import { useEffect, type ReactNode } from 'react'
import { useAtom } from 'jotai'
import { THEMES, THEME_STORAGE_KEY, applyTheme, resolveTheme, themeAtom, type ThemeId } from '../state/theme'
import { Select } from '../ui/Select'
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
 * it. Layout-neutral: like `LocaleSwitcher` it renders only the select, so each
 * host owns its own spacing and muted tone.
 */
export function ThemeSwitcher() {
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

  return (
    <Select
      value={pref}
      onChange={(v) => {
        const next = THEMES.find((th) => th.value === v)
        if (next) {
          setPref(next.value)
          track('theme_changed', { theme: next.value })
        }
      }}
      options={THEMES.map((th) => ({ value: th.value, label: t(th.labelKey), icon: THEME_ICONS[th.value] }))}
      size="xs"
      variant="ghost"
      className="w-full"
      ariaLabel={t('theme.aria')}
    />
  )
}
