import { useMemo, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { periodsAtom, selectedPeriodAtom } from '../state/shell'
import { updatePeriodAtom } from '../state/periodOps'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { useRosterShifts } from '../state/shifts'
import { useCoverageRules } from '../state/coverageRules'
import { defaultCoverageTable, type CoverageBand, type CoverageTable as DomainCoverageTable } from '@crewdoku/domain'
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
import { GenerateShiftsWizard } from './settings/GenerateShiftsWizard'

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
  const t = useT()
  const period = useAtomValue(selectedPeriodAtom)
  const initial = useMemo(() => (period ? seedBoardData(period) : null), [period])
  if (!period || !initial) return <Stub title={t('settings.title')} tickets="15" />
  return <SettingsPage periodId={period.id} initial={initial} />
}

export function SettingsPage({ periodId, initial }: { periodId: string; initial: BoardData }) {
  const t = useT()
  const [teams, setTeams] = useRosterTeams(initial.teams)
  const [people, setPeople] = useRosterPeople(initial.people)
  const [shifts, setShifts] = useRosterShifts(DEFAULT_SHIFTS)
  const defaultCoverage = useMemo(() => defaultCoverageTable(DEFAULT_SHIFTS, teams.length), [teams.length])
  const [coverage, setCoverage] = useCoverageRules(defaultCoverage)
  const [solveSettings, setSolveSettings] = useSolveSettings()
  const [, setDirty] = useSettingsDirty(periodId)
  const markAllDirty = useMarkAllSettingsDirty()
  const [periods, setPeriods] = useAtom(periodsAtom)
  const period = periods.find((p) => p.id === periodId)
  const updatePeriod = useSetAtom(updatePeriodAtom)
  const [, setScheduleByPeriod] = useAtom(scheduleByPeriodAtom)
  const [, setOverridesByPeriod] = useAtom(overridesByPeriodAtom)

  const [wizardOpen, setWizardOpen] = useState(false)

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
    rewriteBoardAssignments(result.shifts, code, reassignToCode)
    markAllDirty()
  }

  function handleSetBand(weekday: number, code: string, band: CoverageBand) {
    setCoverage((prev) => ({
      ...prev,
      byDow: { ...prev.byDow, [weekday]: { ...prev.byDow[weekday], [code]: band } },
    }))
    markAllDirty()
  }
  function handleAddOverride(iso: string) {
    setCoverage((prev) => {
      const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
      const seedRow = prev.byDow[weekday] ?? {}
      return { ...prev, dateOverrides: { ...prev.dateOverrides, [iso]: { ...seedRow } } }
    })
    markAllDirty()
  }
  function handleSetOverrideBand(iso: string, code: string, band: CoverageBand) {
    setCoverage((prev) => ({
      ...prev,
      dateOverrides: { ...prev.dateOverrides, [iso]: { ...prev.dateOverrides[iso], [code]: band } },
    }))
    markAllDirty()
  }
  function handleRemoveOverride(iso: string) {
    setCoverage((prev) => {
      const rest = { ...prev.dateOverrides }
      delete rest[iso]
      return { ...prev, dateOverrides: rest }
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
    updatePeriod({ id: periodId, label: period.label, start, end })
    setDirty(true)
  }

  if (!period) return null

  const hardRuleFlags = Object.values(solveSettings.hardRules.enabled)
  const hardRulesOn = hardRuleFlags.filter(Boolean).length

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 py-2.5">
        <h1 className="m-0 text-sm font-semibold tracking-tight">{t('settings.title')}</h1>
        <span className="text-xs tabular-nums text-[color:var(--text-dim)]">
          {shifts.length === 1
            ? t('settings.meta.shift', { count: shifts.length })
            : t('settings.meta.shifts', { count: shifts.length })}{' '}
          · {t('settings.meta.rulesOn', { on: hardRulesOn, total: hardRuleFlags.length })}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-base-300">
        <div className="flex max-w-[880px] flex-col gap-8 px-4 py-5">
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="m-0 text-sm font-semibold tracking-tight text-base-content">{t('settings.period.title')}</h2>
              <p className="m-0 mt-0.5 text-xs text-base-content/60">{t('settings.period.desc')}</p>
            </div>
            <div className="flex max-w-[520px] items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.period.label')}</label>
                <input
                  type="text"
                  value={period.label}
                  onChange={(e) => handlePeriodField('label', e.target.value)}
                  className="input input-sm w-[180px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.period.start')}</label>
                <input
                  type="date"
                  value={period.start}
                  onChange={(e) => handlePeriodField('start', e.target.value)}
                  className="input input-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('settings.period.end')}</label>
                <input
                  type="date"
                  value={period.end}
                  onChange={(e) => handlePeriodField('end', e.target.value)}
                  className="input input-sm"
                />
              </div>
            </div>
          </section>

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
          <CoverageTable
            shifts={shifts}
            table={coverage}
            onSetBand={handleSetBand}
            onAddOverride={handleAddOverride}
            onSetOverrideBand={handleSetOverrideBand}
            onRemoveOverride={handleRemoveOverride}
          />

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
