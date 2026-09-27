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
 * 360px viewport with and become a normal-flow row *under* it, at the bottom
 * right — where a thumb already rests, rather than the far top corner — and,
 * being in flow after the centred content, they can never cover it. They are
 * the same compact, muted triggers desktop shows (a theme icon and a flag +
 * language code), grown to the 44px touch floor by `SheetSelect`; only their
 * menus become bottom sheets, which open right under that same thumb.
 *
 * Mobile is a flat `base-100` screen (`md:bg-transparent` hands the gray page
 * backdrop back to the consumer's own card): the entry forms below `md` are
 * cardless, so the page itself is the surface and the gray would otherwise
 * show as gutters beside them and as a strip under the control row. Only
 * above `md` — where the consumers paint their gray and re-draw the card — is
 * the body's `--bg` allowed through.
 */
export function PreShellScreen({ children }: { children: ReactNode }) {
  const isNarrow = useIsNarrow()
  return (
    <div className="flex min-h-[100dvh] flex-col bg-base-100 px-4 pb-[env(safe-area-inset-bottom)] md:h-full md:min-h-0 md:bg-transparent md:px-0 md:pb-0">
      {!isNarrow && (
        <div className="fixed right-3 top-3 z-10 flex items-center gap-0.5 text-base-content/50">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      )}
      {children}
      {isNarrow && (
        <div className="-mr-2 flex shrink-0 items-center justify-end gap-0.5 py-2 text-base-content/50">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      )}
    </div>
  )
}
