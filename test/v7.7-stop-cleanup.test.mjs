// 7.7.0, the C tasks: every stopped or cancelled gesture releases what it pressed.
//
// The native halves (releases that bypass the latch, every button tracked, validate-then-press, flags cleared on the
// final key-up, chunking that never splits a surrogate pair) are Rust unit tests and CI on each runner. These cover
// the server side: a hold no longer blocks the event loop, and the keys come up on every exit path.
import assert from 'node:assert/strict'
import test from 'node:test'
import { InputHandler, MAX_HOLD_SECONDS } from '../dist/session/input-handlers.js'
import { TargetStateController } from '../dist/session/target-state.js'

function fixture({ withPrimitives = true, keyDown } = {}) {
  const calls = []
  const native = {
    calls,
    getDisplaySize: () => ({ width: 500, height: 400 }),
    getWindow: () => null,
    getFrontmostApp: () => ({ bundleId: 'app.front' }),
    holdKey: (...args) => calls.push(['hold', ...args]),
    ...(withPrimitives ? {
      keyDown: keyDown ?? (keys => calls.push(['down', keys])),
      keyUp: keys => calls.push(['up', keys]),
    } : {}),
  }
  const targets = new TargetStateController(native, () => 100)
  const focus = { strategyFor: () => 'none', ensure: async () => ({}) }
  const handler = new InputHandler({ native, targets, focus, platform: 'darwin', sleep: async () => {} })
  return { native, handler }
}

test('hold_key presses, awaits and releases without blocking the event loop', async () => {
  const f = fixture()
  let ticks = 0
  const ticker = setInterval(() => ticks++, 5)
  try {
    const started = Date.now()
    const result = await f.handler.handle('hold_key', { keys: ['shift', 'a'], duration: 0.12 })
    assert.equal(result.content[0].text, 'Held')
    assert.ok(Date.now() - started >= 100, 'the hold lasted its duration')
    assert.ok(ticks >= 5, `timers kept running during the hold (${ticks} ticks)`)
  } finally { clearInterval(ticker) }
  assert.deepEqual(f.native.calls, [['down', ['shift', 'a']], ['up', ['shift', 'a']]])
})

test('an abort mid-hold releases the keys at once and reports the interruption', async () => {
  const f = fixture()
  const controller = new AbortController()
  setTimeout(() => controller.abort(new Error('Desktop control paused by person')), 20)
  const started = Date.now()
  await assert.rejects(
    f.handler.handle('hold_key', { keys: ['shift'], duration: MAX_HOLD_SECONDS }, controller.signal),
    /interrupted after the keys went down; they are released/,
  )
  const elapsed = Date.now() - started
  assert.ok(elapsed < 1000, `released within a poll, not after ${MAX_HOLD_SECONDS} s (took ${elapsed} ms)`)
  assert.deepEqual(f.native.calls, [['down', ['shift']], ['up', ['shift']]])
})

test('an unknown key is refused before anything is pressed, and nothing is released twice', async () => {
  const f = fixture({ keyDown: () => { throw new Error('Unknown key: f99') } })
  await assert.rejects(f.handler.handle('hold_key', { keys: ['shift', 'f13'], duration: 1 }), /Unknown key/)
  assert.deepEqual(f.native.calls, [], 'no key went down, so none is released')
})

test('an older native module without the primitives still holds through holdKey', async () => {
  const f = fixture({ withPrimitives: false })
  await f.handler.handle('hold_key', { keys: ['ctrl'], duration: 0.5 })
  assert.deepEqual(f.native.calls, [['hold', ['ctrl'], 500]])
})
