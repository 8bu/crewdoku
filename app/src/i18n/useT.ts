import { useAtomValue } from 'jotai'
import { localeAtom, type LocaleId } from '../state/locale'
import { MESSAGES } from './messages'

/** Looks up a namespaced key in the active locale, with `{name}` interpolation. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

function translate(locale: LocaleId, key: string, params?: Record<string, string | number>): string {
  let out = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.split(`{${name}}`).join(String(value))
    }
  }
  return out
}

/**
 * The translation hook. `const t = useT()` then `t('nav.board')` or
 * `t('board.generate.solving', { elapsed })`. Re-renders when the locale
 * changes. A missing key falls back to English, then to the key itself.
 */
export function useT(): Translate {
  const locale = useAtomValue(localeAtom)
  return (key, params) => translate(locale, key, params)
}
