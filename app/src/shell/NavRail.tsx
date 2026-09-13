import { NavLink } from 'react-router-dom'
import { LocaleSwitcher } from './LocaleSwitcher'
import { Logo } from './Logo'
import { OrgHeader } from './OrgHeader'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { useT } from '../i18n/useT'

const SURFACES = [
  { to: '/board', key: 'nav.board' },
  { to: '/coverage', key: 'nav.coverage' },
  { to: '/roster', key: 'nav.roster' },
  { to: '/teams', key: 'nav.teams' },
  { to: '/settings', key: 'nav.settings' },
  { to: '/export', key: 'nav.export' },
] as const

export function NavRail() {
  const t = useT()
  return (
    <nav
      aria-label={t('nav.aria')}
      className="flex w-56 shrink-0 flex-col border-r border-base-300 bg-base-200"
    >
      <OrgHeader />
      <WorkspaceSwitcher />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3">
        <p className="m-0 px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-base-content/40">
          {t('nav.aria')}
        </p>
        <ul className="flex flex-nowrap flex-col gap-0.5">
          {SURFACES.map((s) => (
            <li key={s.to}>
              <NavLink
                to={s.to}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-1.5 text-sm no-underline transition-colors duration-150 ${
                    isActive
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-base-content/60 hover:bg-base-300/50 hover:text-base-content'
                  }`
                }
              >
                {t(s.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto flex flex-col border-t border-base-300">
        <div className="flex h-11 items-center px-4">
          <Logo className="h-5 w-auto opacity-80" />
        </div>
        <div className="px-2 pb-2 text-base-content/50">
          <LocaleSwitcher />
        </div>
      </div>
    </nav>
  )
}
