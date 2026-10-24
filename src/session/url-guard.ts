/**
 * Where `scrape` may fetch from (7.7.0, K9).
 *
 * A page the agent reads can tell it to fetch a URL, so scrape is a request any web page can make on this machine's
 * behalf. It used to reach loopback services, the router, the cloud metadata endpoint (169.254.169.254) and anything
 * else on the private network. It now fetches public addresses only, checks every address a name resolves to, and
 * follows redirects itself so each hop is checked too. `COMPUTER_USE_SCRAPE_ALLOW_PRIVATE=true` lifts the rule;
 * `COMPUTER_USE_SCRAPE_ALLOWED_HOSTS` (comma-separated host names) allows named hosts whatever they resolve to.
 */

import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type Lookup = (host: string) => Promise<string[]>

const defaultLookup: Lookup = async host => (await dnsLookup(host, { all: true, verbatim: true })).map(entry => entry.address)

function ipv4Octets(address: string): number[] | undefined {
  const parts = address.split('.').map(Number)
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : undefined
}

/** Why an address is not public, or undefined when it is. */
export function privateAddressReason(address: string): string | undefined {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  const v4 = ipv4Octets(mapped ? mapped[1] : address)
  if (v4) {
    const [a, b] = v4
    if (a === 127) return 'loopback'
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private network'
    if (a === 169 && b === 254) return 'link-local (cloud metadata lives here)'
    if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade NAT'
    if (a === 0) return 'unspecified'
    if (a >= 224) return 'multicast or reserved'
    return undefined
  }
  const v6 = address.toLowerCase()
  if (v6 === '::1') return 'loopback'
  if (v6 === '::') return 'unspecified'
  if (/^fe[89ab]/.test(v6)) return 'link-local'
  if (/^f[cd]/.test(v6)) return 'private network (unique local)'
  if (/^ff/.test(v6)) return 'multicast'
  return undefined
}

export interface UrlCheck { ok: true; url: URL }
export interface UrlRefusal { ok: false; error: 'url_not_allowed'; message: string; remediation: string[] }

/** Check one URL: http or https, and every address its host resolves to public unless configured otherwise. */
export async function checkFetchUrl(
  raw: string,
  options: { env?: NodeJS.ProcessEnv; lookup?: Lookup } = {},
): Promise<UrlCheck | UrlRefusal> {
  const env = options.env ?? process.env
  const refuse = (message: string): UrlRefusal => ({
    ok: false, error: 'url_not_allowed', message,
    remediation: [
      'scrape reads public web pages. For a local or private service, use the app or run_script, or set COMPUTER_USE_SCRAPE_ALLOW_PRIVATE=true (or name the host in COMPUTER_USE_SCRAPE_ALLOWED_HOSTS) if the person wants this.',
    ],
  })
  let url: URL
  try { url = new URL(raw) } catch { return refuse(`Not a URL: ${raw.slice(0, 200)}`) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return refuse(`Only http and https URLs are fetched, not ${url.protocol}`)
  if (env.COMPUTER_USE_SCRAPE_ALLOW_PRIVATE === 'true') return { ok: true, url }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const allowed = (env.COMPUTER_USE_SCRAPE_ALLOWED_HOSTS ?? '').split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
  if (allowed.includes(host)) return { ok: true, url }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return refuse(`${host} is a local name`)
  }
  let addresses: string[]
  try { addresses = isIP(host) ? [host] : await (options.lookup ?? defaultLookup)(host) } catch (error) {
    return refuse(`${host} does not resolve: ${error instanceof Error ? error.message : String(error)}`)
  }
  for (const address of addresses) {
    const reason = privateAddressReason(address)
    if (reason) return refuse(`${host} resolves to ${address} (${reason}), which scrape does not fetch`)
  }
  return { ok: true, url }
}

/**
 * Fetch with every redirect hop checked (at most five), so a public page cannot bounce the request to a private one.
 */
export async function guardedFetch(
  raw: string,
  init: RequestInit,
  options: { env?: NodeJS.ProcessEnv; lookup?: Lookup; fetch?: typeof globalThis.fetch } = {},
): Promise<Response | UrlRefusal> {
  const fetcher = options.fetch ?? globalThis.fetch
  let current = raw
  for (let hop = 0; hop <= 5; hop++) {
    const checked = await checkFetchUrl(current, options)
    if (!checked.ok) return checked
    const response = await fetcher(checked.url, { ...init, redirect: 'manual' })
    const location = response.headers?.get?.('location')
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, checked.url).toString()
      continue
    }
    return response
  }
  return { ok: false, error: 'url_not_allowed', message: 'More than five redirects', remediation: ['Fetch the final URL directly.'] }
}
