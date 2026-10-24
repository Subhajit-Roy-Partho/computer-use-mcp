// Non-destructive TypeScript build: compile into dist.next, then swap it into place.
// The old `rm -rf dist && tsc` left a window with no dist/ at all, so a server starting mid-build died at import.
import { execFileSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The compiler as a Node script, never through `npx.cmd`: since the CVE-2024-27980 fix Node refuses to spawn a `.cmd`
 * without a shell (EINVAL), which broke `npm run build:ts` and `npm test` on Windows (7.7.0).
 */
export function tscCommand(root = process.cwd()) {
  const tsc = createRequire(resolve(root, 'package.json')).resolve('typescript/bin/tsc')
  return { command: process.execPath, args: [tsc] }
}

export function buildTs(root = process.cwd()) {
  const dist = resolve(root, 'dist')
  const next = resolve(root, 'dist.next')
  const old = resolve(root, 'dist.old')
  for (const dir of [dist, next, old]) {
    if (basename(dir).startsWith('dist') === false || dir === resolve('/')) throw new Error(`refusing to touch ${dir}`)
  }
  rmSync(next, { recursive: true, force: true })
  rmSync(old, { recursive: true, force: true })
  const { command, args } = tscCommand(root)
  execFileSync(command, [...args, '--outDir', next], { stdio: 'inherit', cwd: root })
  if (existsSync(dist)) renameSync(dist, old)
  renameSync(next, dist)
  rmSync(old, { recursive: true, force: true })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildTs()
