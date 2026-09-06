import { Fragment, useCallback, useMemo, useState } from 'react'
import { HeaderCell } from '../board/HeaderCell'
import { seedBoardData } from '../board/periodSeed'
import { swatchBg } from '../board/shiftColors'
import {
  assignmentKey,
  DEFAULT_SHIFTS,
  emptyAssignments,
  OFF_ASSIGNMENT,
  UNASSIGNED_TEAM,
  UNASSIGNED_TEAM_ID,
  type Assignment,
} from '../board/mockBoard'
import type { Period } from '../state/shell'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { useRosterShifts } from '../state/shifts'
import { defaultCoverageTable, useCoverageRules } from '../state/coverageRules'
import { useBoardSchedule } from '../state/schedule'
import { useBoardOverrides } from '../state/boardOverrides'
import { Select } from '../ui/Select'
import { CoverageCell } from './CoverageCell'
import { CoveragePopover } from './CoveragePopover'
import { buildCoverageView, type CoverageViewCell } from './coverageData'

/**
 * The manager's period-wide gap audit (ticket 21) — a pivot of the live
 * schedule: shifts × dates, each cell headcount-vs-band, with per-shift and
 * per-day margins. Reads exactly the state the board writes (roster, shift
 * catalog, authored coverage table, applied schedule + hand-edit overrides),
 * so the two views always agree. Read-only: a cell's popover names who's on
 * and jumps to the board, which stays the only place that edits.
 */

type PopoverState = { cell: CoverageViewCell; rect: { left: number; top: number; width: number; height: number } }

export function CoverageGrid({ period }: { period: Period }) {
  const periodId = period.id
  const initial = useMemo(() => seedBoardData(period), [period])
  const [people] = useRosterPeople(initial.people)
  const [teams] = useRosterTeams(initial.teams)
  const [shifts] = useRosterShifts(DEFAULT_SHIFTS)
  const initialCoverage = useMemo(() => defaultCoverageTable(DEFAULT_SHIFTS, initial.teams.length), [initial])
  const [coverageTable] = useCoverageRules(initialCoverage)
  const initialAssignments = useMemo(() => emptyAssignments(initial.people, initial.dates), [initial])
  const [baseAssignments, hasSchedule] = useBoardSchedule(periodId, initialAssignments)
  const [overrides] = useBoardOverrides(periodId)

  const [teamId, setTeamId] = useState('all')
  const [popover, setPopover] = useState<PopoverState | null>(null)

  const getAssignment = useCallback(
    (personId: string, dateIso: string): Assignment =>
      overrides.get(assignmentKey(personId, dateIso)) ??
      baseAssignments.get(assignmentKey(personId, dateIso)) ??
      OFF_ASSIGNMENT,
    [overrides, baseAssignments],
  )

  const view = useMemo(
    () => buildCoverageView(people, initial.dates, shifts, coverageTable, getAssignment, teamId),
    [people, initial.dates, shifts, coverageTable, getAssignment, teamId],
  )

  const teamOptions = useMemo(() => {
    const extra = people.some((p) => p.teamId === UNASSIGNED_TEAM_ID) ? [UNASSIGNED_TEAM] : []
    return [{ value: 'all', label: 'All teams' }, ...[...teams, ...extra].map((t) => ({ value: t.id, label: t.name }))]
  }, [teams, people])

  const openPopover = useCallback((cell: CoverageViewCell, target: HTMLElement) => {
    const box = target.getBoundingClientRect()
    setPopover((prev) =>
      prev && prev.cell.shift.code === cell.shift.code && prev.cell.date.iso === cell.date.iso
        ? null
        : { cell, rect: { left: box.left, top: box.top, width: box.width, height: box.height } },
    )
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 py-2.5">
        <h1 className="m-0 text-sm font-semibold tracking-tight">Coverage</h1>
        {view.scoped ? (
          <span className="text-xs text-[color:var(--text-dim)]">
            Counts for this team only — status needs all teams
          </span>
        ) : !hasSchedule ? (
          <span className="text-xs text-[color:var(--text-dim)]">No schedule yet — generate one on the board</span>
        ) : (
          <span className="text-xs tabular-nums">
            {view.shortCells > 0 ? (
              <span className="font-semibold text-[color:var(--viol)]">{view.shortCells} short</span>
            ) : (
              <span className="text-[color:var(--ok)]">No gaps</span>
            )}
            {view.overCells > 0 && (
              <>
                <span className="text-[color:var(--text-faint)]"> · </span>
                <span className="text-[color:var(--over)]">{view.overCells} over</span>
              </>
            )}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label htmlFor="cov-team" className="text-[color:var(--text-dim)]">
            Team
          </label>
          <Select
            id="cov-team"
            value={teamId}
            onChange={(next) => {
              // An open popover snapshots its cell in the previous scope —
              // stale the moment the lens changes.
              setPopover(null)
              setTeamId(next)
            }}
            options={teamOptions}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="grid w-max content-start bg-base-100 [font-variant-numeric:tabular-nums]"
          style={{ gridTemplateColumns: `var(--cov-row-label-w) repeat(${initial.dates.length}, var(--cov-col-w)) 96px` }}
        >
          <div className="cd-board__corner sticky top-0 left-0 z-[4] border-r border-b border-[var(--border-strong)] bg-base-100" />
          {initial.dates.map((date) => (
            <HeaderCell key={date.iso} date={date} />
          ))}
          <div className="cd-text-trim sticky top-0 right-0 z-[3] flex h-[var(--row-h)] items-center justify-center border-b border-l border-b-[var(--border-strong)] border-l-[var(--border-strong)] bg-base-100 text-2xs text-[color:var(--text-dim)]">
            PERIOD
          </div>

          {view.rows.map((row) => (
            <Fragment key={row.shift.code}>
              <div className="sticky left-0 z-[1] flex h-[var(--cov-row-h)] items-center gap-2 border-r border-b border-r-[var(--border-strong)] border-b-[var(--border)] bg-base-100 px-[var(--cell-pad-x)]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-xs"
                  style={{ background: swatchBg(row.shift.color) }}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col gap-0.5 font-mono">
                  <span className="cd-text-trim truncate text-sm font-bold">{row.shift.code}</span>
                  <span className="cd-text-trim text-2xs text-[color:var(--text-faint)]">
                    {row.shift.start} {row.shift.end}
                  </span>
                </div>
              </div>
              {row.cells.map((cell) => (
                <CoverageCell
                  key={cell.date.iso}
                  cell={cell}
                  active={popover?.cell.shift.code === cell.shift.code && popover.cell.date.iso === cell.date.iso}
                  onOpen={openPopover}
                />
              ))}
              <div className="sticky right-0 z-[1] flex h-[var(--cov-row-h)] flex-col items-center justify-center gap-0.5 border-b border-l border-b-[var(--border)] border-l-[var(--border-strong)] bg-base-100 text-2xs tabular-nums">
                {view.scoped ? (
                  <span className="text-[color:var(--text-faint)]">—</span>
                ) : row.shortDays === 0 && row.overDays === 0 ? (
                  <span className="text-[color:var(--ok)]">✓</span>
                ) : (
                  <>
                    {row.shortDays > 0 && (
                      <span className="cd-text-trim font-semibold text-[color:var(--viol)]">{row.shortDays} short</span>
                    )}
                    {row.overDays > 0 && (
                      <span className="cd-text-trim text-[color:var(--over)]">{row.overDays} over</span>
                    )}
                  </>
                )}
              </div>
            </Fragment>
          ))}

          <div className="cd-text-trim sticky left-0 z-[1] flex h-[var(--cov-row-h)] items-center border-r border-b border-r-[var(--border-strong)] border-b-[var(--border)] bg-base-100 px-[var(--cell-pad-x)] text-2xs text-[color:var(--text-dim)]">
            ON DUTY
          </div>
          {view.dayTotals.map((day) => (
            <div
              key={day.date.iso}
              className="flex h-[var(--cov-row-h)] flex-col items-center justify-center gap-0.5 border-b border-l border-b-[var(--border)] border-l-[var(--grid-line)] bg-base-100 tabular-nums"
              data-status={day.status ?? undefined}
            >
              <span
                className={`cd-text-trim text-sm font-semibold ${
                  day.status === 'short'
                    ? 'text-[color:var(--viol)]'
                    : day.status === 'over'
                      ? 'text-[color:var(--over)]'
                      : ''
                }`}
              >
                {day.assigned}
              </span>
              {day.status !== null && (
                <span className="cd-text-trim text-2xs text-[color:var(--text-faint)]">min {day.minTotal}</span>
              )}
            </div>
          ))}
          <div className="sticky right-0 z-[1] border-b border-l border-b-[var(--border)] border-l-[var(--border-strong)] bg-base-100" />
        </div>
      </div>

      {popover && (
        <CoveragePopover
          cell={popover.cell}
          rect={popover.rect}
          allPeople={people}
          getAssignment={getAssignment}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}
