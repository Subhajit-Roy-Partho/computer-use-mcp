// Stage only the exact tested/attested tarballs, before staging the main package.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TARGETS } from './prepare-platform-packages.mjs'
import { npmCommand } from './npm-command.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
function runNpm(args) {
  const command = npmCommand(args)
  const result = spawnSync(command.command, command.args, { encoding: 'utf8' })
  if (result.error) throw result.error
  return result
}
function errorCode(result) {
  try { return JSON.parse(result.stdout).error?.code } catch { return undefined }
}

export function stagePlatformPackages(directory = root, npm = runNpm) {
  const rootPkg = readJson(join(directory, 'package.json'))
  const version = rootPkg.version
  const packages = readJson(join(directory, 'release', 'platform', 'packages.json'))
  if (packages.length !== TARGETS.length || new Set(packages.map(pkg => pkg.target)).size !== TARGETS.length) {
    throw new Error('Release must contain all six distinct native packages')
  }
  // Complete local and registry preflight before staging any package.
  const local = packages.map(pkg => {
    if (!TARGETS.includes(pkg.target) || pkg.version !== version ||
        pkg.name !== `@zavora-ai/computer-use-mcp-${pkg.target}` ||
        pkg.filename !== `zavora-ai-computer-use-mcp-${pkg.target}-${version}.tgz`) {
      throw new Error(`Invalid native release metadata: ${pkg.name}`)
    }
    const archive = join(directory, 'release', 'platform', pkg.filename)
    const integrity = 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64')
    if (integrity !== pkg.integrity) throw new Error(`Tarball integrity mismatch: ${pkg.name}`)
    return { pkg, archive, integrity }
  })
  // 7.6.2: a push after a release is not a release. The main version already on npm already chose its native
  // dependencies, so nothing is staged; without this, every later push re-checked (and, with non-reproducible Windows
  // builds, failed on) packages that cannot change, and a version from before the native packages existed tried to
  // create them.
  const mainSpec = `${rootPkg.name ?? '@zavora-ai/computer-use-mcp'}@${version}`
  const main = npm(['view', mainSpec, 'version', '--json'])
  if (main.status === 0 && main.stdout.trim()) {
    console.log(`${mainSpec} is already published; no native packages to stage`)
    return
  }
  if (main.status !== 0 && errorCode(main) !== 'E404') throw new Error(`Cannot check ${mainSpec}: ${main.stderr || main.stdout}`)
  const pending = []
  for (const { pkg, archive, integrity } of local) {
    const spec = `${pkg.name}@${version}`
    const existing = npm(['view', spec, 'dist.integrity', '--json'])
    if (existing.status === 0) {
      if (JSON.parse(existing.stdout) !== integrity) throw new Error(`Published ${spec} differs from this build; bump the version`)
      console.log(`${spec} already published with identical integrity — skipping`)
    } else {
      if (errorCode(existing) !== 'E404') throw new Error(`Cannot check ${spec}: ${existing.stderr || existing.stdout}`)
      pending.push({ spec, archive, integrity })
    }
  }
  for (const { spec, archive, integrity } of pending) {
    const result = npm(['stage', 'publish', archive, '--access', 'public', '--provenance', '--ignore-scripts', '--json'])
    if (result.status !== 0) {
      const git = process.env.GITHUB_SHA ? undefined : spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: directory, encoding: 'utf8', timeout: 5000,
      })
      const commit = process.env.GITHUB_SHA || (git?.status === 0 ? git.stdout.trim() : 'unavailable')
      throw new Error(
        `Cannot stage ${spec} (${errorCode(result) ?? `exit ${result.status}`}): ${result.stderr || result.stdout}\n` +
        `Commit: ${commit}\nArtifact: ${archive}\nIntegrity: ${integrity}\n` +
        `Release evidence: release-evidence-${commit}\n` +
        'Staging stopped; verify any pending tarball against this release evidence before approval.',
      )
    }
    console.log(result.stdout)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) stagePlatformPackages()
