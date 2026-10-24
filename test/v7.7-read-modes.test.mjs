// 7.7.0: a read-only mode of an admin tool is a read. A filesystem search, a registry read or a process list takes no
// desktop lock and is not paused by the person, so it no longer fails with `locked_by_pid` while another server types.
// Approval policy still names the tool and is unchanged.
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { callMutates } from '../dist/tool-catalog.js'
import { createSession } from '../dist/session.js'
import { OperatorControl } from '../dist/session/operator-control.js'

const text = result => result.content.find(c => c.type === 'text')?.text ?? ''
const presenter = { kind: 'test', start() {}, stop() {} }
const native = {
  getDisplaySize: () => ({ width: 1440, height: 900, scaleFactor: 2 }), listDisplays: () => [{ x: 0, y: 0, width: 1440, height: 900 }],
  getWindow: () => null, listWindows: () => [], listRunningApps: () => [], getFrontmostApp: () => null,
  isNativeEmergencyStopActive: () => false,
}

test('callMutates: read-only modes are reads, every other call of a mutating tool mutates', () => {
  for (const mode of ['read', 'list', 'search', 'info']) assert.equal(callMutates('filesystem', { mode }), false, mode)
  for (const mode of ['write', 'copy', 'move', 'delete']) assert.equal(callMutates('filesystem', { mode }), true, mode)
  assert.equal(callMutates('registry', { mode: 'get' }), false)
  assert.equal(callMutates('registry', { mode: 'set' }), true)
  assert.equal(callMutates('process_kill', { mode: 'list' }), false)
  assert.equal(callMutates('process_kill', { mode: 'kill' }), true)
  assert.equal(callMutates('filesystem', {}), true, 'no mode: treated as a mutation')
  assert.equal(callMutates('click', { mode: 'list' }), true, 'a mode only matters for the admin tools')
  assert.equal(callMutates('screenshot', {}), false)
})

test('a filesystem search runs while another server holds the desktop lock; a write is refused', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cu-read-modes-'))
  writeFileSync(join(root, 'notes.txt'), 'x')
  const lockPath = join(root, 'session.lock')
  // A live process (our parent) with a fresh lease holds the lock.
  writeFileSync(lockPath, JSON.stringify({ pid: process.ppid, renewedAt: Date.now(), startedAt: Date.now() - 1000 }))
  const session = createSession({ native, macosHelper: null, profile: 'full', lockPath, disableSessionLock: false })
  try {
    const search = await session.dispatch('filesystem', { mode: 'search', path: root, pattern: 'notes' })
    assert.equal(search.isError, undefined, text(search))
    assert.match(text(search), /notes\.txt/)
    const write = await session.dispatch('filesystem', { mode: 'write', path: join(root, 'other.txt'), content: 'y' })
    assert.equal(write.isError, true)
    assert.equal(JSON.parse(text(write)).error, 'locked_by_pid')
  } finally {
    session.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('while the person has paused the agent, a filesystem read still works and a delete is refused', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cu-read-modes-'))
  writeFileSync(join(root, 'notes.txt'), 'hello')
  const control = new OperatorControl({ card: { presenter, pollMs: 10_000 } })
  const session = createSession({ native, macosHelper: null, profile: 'full', operatorControl: control, lockPath: join(root, 'session.lock') })
  try {
    control.pause('person')
    const read = await session.dispatch('filesystem', { mode: 'read', path: join(root, 'notes.txt') })
    assert.equal(read.isError, undefined, text(read))
    assert.match(text(read), /hello/)
    const removed = await session.dispatch('filesystem', { mode: 'delete', path: join(root, 'notes.txt') })
    assert.equal(JSON.parse(text(removed)).error, 'paused_by_user')
  } finally {
    session.close()
    rmSync(root, { recursive: true, force: true })
  }
})
