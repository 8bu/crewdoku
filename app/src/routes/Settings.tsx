import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Info, Plus } from '../ui/icons'
import { tourReplayRequestedAtom } from '../onboarding/tour/productTour'
import { findOverlap, periodsAtom, selectedPeriodAtom, type Period } from '../state/shell'
import { updatePeriodAtom } from '../state/periodOps'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { useRosterShifts } from '../state/shifts'
import { useCoverageRules } from '../state/coverageRules'
import { useTags, useTagCoverage } from '../state/tags'
import { defaultCoverageTable, type CoverageBand, type CoverageTable as DomainCoverageTable, type Tag } from '@crewdoku/domain'
import { useSolveSettings, type DisplayHardRuleId } from '../state/solveSettings'
import type { SoftGoalId } from '@crewdoku/domain'
import { useSettingsDirty, useMarkAllSettingsDirty } from '../state/settingsDirty'
import { scheduleByPeriodAtom } from '../state/schedule'
import { overridesByPeriodAtom } from '../state/boardOverrides'
import { DEFAULT_SHIFTS, type ShiftDef } from '@crewdoku/domain'
import type { BoardData } from '../board/mockBoard'
import { seedBoardData } from '../board/periodSeed'
import {
  addShift,
  deleteShift,
  renameShiftCode,
  rewriteAssignmentCode,
  setShiftColor,
  setShiftLabel,
  setShiftTimes,
  setShiftBreak,
} from '../board/roster/shiftOps'
import type { ShiftColorId } from '../board/shiftColors'
import { Stub } from './Stub'
import { ShiftsTable } from './settings/ShiftsTable'
import { CoverageTable } from './settings/CoverageTable'
import { AdvancedRules } from './settings/AdvancedRules'
import { useT } from '../i18n/useT'
import { useIsNarrow } from '../ui/useIsNarrow'
import { Select } from '../ui/Select'
import { SheetSelect } from '../ui/SheetSelect'
import { GenerateShiftsWizard } from './settings/GenerateShiftsWizard'
import { Input } from '../ui/Input'
import {
  analyticsConfigured,
  setAnalyticsEnabled,
  track,
  useAnalyticsEnabled,
  usePageView,
} from '../analytics'

/**
 * Shifts, coverage, the period, and the Advanced door (wayfinder ticket 15)
 * — "easy by default, robust on demand": the three plain tables are always
 * visible, hard rules and soft-goal ranking stay closed behind `<details>`
 * until a planner asks for them. The shift catalog, coverage rules, and
 * solve settings are workspace-global now, so every edit to them marks
 * *every* period's board stale (`useMarkAllSettingsDirty`,
 * `state/settingsDirty.ts`) rather than touching a rule-break — a settings
 * change is drift, not a broken schedule (ticket 15, Q5). Only the period's
 * own label/date fields stay scoped to `periodId`'s own dirty flag.
 *
 * Presented as a full-height console surface in the same chrome Roster,
 * Teams, and Coverage use (compact header bar with tabular meta, scrollable
 * body) — flat sections replace the old floating rounded cards. The meta
 * surfaces the hard-rule count because the Advanced door is closed by
 * default: it's the one glanceable tell that something inside was changed.
 */
export function Settings() {
  usePageView('/settings')
  const t = useT()
  const period = useAtomValue(selectedPeriodAtom)
  const initial = useMemo(() => (period ? seedBoardData(period) : null), [period])
  if (!period || !initial) return <Stub title={t('settings.title')} tickets="15" />
  return <SettingsPage periodId={period.id} initial={initial} />
}

/** A coverage table with no bands at all — what a tag starts from. */
const EMPTY_COVERAGE_TABLE: DomainCoverageTable = { byDow: {}, dateOverrides: {} }

// The four edits `CoverageTable` emits, shared by the org table and a tag's
// own table so the two editors can never drift apart.
function withBandDays(table: DomainCoverageTable, weekdays: number[], code: string, band: CoverageBand): DomainCoverageTable {
  const byDow = { ...table.byDow }
  for (const wd of weekdays) byDow[wd] = { ...byDow[wd], [code]: band }
  return { ...table, byDow }
}
function withAddedOverride(table: DomainCoverageTable, iso: string): DomainCoverageTable {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
  const seedRow = table.byDow[weekday] ?? {}
  return { ...table, dateOverrides: { ...table.dateOverrides, [iso]: { ...seedRow } } }
}
function withOverrideBand(table: DomainCoverageTable, iso: string, code: string, band: CoverageBand): DomainCoverageTable {
  return { ...table, dateOverrides: { ...table.dateOverrides, [iso]: { ...table.dateOverrides[iso], [code]: band } } }
}
function withoutOverride(table: DomainCoverageTable, iso: string): DomainCoverageTable {
  const rest = { ...table.dateOverrides }
  delete rest[iso]
  return { ...table, dateOverrides: rest }
}

/**
 * Apply an edit to one tag's table. The entry only disappears once nothing is
 * left in it: a band the planner typed back to `0..∞` is still their explicit
 * choice, and an override row the seed left empty is about to be filled in.
 */
function withTagTable(
  prev: Record<string, DomainCoverageTable>,
  tagId: string,
  edit: (table: DomainCoverageTable) => DomainCoverageTable,
): Record<string, DomainCoverageTable> {
  const next = edit(prev[tagId] ?? EMPTY_COVERAGE_TABLE)
  if (Object.keys(next.byDow).length > 0 || Object.keys(next.dateOverrides).length > 0) return { ...prev, [tagId]: next }
  if (!(tagId in prev)) return prev
  const rest = { ...prev }
  delete rest[tagId]
  return rest
}

/**
 * "Coverage for" — the org table or one tag's. A segmented control while the
 * catalog is small enough to read at a glance; past that, a dropdown (a sheet
 * on a phone, where a trigger-anchored menu is a corner target).
 */
function CoverageScopePicker({
  value,
  onChange,
  tags,
}: {
  value: string
  onChange: (value: string) => void
  tags: Tag[]
}) {
  const t = useT()
  const isNarrow = useIsNarrow()
  const options = [
    { value: 'all', label: t('settings.coverage.everyone') },
    ...tags.map((tag) => ({ value: tag.id, label: tag.name })),
  ]
  if (options.length > 3) {
    return isNarrow ? (
      <SheetSelect
        value={value}
        onChange={onChange}
        options={options}
        title={t('settings.coverage.for')}
        ariaLabel={t('settings.coverage.scopeAria')}
      />
    ) : (
      <Select
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={t('settings.coverage.scopeAria')}
        className="min-w-[140px]"
      />
    )
  }
  return (
    <div role="group" aria-label={t('settings.coverage.scopeAria')} className="flex overflow-hidden rounded-md border border-base-300 text-2xs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`min-h-11 flex-1 px-2.5 py-1 font-medium transition-colors md:min-h-0 md:flex-none ${option.value === value ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:bg-base-200'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsPage({ periodId, initial }: { periodId: string; initial: BoardData }) {
  const t = useT()
  const [teams, setTeams] = useRosterTeams(initial.teams)
  const [people, setPeople] = useRosterPeople(initial.people)
  const [shifts, setShifts] = useRosterShifts(DEFAULT_SHIFTS)
  const defaultCoverage = useMemo(() => defaultCoverageTable(DEFAULT_SHIFTS, teams.length), [teams.length])
  const [coverage, setCoverage] = useCoverageRules(defaultCoverage)
  const [tags] = useTags()
  const [tagCoverage, setTagCoverage] = useTagCoverage()
  const [coverageScope, setCoverageScope] = useState('all')
  const [solveSettings, setSolveSettings] = useSolveSettings()
  const [, setDirty] = useSettingsDirty(periodId)
  const markAllDirty = useMarkAllSettingsDirty()
  const [periods, setPeriods] = useAtom(periodsAtom)
  const period = periods.find((p) => p.id === periodId)
  const updatePeriod = useSetAtom(updatePeriodAtom)
  // A tag deleted while it was selected falls back to the everyone table.
  const coverageTag = tags.find((tag) => tag.id === coverageScope) ?? null
  const [, setScheduleByPeriod] = useAtom(scheduleByPeriodAtom)
  const [, setOverridesByPeriod] = useAtom(overridesByPeriodAtom)

  const [wizardOpen, setWizardOpen] = useState(false)
  // The period whose dates the typed range would collide with; the atom would
  // refuse the edit, so the panel says why instead of leaving a keystroke that
  // silently does nothing.
  const [periodClash, setPeriodClash] = useState<Period | null>(null)
  const analyticsOn = useAnalyticsEnabled()
  const navigate = useNavigate()
  const requestTourReplay = useSetAtom(tourReplayRequestedAtom)

  // The shared board schedule and any hand-edit overrides are themselves a
  // reference to a shift code (ticket 15) — a rename/delete rewrites them
  // too, using the *new* catalog (`nextShifts`) for the rewritten cells'
  // times, so a cell never keeps showing a code that no longer exists.
  // Shift codes are workspace-global now, so a rename/delete here rewrites
  // every period's schedule and overrides, not just the one currently open.
  function rewriteBoardAssignments(nextShifts: ShiftDef[], oldCode: string, newCode: string) {
    setScheduleByPeriod((prev) => {
      let changed = false
      const next: typeof prev = {}
      for (const [id, current] of Object.entries(prev)) {
        const assignments = rewriteAssignmentCode(current.assignments, nextShifts, oldCode, newCode)
        if (assignments === current.assignments) {
          next[id] = current
        } else {
          changed = true
          next[id] = { ...current, assignments }
        }
      }
      return changed ? next : prev
    })
    setOverridesByPeriod((prev) => {
      let changed = false
      const next: typeof prev = {}
      for (const [id, current] of Object.entries(prev)) {
        const rewritten = rewriteAssignmentCode(current, nextShifts, oldCode, newCode)
        if (rewritten === current) {
          next[id] = current
        } else {
          changed = true
          next[id] = rewritten
        }
      }
      return changed ? next : prev
    })
  }

  function handleAddShift(code: string, label: string) {
    setShifts((prev) => addShift(prev, code, label))
    markAllDirty()
  }
  function handleRenameShift(oldCode: string, newCode: string) {
    const result = renameShiftCode(shifts, teams, people, coverage, oldCode, newCode)
    setShifts(() => result.shifts)
    setTeams(() => result.teams)
    setPeople(() => result.people)
    setCoverage(() => result.coverage)
    // A shift code is a key in every tag's coverage table too; reuse the same
    // rewrite per table (only its `coverage` half is kept here).
    setTagCoverage((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([tagId, table]): [string, DomainCoverageTable] => [tagId, renameShiftCode(shifts, teams, people, table, oldCode, newCode).coverage]),
      ),
    )
    rewriteBoardAssignments(result.shifts, oldCode, newCode)
    markAllDirty()
  }
  function handleSetShiftLabel(code: string, label: string) {
    setShifts((prev) => setShiftLabel(prev, code, label))
    markAllDirty()
  }
  function handleSetShiftTimes(code: string, start: string, end: string) {
    setShifts((prev) => setShiftTimes(prev, code, start, end))
    markAllDirty()
  }
  function handleSetShifts(next: ShiftDef[]) {
    setShifts(() => next)
    markAllDirty()
  }
  function handleSetShiftBreak(code: string, minutes: number) {
    setShifts((prev) => setShiftBreak(prev, code, minutes))
    markAllDirty()
  }
  function handleApplyGeneratedShifts(nextShifts: ShiftDef[], nextCoverage: DomainCoverageTable) {
    track('shifts_generated', { shifts: nextShifts.length })
    setShifts(() => nextShifts)
    setCoverage(() => nextCoverage)
    markAllDirty()
    setWizardOpen(false)
  }
  // Cosmetic only — a colour swap doesn't feed fairness/coverage/eligibility,
  // so unlike every other shift edit here it does *not* mark the board
  // stale (ticket 15, Q5's "settings change is drift" rule only applies to
  // rule-relevant edits).
  function handleSetShiftColor(code: string, color: ShiftColorId) {
    setShifts((prev) => setShiftColor(prev, code, color))
  }
  function handleToggleNight(code: string) {
    setShifts((prev) => prev.map((s) => (s.code === code ? { ...s, isNight: !s.isNight } : s)))
    markAllDirty()
  }
  function handleDeleteShift(code: string, reassignToCode: string) {
    const result = deleteShift(shifts, teams, people, coverage, code, reassignToCode)
    setShifts(() => result.shifts)
    setTeams(() => result.teams)
    setPeople(() => result.people)
    setCoverage(() => result.coverage)
    setTagCoverage((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([tagId, table]): [string, DomainCoverageTable] => [tagId, deleteShift(shifts, teams, people, table, code, reassignToCode).coverage]),
      ),
    )
    rewriteBoardAssignments(result.shifts, code, reassignToCode)
    markAllDirty()
  }

  // The four band/override edits write to whichever table the "Coverage for"
  // switch points at — the org table, or one tag's — through the same
  // `with*` helpers, so both stay dirty-marked and behave identically.
  function handleSetBandDays(weekdays: number[], code: string, band: CoverageBand) {
    if (coverageTag) setTagCoverage((prev) => withTagTable(prev, coverageTag.id, (table) => withBandDays(table, weekdays, code, band)))
    else setCoverage((prev) => withBandDays(prev, weekdays, code, band))
    markAllDirty()
  }
  function handleAddOverride(iso: string) {
    if (coverageTag) setTagCoverage((prev) => withTagTable(prev, coverageTag.id, (table) => withAddedOverride(table, iso)))
    else setCoverage((prev) => withAddedOverride(prev, iso))
    markAllDirty()
  }
  function handleSetOverrideBand(iso: string, code: string, band: CoverageBand) {
    if (coverageTag) setTagCoverage((prev) => withTagTable(prev, coverageTag.id, (table) => withOverrideBand(table, iso, code, band)))
    else setCoverage((prev) => withOverrideBand(prev, iso, code, band))
    markAllDirty()
  }
  function handleRemoveOverride(iso: string) {
    if (coverageTag) setTagCoverage((prev) => withTagTable(prev, coverageTag.id, (table) => withoutOverride(table, iso)))
    else setCoverage((prev) => withoutOverride(prev, iso))
    markAllDirty()
  }
  /** Give a tag its own (still empty) table so its bands become editable. */
  function handleAddTagCoverage(tagId: string) {
    setTagCoverage((prev) => ({ ...prev, [tagId]: { byDow: {}, dateOverrides: {} } }))
    markAllDirty()
  }
  function handleRemoveTagCoverage(tagId: string) {
    setTagCoverage((prev) => {
      const rest = { ...prev }
      delete rest[tagId]
      return rest
    })
    markAllDirty()
  }

  function handleToggleHardRule(id: DisplayHardRuleId) {
    if (id === 'H4') return
    setSolveSettings((prev) => ({
      ...prev,
      hardRules: { ...prev.hardRules, enabled: { ...prev.hardRules.enabled, [id]: !prev.hardRules.enabled[id] } },
    }))
    markAllDirty()
  }
  function handleSetMaxHoursPerWeek(n: number) {
    setSolveSettings((prev) => ({ ...prev, hardRules: { ...prev.hardRules, maxHoursPerWeek: n } }))
    markAllDirty()
  }
  function handleSetMinRestHours(n: number) {
    setSolveSettings((prev) => ({ ...prev, hardRules: { ...prev.hardRules, minRestHours: n } }))
    markAllDirty()
  }
  function handleReorderSoftGoals(order: SoftGoalId[]) {
    setSolveSettings((prev) => ({ ...prev, softGoalOrder: order }))
    markAllDirty()
  }
  function handleToggleSoftGoal(id: SoftGoalId) {
    setSolveSettings((prev) => ({
      ...prev,
      softGoalEnabled: { ...prev.softGoalEnabled, [id]: !prev.softGoalEnabled[id] },
    }))
    markAllDirty()
  }

  function handlePeriodField(field: 'label' | 'start' | 'end', value: string) {
    if (field === 'label') {
      // Keystroke-level label edits write directly — a transiently blank
      // label while retyping must stay renderable in the controlled input.
      setPeriods((prev) => prev.map((p) => (p.id === periodId ? { ...p, label: value } : p)))
      setDirty(true)
      return
    }
    if (!period) return
    const start = field === 'start' ? value : period.start
    const end = field === 'end' ? value : period.end
    // Date edits go through the period op so the schedule matrix reconciles
    // (surviving cells keep their codes, new dates fill OFF, out-of-range
    // hand edits are pruned) — BoardGrid no longer wipes on a range change.
    if (!start || !end || start > end) return
    // Periods may not share a day, so a colliding range is refused here (the
    // atom repeats the check) and the clash is named below. The inputs stay
    // bound to the stored dates, so the refused value never sticks.
    const clash = findOverlap(periods, { start, end }, periodId)
    if (clash) {
      setPeriodClash(clash)
      return
    }
    setPeriodClash(null)
    updatePeriod({ id: periodId, label: period.label, start, end })
    setDirty(true)
  }

  if (!period) return null

  const hardRuleFlags = Object.values(solveSettings.hardRules.enabled)
  const hardRulesOn = hardRuleFlags.filter(Boolean).length

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-base-300 px-4">
        <h1 className="m-0 text-sm font-semibold tracking-tight">{t('settings.title')}</h1>
        <span className="text-xs tabular-nums text-[color:var(--text-dim)]">
          {shifts.length === 1
            ? t('settings.meta.shift', { count: shifts.length })
            : t('settings.meta.shifts', { count: shifts.length })}{' '}
          · {t('settings.meta.rulesOn', { on: hardRulesOn, total: hardRuleFlags.length })}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-[880px] flex-col gap-5 px-4 py-5">
          <div className="-mx-4 border-b border-base-300 px-4 pb-5 md:mx-0 md:rounded-lg md:border md:border-base-300 md:bg-base-100 md:p-5">
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="m-0 text-sm font-semibold tracking-tight text-base-content">{t('settings.period.title')}</h2>
              <p className="m-0 mt-0.5 text-xs text-base-content/60">{t('settings.period.desc')}</p>
            </div>
            <div className="flex max-w-[520px] flex-col gap-3 md:flex-row md:items-end md:gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.period.label')}</label>
                <Input
                  type="text"
                  value={period.label}
                  onChange={(e) => handlePeriodField('label', e.target.value)}
                  className="w-full md:w-[180px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.period.start')}</label>
                <Input
                  type="date"
                  value={period.start}
                  onChange={(e) => handlePeriodField('start', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.period.end')}</label>
                <Input
                  type="date"
                  value={period.end}
                  onChange={(e) => handlePeriodField('end', e.target.value)}
                />
              </div>
            </div>
            {periodClash && (
              <p className="m-0 text-xs text-warning">
                {t('period.overlapFormError', {
                  label: periodClash.label,
                  start: periodClash.start,
                  end: periodClash.end,
                })}
              </p>
            )}
          </section>
          </div>

          <div className="-mx-4 border-b border-base-300 px-4 pb-5 md:mx-0 md:rounded-lg md:border md:border-base-300 md:bg-base-100 md:p-5">
          <ShiftsTable
            shifts={shifts}
            onAdd={handleAddShift}
            onRename={handleRenameShift}
            onSetLabel={handleSetShiftLabel}
            onSetTimes={handleSetShiftTimes}
            onEditShifts={handleSetShifts}
            onSetBreak={handleSetShiftBreak}
            onSetColor={handleSetShiftColor}
            onToggleNight={handleToggleNight}
            onDelete={handleDeleteShift}
            onOpenWizard={() => setWizardOpen(true)}
          />
          </div>
          <div className="-mx-4 flex flex-col gap-4 border-b border-base-300 px-4 pb-5 md:mx-0 md:rounded-lg md:border md:border-base-300 md:bg-base-100 md:p-5">
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.coverage.for')}</span>
              <CoverageScopePicker value={coverageTag ? coverageTag.id : 'all'} onChange={setCoverageScope} tags={tags} />
              {coverageTag && tagCoverage[coverageTag.id] && (
                <button
                  type="button"
                  onClick={() => handleRemoveTagCoverage(coverageTag.id)}
                  className="ml-auto min-h-11 cursor-pointer border-none bg-transparent px-2 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors hover:text-error md:min-h-0 md:px-0"
                >
                  {t('settings.coverage.tagRemoveRequirements')}
                </button>
              )}
            </div>
          )}
          {coverageTag && !tagCoverage[coverageTag.id] ? (
            // A tag carries no requirement until the planner asks for one — the
            // empty state says so instead of implying a table of zeroes.
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-base-300 px-3 py-4">
              <p className="m-0 text-sm font-semibold text-base-content">
                {t('settings.coverage.tagEmptyTitle', { tag: coverageTag.name })}
              </p>
              <p className="m-0 text-xs text-base-content/60">{t('settings.coverage.tagEmptyBody')}</p>
              <button
                type="button"
                onClick={() => handleAddTagCoverage(coverageTag.id)}
                className="btn btn-outline btn-sm min-h-11 gap-1.5 md:min-h-8"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('settings.coverage.tagAddRequirements')}
              </button>
            </div>
          ) : (
            <CoverageTable
              // A fresh instance per scope: the per-shift "Every day / Weekend /
              // Per day" choices are a view of one table, not a shared setting.
              key={coverageTag?.id ?? 'all'}
              shifts={shifts}
              table={coverageTag ? (tagCoverage[coverageTag.id] ?? EMPTY_COVERAGE_TABLE) : coverage}
              onSetBandDays={handleSetBandDays}
              onAddOverride={handleAddOverride}
              onSetOverrideBand={handleSetOverrideBand}
              onRemoveOverride={handleRemoveOverride}
            />
          )}
          </div>

          {/* No measurement ID means nothing is collected, so there is nothing
              to switch off — a dead control would be worse than none. */}
          {analyticsConfigured() && (
            <div className="-mx-4 border-b border-base-300 px-4 pb-5 md:mx-0 md:rounded-lg md:border md:border-base-300 md:bg-base-100 md:p-5">
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="m-0 text-sm font-semibold tracking-tight text-base-content">{t('settings.privacy.title')}</h2>
                <p className="m-0 mt-0.5 text-xs text-base-content/60">{t('settings.privacy.desc')}</p>
              </div>
              <div className="flex min-h-11 items-center gap-2 md:min-h-0">
                <input
                  type="checkbox"
                  id="analytics-enabled"
                  className="checkbox checkbox-sm checkbox-primary"
                  checked={analyticsOn}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                />
                <label htmlFor="analytics-enabled" className="cursor-pointer text-sm text-base-content">
                  {t('settings.privacy.toggle')}
                </label>
              </div>
            </section>
            </div>
          )}

          <AdvancedRules
            hardRules={solveSettings.hardRules}
            softGoalOrder={solveSettings.softGoalOrder}
            softGoalEnabled={solveSettings.softGoalEnabled}
            onToggleHardRule={handleToggleHardRule}
            onSetMaxHoursPerWeek={handleSetMaxHoursPerWeek}
            onSetMinRestHours={handleSetMinRestHours}
            onReorderSoftGoals={handleReorderSoftGoals}
            onToggleSoftGoal={handleToggleSoftGoal}
          />

          {/* The tour runs on the board, so this only raises the request and
              sends the person there; the board's own hook consumes it. */}
          <div className="-mx-4 px-4 md:mx-0 md:rounded-lg md:border md:border-base-300 md:bg-base-100 md:p-5">
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="m-0 text-sm font-semibold tracking-tight text-base-content">{t('tour.done.title')}</h2>
                <p className="m-0 mt-0.5 text-xs text-base-content/60">{t('tour.done.body')}</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm w-fit min-h-11 gap-2 md:min-h-0"
                onClick={() => {
                  requestTourReplay(true)
                  navigate('/board')
                }}
              >
                <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('tour.replay')}
              </button>
            </section>
          </div>
        </div>

          {wizardOpen && (
            <GenerateShiftsWizard
              currentShiftsCount={shifts.length}
              onApply={handleApplyGeneratedShifts}
              onCancel={() => setWizardOpen(false)}
            />
          )}
      </div>
    </section>
  )
}
