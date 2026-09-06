/**
 * The solver port. The whole board/generate UI depends only on these names —
 * never on `@crewdoku/solver` internals directly — so the engine can be
 * retyped or replaced without touching UI code (wayfinder ticket 10).
 *
 * These are thin re-exports of the real engine's contract. proto's stub-era
 * request shapes (`SolveRequest`/`SolveRules`/`SolveOptions`) are gone (app
 * ticket 03): the app now builds a real `ModelInput` (see `modelInput.ts`) and
 * reads a real `SolveResult`.
 */
import type { Schedule } from '@crewdoku/domain'

export type { ConflictCoreItem, ModelInput } from '@crewdoku/solver'
export type { Relaxation as RelaxationOption } from '@crewdoku/solver'
export type { SolveOutcome as SolveResult } from '@crewdoku/solver'

/** The per-period assignment matrix, keyed `${personId}|${iso}`. */
export type ScheduleMap = Schedule
