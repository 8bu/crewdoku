import { useMemo } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import {
  dow,
  eachDate,
  isWeekend,
  isoWeekKey,
  keyOf,
  type Employee,
  type ISODate,
  type Shift,
  type Team,
} from '@crewdoku/domain'
import type { AppStore } from '../../store/store'
import { cx, EmptyState } from '../../ui'

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** A date column's display metadata. */
interface DateCol {
  date: ISODate
  weekKey: ISODate
  dowIdx: number
  weekend: boolean
}

/** Employees grouped under their team for the row blocks. */
interface TeamGroup {
  team: Team | null
  employees: Employee[]
}

function groupByTeam(employees: Employee[], teams: Team[]): TeamGroup[] {
  const byTeam = new Map<string, Employee[]>()
  for (const e of employees) {
    const list = byTeam.get(e.teamId) ?? []
    list.push(e)
    byTeam.set(e.teamId, list)
  }
  const groups: TeamGroup[] = []
  for (const team of teams) {
    const emps = byTeam.get(team.id)
    if (emps && emps.length) groups.push({ team, employees: emps })
  }
  // any employees with an unknown team fall into an "ungrouped" block
  const known = new Set(teams.map((t) => t.id))
  const orphans = employees.filter((e) => !known.has(e.teamId))
  if (orphans.length) groups.push({ team: null, employees: orphans })
  return groups
}

/** Cell coloring uses the --sh-{code}-* token contract; unknown codes fall back
 *  to neutral chrome (the token simply doesn't resolve and inherits). */
function shiftCellStyle(shift: Shift | undefined): React.CSSProperties {
  if (!shift) return {}
  const c = shift.code
  return {
    background: `var(--sh-${c}-bg)`,
    color: `var(--sh-${c}-fg)`,
    borderColor: `var(--sh-${c}-bd)`,
  }
}

/**
 * ScheduleBoard — the main view. Rows = employees grouped by team; columns =
 * Period dates with a 2-level header (ISO week range › day-of-week). Sticky
 * first column + sticky header. Reads the schedule from the store; cells are
 * keyboard-operable and labeled for a11y. No virtualization (design decision).
 */
export function Board({ store }: { store: StoreApi<AppStore> }) {
  const schedule = useStore(store, (s) => s.schedule)
  const employees = useStore(store, (s) => s.employees)
  const teams = useStore(store, (s) => s.teams)
  const shifts = useStore(store, (s) => s.shifts)
  const period = useStore(store, (s) => s.period)
  const pins = useStore(store, (s) => s.pins)
  const proposal = useStore(store, (s) => s.proposal)

  const shiftById = useMemo(() => new Map(shifts.map((sh) => [sh.id, sh])), [shifts])

  // Set of `${employeeId}|${date}` cells the current proposal would change, so
  // the board can render the .sf-proposed (violet dashed) status outline.
  const proposed = useMemo(
    () => new Set((proposal?.changes ?? []).map((c) => keyOf(c.employeeId, c.date))),
    [proposal],
  )

  const cols: DateCol[] = useMemo(
    () =>
      eachDate(period).map((date) => ({
        date,
        weekKey: isoWeekKey(date),
        dowIdx: dow(date),
        weekend: isWeekend(date),
      })),
    [period],
  )

  // contiguous week spans for the top header row
  const weekSpans = useMemo(() => {
    const spans: { weekKey: ISODate; count: number; first: ISODate }[] = []
    for (const c of cols) {
      const last = spans[spans.length - 1]
      if (last && last.weekKey === c.weekKey) last.count += 1
      else spans.push({ weekKey: c.weekKey, count: 1, first: c.date })
    }
    return spans
  }, [cols])

  const groups = useMemo(() => groupByTeam(employees, teams), [employees, teams])

  if (employees.length === 0) {
    return (
      <EmptyState
        glyph="◫"
        title="No schedule yet"
        body="Load the demo org or complete onboarding to populate the board."
      />
    )
  }

  return (
    <div className="h-full overflow-auto bg-surface">
      <table
        role="grid"
        aria-label="Team schedule"
        className="border-collapse text-xs"
        style={{ borderColor: 'var(--grid-line)' }}
      >
        <thead>
          {/* top header: week ranges */}
          <tr role="row">
            <th
              role="columnheader"
              scope="col"
              rowSpan={2}
              className="sticky left-0 top-0 z-30 bg-raised border border-bd px-2 text-left font-semibold uppercase tracking-wider text-2xs text-dim"
              style={{ minWidth: 200, width: 200 }}
            >
              Employee
            </th>
            {weekSpans.map((w) => (
              <th
                key={w.weekKey}
                role="columnheader"
                scope="colgroup"
                colSpan={w.count}
                className="sticky top-0 z-20 bg-raised border border-bd px-2 text-center font-mono text-2xs text-dim"
              >
                Week of {w.weekKey}
              </th>
            ))}
          </tr>
          {/* second header: day-of-week per date */}
          <tr role="row">
            {cols.map((c) => (
              <th
                key={c.date}
                role="columnheader"
                scope="col"
                className={cx(
                  'sticky z-20 border border-bd px-1 text-center font-mono text-2xs',
                  c.weekend ? 'bg-surface-2 text-faint' : 'bg-raised text-dim',
                )}
                style={{ top: 'var(--row-h)', minWidth: 36 }}
                title={c.date}
              >
                <div>{DOW_LABELS[c.dowIdx]}</div>
                <div className="text-faint">{c.date.slice(8)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <BoardGroup
              key={g.team?.id ?? 'ungrouped'}
              group={g}
              cols={cols}
              schedule={schedule}
              shiftById={shiftById}
              pins={pins}
              proposed={proposed}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BoardGroup({
  group,
  cols,
  schedule,
  shiftById,
  pins,
  proposed,
}: {
  group: TeamGroup
  cols: DateCol[]
  schedule: AppStore['schedule']
  shiftById: Map<string, Shift>
  pins: Set<string>
  proposed: Set<string>
}) {
  return (
    <>
      <tr role="row">
        <th
          role="rowheader"
          scope="colgroup"
          colSpan={cols.length + 1}
          className="sticky left-0 z-10 bg-surface-2 border border-bd px-2 py-0.5 text-left text-2xs font-semibold uppercase tracking-wider text-dim"
        >
          {group.team ? group.team.name : 'Ungrouped'}
        </th>
      </tr>
      {group.employees.map((emp) => (
        <tr key={emp.id} role="row">
          <th
            role="rowheader"
            scope="row"
            className="sticky left-0 z-10 bg-surface border border-bd px-2 text-left font-medium text-ink truncate"
            style={{ minWidth: 200, width: 200, height: 'var(--row-h)' }}
            title={emp.name}
          >
            {emp.name}
          </th>
          {cols.map((c) => {
            const a = schedule.assignments.get(keyOf(emp.id, c.date))
            const shift = a?.shiftId ? shiftById.get(a.shiftId) : undefined
            const pinned = pins.has(keyOf(emp.id, c.date))
            const isProposed = proposed.has(keyOf(emp.id, c.date))
            const label = `${emp.name}, ${c.date}${shift ? `, ${shift.name}` : ', no shift'}`
            return (
              <td
                key={c.date}
                role="gridcell"
                tabIndex={0}
                aria-label={label}
                title={label}
                className={cx(
                  'relative border text-center align-middle font-mono select-none outline-none',
                  'focus:ring-2 focus:ring-[var(--sel)] focus:z-10',
                  c.weekend && !shift && 'bg-surface-2',
                  pinned && 'sf-pinned',
                  isProposed && 'sf-proposed',
                )}
                style={{
                  minWidth: 36,
                  height: 'var(--row-h)',
                  borderColor: 'var(--grid-line)',
                  fontSize: 'var(--cell-fs)',
                  ...shiftCellStyle(shift),
                }}
              >
                {shift ? (
                  <span className="font-semibold">{shift.code}</span>
                ) : a && a.shiftId === null ? (
                  <span className="text-faint" aria-hidden="true">
                    ·
                  </span>
                ) : (
                  ''
                )}
                {pinned && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 right-0 text-[8px] leading-none text-dim"
                  >
                    ◢
                  </span>
                )}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
