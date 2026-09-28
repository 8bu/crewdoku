import { atom } from 'jotai'
import { isLocaleId, readGeoLocale } from '../i18n/geo'
import { LOCALE_IDS, type LocaleId } from '../i18n/localeIds'

/**
 * UI language. The switcher in the nav rail writes `localeAtom`, which drives
 * `useT` app-wide and is mirrored onto `<html lang>`. The choice is saved to
 * localStorage so it survives a reload; a fresh visitor with no saved choice
 * gets the region default set at the edge, then their browser language
 * auto-detected.
 *
 * The locales themselves are listed once, in `i18n/localeIds.ts`; this module
 * gives each one the endonym the switcher shows, so a user can find their own
 * language regardless of the current one (a missing or extra label is a compile
 * error). First-load precedence, in order: the saved choice, then the geo cookie
 * the edge Worker set from `cf-ipcountry`, then the browser language, then EN
 * (see `initialLocale`).
 */
export const LOCALE_STORAGE_KEY = 'crewdoku-locale'

const LOCALE_LABELS: Record<LocaleId, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
  es: 'Español',
  fr: 'Français',
  ja: '日本語',
  de: 'Deutsch',
  pt: 'Português',
}

export const LOCALES: { value: LocaleId; label: string }[] = LOCALE_IDS.map((value) => ({
  value,
  label: LOCALE_LABELS[value],
}))

/**
 * The browser's preferred language ("pt-BR") reduced to its primary subtag and
 * narrowed to a supported locale; EN when there is no match.
 */
function detectLocale(): LocaleId {
  if (typeof navigator !== 'undefined') {
    const primary = navigator.language.toLowerCase().split('-')[0]
    if (isLocaleId(primary)) return primary
  }
  return 'en'
}

/**
 * The locale for the very first render, in precedence order: an explicit saved
 * choice, then the region default the edge Worker stamped into the cookie from
 * `cf-ipcountry` (see `worker.ts`), then the browser language, then EN.
 */
export function initialLocale(): LocaleId {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isLocaleId(saved)) return saved
  }
  // Set by the edge Worker from `cf-ipcountry` — a first-run default only.
  if (typeof document !== 'undefined') {
    const geo = readGeoLocale(document.cookie)
    if (geo) return geo
  }
  return detectLocale()
}

export const localeAtom = atom<LocaleId>(initialLocale())
