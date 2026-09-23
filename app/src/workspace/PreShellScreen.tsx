import type { ReactNode } from 'react'
import { LocaleSwitcher } from '../shell/LocaleSwitcher'
import { ThemeSwitcher } from '../shell/ThemeSwitcher'
import { useIsNarrow } from '../ui/useIsNarrow'

/**
 * Chrome shared by every pre-shell entry screen (org picker, workspace create).
 * These render before the nav rail exists, so the app-wide device controls
 * (appearance, locale) live here — the one place a first-run user can reach
 * them. Any future entry screen routed through the App gate inherits it.
 *
 * Layout: this is the whole page below the App gate, so it owns the viewport
 * box (`100dvh`, not `vh` — a phone's URL bar would otherwise crop it) and the
 * mobile gutter. Consumers therefore pass no horizontal padding of their own
 * below `md`; they only centre themselves inside it (`flex-1`).
 *
 * Mobile: the two device controls stop floating over the content they share a
 * 360px viewport with. They become a normal-flow row above the card (so they
 * can never cover it) and the `xs` ghost triggers take the 44px touch floor via
 * the wrapper's `[&_button]` rule. Desktop keeps a fixed top-right overlay of
 * the two compact triggers, side by side.
 */
export function PreShellScreen({ children }: { children: ReactNode }) {
  const isNarrow = useIsNarrow()
  return (
    <div className="flex min-h-[100dvh] flex-col px-4 pb-[env(safe-area-inset-bottom)] md:h-full md:min-h-0 md:px-0 md:pb-0">
      {isNarrow ? (
        <div className="flex shrink-0 items-center justify-end gap-2 py-3 text-base-content/50 [&_button]:min-h-11">
          <div className="w-32">
            <ThemeSwitcher />
          </div>
          <div className="w-32">
            <LocaleSwitcher />
          </div>
        </div>
      ) : (
        <div className="fixed right-3 top-3 z-10 flex items-center gap-0.5 text-base-content/50">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      )}
      {children}
    </div>
  )
}
