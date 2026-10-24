#!/usr/bin/env node
// Reach computer-use-mcp running inside UTM virtual machines from this Mac. The server has to run on the VM's own
// logged-in desktop and its HTTP runner listens on loopback only, so each VM gets an SSH tunnel from a local port to the
// VM's 127.0.0.1:3100, and the tunnel's URL is registered with Claude Code. Setting up the VMs and starting the server
// inside them is in docs/TESTING-IN-UTM.md.
//
//   node scripts/utm-vms.mjs up        open the tunnels and register win-vm and linux-vm with Claude Code
//   node scripts/utm-vms.mjs status    each VM's state, its tunnel, whether a server answers, its registration
//   node scripts/utm-vms.mjs down      close the tunnels (--unregister also removes the registrations)
//
// Options: --only windows|linux, --windows-vm <UTM name> (default "Windows 11"), --linux-vm (default "Ubuntu"),
// --windows-user / --linux-user (default: your Mac user name), --windows-host / --linux-host (skip utmctl and use this
// address), --windows-port / --linux-port (local ports, default 3101 / 3102), --remote-port (default 3100),
// --scope local|user|project (Claude Code scope, default local: this checkout only).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const usage = 'usage: node scripts/utm-vms.mjs up|status|down [--only windows|linux] [--unregister] (see the header of this file)'

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'windows-vm': { type: 'string', default: 'Windows 11' },
    'windows-user': { type: 'string', default: userInfo().username },
    'windows-host': { type: 'string' },
    'windows-port': { type: 'string', default: '3101' },
    'linux-vm': { type: 'string', default: 'Ubuntu' },
    'linux-user': { type: 'string', default: userInfo().username },
    'linux-host': { type: 'string' },
    'linux-port': { type: 'string', default: '3102' },
    'remote-port': { type: 'string', default: '3100' },
    only: { type: 'string' },
    scope: { type: 'string', default: 'local' },
    unregister: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const command = positionals[0]
if (opts.help || !['up', 'status', 'down'].includes(command)) {
  console.error(usage)
  process.exit(opts.help ? 0 : 2)
}
if (opts.only && !['windows', 'linux'].includes(opts.only)) fail(`--only must be windows or linux, not ${opts.only}`)
if (!['local', 'user', 'project'].includes(opts.scope)) fail(`--scope must be local, user or project, not ${opts.scope}`)

const port = (flag) => {
  const value = Number(opts[flag])
  if (!Number.isInteger(value) || value < 1 || value > 65_535) fail(`--${flag} must be an integer from 1 to 65535`)
  return value
}
const remotePort = port('remote-port')
const vms = ['windows', 'linux'].filter(os => !opts.only || opts.only === os).map(os => ({
  os,
  name: os === 'windows' ? 'win-vm' : 'linux-vm',
  utm: opts[`${os}-vm`],
  user: opts[`${os}-user`],
  host: opts[`${os}-host`],
  port: port(`${os}-port`),
}))

// utmctl ships inside UTM.app and is not on PATH unless you link it there.
const utmctl = process.env.UTMCTL ?? ['/Applications/UTM.app/Contents/MacOS/utmctl'].find(existsSync) ?? 'utmctl'
// One ssh control socket per tunnel, so `down` and `status` find the tunnel without a pid file.
const socketDir = join(homedir(), '.computer-use-mcp')
const socketOf = vm => join(socketDir, `utm-${vm.name}.sock`)

function fail(message) {
  console.error(message)
  process.exit(2)
}

function run(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8' })
  const missing = result.error?.code === 'ENOENT'
  if (result.error) return { ok: false, missing, out: '', err: missing ? `${file} not found` : result.error.message }
  return { ok: result.status === 0, missing, out: result.stdout.trim(), err: result.stderr.trim() }
}

// The VM's address: --<os>-host when given, otherwise the first IPv4 address UTM's guest agent reports.
function locate(vm) {
  if (vm.host) return { address: vm.host, state: 'address given' }
  const status = run(utmctl, ['status', vm.utm])
  if (!status.ok) return { error: `utmctl status "${vm.utm}": ${status.err || status.out}` }
  if (status.out !== 'started') return { error: `"${vm.utm}" is ${status.out}; start it with: ${utmctl} start "${vm.utm}"`, state: status.out }
  const ips = run(utmctl, ['ip-address', vm.utm])
  const address = ips.out.split('\n').map(line => line.trim()).find(line => /^\d+\.\d+\.\d+\.\d+$/.test(line))
  if (!address) return { error: `no IPv4 address from "${vm.utm}" (is the guest agent installed?); pass --${vm.os}-host`, state: status.out }
  return { address, state: status.out }
}

const tunnelOpen = vm => run('ssh', ['-S', socketOf(vm), '-O', 'check', 'tunnel']).ok

function openTunnel(vm, address) {
  mkdirSync(socketDir, { recursive: true })
  // Inherit the terminal so a password or host-key prompt reaches you; -f backgrounds ssh once it is authenticated.
  const result = spawnSync('ssh', [
    '-f', '-N', '-M', '-S', socketOf(vm),
    '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
    '-L', `127.0.0.1:${vm.port}:127.0.0.1:${remotePort}`,
    `${vm.user}@${address}`,
  ], { stdio: 'inherit' })
  return result.status === 0
}

// A tunnel can be open while nothing listens inside the VM, so ask the server itself.
async function probe(vm) {
  try {
    const response = await fetch(`http://127.0.0.1:${vm.port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'utm-vms', version: '1' } },
      }),
      signal: AbortSignal.timeout(5000),
    })
    const body = await response.text()
    const json = body.trimStart().startsWith('{') ? body : body.split('\n').find(line => line.startsWith('data:'))?.slice(5)
    const info = (() => { try { return JSON.parse(json ?? '').result?.serverInfo } catch { return undefined } })()
    return info ? `${info.name} ${info.version}` : `answers with HTTP ${response.status}`
  } catch {
    return undefined
  }
}

const urlOf = vm => `http://127.0.0.1:${vm.port}/mcp`

function registration(vm) {
  const existing = run('claude', ['mcp', 'get', vm.name])
  if (!existing.ok) return existing.missing ? 'claude not found on PATH' : undefined
  return existing.out.includes(urlOf(vm)) ? 'registered' : 'registered with another URL'
}

function register(vm) {
  const current = registration(vm)
  if (current === 'registered' || current === 'claude not found on PATH') return current
  if (current) run('claude', ['mcp', 'remove', vm.name])
  const added = run('claude', ['mcp', 'add', '--transport', 'http', '-s', opts.scope, vm.name, urlOf(vm)])
  if (!added.ok) return `not registered: ${added.err || added.out}`
  return current ? `re-registered (${opts.scope} scope)` : `registered (${opts.scope} scope)`
}

const line = (label, text) => console.log(`  ${label.padEnd(8)}${text}`)
let failures = 0

for (const vm of vms) {
  console.log(`${vm.name}  (${vm.os}, UTM "${vm.utm}", ${urlOf(vm)})`)

  if (command === 'down') {
    if (tunnelOpen(vm)) {
      const closed = run('ssh', ['-S', socketOf(vm), '-O', 'exit', 'tunnel'])
      line('tunnel', closed.ok ? 'closed' : `could not close: ${closed.err}`)
      if (!closed.ok) failures++
    } else {
      line('tunnel', 'not open')
    }
    if (opts.unregister) {
      const removed = run('claude', ['mcp', 'remove', vm.name])
      line('Claude', removed.ok ? 'unregistered' : `not unregistered: ${removed.err || removed.out}`)
    }
    continue
  }

  const open = tunnelOpen(vm)
  const where = open ? undefined : locate(vm)
  if (where?.error) {
    line('VM', where.error)
    failures++
    continue
  }
  if (where) line('VM', `${where.state}, ${where.address}`)

  if (open) {
    line('tunnel', `open: 127.0.0.1:${vm.port} → VM 127.0.0.1:${remotePort}`)
  } else if (command === 'up') {
    if (!openTunnel(vm, where.address)) {
      line('tunnel', `ssh ${vm.user}@${where.address} failed (is the VM's SSH server running? see the output above)`)
      failures++
      continue
    }
    line('tunnel', `opened: 127.0.0.1:${vm.port} → ${where.address} 127.0.0.1:${remotePort}`)
  } else {
    line('tunnel', 'not open (run: node scripts/utm-vms.mjs up)')
  }

  if (open || command === 'up') {
    const server = await probe(vm)
    line('server', server ?? `nothing answers: start computer-use-mcp-http in a terminal on the VM's desktop`)
  }
  line('Claude', command === 'up' ? register(vm) : (registration(vm) ?? 'not registered'))
}

process.exitCode = failures ? 1 : 0
