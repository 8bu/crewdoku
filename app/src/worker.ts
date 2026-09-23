import { GEO_LOCALE_COOKIE, localeForCountry } from './i18n/geo'

/**
 * Crewdoku's front controller. Static assets do all the real serving; the
 * Worker exists only to give a *first* visit a sensible locale: it resolves the
 * visitor's region from Cloudflare's `cf-ipcountry` and stamps it on the HTML
 * response as the `crewdoku-geo` cookie, which the client reads when seeding
 * `localeAtom` (see `state/locale.ts`).
 *
 * Precedence is deliberately split across the two sides: an explicit pick in
 * the browser (localStorage-backed) always wins client-side and this Worker
 * never overwrites it — the edge only supplies the *default* for someone who has
 * never chosen. The response carrying that decision is per-visitor, so it must
 * never be cached (`private, no-store`); non-HTML assets are passed through
 * untouched and stay cacheable.
 */
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

/** One year — the decision is a default, not a session value. */
const GEO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const locale = localeForCountry(request.headers.get('cf-ipcountry'))
    const res = await env.ASSETS.fetch(request)

    // No region signal, or a region with no dedicated locale: serve as-is.
    if (locale === null) return res
    // Only the document seeds the client locale; JS/CSS/media are cacheable
    // and must not carry a per-visitor cookie.
    if (!(res.headers.get('content-type') ?? '').startsWith('text/html')) return res

    const headers = new Headers(res.headers)
    headers.set(
      'set-cookie',
      `${GEO_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${GEO_COOKIE_MAX_AGE}; SameSite=Lax`,
    )
    headers.set('cache-control', 'private, no-store')
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  },
}
