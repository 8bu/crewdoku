import { useEffect } from 'react'
import { useAtom } from 'jotai'
import { LOCALES, LOCALE_STORAGE_KEY, localeAtom } from '../state/locale'
import { Select } from '../ui/Select'
import { useT } from '../i18n/useT'

/**
 * The app-wide locale control. The choice lives in `localeAtom`, drives `useT`
 * everywhere, and is mirrored onto `<html lang>` so the document tells the
 * truth. Layout-neutral: it renders only the select, so each host (the nav-rail
 * footer, the pre-shell entry overlay) owns its own spacing and muted tone.
 */
export function LocaleSwitcher() {
  const [locale, setLocale] = useAtom(localeAtom)
  const t = useT()

  useEffect(() => {
    document.documentElement.lang = locale
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  return (
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
  )
}
