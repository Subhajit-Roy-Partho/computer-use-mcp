// 7.7.0 (A1): what models send instead of the declared type is accepted when it is unambiguous. "[100, 200]" or
// "100,200" for a coordinate, "500" for a number, "true" for a flag; only an argument that fails its schema is tried,
// and only a coerced form that passes is kept. Applied at the MCP boundary and on direct session calls.
import assert from 'node:assert/strict'
import test from 'node:test'
import { coercedValue, coerceToShape } from '../dist/registry/coerce.js'
import { coerceArguments } from '../dist/registry/definitions.js'
import { createComputerUseServer } from '../dist/server.js'
import { connectInProcess } from '../dist/client.js'
import { createSession } from '../dist/session.js'

const text = result => result.content.find(c => c.type === 'text')?.text ?? ''

test('coercedValue: arrays, numbers and flags from text; nothing becomes NaN or Infinity', () => {
  assert.deepEqual(coercedValue('[100, 200]'), [100, 200])
  assert.deepEqual(coercedValue(' 100,200 '), [100, 200])
  assert.deepEqual(coercedValue('-5.5, 3'), [-5.5, 3])
  assert.deepEqual(coercedValue(['100', '200']), [100, 200])
  assert.deepEqual(coercedValue('[[1,2],["3","4"]]'), [[1, 2], [3, 4]])
  assert.equal(coercedValue('500'), 500)
  assert.equal(coercedValue('true'), true)
  assert.equal(coercedValue('[1, 2'), undefined, 'malformed JSON is left alone')
  assert.equal(coercedValue('NaN'), undefined)
  assert.equal(coercedValue('Infinity'), undefined)
  assert.equal(coercedValue('1e999'), undefined)
  assert.equal(coercedValue('hello'), undefined)
  assert.equal(coercedValue(12), undefined)
})

test('coerceArguments touches only what fails its schema, and keeps a coerced form only if it passes', () => {
  assert.deepEqual(coerceArguments('click', { coordinate: '[10, 20]', count: '2' }), { coordinate: [10, 20], count: 2 })
  const typed = { text: '123' }
  assert.equal(coerceArguments('type', typed), typed, 'a string argument that is a string stays a string')
  assert.deepEqual(coerceArguments('click', { coordinate: '[10, 20, 30]' }), { coordinate: '[10, 20, 30]' }, 'three numbers are not a coordinate')
  assert.deepEqual(coerceArguments('zoom', { region: '0,0,100,50' }), { region: [0, 0, 100, 50] })
  assert.deepEqual(coerceArguments('wait_for_text', { text: 'Done', gone: 'true', timeout_ms: '2000' }), { text: 'Done', gone: true, timeout_ms: 2000 })
  assert.deepEqual(coerceArguments('no_such_tool', { a: '1' }), { a: '1' })
  assert.deepEqual(coerceToShape({}, { a: '1' }), { a: '1' })
})

test('a direct session call with a stringified coordinate clicks where it says', async () => {
  const clicks = []
  const win = { windowId: 1, pid: 10, bundleId: 'com.example.app', title: 'Doc', bounds: { x: 0, y: 0, width: 800, height: 600 }, isOnScreen: true, isFocused: true, layer: 0 }
  const native = {
    getDisplaySize: () => ({ width: 1440, height: 900, scaleFactor: 2 }), listDisplays: () => [{ x: 0, y: 0, width: 1440, height: 900 }],
    getWindow: id => (id === 1 ? win : null), listWindows: () => [win],
    getFrontmostApp: () => ({ bundleId: 'com.example.app', pid: 10 }),
    listRunningApps: () => [{ bundleId: 'com.example.app', pid: 10, isHidden: false }],
    activateApp: () => ({ activated: true }), activateWindow: () => ({ activated: true }),
    mouseMove: () => {}, mouseClick: (x, y, button, count) => clicks.push([x, y, button, count]), getUserIdleTimeMs: () => 60_000,
    isNativeEmergencyStopActive: () => false,
  }
  const session = createSession({ native, macosHelper: null, profile: 'desktop' })
  try {
    const result = await session.dispatch('click', { coordinate: '[120, 340]', target_window_id: 1 })
    assert.equal(result.isError, undefined, text(result))
    assert.deepEqual(clicks[0].slice(0, 2), [120, 340])
  } finally {
    session.close()
  }
})

test('over MCP: a stringified region is accepted, a nonsense one is still invalid_arguments', async () => {
  const native = {
    getFrontmostApp: () => null, listRunningApps: () => [], listWindows: () => [], getWindow: () => null,
    getDisplaySize: () => ({ width: 1920, height: 1080, pixelWidth: 1920, pixelHeight: 1080, scaleFactor: 1 }),
    listDisplays: () => [], drainRunloop: () => {},
  }
  const client = await connectInProcess(createComputerUseServer({ session: createSession({ native, macosHelper: null, disableSessionLock: true }) }))
  try {
    const coerced = await client.callTool('scroll', { coordinate: '100,200', direction: 'down', amount: '3' })
    const payload = (() => { try { return JSON.parse(text(coerced)) } catch { return {} } })()
    assert.notEqual(payload.error, 'invalid_arguments', text(coerced))
    const bad = await client.callTool('scroll', { coordinate: 'left side', direction: 'down' })
    assert.equal(JSON.parse(text(bad)).error, 'invalid_arguments')
    assert.deepEqual([...new Set(JSON.parse(text(bad)).issues.map(issue => issue.path))], ['coordinate'])
  } finally {
    await client.close()
  }
})
