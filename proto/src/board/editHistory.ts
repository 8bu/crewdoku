import type { Assignment } from './mockBoard'

/** A cell key mapped to its next value, or `undefined` to revert to the base (solver) assignment. */
export type CellPatch = Map<string, Assignment | undefined>
export type Overrides = Map<string, Assignment>

export type HistoryEntry = { forward: CellPatch; backward: CellPatch }
export type EditHistory = { past: HistoryEntry[]; future: HistoryEntry[] }

export const emptyHistory: EditHistory = { past: [], future: [] }

export function applyPatch(overrides: Overrides, patch: CellPatch): Overrides {
  const next = new Map(overrides)
  for (const [key, value] of patch) {
    if (value === undefined) next.delete(key)
    else next.set(key, value)
  }
  return next
}

/** Captures the pre-edit state of every key `forward` is about to touch, so the edit can be undone. */
function backwardFor(overrides: Overrides, forward: CellPatch): CellPatch {
  const backward: CellPatch = new Map()
  for (const key of forward.keys()) {
    backward.set(key, overrides.get(key))
  }
  return backward
}

export function commitEdit(
  history: EditHistory,
  overrides: Overrides,
  forward: CellPatch,
): { history: EditHistory; overrides: Overrides } {
  const backward = backwardFor(overrides, forward)
  const entry: HistoryEntry = { forward, backward }
  return {
    history: { past: [...history.past, entry], future: [] },
    overrides: applyPatch(overrides, forward),
  }
}

export function undo(history: EditHistory, overrides: Overrides): { history: EditHistory; overrides: Overrides } {
  const entry = history.past.at(-1)
  if (!entry) return { history, overrides }
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, entry] },
    overrides: applyPatch(overrides, entry.backward),
  }
}

export function redo(history: EditHistory, overrides: Overrides): { history: EditHistory; overrides: Overrides } {
  const entry = history.future.at(-1)
  if (!entry) return { history, overrides }
  return {
    history: { past: [...history.past, entry], future: history.future.slice(0, -1) },
    overrides: applyPatch(overrides, entry.forward),
  }
}
