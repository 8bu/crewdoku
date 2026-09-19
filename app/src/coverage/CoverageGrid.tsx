import { Check } from '../ui/icons'
import { useT } from '../i18n/useT'
import { Fragment, useCallback, useMemo, useState } from 'react'
import { HeaderCell } from '../board/HeaderCell'
import { seedBoardData } from '../board/periodSeed'
import { swatchBg } from '../board/shiftColors'
import {
  assignmentKey,
  DEFAULT_SHIFTS,
  defaultCoverageTable,
  OFF_ASSIGNMENT,
  UNASSIGNED_TEAM_ID,
  type Assignment,
} from '@crewdoku/domain'
import { emptyAssignments, UNASSIGNED_TEAM } from '../board/mockBoard'
import type { Period } from '../state/shell'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { useRosterShifts } from '../state/shifts'
import { useCoverageRules } from '../state/coverageRules'
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
  const t = useT()
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
    return [{ value: 'all', label: t('rtc.common.allTeams') }, ...[...teams, ...extra].map((team) => ({ value: team.id, label: team.id === UNASSIGNED_TEAM_ID ? t('rtc.common.unassigned') : team.name }))]
  }, [teams, people, t])

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
      {/* Mobile: title, status and the team lens stack instead of squeezing one
          360px line; `md:` restores the single 48px strip unchanged. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-300 px-4 py-2 md:h-12 md:flex-nowrap md:gap-3 md:py-0">
        <h1 className="m-0 text-sm font-semibold tracking-tight">{t('rtc.coverage.title')}</h1>
        {view.scoped ? (
          <span className="text-xs text-[color:var(--text-dim)]">
            {t('rtc.coverage.scopedNotice')}
          </span>
        ) : !hasSchedule ? (
          <span className="text-xs text-[color:var(--text-dim)]">{t('rtc.coverage.noSchedule')}</span>
        ) : (
          <span className="text-xs tabular-nums">
            {view.shortCells > 0 ? (
              <span className="font-semibold text-[color:var(--viol)]">{t('rtc.coverage.shortCount', { count: view.shortCells })}</span>
            ) : (
              <span className="text-[color:var(--ok)]">{t('rtc.coverage.noGaps')}</span>
            )}
            {view.overCells > 0 && (
              <>
                <span className="text-[color:var(--text-faint)]"> · </span>
                <span className="text-[color:var(--over)]">{t('rtc.coverage.overCount', { count: view.overCells })}</span>
              </>
            )}
          </span>
        )}
        <div className="flex w-full items-center gap-2 text-sm md:ml-auto md:w-auto">
          <label htmlFor="cov-team" className="shrink-0 text-[color:var(--text-dim)]">
            {t('rtc.coverage.teamFilter')}
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
            className="flex-1 md:flex-initial"
          />
        </div>
      </div>

      {/* The grid pans on touch inside this box; `overscroll-contain` stops a
          horizontal flick at the period's edge from rubber-banding the page
          behind it (the same guard `styles.css` puts on `.cd-board-scroll`). */}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {/* `--cov-total-w` is this grid's own lane width: a phone drops the
            sticky totals column to 72px so a full day column still fits beside
            the 120px row label on a 360px screen; `md:` restores today's 96px.
            The inline template reads it with a 96px fallback, so a missing
            custom property degrades to the desktop track rather than none. */}
        <div
          className="grid w-max content-start bg-base-100 [--cov-total-w:72px] [font-variant-numeric:tabular-nums] md:[--cov-total-w:96px]"
          style={{ gridTemplateColumns: `var(--cov-row-label-w) repeat(${initial.dates.length}, var(--cov-col-w)) var(--cov-total-w, 96px)` }}
        >
          <div className="cd-board__corner sticky top-0 left-0 z-[4] border-r border-b border-[var(--border-strong)] bg-base-100" />
          {initial.dates.map((date) => (
            <HeaderCell key={date.iso} date={date} />
          ))}
          <div className="cd-text-trim sticky top-0 right-0 z-[3] flex h-[var(--row-h)] items-center justify-center border-b border-l border-b-[var(--border-strong)] border-l-[var(--border-strong)] bg-base-100 text-2xs text-[color:var(--text-dim)]">
            {t('rtc.coverage.periodHeader')}
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
                  <Check className="h-3.5 w-3.5 text-[color:var(--ok)]" />
                ) : (
                  <>
                    {row.shortDays > 0 && (
                      <span className="cd-text-trim font-semibold text-[color:var(--viol)]">{t('rtc.coverage.shortDays', { count: row.shortDays })}</span>
                    )}
                    {row.overDays > 0 && (
                      <span className="cd-text-trim text-[color:var(--over)]">{t('rtc.coverage.overDays', { count: row.overDays })}</span>
                    )}
                  </>
                )}
              </div>
            </Fragment>
          ))}

          <div className="cd-text-trim sticky left-0 z-[1] flex h-[var(--cov-row-h)] items-center border-r border-b border-r-[var(--border-strong)] border-b-[var(--border)] bg-base-100 px-[var(--cell-pad-x)] text-2xs text-[color:var(--text-dim)]">
            {t('rtc.coverage.onDutyHeader')}
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
                <span className="cd-text-trim text-2xs text-[color:var(--text-faint)]">{t('rtc.coverage.minRequirement', { min: day.minTotal })}</span>
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
