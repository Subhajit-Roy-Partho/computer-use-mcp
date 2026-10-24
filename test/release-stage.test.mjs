import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import test from 'node:test'

// Execute the actual main staging step with a disposable npm command, not a registry.
const workflow = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const step = workflow.split('      - name: Stage main package for maintainer approval\n')[1]
const script = step.split('        run: |\n')[1].split('\n        env:')[0]
  .split('\n').map(line => line.slice(10)).join('\n')

// The step runs on the ubuntu release job; its shell logic is exercised wherever bash and POSIX find are the defaults.
const cases = [
  { name: 'succeeds normally', mode: 'ok', exit: 0 },
  { name: 'tolerates a version already staged and awaiting approval (E409)', mode: 'staged', exit: 0 },
  { name: 'fails with the release evidence on any other error', mode: 'denied', exit: 1 },
]
for (const { name, mode, exit } of cases) {
  test(`main staging ${name}`, { skip: process.platform === 'win32' && 'needs POSIX find and bash' }, t => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'computer-use-main-stage-'))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const commands = path.join(directory, 'commands')
    fs.mkdirSync(commands)
    fs.mkdirSync(path.join(directory, 'release', 'root'), { recursive: true })
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: '9.0.0-test.1' }))
    fs.writeFileSync(path.join(directory, 'release', 'root', 'main.tgz'), 'tested main artifact')
    fs.writeFileSync(path.join(commands, 'npm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$STAGE_TRACE"
if [ "$1" = view ]; then exit 1; fi
if [ "$1" = stage ]; then
  case "$STAGE_MODE" in
    ok) printf '{}\\n'; exit 0 ;;
    staged) printf 'npm error code E409\\nnpm error Cannot stage previously published version\\n'; exit 1 ;;
    *) printf 'npm error code E403\\nnpm error publish denied\\n'; exit 1 ;;
  esac
fi
exit 2
`, { mode: 0o755 })
    const trace = path.join(directory, 'npm-calls.txt')
    const commit = 'b'.repeat(40)
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: directory, encoding: 'utf8', env: { ...process.env,
        PATH: commands + path.delimiter + process.env.PATH,
        GITHUB_SHA: commit, STAGE_MODE: mode, STAGE_TRACE: trace,
      },
    })
    assert.equal(result.error, undefined)
    assert.equal(result.status, exit, result.stderr || result.stdout)
    const calls = fs.readFileSync(trace, 'utf8').trim().split('\n')
    assert.equal(calls.length, 2)
    assert.match(calls[1], /^stage publish .* --access public --provenance$/)
    if (mode === 'staged') assert.match(result.stdout, /::warning::@zavora-ai\/computer-use-mcp@9\.0\.0-test\.1 is already staged/)
    if (mode === 'denied') {
      assert.ok(result.stdout.includes('@zavora-ai/computer-use-mcp@9.0.0-test.1'))
      assert.ok(result.stdout.includes(`commit=${commit}`))
      assert.match(result.stdout, /artifact=release\/root\/main.tgz integrity=sha512-/)
      assert.equal(result.stdout.includes('::warning::'), false)
    }
  })
}
