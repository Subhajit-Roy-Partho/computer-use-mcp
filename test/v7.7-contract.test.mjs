// 7.7.0 (K1): the result contract. Every action says what it did (effect, route, delivery); every refusal says what to
// do next (hint) and offers one call that is always safe to run (next_call: a read-only tool this session can call).
import assert from 'node:assert/strict'
import test from 'node:test'
import { createSession } from '../dist/session.js'
import { REFUSALS, HINT_MAX, applyContract, classifyError, defaultContract } from '../dist/session/contract.js'
import { getToolMeta } from '../dist/tool-catalog.js'

const win = { windowId: 1, pid: 100, bundleId: 'com.example.app', title: 'Doc', bounds: { x: 100, y: 100, width: 800, height: 600 }, isOnScreen: true, isFocused: true, layer: 0 }
function fakeNative(overrides = {}) {
  const calls = []
  let clipboard = 'before'
  let shot = 0
  return {
    calls,
    getDisplaySize: () => ({ width: 2560, height: 1440, pixelWidth: 5120, pixelHeight: 2880, scaleFactor: 2 }),
    listDisplays: () => [{ x: 0, y: 0, width: 2560, height: 1440, scaleFactor: 2 }],
    getWindow: id => (id === 1 ? win : null),
    listWindows: () => [win],
    getFrontmostApp: () => ({ bundleId: 'com.example.app', displayName: 'App', pid: 100 }),
    listRunningApps: () => [{ bundleId: 'com.example.app', displayName: 'App', pid: 100, isHidden: false }],
    takeScreenshot: () => ({ base64: 'AAAA', width: 480, height: 270, mimeType: 'image/jpeg', hash: `h${++shot}`, unchanged: false }),
    activateApp: () => ({ activated: true }), activateWindow: () => ({ activated: true }),
    mouseMove: (...a) => calls.push(['mouseMove', a]), mouseClick: (...a) => calls.push(['mouseClick', a]),
    keyPress: (...a) => calls.push(['keyPress', a]), typeText: (...a) => calls.push(['typeText', a]),
    readClipboard: () => clipboard, writeClipboard: value => { clipboard = value },
    cursorPosition: () => ({ x: 1, y: 1 }), getUserIdleTimeMs: () => 60_000,
    findElement: () => [], setElementValue: () => ({ set: true }),
    isNativeEmergencyStopActive: () => false,
    ...overrides,
  }
}
const session = (native, extra = {}) => createSession({ native, macosHelper: null, profile: 'desktop', ...extra })
const tail = result => JSON.parse(result.content.at(-1).text)

test('a click says it was posted and not confirmed, with a safe call to check it', async () => {
  const s = session(fakeNative())
  const r = await s.dispatch('click', { coordinate: [10, 10], target_window_id: 1, force: true })
  assert.equal(r.content[0].text, 'Clicked (10, 10)', 'the handler text comes first, unchanged')
  const contract = r.structuredContent
  assert.equal(contract.effect, 'unverified')
  assert.equal(contract.route, 'input')
  assert.equal(contract.delivery, 'hid')
  assert.ok(contract.hint.length <= HINT_MAX)
  assert.equal(getToolMeta(contract.next_call.tool).mutates, false, 'next_call is read-only')
  assert.deepEqual(tail(r).next_call, contract.next_call, 'the same contract is in the text')
  s.close()
})

test('verify: true captures before and after and reports changed or no_visible_change', async () => {
  const changing = session(fakeNative())
  const changed = await changing.dispatch('click', { coordinate: [10, 10], target_window_id: 1, force: true, verify: true })
  assert.equal(changed.structuredContent.effect, 'changed')
  assert.match(changed.structuredContent.hint, /changed/)
  changing.close()
  const still = session(fakeNative({ takeScreenshot: () => ({ base64: 'AAAA', width: 480, height: 270, mimeType: 'image/jpeg', hash: 'same', unchanged: false }) }))
  const same = await still.dispatch('type', { text: 'hi', target_window_id: 1, force: true, verify: true })
  assert.equal(same.structuredContent.effect, 'no_visible_change')
  assert.match(same.structuredContent.hint, /probably did nothing/)
  still.close()
})

test('a read-back makes an effect verified, with no hint and no next_call', async () => {
  const s = session(fakeNative())
  const written = await s.dispatch('write_clipboard', { text: 'hello' })
  assert.equal(written.structuredContent.effect, 'verified')
  assert.equal(written.structuredContent.hint, undefined)
  assert.equal(written.structuredContent.next_call, undefined)
  s.close()
})

test('a refusal carries the table\'s hint and a safe next call, after the handler\'s own text', async () => {
  const s = session(fakeNative())
  const outside = await s.dispatch('click', { coordinate: [99999, 10], force: true })
  assert.equal(outside.isError, true)
  assert.match(outside.content[0].text, /outside display bounds/)
  assert.equal(outside.structuredContent.error, 'outside_display')
  assert.equal(outside.structuredContent.next_call.tool, 'screenshot')
  s.close()
})

test('a native error that names its code becomes that refusal', () => {
  assert.deepEqual(classifyError('window_minimized: window 7 is minimised'), { code: 'window_minimized', message: 'window 7 is minimised' })
  assert.equal(classifyError('EmergencyStop: native input is latched off').code, 'emergency_stop_active')
  assert.equal(classifyError('input_blocked: Windows accepted 0 of 2 input events').code, 'input_blocked')
  assert.equal(classifyError('screen_locked: the screen is locked (DXGI)').code, 'screen_locked')
  assert.equal(classifyError('something odd').code, 'tool_failed')
})

test('every refusal in the table has a short hint and only ever suggests a read-only tool', () => {
  const args = { target_window_id: 1, target_app: 'com.example.app', bundle_id: 'com.example.app', window_id: 1 }
  for (const [code, advice] of Object.entries(REFUSALS)) {
    assert.ok(advice.hint.length <= HINT_MAX, `${code}: ${advice.hint.length} characters`)
    const next = advice.next?.(args, 'click', { requestedBundleId: 'com.example.app' })
    if (next) {
      const meta = getToolMeta(next.tool)
      assert.ok(meta, `${code}: ${next.tool} exists`)
      assert.equal(meta.mutates, false, `${code}: ${next.tool} changes nothing`)
    }
  }
})

test('a next_call outside the session\'s profile is dropped rather than suggested', () => {
  const refusal = { content: [{ type: 'text', text: JSON.stringify({ error: 'element_not_found', message: 'none' }) }], isError: true }
  const offered = applyContract('click_element', { window_id: 1 }, refusal, 'darwin', () => true)
  assert.equal(offered.structuredContent.next_call.tool, 'get_ui_tree')
  const core = applyContract('click_element', { window_id: 1 }, refusal, 'darwin', tool => tool !== 'get_ui_tree')
  assert.equal(core.structuredContent.next_call, undefined)
  assert.ok(core.structuredContent.hint)
})

test('read-only successes are left alone, and defaults cover every mutating route', async () => {
  const s = session(fakeNative())
  const shot = await s.dispatch('screenshot', {})
  assert.equal(shot.structuredContent, undefined)
  assert.equal(shot.content.some(c => c.type === 'text' && c.text.includes('"effect"')), false)
  s.close()
  assert.equal(defaultContract('run_script', {}).route, 'script')
  assert.equal(defaultContract('filesystem', {}).effect, 'verified')
  assert.equal(defaultContract('key', {}, 'darwin').next_call.tool, 'screenshot', 'no target: a screenshot')
  assert.equal(defaultContract('key', { target_window_id: 1 }, 'darwin').next_call.tool, 'wait_for_stable')
  assert.equal(defaultContract('key', { target_window_id: 1 }, 'win32').next_call.tool, 'screenshot', 'no wait_for_stable off macOS')
})
