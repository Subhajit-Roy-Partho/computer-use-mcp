// 7.7.0 (K2): run_steps. Several actions in one call: every step checked before any runs, each step dispatched like a
// direct call (policy, the person's pause and stop, the result contract), stopping at the first failure, one optional
// capture at the end. Driven through the real server so each step gets the registry's own argument validation.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createComputerUseServer } from '../dist/server.js'
import { connectInProcess } from '../dist/client.js'
import { createSession } from '../dist/session.js'
import { OperatorControl } from '../dist/session/operator-control.js'

const win = { windowId: 1, pid: 100, bundleId: 'com.example.app', title: 'Doc', bounds: { x: 100, y: 100, width: 800, height: 600 }, isOnScreen: true, isFocused: true, layer: 0 }
function fakeNative(overrides = {}) {
  const calls = []
  return {
    calls,
    getDisplaySize: () => ({ width: 2560, height: 1440, pixelWidth: 5120, pixelHeight: 2880, scaleFactor: 2 }),
    listDisplays: () => [{ x: 0, y: 0, width: 2560, height: 1440, scaleFactor: 2 }],
    getWindow: id => (id === 1 ? win : null),
    listWindows: () => [win],
    getFrontmostApp: () => ({ bundleId: 'com.example.app', displayName: 'App', pid: 100 }),
    listRunningApps: () => [{ bundleId: 'com.example.app', displayName: 'App', pid: 100, isHidden: false }],
    takeScreenshot: () => ({ base64: 'AAAA', width: 400, height: 300, mimeType: 'image/jpeg', hash: `h${calls.length}`, unchanged: false }),
    activateApp: (...a) => { calls.push(['activateApp', a]); return { activated: true } },
    activateWindow: () => ({ activated: true }),
    mouseMove: (...a) => calls.push(['mouseMove', a]), mouseClick: (...a) => calls.push(['mouseClick', a]),
    keyPress: (...a) => calls.push(['keyPress', a]), typeText: (...a) => calls.push(['typeText', a]),
    cursorPosition: () => ({ x: 1, y: 1 }), getUserIdleTimeMs: () => 60_000,
    findElement: () => [], isNativeEmergencyStopActive: () => false,
    ...overrides,
  }
}
const input = calls => calls.filter(([name]) => ['mouseClick', 'typeText', 'keyPress'].includes(name)).map(([name]) => name)

async function server(native) {
  const instance = createComputerUseServer({ native, profile: 'desktop', disableSessionLock: true })
  return connectInProcess(instance)
}
const payload = result => result.structuredContent ?? JSON.parse(result.content[0].text)

test('a known sequence runs in one call and reports every step with its effect', async () => {
  const native = fakeNative()
  const client = await server(native)
  try {
    const result = await client.callTool('run_steps', {
      target_window_id: 1,
      steps: [
        { tool: 'click', args: { coordinate: [300, 200], force: true } },
        { tool: 'type', args: { text: 'hello', force: true } },
        { tool: 'key', args: { text: 'return', force: true } },
      ],
    })
    assert.equal(result.isError, undefined, JSON.stringify(result))
    const body = payload(result)
    assert.equal(body.completed, 3)
    assert.equal(body.total, 3)
    assert.equal(body.stopped_at, null)
    assert.deepEqual(body.steps.map(step => step.tool), ['click', 'type', 'key'])
    assert.ok(body.steps.every(step => step.ok && step.route === 'input' && step.effect === 'unverified'))
    assert.equal(body.route, 'batch')
    assert.equal(body.effect, 'unverified')
    assert.deepEqual(input(native.calls), ['mouseClick', 'typeText', 'keyPress'])
    assert.equal(native.calls.filter(([name]) => name === 'activateApp').length, 0, 'the target was in front: nothing re-activated')
  } finally { await client.close() }
})

test('every step is checked before any runs: one bad argument and nothing happens', async () => {
  const native = fakeNative()
  const client = await server(native)
  try {
    const result = await client.callTool('run_steps', {
      steps: [
        { tool: 'click', args: { coordinate: [300, 200], force: true } },
        { tool: 'type', args: { txt: 'typo in the name' } },
      ],
    })
    assert.equal(result.isError, true)
    const body = payload(result)
    assert.equal(body.error, 'invalid_arguments')
    assert.match(JSON.stringify(body.issues), /did you mean \\"text\\"/)
    assert.deepEqual(input(native.calls), [], 'not even the valid first step ran')
  } finally { await client.close() }
})

test('a tool that is not a step (a script, an admin tool, another batch) is refused by the schema', async () => {
  const native = fakeNative()
  const client = await server(native)
  try {
    const result = await client.callTool('run_steps', { steps: [{ tool: 'run_script', args: { language: 'applescript', script: 'beep' } }] })
    assert.equal(result.isError, true)
    assert.equal(payload(result).error, 'invalid_arguments')
  } finally { await client.close() }
})

test('the batch stops at the first failing step; the rest are reported as not run', async () => {
  const native = fakeNative()
  const client = await server(native)
  try {
    const result = await client.callTool('run_steps', {
      steps: [
        { tool: 'click', args: { coordinate: [300, 200], force: true } },
        { tool: 'click', args: { coordinate: [99999, 5], force: true } },
        { tool: 'type', args: { text: 'never typed', force: true } },
      ],
    })
    assert.equal(result.isError, true)
    const body = payload(result)
    assert.equal(body.error, 'step_failed')
    assert.equal(body.stopped_at, 1)
    assert.equal(body.completed, 1)
    assert.equal(body.failed_step.error, 'outside_display')
    assert.match(body.hint, /^Step 2 \(click\) failed/)
    assert.equal(body.steps[2].status, 'not_run')
    assert.deepEqual(input(native.calls), ['mouseClick'], 'the third step never typed')
  } finally { await client.close() }
})

test('capture adds one image after the last step', async () => {
  const native = fakeNative()
  const client = await server(native)
  try {
    const result = await client.callTool('run_steps', {
      target_window_id: 1, capture: 'window',
      steps: [{ tool: 'click', args: { coordinate: [300, 200], force: true } }],
    })
    assert.equal(result.isError, undefined)
    assert.equal(result.content.filter(block => block.type === 'image').length, 1)
    assert.match(payload(result).hint, /capture above shows the result/)
  } finally { await client.close() }
})

test('a pause between steps stops the batch with the person\'s refusal', async () => {
  const native = fakeNative()
  const control = new OperatorControl({ native })
  const session = createSession({ native, macosHelper: null, profile: 'desktop', operatorControl: control })
  let typed = 0
  native.typeText = () => { typed++; control.pause('person') }
  const result = await session.dispatch('run_steps', {
    steps: [
      { tool: 'type', args: { text: 'one', force: true } },
      { tool: 'type', args: { text: 'two', force: true } },
    ],
  })
  assert.equal(result.isError, true)
  const body = payload(result)
  assert.equal(body.stopped_at, 1)
  assert.equal(body.failed_step.error, 'paused_by_user')
  assert.equal(typed, 1, 'nothing ran after the pause')
  session.close()
})

test('openai_computer maps coordinates from the last screenshot to the screen (7.7.0 K2)', async () => {
  // The display is 2560 wide; a 1280-wide screenshot makes every image pixel two screen points.
  const native = fakeNative({
    takeScreenshot: () => ({ base64: 'AAAA', width: 1280, height: 720, mimeType: 'image/jpeg', hash: 'h-shot', unchanged: false }),
  })
  const session = createSession({ native, macosHelper: null, profile: 'full' })
  await session.dispatch('openai_computer', { actions: [{ type: 'screenshot' }], width: 1280 })
  await session.dispatch('openai_computer', { actions: [{ type: 'click', x: 100, y: 50 }] })
  const clicks = native.calls.filter(([name]) => name === 'mouseClick').map(([, a]) => a.slice(0, 2))
  assert.deepEqual(clicks.at(-1), [200, 100], 'image (100, 50) is screen (200, 100)')
  await session.dispatch('openai_computer', { actions: [{ type: 'click', x: 100, y: 50 }], coordinate_space: 'screen' })
  assert.deepEqual(native.calls.filter(([name]) => name === 'mouseClick').map(([, a]) => a.slice(0, 2)).at(-1), [100, 50])
  session.close()
})
