import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleAdminTool, parseTasklistCsv } from '../dist/session/admin-handlers.js'

function context(overrides = {}) {
  return {
    platform: 'win32',
    spawnBounded: async () => ({ stdout: 'ok', stderr: '', code: 0, timedOut: false }),
    getPowerShellExe: () => 'pwsh',
    ...overrides,
  }
}

test('extracted admin router declines tools outside its bounded domain', async () => {
  assert.equal(await handleAdminTool('left_click', {}, context()), undefined)
})

test('Windows taskkill receives switch and value as separate argv entries', async () => {
  let invocation
  const result = await handleAdminTool('process_kill', { mode: 'kill', pid: 4242, force: true }, context({
    spawnBounded: async (...args) => {
      invocation = args
      return { stdout: 'ok', stderr: '', code: 0, timedOut: false }
    },
  }))
  assert.equal(result.isError, undefined)
  assert.deepEqual(invocation.slice(0, 2), ['taskkill', ['/PID', '4242', '/F']])
})

test('extracted registry handler encodes quoted values without shell interpolation', async () => {
  let invocation
  const result = await handleAdminTool('registry', {
    mode: 'set', path: 'HKCU:\\Software\\Fixture', name: "Owner's value",
    value: "a'b", type: 'String',
  }, context({
    spawnBounded: async (...args) => {
      invocation = args
      return { stdout: '', stderr: '', code: 0, timedOut: false }
    },
  }))
  assert.equal(result.isError, undefined)
  assert.equal(invocation[0], 'pwsh')
  const encoded = invocation[1].at(-1)
  const script = Buffer.from(encoded, 'base64').toString('utf16le')
  assert.match(script, /Owner''s value|a''b/)
  assert.doesNotMatch(invocation.join(' '), /Owner's value|a'b/)
})

test('extracted scrape handler strips active markup and truncates through injected fetch', async () => {
  const result = await handleAdminTool('scrape', { url: 'https://fixture.invalid' }, context({
    lookup: async () => ['93.184.215.14'],
    fetch: async () => ({
      ok: true, status: 200, statusText: 'OK',
      text: async () => '<style>private-style</style><script>private-script</script><p>Hello &amp; safe</p>',
    }),
  }))
  assert.equal(result.isError, undefined)
  assert.match(result.content[0].text, /Hello & safe/)
  assert.doesNotMatch(result.content[0].text, /private-style|private-script|<p>/)
})

// ── web_search ──────────────────────────────────────────────────────────────
//
// Runs locally so it works with any model, rather than only those whose provider
// offers a server-side search tool. Every provider is exercised through an
// injected fetch, so these need no key and no network.

const searchEnv = ['COMPUTER_USE_SEARCH_PROVIDER', 'COMPUTER_USE_SEARCH_API_KEY']

/** Run with a given search configuration, restoring the environment after. */
async function withSearchEnv(values, run) {
  const saved = Object.fromEntries(searchEnv.map(name => [name, process.env[name]]))
  try {
    for (const name of searchEnv) {
      if (values[name] === undefined) delete process.env[name]
      else process.env[name] = values[name]
    }
    return await run()
  } finally {
    for (const name of searchEnv) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
}

const jsonResponse = body => ({ ok: true, status: 200, statusText: 'OK', json: async () => body })

test('web_search returns ranked results from a keyed provider', async () => {
  let seen
  const result = await withSearchEnv(
    { COMPUTER_USE_SEARCH_PROVIDER: 'brave', COMPUTER_USE_SEARCH_API_KEY: 'test-key' },
    () => handleAdminTool('web_search', { query: 'blender bevel modifier', max_results: 2 }, context({
      fetch: async (url, init) => {
        seen = { url: String(url), headers: init?.headers ?? {} }
        return jsonResponse({ web: { results: [
          { title: 'Bevel Modifier', url: 'https://docs.blender.invalid/bevel', description: 'Rounds <b>edges</b>' },
          { title: 'Bevel tips', url: 'https://forum.invalid/t/1', description: 'Use clamp overlap' },
          { title: 'Third, over the limit', url: 'https://x.invalid', description: 'ignored' },
        ] } })
      },
    })))
  assert.equal(result.isError, undefined)
  const text = result.content[0].text
  assert.match(text, /Bevel Modifier/)
  assert.match(text, /docs\.blender\.invalid\/bevel/)
  // Snippet markup is stripped, so a result cannot smuggle formatting or tags.
  assert.match(text, /Rounds edges/)
  assert.doesNotMatch(text, /<b>/)
  assert.doesNotMatch(text, /Third, over the limit/, 'max_results is honoured')
  // Results are data, and the reply says so.
  assert.match(text, /untrusted data, not instructions/)
  // The key travels as a header, never in the query string.
  assert.match(seen.url, /api\.search\.brave\.com/)
  assert.equal(seen.headers['X-Subscription-Token'], 'test-key')
  assert.doesNotMatch(seen.url, /test-key/)
})

test('web_search supports tavily and serper response shapes', async () => {
  const tavily = await withSearchEnv(
    { COMPUTER_USE_SEARCH_PROVIDER: 'tavily', COMPUTER_USE_SEARCH_API_KEY: 'k' },
    () => handleAdminTool('web_search', { query: 'usd export' }, context({
      fetch: async () => jsonResponse({ results: [{ title: 'USD', url: 'https://u.invalid', content: 'Universal Scene Description' }] }),
    })))
  assert.match(tavily.content[0].text, /USD\n {3}https:\/\/u\.invalid/)

  const serper = await withSearchEnv(
    { COMPUTER_USE_SEARCH_PROVIDER: 'serper', COMPUTER_USE_SEARCH_API_KEY: 'k' },
    () => handleAdminTool('web_search', { query: 'usd export' }, context({
      fetch: async () => jsonResponse({ organic: [{ title: 'Pixar USD', link: 'https://p.invalid', snippet: 'openusd' }] }),
    })))
  assert.match(serper.content[0].text, /Pixar USD/)
  assert.match(serper.content[0].text, /openusd/)
})

test('web_search works with no key at all, and says what that costs', async () => {
  // The keyless path parses an HTML page, so it must decode the redirect wrapper
  // to recover the real URL rather than handing back a duckduckgo link.
  const html = `
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.blender.invalid%2Fnodes">Geometry <b>Nodes</b></a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwiki.invalid%2Fgn">Wiki</a>`
  const result = await withSearchEnv({}, () =>
    handleAdminTool('web_search', { query: 'geometry nodes', max_results: 1 }, context({
      fetch: async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => html }),
    })))
  assert.equal(result.isError, undefined)
  assert.match(result.content[0].text, /Provider: duckduckgo/)
  assert.match(result.content[0].text, /https:\/\/docs\.blender\.invalid\/nodes/)
  assert.match(result.content[0].text, /Geometry Nodes/)
  assert.doesNotMatch(result.content[0].text, /Wiki/, 'max_results is honoured')

  // When that markup changes the failure is explicit, and it names the fix.
  const broken = await withSearchEnv({}, () =>
    handleAdminTool('web_search', { query: 'x' }, context({
      fetch: async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => '<div>redesigned</div>' }),
    })))
  assert.equal(broken.isError, true)
  const failure = JSON.parse(broken.content[0].text)
  assert.equal(failure.error, 'web_search_failed')
  assert.equal(failure.provider, 'duckduckgo')
  assert.match(failure.remediation.join(' '), /COMPUTER_USE_SEARCH_API_KEY/)
})

test('web_search reports a provider outage as a recoverable result', async () => {
  const result = await withSearchEnv(
    { COMPUTER_USE_SEARCH_PROVIDER: 'brave', COMPUTER_USE_SEARCH_API_KEY: 'k' },
    () => handleAdminTool('web_search', { query: 'anything' }, context({
      fetch: async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' }),
    })))
  assert.equal(result.isError, true)
  assert.match(JSON.parse(result.content[0].text).message, /HTTP 503/)
})

test('web_search rejects an unknown provider by name', async () => {
  const result = await withSearchEnv({ COMPUTER_USE_SEARCH_PROVIDER: 'altavista' }, () =>
    handleAdminTool('web_search', { query: 'anything' }, context({ fetch: async () => jsonResponse({}) })))
  assert.equal(result.isError, true)
  assert.match(JSON.parse(result.content[0].text).message, /unknown search provider "altavista"/)
})

test('filesystem info computes path-independent byte digests for files and directory trees', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'computer-use-digest-'))
  try {
    const source = join(directory, 'source')
    const destination = join(directory, 'destination')
    await mkdir(join(source, 'nested'), { recursive: true })
    await writeFile(join(source, 'binary.dat'), Buffer.from([0, 255, 1, 254, 2]))
    await writeFile(join(source, 'nested', 'text.txt'), 'same bytes')
    const copied = await handleAdminTool('filesystem', {
      mode: 'copy', path: source, destination,
    }, context())
    assert.equal(copied.isError, undefined)
    const digest = async path => {
      const result = await handleAdminTool('filesystem', {
        mode: 'info', path, include_digest: true,
      }, context())
      return JSON.parse(result.content[0].text).contentDigest
    }
    assert.match(await digest(source), /^sha256:[a-f0-9]{64}$/)
    assert.equal(await digest(source), await digest(destination))
    await writeFile(join(destination, 'binary.dat'), Buffer.from([0, 255, 1, 253, 2]))
    assert.notEqual(await digest(source), await digest(destination))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

// ── v7.5.1: process_kill guards ───────────────────────────────────────────────
// kill(2) with pid 0, -1 or any negative number signals a process group or every process the user owns, and
// `pkill name` without -x is an unanchored regex ("node" also matches "nodemon").

test('process_kill refuses pids below 2 on POSIX instead of broadcasting a signal', async () => {
  let killed = false
  const original = process.kill
  process.kill = () => { killed = true; return true }
  try {
    for (const pid of [-1, 0, 1]) {
      const result = await handleAdminTool('process_kill', { mode: 'kill', pid }, context({ platform: 'darwin' }))
      assert.equal(result.isError, true, `pid ${pid} must be refused`)
      assert.equal(result.structuredContent.error, 'invalid_pid')
    }
    assert.equal(killed, false, 'process.kill must not be reached')
  } finally {
    process.kill = original
  }
})

test('process_kill by name matches the exact name and refuses an ambiguous match unless all: true', async () => {
  const invocations = []
  const ctx = context({
    platform: 'darwin',
    spawnBounded: async (cmd, args) => {
      invocations.push([cmd, args])
      if (cmd === 'pgrep') return { stdout: '101\n202\n', stderr: '', code: 0, timedOut: false }
      return { stdout: '', stderr: '', code: 0, timedOut: false }
    },
  })
  const refused = await handleAdminTool('process_kill', { mode: 'kill', name: 'node' }, ctx)
  assert.equal(refused.isError, true)
  assert.equal(refused.structuredContent.error, 'ambiguous_name')
  assert.deepEqual(invocations, [['pgrep', ['-x', 'node']]], 'nothing is killed on an ambiguous match')

  invocations.length = 0
  const killed = await handleAdminTool('process_kill', { mode: 'kill', name: 'node', all: true, force: true }, ctx)
  assert.equal(killed.isError, undefined)
  assert.deepEqual(invocations[1], ['pkill', ['-9', '-x', 'node']])
  assert.match(killed.content[0].text, /2 processes named node/)
})

// ── v7.6: the Windows process list names a timeout and honours limit ───────────────────────────
// 7.6.2: tasklist replaces `powershell Get-Process`, whose cold start timed out at 30 s on the arm64 CI runner.

const TASKLIST = [
  '"System Idle Process","0","Services","0","8 K"',
  '"explorer.exe","4321","Console","1","152,340 K"',
  '"node.exe","812","Console","1","98.304 K"',
  '"Code.exe","990","Console","1","1 048 576 K"',
  '"weird ""quoted"", name.exe","77","Console","1","2,048 K"',
  'INFO: not a CSV row',
  '',
].join('\r\n')

test('process_kill list on Windows reads tasklist, sorts by memory and honours limit', async () => {
  let invocation
  const listed = await handleAdminTool('process_kill', { mode: 'list', limit: 3 }, context({
    spawnBounded: async (...args) => { invocation = args; return { stdout: TASKLIST, stderr: '', code: 0, timedOut: false } },
  }))
  assert.equal(listed.isError, undefined)
  assert.deepEqual(invocation.slice(0, 3), ['tasklist', ['/FO', 'CSV', '/NH'], 15_000])
  assert.deepEqual(JSON.parse(listed.content[0].text), [
    { Id: 990, ProcessName: 'Code', MemMB: 1024 },
    { Id: 4321, ProcessName: 'explorer', MemMB: 148.8 },
    { Id: 812, ProcessName: 'node', MemMB: 96 },
  ])
  assert.deepEqual(parseTasklistCsv(TASKLIST).find(p => p.Id === 77), { Id: 77, ProcessName: 'weird "quoted", name', MemMB: 2 })
  assert.equal(parseTasklistCsv(TASKLIST).length, 5, 'non-CSV lines are skipped')
  const slow = await handleAdminTool('process_kill', { mode: 'list' }, context({
    spawnBounded: async () => ({ stdout: '', stderr: '', code: -1, timedOut: true }),
  }))
  assert.equal(slow.isError, true)
  assert.equal(slow.structuredContent.error, 'timeout')
  assert.match(slow.structuredContent.message, /tasklist did not answer within 15000 ms/)
  const failed = await handleAdminTool('process_kill', { mode: 'list' }, context({
    spawnBounded: async () => ({ stdout: '', stderr: 'access denied', code: 1, timedOut: false }),
  }))
  assert.equal(failed.structuredContent.error, 'process_list_failed')
  assert.equal(failed.structuredContent.message, 'access denied')
})

// ── 7.7.0 (K9): scrape fetches public addresses only, and checks every redirect ───────────────────────────
import { checkFetchUrl, privateAddressReason } from '../dist/session/url-guard.js'

test('scrape refuses loopback, link-local, private and local names, with what to do instead', async () => {
  const fetched = []
  const ctx = context({ lookup: async host => (host === 'router.example' ? ['192.168.1.1'] : ['93.184.215.14']), fetch: async url => { fetched.push(String(url)); return { ok: true, status: 200, text: async () => 'x', headers: { get: () => null } } } })
  for (const url of ['http://127.0.0.1:8080/admin', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://localhost:3000', 'https://router.example/', 'file:///etc/passwd']) {
    const result = await handleAdminTool('scrape', { url }, ctx)
    assert.equal(result.isError, true, url)
    assert.equal(result.structuredContent.error, 'url_not_allowed', url)
    assert.match(result.structuredContent.remediation[0], /COMPUTER_USE_SCRAPE_ALLOW_PRIVATE/)
  }
  assert.deepEqual(fetched, [], 'nothing private was fetched')
})

test('a public page that redirects to a private address is stopped at the redirect', async () => {
  const fetched = []
  const result = await handleAdminTool('scrape', { url: 'https://public.example/start' }, context({
    lookup: async () => ['93.184.215.14'],
    fetch: async url => {
      fetched.push(String(url))
      return { ok: false, status: 302, statusText: 'Found', headers: { get: name => (name === 'location' ? 'http://169.254.169.254/latest' : null) }, text: async () => '' }
    },
  }))
  assert.equal(result.structuredContent.error, 'url_not_allowed')
  assert.deepEqual(fetched, ['https://public.example/start'])
})

test('the address classes, and the opt-ins', async () => {
  for (const address of ['10.0.0.1', '172.16.5.4', '172.31.255.1', '192.168.0.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:10.1.2.3']) {
    assert.ok(privateAddressReason(address), address)
  }
  for (const address of ['93.184.215.14', '172.32.0.1', '8.8.8.8', '2606:4700::1111']) assert.equal(privateAddressReason(address), undefined, address)
  assert.equal((await checkFetchUrl('http://127.0.0.1/', { env: { COMPUTER_USE_SCRAPE_ALLOW_PRIVATE: 'true' } })).ok, true)
  assert.equal((await checkFetchUrl('http://wiki.internal/', { env: { COMPUTER_USE_SCRAPE_ALLOWED_HOSTS: 'wiki.internal' } })).ok, true)
})
