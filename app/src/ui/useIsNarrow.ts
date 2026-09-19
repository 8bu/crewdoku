import { useSyncExternalStore } from 'react'

/**
 * The one adaptive-breakpoint source of truth. `true` below Tailwind's `md`
 * (redefined to 1000px in styles.css), so `useIsNarrow()` and the `md:` utility
 * prefix always agree: unprefixed classes are the touch layout for phones and
 * tablets/phablets, `md:` is the desktop one, and this hook gates the
 * *behavioural* forks utilities can't express — a docked panel vs. a bottom
 * sheet, hover-reveal vs. always-on, a mouse drag vs. a tap.
 *
 * `999.98px` (not `999px`) matches Tailwind's own `max-width` breakpoint math,
 * so there is no dead 1px band between this hook flipping and `md:` engaging.
 * `useSyncExternalStore` keeps it tear-free and SSR-safe (server → desktop).
 */
const QUERY = '(max-width: 999.98px)'

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
