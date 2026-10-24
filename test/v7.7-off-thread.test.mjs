// 7.7.0 (K4): slow native calls run off the JavaScript thread. An accessibility walk, a capture or a Windows activation
// resolves a promise from a worker, so Stop, cancellation and every other request are answered while it runs. A native
// module without the async variants (older builds, test doubles) is called synchronously as before.
import assert from 'node:assert/strict'
import test from 'node:test'
import { offThread } from '../dist/session/native-async.js'
import { createSession } from '../dist/session.js'

const text = result => result.content.find(c => c.type === 'text')?.text ?? ''

test('offThread uses the async variant when the native module has one', async () => {
  const calls = []
  const native = {
    getUiTree: () => { calls.push('sync'); return { role: 'sync' } },
    getUiTreeAsync: async (windowId, depth) => { calls.push(['async', windowId, depth]); return { role: 'async' } },
  }
  assert.deepEqual(await offThread(native, 'getUiTree', 7, 3), { role: 'async' })
  assert.deepEqual(calls, [['async', 7, 3]])
})

test('offThread falls back to the synchronous call, and a throw becomes a rejection', async () => {
  const native = {
    findElement: (windowId, role) => [{ role, windowId }],
    getMenuBar: () => { throw new Error('app_not_running:com.example') },
  }
  assert.deepEqual(await offThread(native, 'findElement', 4, 'AXButton'), [{ role: 'AXButton', windowId: 4 }])
  const pending = offThread(native, 'getMenuBar', 'com.example')
  assert.ok(pending instanceof Promise, 'a synchronous throw is not thrown at the call site')
  await assert.rejects(pending, /app_not_running/)
})

test('a slow accessibility walk does not hold the session: control_status answers while it runs', async () => {
  const win = { windowId: 9, pid: 10, bundleId: 'com.example.app', title: 'Doc', bounds: { x: 0, y: 0, width: 800, height: 600 }, isOnScreen: true, isFocused: true, layer: 0 }
  let finishWalk
  const native = {
    getDisplaySize: () => ({ width: 1440, height: 900, scaleFactor: 2 }), listDisplays: () => [{ x: 0, y: 0, width: 1440, height: 900 }],
    getWindow: id => (id === 9 ? win : null), listWindows: () => [win], listRunningApps: () => [],
    getFrontmostApp: () => ({ bundleId: 'com.example.app', pid: 10 }),
    getUiTree: () => { throw new Error('the synchronous walk must not be used') },
    getUiTreeAsync: () => new Promise(resolve => { finishWalk = () => resolve({ role: 'AXWindow', label: 'Doc', children: [] }) }),
    isNativeEmergencyStopActive: () => false,
  }
  const session = createSession({ native, macosHelper: null, profile: 'full' })
  const order = []
  const walk = session.dispatch('get_ui_tree', { window_id: 9 }).then(result => { order.push('walk'); return result })
  const status = await session.dispatch('control_status', {})
  order.push('status')
  assert.equal(status.isError, undefined)
  finishWalk()
  const tree = await walk
  assert.deepEqual(order, ['status', 'walk'], 'control_status answered while the walk was still running')
  assert.equal(JSON.parse(text(tree)).role, 'AXWindow')
  session.close()
})

test('activation goes through the async variant where the native module has one (Windows, Linux)', async () => {
  const win = { windowId: 5, pid: 11, bundleId: 'notepad.exe', title: 'Untitled', bounds: { x: 0, y: 0, width: 800, height: 600 }, isOnScreen: true, isFocused: false, layer: 0 }
  const calls = []
  const native = {
    getDisplaySize: () => ({ width: 1920, height: 1080, scaleFactor: 1 }), listDisplays: () => [{ x: 0, y: 0, width: 1920, height: 1080 }],
    getWindow: id => (id === 5 ? win : null), listWindows: () => [win],
    listRunningApps: () => [{ bundleId: 'notepad.exe', pid: 11, isHidden: false }],
    getFrontmostApp: () => ({ bundleId: 'notepad.exe', pid: 11 }), getUserIdleTimeMs: () => 60_000,
    activateApp: () => { throw new Error('sync activateApp used') },
    activateWindow: () => { throw new Error('sync activateWindow used') },
    activateAppAsync: async bundleId => { calls.push(['app', bundleId]); return { bundleId, activated: true } },
    activateWindowAsync: async windowId => { calls.push(['window', windowId]); return { windowId, activated: true, reason: null } },
    isNativeEmergencyStopActive: () => false,
  }
  const session = createSession({ native, macosHelper: null, profile: 'full' })
  const result = await session.dispatch('activate_window', { window_id: 5 })
  assert.equal(result.isError, undefined, text(result))
  assert.deepEqual(calls, [['app', 'notepad.exe'], ['window', 5]])
  session.close()
})

// The real addon, when it is built with the async exports: they return promises and reject like the synchronous calls.
let addon
try { addon = (await import('../dist/native.js')).loadNative() } catch { addon = undefined }

test('the built addon exposes the async walks and they reject like the synchronous ones', { skip: typeof addon?.getUiTreeAsync !== 'function' && 'native addon not built with 7.7 async exports' }, async () => {
  assert.equal(typeof addon.findElementAsync, 'function')
  assert.equal(typeof addon.getMenuBarAsync, 'function')
  assert.equal(typeof addon.takeScreenshotAsync, 'function')
  const pending = addon.getUiTreeAsync(0, 2)
  assert.ok(pending instanceof Promise)
  let syncError
  try { addon.getUiTree(0, 2) } catch (error) { syncError = error }
  if (syncError) await assert.rejects(pending, error => error.message === syncError.message)
  else await pending
  if (process.platform === 'darwin') {
    assert.equal(addon.activateWindowAsync, undefined, 'macOS keeps activation synchronous')
  }
})
