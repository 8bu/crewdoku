import { NavLink } from 'react-router-dom'
import { LocaleSwitcher } from './LocaleSwitcher'
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
      <div className="flex h-12 items-center px-4 text-sm font-semibold tracking-tight text-base-content">
        Crewdoku
      </div>
      <ul className="flex flex-nowrap flex-col gap-0.5 px-2 py-2">
        {SURFACES.map((s) => (
          <li key={s.to}>
            <NavLink
              to={s.to}
              className={({ isActive }) =>
                `block rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
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
      <div className="mt-auto">
        <LocaleSwitcher />
      </div>
    </nav>
  )
}
