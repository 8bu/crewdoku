import type { ReactNode } from 'react'
import { LocaleSwitcher } from '../shell/LocaleSwitcher'
import { ThemeSwitcher } from '../shell/ThemeSwitcher'

/**
 * Chrome shared by every pre-shell entry screen (org picker, workspace create).
 * These render before the nav rail exists, so the app-wide device controls
 * (appearance, locale) live here as a top-right overlay — the one place a
 * first-run user can reach them. Any future entry screen routed through the App
 * gate inherits it.
 */
export function PreShellScreen({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div className="fixed right-3 top-3 z-10 flex w-36 flex-col gap-1 text-base-content/50">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
    </>
  )
}
