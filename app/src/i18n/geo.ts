/**
 * Region-based locale default, shared by BOTH sides of the first load: the edge
 * Worker (`src/worker.ts`) reads `cf-ipcountry` from the visitor's request and
 * stamps the `crewdoku-geo` cookie, and the client (`state/locale.ts`) reads that
 * cookie to seed the very first `localeAtom` value. This catches a Vietnamese
 * visitor on an English-set browser, which `navigator.language` alone misses.
 *
 * Deliberately dependency-free — only a type import — because it is bundled into
 * the edge Worker, where importing the jotai-backed locale module (or any other
 * client state) would be wrong. Keep every addition to this file pure and
 * side-effect-free.
 */
import type { LocaleId } from '../state/locale'

/** Cookie the edge Worker writes with the visitor's geo-resolved locale. */
export const GEO_LOCALE_COOKIE = 'crewdoku-geo'

/**
 * ISO 3166-1 alpha-2 country codes that map to a locale, keyed by locale so
 * adding a language keeps the mapping in one place. Only countries where the
 * language is clearly dominant are listed; the deliberately unlisted
 * multilingual countries (BE, CH, CA, IN, …) fall through to the browser
 * language, which is the better signal there. Anything unlisted also falls back
 * to EN as the last resort.
 */
const LOCALE_COUNTRIES: Partial<Record<LocaleId, readonly string[]>> = {
  vi: ['VN'],
  es: ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY'],
  fr: ['FR', 'MC'],
  ja: ['JP'],
  de: ['DE', 'AT', 'LI'],
  pt: ['BR', 'PT', 'AO', 'MZ'],
}

const COUNTRY_LOCALE: Record<string, LocaleId> = Object.fromEntries(
  Object.entries(LOCALE_COUNTRIES).flatMap(([locale, countries]) =>
    (countries ?? []).map((country) => [country, locale as LocaleId]),
  ),
)

/** Best-effort map of a country code ("VN") to a locale, or `null` if none. */
export function localeForCountry(country: string | null | undefined): LocaleId | null {
  if (!country) return null
  return COUNTRY_LOCALE[country.toUpperCase()] ?? null
}

/**
 * Every supported locale, as an exhaustive map — a new `LocaleId` member without
 * an entry here is a compile error, which keeps `isLocaleId` honest.
 */
const SUPPORTED: Record<LocaleId, true> = {
  en: true,
  vi: true,
  es: true,
  fr: true,
  ja: true,
  de: true,
  pt: true,
}

/**
 * Narrows an untrusted string (a cookie value, a browser language tag) to a
 * supported locale. `hasOwn` (not `in`) keeps prototype keys such as
 * `'toString'` out.
 */
export function isLocaleId(v: string | null | undefined): v is LocaleId {
  return v != null && Object.hasOwn(SUPPORTED, v)
}

/**
 * Reads the geo locale out of a `Cookie:` header (or `document.cookie`), which
 * carries `; `-separated `name=value` pairs. Returns `null` when the cookie is
 * absent or holds anything that is not a supported locale.
 */
export function readGeoLocale(cookieHeader: string | null | undefined): LocaleId | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== GEO_LOCALE_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    return isLocaleId(value) ? value : null
  }
  return null
}
