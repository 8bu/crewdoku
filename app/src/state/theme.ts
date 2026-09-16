import { atom } from 'jotai'

/**
 * Colour scheme. The switchers (nav-rail footer, pre-shell overlay) write
 * `themeAtom`, which is mirrored onto `<html data-theme>`; `styles.css` keys
 * every dark override on `[data-theme="console-dark"]`. A device preference,
 * not workspace data: a workspace blob is shared content, while screen
 * brightness belongs to the person looking at it — so it lives in localStorage
 * next to the locale, saved per device and never exported. 'system' is the
 * default and follows `prefers-color-scheme` live.
 *
 * The attribute is ALWAYS present (`console` or `console-dark`, never absent)
 * because the CSS resolves dark from it, not from a media query. The inline
 * script in index.html sets it before first paint so a dark-mode load never
 * flashes the light theme; React re-applies the same value once it mounts.
 */
export type ThemeId = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'crewdoku-theme'

export const THEMES: { value: ThemeId; labelKey: string }[] = [
  { value: 'system', labelKey: 'theme.system' },
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
]

/** The two daisyUI theme names registered in `styles.css`. */
export type ThemeName = 'console' | 'console-dark'

function initialTheme(): ThemeId {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'system' || saved === 'light' || saved === 'dark') return saved
  }
  return 'system'
}

export const themeAtom = atom<ThemeId>(initialTheme())

export function resolveTheme(pref: ThemeId): ThemeName {
  if (pref === 'system') {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'console'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'console-dark' : 'console'
  }
  return pref === 'dark' ? 'console-dark' : 'console'
}

/** Same two hex values the pre-paint script in index.html writes. */
const THEME_COLOR: Record<ThemeName, string> = { console: '#f9f9fa', 'console-dark': '#141417' }

export function applyTheme(name: ThemeName) {
  document.documentElement.dataset.theme = name
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[name])
}
