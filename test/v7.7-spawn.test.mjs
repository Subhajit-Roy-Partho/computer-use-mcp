// 7.7.0: subprocess output (W6) and completion (K9).
import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultSpawnBounded, EXIT_GRACE_MS } from '../dist/session/spawn.js'

test('a multi-byte character split across two writes is decoded whole', async () => {
  // "€" is E2 82 AC in UTF-8; the child writes it in two chunks with a pause between.
  const script = 'process.stdout.write(Buffer.from([0xE2, 0x82])); setTimeout(() => process.stdout.write(Buffer.from([0xAC, 0x0A])), 60)'
  const result = await defaultSpawnBounded(process.execPath, ['-e', script], 5000)
  assert.equal(result.code, 0)
  assert.equal(result.stdout, '€\n')
})

test('a grandchild that keeps the pipes open no longer holds the call until its timeout', async () => {
  // The child starts a grandchild that inherits stdout and lives for 3 s, prints, and exits at once.
  const script = [
    "const { spawn } = require('node:child_process');",
    "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { stdio: ['ignore', 'inherit', 'inherit'] }).unref();",
    "process.stdout.write('done');",
  ].join(' ')
  const started = Date.now()
  const result = await defaultSpawnBounded(process.execPath, ['-e', script], 20000)
  const elapsed = Date.now() - started
  assert.equal(result.stdout, 'done')
  assert.equal(result.code, 0)
  assert.equal(result.timedOut, false)
  assert.ok(elapsed < 2500, `completed ${elapsed} ms after start, within the exit grace (${EXIT_GRACE_MS} ms), not after the grandchild`)
})
