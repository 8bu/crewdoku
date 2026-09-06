import { atom } from 'jotai'

/**
 * One-shot cross-route hint (ticket 21): the Coverage view's "Show on board"
 * button sets it, `BoardGrid` consumes and clears it on mount — opening
 * ticket 06's coverage panel on that date, drilled into `shift` when one is
 * named (a short shift lights its eligible fixers; ok/over just opens the
 * breakdown). An atom rather than router state so the flow survives however
 * the navigation happens.
 */
export const coverageDrillAtom = atom<{ dateIso: string; shift: string | null } | null>(null)
