import { NavLink } from 'react-router-dom'
import { LocaleSwitcher } from './LocaleSwitcher'

const SURFACES = [
  { to: '/board', label: 'Board' },
  { to: '/coverage', label: 'Coverage' },
  { to: '/roster', label: 'Roster' },
  { to: '/teams', label: 'Teams' },
  { to: '/settings', label: 'Settings' },
  { to: '/export', label: 'Export' },
] as const

export function NavRail() {
  return (
    <nav
      aria-label="Surfaces"
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
              {s.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <LocaleSwitcher />
        <div className="border-t border-base-300 px-4 py-3 text-2xs leading-tight text-base-content/40">
        throwaway prototype
        </div>
      </div>
    </nav>
  )
}
