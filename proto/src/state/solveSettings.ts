import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'

/**
 * Hard rules and soft goals (ticket 15, Q3) — the same H1–H6/S1–S5 language
 * the deleted app used (see CLAUDE.md's historical-reference section), kept
 * as proven domain vocabulary rather than invented fresh for the prototype.
 * H1/H2/H3/H5/H6 get real enforcement (`violations.ts`, `coverage.ts`,
 * `engine/stubSolver.ts`); H4 is structurally guaranteed by the data model
 * (one `Assignment` per person per date) and can never actually be broken,
 * so its toggle is locked on. S1–S5 rank by drag order (ticket 15, Q4) with
 * no weight number and no scoring math — the stub has no MILP to score with.
 * Workspace-global across all periods.
 */
export type HardRuleId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6'

export type HardRuleDef = {
  id: HardRuleId
  label: string
  description: string
  /** H4 only — always on, can't be violated by construction. */
  locked?: boolean
}

export const HARD_RULES: HardRuleDef[] = [
  { id: 'H1', label: 'Coverage', description: 'Each shift stays within its min/max headcount for the day.' },
  { id: 'H2', label: 'Max hours per week', description: 'No one works more than the weekly hour cap.' },
  { id: 'H3', label: 'Rest between shifts', description: 'A minimum number of hours between one shift ending and the next starting.' },
  { id: 'H4', label: 'One shift per day', description: "Every person works at most one shift a day — always true; there's nowhere to put a second.", locked: true },
  { id: 'H5', label: 'Time off & unavailability', description: 'Approved time off and recurring days off are never scheduled.' },
  { id: 'H6', label: 'Eligibility', description: 'Only a shift someone is certified for is assigned.' },
]

export type SoftGoalId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'

export type SoftGoalDef = {
  id: SoftGoalId
  label: string
  description: string
}

export const SOFT_GOALS: SoftGoalDef[] = [
  { id: 'S1', label: 'Night-shift fairness', description: 'Spread night shifts evenly across the team.' },
  { id: 'S2', label: 'Preference match', description: 'Honour what people want and avoid, where possible.' },
  { id: 'S3', label: 'Stability', description: 'Change as little as possible from the current schedule.' },
  { id: 'S4', label: 'Weekend fairness', description: 'Spread weekend shifts evenly.' },
  { id: 'S5', label: 'Sequence smoothness', description: 'Avoid awkward shift-to-shift transitions.' },
]

export type HardRuleSettings = {
  enabled: Record<HardRuleId, boolean>
  maxHoursPerWeek: number
  minRestHours: number
}

export type SolveSettings = {
  hardRules: HardRuleSettings
  /** Ranked, index 0 = highest priority. Always all five ids, just reordered. */
  softGoalOrder: SoftGoalId[]
  softGoalEnabled: Record<SoftGoalId, boolean>
}

export const DEFAULT_SOLVE_SETTINGS: SolveSettings = {
  hardRules: {
    enabled: { H1: true, H2: true, H3: true, H4: true, H5: true, H6: true },
    maxHoursPerWeek: 40,
    minRestHours: 11,
  },
  softGoalOrder: ['S1', 'S2', 'S3', 'S4', 'S5'],
  softGoalEnabled: { S1: true, S2: true, S3: true, S4: true, S5: true },
}

export const solveSettingsAtom = atom<SolveSettings | null>(null)

export function useSolveSettings(
  initial: SolveSettings = DEFAULT_SOLVE_SETTINGS,
): [SolveSettings, (updater: (prev: SolveSettings) => SolveSettings) => void] {
  const [settingsState, setSettingsState] = useAtom(solveSettingsAtom)

  useEffect(() => {
    setSettingsState((prev) => prev ?? initial)
  }, [])

  const settings = settingsState ?? initial

  const setSettings = useCallback(
    (updater: (prev: SolveSettings) => SolveSettings) =>
      setSettingsState((prev) => updater(prev ?? initial)),
    [initial, setSettingsState],
  )

  return [settings, setSettings]
}
