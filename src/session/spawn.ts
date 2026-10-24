/**
 * Spawn + timing helpers — extracted verbatim from session.ts (PR-13b split).
 */

import { execFile, spawn, type ChildProcess } from 'child_process'
import { StringDecoder } from 'node:string_decoder'

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Sleep that resolves early if the signal aborts. Resolves `true` when it was
 * cut short by an abort, `false` when the full duration elapsed. (PR-14 cancellation.)
 */
export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(true)
  return new Promise<boolean>(resolve => {
    const timer = setTimeout(() => { cleanup(); resolve(false) }, ms)
    const onAbort = () => { clearTimeout(timer); cleanup(); resolve(true) }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// ── Scripting bridge ──────────────────────────────────────────────────────────

export interface SpawnResult {
  stdout: string
  stderr: string
  code: number
  timedOut: boolean
}

const MAX_SUBPROCESS_OUTPUT_BYTES = 8 * 1024 * 1024

/**
 * How long output may keep arriving after the process exits (7.7.0, K9). A backgrounded grandchild that inherited the
 * pipes kept them open, and `close` waited for it until the call timed out; now the call completes this long after
 * `exit` with what was written.
 */
export const EXIT_GRACE_MS = 500

export type SpawnBounded = (
  cmd: string,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
  input?: string,
) => Promise<SpawnResult>

const CONTROL_PLANE_ENV = /^(?:COMPUTER_USE_SUPERVISOR_|COMPUTER_USE_REMOTE_|COMPUTER_USE_APPROVAL_TOKEN$|COMPUTER_USE_PRINCIPAL_ID$|COMPUTER_USE_SESSION_ID$)/
const SENSITIVE_ENV = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIALS?|COOKIE|AUTHORIZATION)(?:$|_)/
const HIGH_RISK_ENV = /^(?:SSH_AUTH_SOCK|GPG_AGENT_INFO|KUBECONFIG|DOCKER_CONFIG|NETRC)$/

/**
 * Prevent model-authored child processes from inheriting host/control-plane
 * credentials. Generic secret-shaped variables require an explicit name in
 * COMPUTER_USE_SCRIPT_ENV_ALLOWLIST; supervisor/remote authority is never
 * inheritable, even through that escape hatch.
 */
export function sanitizedChildEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allow = new Set((env.COMPUTER_USE_SCRIPT_ENV_ALLOWLIST ?? '')
    .split(',').map(value => value.trim()).filter(Boolean))
  const result: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || name === 'COMPUTER_USE_SCRIPT_ENV_ALLOWLIST') continue
    if (CONTROL_PLANE_ENV.test(name)) continue
    if ((SENSITIVE_ENV.test(name) || HIGH_RISK_ENV.test(name)) && !allow.has(name)) continue
    result[name] = value
  }
  return result
}

/**
 * Terminate the complete process tree rooted at a model-authored subprocess.
 *
 * POSIX children are launched as process-group leaders, so a negative PID
 * reaches the interpreter and every descendant that has not deliberately
 * escaped into a new session. Windows does not expose POSIX process groups;
 * taskkill /T performs the corresponding recursive tree walk. This helper is
 * intentionally not exported as a general process-kill primitive.
 */
function terminateProcessTree(child: ChildProcess): void {
  const pid = child.pid
  if (!Number.isInteger(pid) || !pid || pid <= 0) {
    try { child.kill('SIGKILL') } catch { /* process already exited */ }
    return
  }

  if (process.platform === 'win32') {
    const fallback = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* process already exited */ }
    }, 1_000)
    fallback.unref()
    try {
      const killer = execFile('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        timeout: 5_000,
        env: sanitizedChildEnvironment(),
      }, () => {
        clearTimeout(fallback)
        try { child.kill('SIGKILL') } catch { /* process already exited */ }
      })
      killer.unref()
    } catch {
      clearTimeout(fallback)
      try { child.kill('SIGKILL') } catch { /* process already exited */ }
    }
    return
  }

  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try { child.kill('SIGKILL') } catch { /* process already exited */ }
  }
}

/** Spawn a process with a hard timeout. Terminates its process tree on overrun or abort. */
export const defaultSpawnBounded: SpawnBounded = (cmd, args, timeoutMs, signal, input) =>
  new Promise<SpawnResult>(resolve => {
    if (signal?.aborted) {
      resolve({ stdout: '', stderr: 'aborted', code: -1, timedOut: false })
      return
    }
    const child = spawn(cmd, args, {
      env: sanitizedChildEnvironment(),
      windowsHide: true,
      // On POSIX this creates a process group that can be atomically killed.
      // Windows recursive termination is handled with taskkill /T below.
      detached: process.platform !== 'win32',
    })
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)
    let stdout = ''
    let stderr = ''
    // One decoder per stream, so a multi-byte character split across two chunks is not turned into U+FFFD (W6).
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }
    let capturedBytes = 0
    let outputLimitExceeded = false
    let timedOut = false
    let aborted = false
    let terminationRequested = false
    const terminate = () => {
      if (terminationRequested) return
      terminationRequested = true
      terminateProcessTree(child)
    }
    const capture = (stream: 'stdout' | 'stderr', chunk: Buffer | string) => {
      if (outputLimitExceeded) return
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const remaining = MAX_SUBPROCESS_OUTPUT_BYTES - capturedBytes
      if (bytes.byteLength > remaining) {
        const retained = decoders[stream].write(bytes.subarray(0, Math.max(remaining, 0))) + decoders[stream].end()
        if (stream === 'stdout') stdout += retained
        else stderr += retained
        capturedBytes = MAX_SUBPROCESS_OUTPUT_BYTES
        outputLimitExceeded = true
        stderr += `${stderr ? '\n' : ''}subprocess output exceeded ${MAX_SUBPROCESS_OUTPUT_BYTES} bytes`
        terminate()
        return
      }
      capturedBytes += bytes.byteLength
      if (stream === 'stdout') stdout += decoders.stdout.write(bytes)
      else stderr += decoders.stderr.write(bytes)
    }
    child.stdout?.on('data', chunk => { capture('stdout', chunk) })
    child.stderr?.on('data', chunk => { capture('stderr', chunk) })
    const onAbort = () => {
      aborted = true
      terminate()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const killer = setTimeout(() => {
      timedOut = true
      terminate()
    }, Math.max(timeoutMs, 100))
    let settled = false
    let grace: ReturnType<typeof setTimeout> | undefined
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(killer)
      if (grace) clearTimeout(grace)
      cleanup()
      if (!outputLimitExceeded) {
        stdout += decoders.stdout.end()
        stderr += decoders.stderr.end()
      }
      resolve({
        stdout,
        stderr: aborted ? (stderr || 'aborted') : stderr,
        // taskkill reports its own platform-specific exit status on Windows.
        // Preserve the stable SpawnResult contract for an output-limit kill.
        code: outputLimitExceeded ? -1 : (code ?? -1),
        timedOut,
      })
    }
    child.on('error', err => {
      if (settled) return
      settled = true
      clearTimeout(killer)
      if (grace) clearTimeout(grace)
      cleanup()
      resolve({ stdout, stderr: stderr || String(err), code: -1, timedOut })
    })
    child.on('exit', code => {
      // Output still buffered in the pipes normally arrives before `close`; a grandchild holding them gets the grace.
      grace = setTimeout(() => {
        child.stdout?.destroy()
        child.stderr?.destroy()
        finish(code)
      }, EXIT_GRACE_MS)
    })
    child.on('close', code => finish(code))
  })
