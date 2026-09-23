import { describe, expect, it, vi } from 'vitest'
import worker from './worker'

/** A stand-in for the assets binding, returning whatever the test wants. */
function assetEnv(response: Response) {
  return { ASSETS: { fetch: vi.fn(async () => response) } }
}

function requestFrom(country: string): Request {
  return new Request('https://crewdoku.8bu.dev/', { headers: { 'cf-ipcountry': country } })
}

describe('worker geo locale default', () => {
  it('stamps the geo cookie on an HTML document and marks it uncacheable', async () => {
    const original = new Response('<!doctype html><h1>Crewdoku</h1>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
    const res = await worker.fetch(requestFrom('VN'), assetEnv(original))

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('crewdoku-geo=vi')
    expect(cookie).toContain('Path=/')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.text()).toBe('<!doctype html><h1>Crewdoku</h1>')
  })

  it('leaves a request from a region with no dedicated locale untouched', async () => {
    const original = new Response('<html></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' },
    })
    const res = await worker.fetch(requestFrom('US'), assetEnv(original))

    expect(res).toBe(original)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('does not stamp the cookie on a non-document asset', async () => {
    const original = new Response('export const a = 1', {
      headers: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=60' },
    })
    const res = await worker.fetch(requestFrom('VN'), assetEnv(original))

    expect(res).toBe(original)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')
  })
})
