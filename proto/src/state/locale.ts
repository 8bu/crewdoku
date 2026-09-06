import { atom } from 'jotai'

/**
 * UI-language shell (no i18n engine yet). The switcher in the nav rail
 * writes this atom and mirrors the choice onto `<html lang>`; nothing else
 * reads it until a real translation layer lands.
 *
 * EN + VI only — the product requirement (archived `ui-requirements.md`:
 * "English and Vietnamese, with a language switcher. Browser language
 * auto-detected on first run"), matching the deleted app's i18n catalogs.
 * Labels are endonyms so a user can find their own language regardless of
 * the current one.
 */
export type LocaleId = 'en' | 'vi'

export const LOCALES: { value: LocaleId; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
]

function detectLocale(): LocaleId {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('vi')) return 'vi'
  return 'en'
}

export const localeAtom = atom<LocaleId>(detectLocale())
