import { useEffect, useMemo, type ReactNode } from 'react'
import { useAtom } from 'jotai'
import { LOCALES, LOCALE_STORAGE_KEY, localeAtom, type LocaleId } from '../state/locale'
import { Select } from '../ui/Select'
import { useT } from '../i18n/useT'
import { track } from '../analytics'

// Small SVG flags (not emoji — emoji flags don't render on Windows/Chrome and
// the design system forbids emoji). A clipping span rounds the corners.
const flagFrame = 'inline-block h-3 shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10'

function FlagGB() {
  return (
    <span className={`${flagFrame} w-[22px]`}>
      <svg viewBox="0 0 60 30" className="h-full w-full" aria-hidden="true">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 60,30 M60,0 0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 60,30 M60,0 0,30" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    </span>
  )
}

function FlagVN() {
  return (
    <span className={`${flagFrame} w-[18px]`}>
      <svg viewBox="0 0 30 20" className="h-full w-full" aria-hidden="true">
        <rect width="30" height="20" fill="#DA251D" />
        <polygon
          points="15,3.5 16.53,7.9 21.18,7.99 17.47,10.8 18.82,15.26 15,12.6 11.18,15.26 12.53,10.8 8.82,7.99 13.47,7.9"
          fill="#FFFF00"
        />
      </svg>
    </span>
  )
}

const FLAGS: Record<LocaleId, ReactNode> = { en: <FlagGB />, vi: <FlagVN /> }

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

  const options = useMemo(() => LOCALES.map((l) => ({ ...l, icon: FLAGS[l.value] })), [])

  return (
    <Select
      value={locale}
      onChange={(v) => {
        const next = LOCALES.find((l) => l.value === v)
        if (next) {
          setLocale(next.value)
          track('locale_changed', { locale: next.value })
        }
      }}
      options={options}
      size="xs"
      variant="ghost"
      className="w-full"
      ariaLabel={t('locale.aria')}
    />
  )
}
