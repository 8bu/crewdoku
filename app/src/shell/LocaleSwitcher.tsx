import { useEffect } from 'react'
import { useAtom } from 'jotai'
import { LOCALES, LOCALE_STORAGE_KEY, localeAtom } from '../state/locale'
import { Select } from '../ui/Select'
import { useT } from '../i18n/useT'

/**
 * Locale switcher in the nav-rail footer — the rail is the only chrome present
 * on every surface (the shell header exists only on period routes). The choice
 * lives in `localeAtom`, drives `useT` app-wide, and is mirrored onto
 * `<html lang>` so the document itself tells the truth.
 */
export function LocaleSwitcher() {
  const [locale, setLocale] = useAtom(localeAtom)
  const t = useT()

  useEffect(() => {
    document.documentElement.lang = locale
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  return (
    <div className="px-2 pb-2 text-base-content/50">
      <Select
        value={locale}
        onChange={(v) => {
          const next = LOCALES.find((l) => l.value === v)
          if (next) setLocale(next.value)
        }}
        options={LOCALES}
        size="xs"
        variant="ghost"
        className="w-full"
        ariaLabel={t('locale.aria')}
      />
    </div>
  )
}
