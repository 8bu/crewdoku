import { useEffect, useMemo, type ReactNode } from 'react'
import { useAtom } from 'jotai'
import { LOCALES, LOCALE_STORAGE_KEY, localeAtom, type LocaleId } from '../state/locale'
import { Select } from '../ui/Select'
import { SheetSelect } from '../ui/SheetSelect'
import { useIsNarrow } from '../ui/useIsNarrow'
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

function FlagES() {
  return (
    <span className={`${flagFrame} w-[18px]`}>
      <svg viewBox="0 0 30 20" className="h-full w-full" aria-hidden="true">
        <rect width="30" height="20" fill="#AA151B" />
        <rect y="5" width="30" height="10" fill="#F1BF00" />
      </svg>
    </span>
  )
}

function FlagFR() {
  return (
    <span className={`${flagFrame} w-[18px]`}>
      <svg viewBox="0 0 30 20" className="h-full w-full" aria-hidden="true">
        <rect width="10" height="20" fill="#002395" />
        <rect x="10" width="10" height="20" fill="#FFFFFF" />
        <rect x="20" width="10" height="20" fill="#ED2939" />
      </svg>
    </span>
  )
}

function FlagJP() {
  return (
    <span className={`${flagFrame} w-[18px]`}>
      <svg viewBox="0 0 30 20" className="h-full w-full" aria-hidden="true">
        <rect width="30" height="20" fill="#FFFFFF" />
        <circle cx="15" cy="10" r="6" fill="#BC002D" />
      </svg>
    </span>
  )
}

function FlagDE() {
  return (
    <span className={`${flagFrame} w-[18px]`}>
      <svg viewBox="0 0 30 20" className="h-full w-full" aria-hidden="true">
        <rect width="30" height="6.67" fill="#000000" />
        <rect y="6.67" width="30" height="6.66" fill="#DD0000" />
        <rect y="13.33" width="30" height="6.67" fill="#FFCE00" />
      </svg>
    </span>
  )
}

// The 10:7 official ratio, so the width is 10/7 of the 12px frame height.
function FlagBR() {
  return (
    <span className={`${flagFrame} w-[17px]`}>
      <svg viewBox="0 0 30 21" className="h-full w-full" aria-hidden="true">
        <rect width="30" height="21" fill="#009C3B" />
        <polygon points="15,2 28,10.5 15,19 2,10.5" fill="#FFDF00" />
        <circle cx="15" cy="10.5" r="4.5" fill="#002776" />
      </svg>
    </span>
  )
}

const FLAGS: Record<LocaleId, ReactNode> = {
  en: <FlagGB />,
  vi: <FlagVN />,
  es: <FlagES />,
  fr: <FlagFR />,
  ja: <FlagJP />,
  de: <FlagDE />,
  pt: <FlagBR />,
}

/**
 * The app-wide locale control. The choice lives in `localeAtom`, drives `useT`
 * everywhere, and is mirrored onto `<html lang>` so the document tells the
 * truth. Layout-neutral: it renders only the control, so each host (the
 * nav-rail footer, the pre-shell entry overlay) owns its own spacing and muted
 * tone.
 *
 * Only the surface forks on touch, exactly as in `ThemeSwitcher`: on desktop a
 * compact flag + language-code trigger whose panel lists the endonyms, below
 * `md` a chip that opens a full-width bottom-sheet list of them.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const [locale, setLocale] = useAtom(localeAtom)
  const t = useT()

  useEffect(() => {
    document.documentElement.lang = locale
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  const isNarrow = useIsNarrow()
  const options = useMemo(() => LOCALES.map((l) => ({ ...l, icon: FLAGS[l.value] })), [])
  function handleChange(v: string) {
    const next = LOCALES.find((l) => l.value === v)
    if (next) {
      setLocale(next.value)
      track('locale_changed', { locale: next.value })
    }
  }

  if (isNarrow) {
    return (
      <SheetSelect
        value={locale}
        onChange={handleChange}
        options={options}
        title={t('locale.aria')}
        ariaLabel={t('locale.aria')}
        className={className}
      />
    )
  }

  return (
    <Select
      value={locale}
      onChange={handleChange}
      options={options}
      display={
        <span className="flex items-center gap-1.5 text-2xs font-medium tracking-wide">
          {FLAGS[locale]}
          {locale.toUpperCase()}
        </span>
      }
      align="end"
      ariaLabel={t('locale.aria')}
    />
  )
}
