import SF from '../data/sf'
import { cx, Badge, Btn, Dot } from './ui'

function SideLabel({ children }) {
  return (
    <p className="px-3 pt-3 pb-1 text-2xs font-semibold uppercase tracking-widest text-faint first:pt-2">
      {children}
    </p>
  )
}

function NavItem({ icon, label, badge, active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className={cx(
        'w-full flex items-center gap-2 px-3 h-7 text-xs rounded-[2px] text-left transition-none',
        active ? 'bg-[var(--sel-bg)] text-ink font-semibold' : 'text-dim hover:bg-surface-2 hover:text-ink'
      )}>
      <span className="font-mono text-xs w-3.5 text-center shrink-0 opacity-60">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && <Badge tone="warn" className="ml-auto">{badge}</Badge>}
    </button>
  )
}

const ADMIN_CONFIG = [
  { v: 'shifts',  icon: '≡', label: 'Shift definitions'  },
  { v: 'rules',   icon: '§', label: 'Scheduling rules'   },
  { v: 'teams',   icon: '◫', label: 'Teams & structure'  },
  { v: 'prefs',   icon: '◈', label: 'Emp. preferences'   },
  { v: 'weights', icon: '≈', label: 'Schedule priorities' },
]

export default function Sidebar({ app, dispatch }) {
  const { role } = app
  const hasDiff  = !!app.diff
  const inSwaps  = (app.swaps || []).filter(s => s.toEmp === app.empIdx && s.status === 'pending').length

  return (
    <aside className="w-48 shrink-0 border-r border-bd bg-surface flex flex-col select-none overflow-hidden">

      {/* brand */}
      <div className="h-9 flex items-center gap-2 px-3 border-b border-bd shrink-0">
        <span className="w-[18px] h-[18px] inline-flex items-center justify-center text-[9px] font-bold font-mono rounded-[2px]"
          style={{ background: 'var(--ink-solid)', color: 'var(--text-inv)' }}>SF</span>
        <span className="text-xs font-semibold">ShiftForge</span>
        <span className="flex-1"></span>
        <span className="font-mono text-2xs px-1 border border-bd rounded-[2px] text-faint">v4</span>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-auto px-1.5 pb-2">

        {role === 'admin' && (
          <>
            <SideLabel>Schedule</SideLabel>
            <NavItem icon="▦" label="Board"
              active={app.adminView === 'board' || app.adminView === 'generate'}
              onClick={() => dispatch({ type: 'ADMIN_VIEW', view: 'board' })} />
            {hasDiff && (
              <div className="mx-1.5 mt-1 px-2 py-1.5 border rounded-[2px] text-2xs leading-snug cursor-pointer"
                style={{ background: 'var(--st-prop-bg)', borderColor: 'var(--st-prop)', color: 'var(--st-prop)' }}
                onClick={() => dispatch({ type: 'ADMIN_VIEW', view: 'generate' })}>
                <p className="font-semibold flex items-center gap-1"><Dot tone="prop" blink />Proposal pending</p>
                <p className="text-faint mt-0.5">{app.diff.proposal.changes.length} changes · click to review</p>
              </div>
            )}
            <SideLabel>Configuration</SideLabel>
            {ADMIN_CONFIG.map(s => (
              <NavItem key={s.v} icon={s.icon} label={s.label}
                active={app.adminView === 'config' && app.adminSection === s.v}
                onClick={() => {
                  dispatch({ type: 'ADMIN_SECTION', section: s.v })
                  dispatch({ type: 'ADMIN_VIEW',    view: 'config' })
                }} />
            ))}
          </>
        )}

        {role === 'member' && (
          <>
            <SideLabel>My workspace</SideLabel>
            <NavItem icon="▦" label="My schedule"   active={app.empView === 'schedule'} onClick={() => dispatch({ type: 'EMP_VIEW', view: 'schedule' })} />
            <NavItem icon="⇄" label="Swaps"          active={app.empView === 'swaps'}    onClick={() => dispatch({ type: 'EMP_VIEW', view: 'swaps' })}    badge={inSwaps} />
            <NavItem icon="◈" label="Preferences"   active={app.empView === 'prefs'}    onClick={() => dispatch({ type: 'EMP_VIEW', view: 'prefs' })} />
            <SideLabel>Team</SideLabel>
            <NavItem icon="⊞" label="Team schedule" active={app.empView === 'team'}     onClick={() => dispatch({ type: 'EMP_VIEW', view: 'team' })} />
          </>
        )}

      </nav>

      {/* role switcher */}
      <div className="border-t border-bd px-2 py-2.5 shrink-0 bg-raised space-y-2.5">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest text-faint px-1 pb-1.5">Role</p>
          <div className="flex gap-1">
            {[{ v: 'admin', label: 'Admin' }, { v: 'member', label: 'Member' }].map(r => (
              <button key={r.v} type="button"
                onClick={() => dispatch({ type: 'SET_ROLE', role: r.v })}
                className={cx('flex-1 text-2xs py-1 rounded-[2px] font-medium transition-none',
                  role === r.v
                    ? 'bg-[var(--ink-solid)] text-[var(--text-inv)]'
                    : 'border border-bd text-dim hover:border-bds hover:text-ink')}>
                {r.v === 'admin' ? 'Admin' : 'Member'}
              </button>
            ))}
          </div>
        </div>

        {role === 'member' && (
          <div>
            <p className="text-2xs font-semibold uppercase tracking-widest text-faint px-1 pb-1">Viewing as</p>
            <select value={app.empIdx}
              onChange={e => dispatch({ type: 'SET_EMPIDX', idx: Number(e.target.value) })}
              className="w-full text-2xs border border-bd bg-surface rounded-[2px] px-1.5 py-1 text-ink">
              {/* Import SF from data layer — employees list */}
              {SF.EMPLOYEES.map(e => (
                <option key={e.i} value={e.i}>{e.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </aside>
  )
}
