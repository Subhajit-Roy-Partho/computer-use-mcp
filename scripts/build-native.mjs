// Build the Rust N-API addon for this machine (or `--target <rust triple>`) and copy it to the names the loader reads.
// 7.7.0: one portable script instead of `cp`, `uname` and `codesign` in package.json, which only worked on macOS and
// Linux; `npm run build` now works on Windows too.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '..', '..')

const TRIPLES = {
  'aarch64-apple-darwin': ['darwin', 'arm64'],
  'x86_64-apple-darwin': ['darwin', 'x64'],
  'x86_64-pc-windows-msvc': ['win32', 'x64'],
  'aarch64-pc-windows-msvc': ['win32', 'arm64'],
  'x86_64-unknown-linux-gnu': ['linux', 'x64'],
  'aarch64-unknown-linux-gnu': ['linux', 'arm64'],
}

/** The Cargo output and the `.node` names for a target; `triple` undefined means the host build. */
export function nativeArtifact(triple, host = { platform: process.platform, arch: process.arch }) {
  const [platform, arch] = triple ? TRIPLES[triple] ?? [] : [host.platform, host.arch]
  if (!platform) throw new Error(`Unsupported Rust target: ${triple}. Supported: ${Object.keys(TRIPLES).join(', ')}`)
  const library = platform === 'darwin' ? 'libcomputer_use_napi.dylib'
    : platform === 'win32' ? 'computer_use_napi.dll' : 'libcomputer_use_napi.so'
  const built = join('native', 'target', ...(triple ? [triple] : []), 'release', library)
  const outputs = [`computer-use-napi.${platform}-${arch}.node`]
  // The generic name is only for the host: it is what an older loader and a checkout's tests pick up.
  if (!triple || (platform === host.platform && arch === host.arch)) outputs.push('computer-use-napi.node')
  return { platform, arch, built, outputs }
}

export function buildNative({ triple, dryRun = false, log = console.log } = {}) {
  const artifact = nativeArtifact(triple)
  const cargo = ['build', '--release', ...(triple ? ['--target', triple] : [])]
  log(`cargo ${cargo.join(' ')} (in native/)`)
  if (!dryRun) execFileSync('cargo', cargo, { cwd: join(root, 'native'), stdio: 'inherit' })
  const source = join(root, artifact.built)
  if (!dryRun && !existsSync(source)) throw new Error(`Cargo finished but ${artifact.built} is missing`)
  for (const output of artifact.outputs) {
    log(`copy ${artifact.built} -> ${output}`)
    if (!dryRun) copyFileSync(source, join(root, output))
  }
  // An ad-hoc signature keeps macOS from refusing a library rewritten in place.
  if (artifact.platform === 'darwin' && process.platform === 'darwin') {
    log(`codesign --force --sign - ${artifact.outputs.join(' ')}`)
    if (!dryRun) execFileSync('codesign', ['--force', '--sign', '-', ...artifact.outputs], { cwd: root, stdio: 'inherit' })
  }
  return artifact
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--target')
  buildNative({ triple: at > 0 ? process.argv[at + 1] : undefined, dryRun: process.argv.includes('--dry-run') })
}
