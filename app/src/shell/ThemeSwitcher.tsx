import { useEffect, type ReactNode } from 'react'
import { useAtom } from 'jotai'
import { THEMES, THEME_STORAGE_KEY, applyTheme, resolveTheme, themeAtom, type ThemeId } from '../state/theme'
import { Select } from '../ui/Select'
import { SheetSelect } from '../ui/SheetSelect'
import { useIsNarrow } from '../ui/useIsNarrow'
import { Monitor, Moon, Sun } from '../ui/icons'
import { useT } from '../i18n/useT'
import { track } from '../analytics'

// Sized to the Select's own chevron so the trigger's icon slot never jumps.
const iconCls = 'h-3.5 w-3.5 shrink-0'
const THEME_ICONS: Record<ThemeId, ReactNode> = {
  system: <Monitor className={iconCls} />,
  light: <Sun className={iconCls} />,
  dark: <Moon className={iconCls} />,
}

/**
 * The app-wide appearance control. The choice lives in `themeAtom`, is mirrored
 * onto `<html data-theme>`, and is saved to localStorage. On 'system' it also
 * follows the OS live, so a laptop that switches at dusk switches the app with
 * it. Layout-neutral: like `LocaleSwitcher` it renders only the control, so
 * each host owns its own spacing and muted tone.
 *
 * Only the surface forks on touch: on desktop the trigger is a compact icon
 * button (the label lives in its tooltip and accessible name, the panel keeps
 * full labels), so it can share one row with its host's other chrome; on
 * mobile the same options open as full-width rows in a `SheetSelect`'s bottom
 * sheet, under the thumb.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const [pref, setPref] = useAtom(themeAtom)
  const t = useT()

  useEffect(() => {
    applyTheme(resolveTheme(pref))
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_STORAGE_KEY, pref)
    if (pref !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(media.matches ? 'console-dark' : 'console')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [pref])

  const isNarrow = useIsNarrow()
  const options = THEMES.map((th) => ({ value: th.value, label: t(th.labelKey), icon: THEME_ICONS[th.value] }))
  function handleChange(v: string) {
    const next = THEMES.find((th) => th.value === v)
    if (next) {
      setPref(next.value)
      track('theme_changed', { theme: next.value })
    }
  }

  if (isNarrow) {
    return (
      <SheetSelect
        value={pref}
        onChange={handleChange}
        options={options}
        title={t('theme.aria')}
        ariaLabel={t('theme.aria')}
        className={className}
      />
    )
  }

  return (
    <Select
      value={pref}
      onChange={handleChange}
      options={options}
      display={THEME_ICONS[pref]}
      align="end"
      ariaLabel={t('theme.aria')}
    />
  )
}
