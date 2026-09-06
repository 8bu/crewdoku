import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import {
  DEFAULT_SOLVE_SETTINGS,
  type HardRuleId,
  type SoftGoalId,
  type SolveSettings,
} from '@crewdoku/domain'

/**
 * Solve-settings presentation. The rule set, its shapes, and the defaults now
 * live in `@crewdoku/domain` (the enforced hard rules are H1, H2, H3, H5; H4 is
 * structural and H6/eligibility is a flagged capability fact, not a solver
 * rule). This module keeps only the UI copy for those rules and the
 * workspace-global atom + hook. Ticket 02 replaces this memory atom with
 * persistence-backed state.
 */

/**
 * The ids the Advanced screen renders. It shows H4 as a locked, always-on
 * structural row on top of the enforced `HardRuleId` set, so the display id is
 * wider than the domain's toggleable id.
 */
export type DisplayHardRuleId = HardRuleId | 'H4'

export type HardRuleDef = {
  id: DisplayHardRuleId
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
]

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
