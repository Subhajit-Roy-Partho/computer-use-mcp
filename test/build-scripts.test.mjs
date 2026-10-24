// 7.7.0 (R4): the build scripts work on every OS. `npm run build:ts` spawned `npx.cmd` without a shell, which Node has
// refused since the CVE-2024-27980 fix (EINVAL on Windows), and `npm run build` used cp, uname and codesign.
import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { tscCommand } from '../scripts/build-ts.mjs'
import { buildNative, nativeArtifact } from '../scripts/build-native.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('build:ts runs the compiler as a Node script, never through npx', () => {
  const { command, args } = tscCommand(root)
  assert.equal(command, process.execPath)
  assert.ok(existsSync(args[0]), `tsc resolved to an existing file: ${args[0]}`)
  assert.doesNotMatch(readFileSync(join(root, 'scripts', 'build-ts.mjs'), 'utf8'), /execFileSync\([^)]*npx/)
})

test('the native build names every target the loader reads', () => {
  assert.deepEqual(nativeArtifact('x86_64-pc-windows-msvc', { platform: 'darwin', arch: 'arm64' }), {
    platform: 'win32', arch: 'x64',
    built: join('native', 'target', 'x86_64-pc-windows-msvc', 'release', 'computer_use_napi.dll'),
    outputs: ['computer-use-napi.win32-x64.node'],
  })
  assert.deepEqual(nativeArtifact(undefined, { platform: 'linux', arch: 'arm64' }).outputs,
    ['computer-use-napi.linux-arm64.node', 'computer-use-napi.node'])
  assert.equal(nativeArtifact('aarch64-apple-darwin', { platform: 'darwin', arch: 'arm64' }).built,
    join('native', 'target', 'aarch64-apple-darwin', 'release', 'libcomputer_use_napi.dylib'))
  assert.throws(() => nativeArtifact('riscv64gc-unknown-linux-gnu'), /Unsupported Rust target/)
})

test('the package scripts use the portable builders', () => {
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts
  for (const name of ['build:native', 'build:native:win', 'build:native:win:arm64', 'build:native:linux']) {
    assert.match(scripts[name], /^node scripts\/build-native\.mjs/, name)
  }
  assert.equal(scripts['build:ts'], 'node scripts/build-ts.mjs')
  const plan = []
  buildNative({ dryRun: true, log: line => plan.push(line) })
  assert.match(plan[0], /^cargo build --release/)
})
