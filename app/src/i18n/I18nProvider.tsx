import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { CATALOGS, type Locale } from './messages'

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  /** Translate a CHROME string. Falls back to the key (English source). */
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

/**
 * I18nProvider — chrome-only i18n. `t(key)` translates app-chrome strings only;
 * never pass user data (names, notes) through it. This is the stable seam the
 * P6b dispatch can swap for a full Lingui macro runtime without changing the
 * `useI18n().t(...)` call sites.
 */
export function I18nProvider({
  children,
  initialLocale = 'en',
}: {
  children: ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: string) => CATALOGS[locale][key] ?? key,
    }),
    [locale],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}
