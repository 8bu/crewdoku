import { atom } from 'jotai'

/**
 * UI language. The switcher in the nav rail writes `localeAtom`, which drives
 * `useT` app-wide and is mirrored onto `<html lang>`. The choice is saved to
 * localStorage so it survives a reload; a fresh visitor with no saved choice
 * gets their browser language auto-detected (EN or VI).
 *
 * EN + VI only — the product requirement (archived `ui-requirements.md`:
 * "English and Vietnamese, with a language switcher. Browser language
 * auto-detected on first run"). Labels are endonyms so a user can find their
 * own language regardless of the current one.
 */
export type LocaleId = 'en' | 'vi'

export const LOCALE_STORAGE_KEY = 'crewdoku-locale'

export const LOCALES: { value: LocaleId; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
]

function detectLocale(): LocaleId {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('vi')) return 'vi'
  return 'en'
}

function initialLocale(): LocaleId {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (saved === 'en' || saved === 'vi') return saved
  }
  return detectLocale()
}

export const localeAtom = atom<LocaleId>(initialLocale())
