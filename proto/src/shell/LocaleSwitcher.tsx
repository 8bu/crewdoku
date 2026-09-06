import { useEffect } from 'react'
import { useAtom } from 'jotai'
import { LOCALES, localeAtom } from '../state/locale'
import { Select } from '../ui/Select'

/**
 * Locale switcher shell in the nav-rail footer — the rail is the only chrome
 * present on every surface (the shell header exists only on period routes).
 * No translation engine behind it yet: the choice lives in `localeAtom` and
 * is mirrored onto `<html lang>` so the document at least tells the truth.
 */
export function LocaleSwitcher() {
  const [locale, setLocale] = useAtom(localeAtom)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <div className="border-t border-base-300 px-4 py-3">
      <div className="mb-1 text-2xs uppercase tracking-wide text-base-content/40">Language</div>
      <Select
        value={locale}
        onChange={(v) => {
          const next = LOCALES.find((l) => l.value === v)
          if (next) setLocale(next.value)
        }}
        options={LOCALES}
        size="xs"
        className="w-full"
        ariaLabel="UI language"
      />
    </div>
  )
}
