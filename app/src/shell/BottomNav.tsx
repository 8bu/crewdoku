import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useT } from '../i18n/useT'
import { BottomSheet } from '../ui/BottomSheet'
import { Download, Gauge, LayoutGrid, MoreHorizontal, Settings, Users, UsersRound } from '../ui/icons'
import { LocaleSwitcher } from './LocaleSwitcher'
import { Logo } from './Logo'
import { OrgHeader } from './OrgHeader'
import { ThemeSwitcher } from './ThemeSwitcher'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

/**
 * The mobile half of the navigation: the rail's six surfaces become four
 * primary tabs (Board, Coverage, Roster, Teams) plus More, which opens a sheet
 * holding the two remaining surfaces and everything the rail carries besides
 * navigation — org, workspace, theme, locale, the byline. A 360px-wide bar
 * can't hold six labelled targets at 44px a piece, and the rail's secondary
 * controls have no room to sit beside them, so the sheet is where the rail's
 * footer and header go on a phone. Slugs, labels, icons and active treatment
 * all mirror `NavRail` — the two are the same app, not two apps.
 *
 * Fixed rather than in-flow so the bar never competes with the board's own
 * internal scrollers for height; `Shell`'s `<main>` reserves the matching
 * bottom padding, so route content needs none of its own.
 */
const PRIMARY = [
  { to: '/board', key: 'nav.board', Icon: LayoutGrid },
  { to: '/coverage', key: 'nav.coverage', Icon: Gauge },
  { to: '/roster', key: 'nav.roster', Icon: Users },
  { to: '/teams', key: 'nav.teams', Icon: UsersRound },
] as const

const OVERFLOW = [
  { to: '/settings', key: 'nav.settings', Icon: Settings },
  { to: '/export', key: 'nav.export', Icon: Download },
] as const

/** NavRail's active wash, grown into a full-height tab. Preflight already
    leaves buttons borderless and transparent, so the base carries no `bg-*`
    that could out-order the active wash. */
const TAB_BASE =
  'flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 no-underline transition-colors duration-150'
const TAB_ACTIVE = 'bg-primary/10 font-medium text-primary'
const TAB_IDLE = 'text-base-content/60 hover:bg-base-300/50 hover:text-base-content'

export function BottomNav() {
  const t = useT()
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = moreOpen || OVERFLOW.some((s) => pathname.startsWith(s.to))

  return (
    <>
      {/* Height = the token *plus* the home-indicator inset, paid as padding —
          so the tabs keep the token's full 56px to tap on a notched phone
          instead of losing it to the safe area. `Shell` reserves the same
          total below its content. */}
      <nav
        aria-label={t('nav.aria')}
        className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--mobile-nav-h)_+_env(safe-area-inset-bottom))] border-t border-base-300 bg-base-200 pb-[env(safe-area-inset-bottom)] md:hidden"
        data-tour="nav"
      >
        {PRIMARY.map(({ to, key, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="w-full truncate px-0.5 text-center text-2xs">{t(key)}</span>
          </NavLink>
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={`${TAB_BASE} ${moreActive ? TAB_ACTIVE : TAB_IDLE}`}
        >
          <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="w-full truncate px-0.5 text-center text-2xs">{t('chrome.more')}</span>
        </button>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('chrome.more')}>
        <div className="flex flex-col gap-0.5">
          {OVERFLOW.map(({ to, key, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm no-underline transition-colors duration-150 ${
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t(key)}
            </NavLink>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-base-300 pt-3">
          <OrgHeader variant="sheet" />
          <WorkspaceSwitcher variant="sheet" />
          {/* Compact chips, not inline selects: on touch each renders a
              44px trigger that opens its own bottom-sheet picker, so the two
              share one row instead of stacking two full-width dropdowns. */}
          <div className="grid grid-cols-2 gap-2">
            <ThemeSwitcher />
            <LocaleSwitcher />
          </div>
          <div className="flex items-center gap-1.5 px-1 pt-1">
            <Logo className="h-5 w-auto opacity-80" />
            <span className="text-2xs text-base-content/40">
              by{' '}
              <a
                href="https://8bu.dev"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center font-medium text-base-content/60 no-underline transition-colors hover:text-primary hover:underline"
              >
                8BU
              </a>
            </span>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
