import { useCallback, useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import type { ShiftCode } from '@crewdoku/domain'
import { applyPatch } from '../board/editHistory'
import { overridesByPeriodAtom } from '../state/boardOverrides'
import { peopleAtom } from '../state/roster'
import {
  buildShiftChangePatches,
  buildSwapPatches,
  type CalendarSource,
  type PeriodPatch,
} from './calendarModel'

/** Leave booked, extended, shortened or removed: one person's `timeOff` either side of the edit. */
type LeaveChange = { personId: string; before: readonly string[]; after: readonly string[] }

/** One action on the calendar, whatever it touched. A single undo pops exactly this. */
type CalendarEntry = { patches: readonly PeriodPatch[]; leave: readonly LeaveChange[] }

export type CalendarEditing = {
  swapDays(personId: string, fromIso: string, toIso: string): boolean
  changeShift(personId: string, iso: string, code: ShiftCode): boolean
  setTimeOff(personId: string, nextTimeOff: readonly string[]): void
  /** The same write for several people at once — one entry, so clearing a day for N people undoes in one step. */
  setTimeOffMany(entries: readonly { personId: string; nextTimeOff: readonly string[] }[]): void
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
}

/**
 * The calendar's edits, and its own undo stack: a swap made here must not become
 * a board undo target, and vice versa (settled with the page's design). Shift
 * writes land in the same `overridesByPeriodAtom` the board writes, so a pin
 * made on either surface is a pin on both; only the history is page-local, which
 * is all it has to survive (the board keeps its stack local for the same
 * reason).
 *
 * The pure half — what a swap or a shift change actually patches, and when it
 * is refused — lives in `calendarModel.ts`; this hook only commits, applies,
 * and remembers.
 */
export function useCalendarEditing(source: CalendarSource): CalendarEditing {
  const setOverrides = useSetAtom(overridesByPeriodAtom)
  const setPeople = useSetAtom(peopleAtom)
  // A ref, not an atom: the stack only means anything while the page is mounted.
  // The counter beside it is what makes `canUndo`/`canRedo` re-render.
  const historyRef = useRef<{ past: CalendarEntry[]; future: CalendarEntry[] }>({ past: [], future: [] })
  const [, setRevision] = useState(0)

  /** One direction of an entry's patches, into the periods that own the cells. */
  const applyPeriods = useCallback(
    (patches: readonly PeriodPatch[], direction: 'forward' | 'backward') => {
      for (const patch of patches) {
        setOverrides((prev) => ({
          ...prev,
          [patch.periodId]: applyPatch(prev[patch.periodId] ?? new Map(), patch[direction]),
        }))
      }
    },
    [setOverrides],
  )

  const applyEntry = useCallback(
    (entry: CalendarEntry, direction: 'forward' | 'backward') => {
      applyPeriods(entry.patches, direction)
      for (const change of entry.leave) {
        const days = direction === 'forward' ? change.after : change.before
        // Only writes into an already-seeded roster: mounting the calendar first
        // must never be what pins the workspace's people list to empty.
        setPeople((prev) =>
          prev === null ? prev : prev.map((p) => (p.id === change.personId ? { ...p, timeOff: [...days] } : p)),
        )
      }
    },
    [applyPeriods, setPeople],
  )

  /** One user action, one entry; anything undone before it is dropped, as usual. */
  const commit = useCallback((entry: CalendarEntry) => {
    historyRef.current = { past: [...historyRef.current.past, entry], future: [] }
    setRevision((n) => n + 1)
  }, [])

  const swapDays = useCallback(
    (personId: string, fromIso: string, toIso: string): boolean => {
      const patches = buildSwapPatches(source, personId, fromIso, toIso)
      if (!patches) return false
      applyPeriods(patches, 'forward')
      commit({ patches, leave: [] })
      return true
    },
    [source, applyPeriods, commit],
  )

  const changeShift = useCallback(
    (personId: string, iso: string, code: ShiftCode): boolean => {
      const patches = buildShiftChangePatches(source, personId, iso, code)
      if (!patches) return false
      applyPeriods(patches, 'forward')
      commit({ patches, leave: [] })
      return true
    },
    [source, applyPeriods, commit],
  )

  /**
   * Leave writes. The batch form is the primitive because one action can touch
   * many people (the day menu's "clear leave" hits everyone on that day) and it
   * still has to be one undo — folding over a working copy keeps one before/
   * after per person, a repeated person's last write winning, exactly what
   * sequential calls would leave behind.
   */
  const setTimeOffMany = useCallback(
    (entries: readonly { personId: string; nextTimeOff: readonly string[] }[]): void => {
      // Booked days are stored sorted and unique, the shape the roster's own
      // leave writes keep — so the two sides of an undo compare cleanly.
      let next = source.people
      const changes = new Map<string, LeaveChange>()
      for (const { personId, nextTimeOff } of entries) {
        const person = next.find((p) => p.id === personId)
        if (!person) continue
        const before = [...new Set(person.timeOff ?? [])].sort()
        const after = [...new Set(nextTimeOff)].sort()
        if (before.length === after.length && before.every((day, i) => day === after[i])) continue
        next = next.map((p) => (p.id === personId ? { ...p, timeOff: after } : p))
        changes.set(personId, { personId, before: changes.get(personId)?.before ?? before, after })
      }
      if (changes.size === 0) return
      // Only writes into an already-seeded roster: mounting the calendar first
      // must never be what pins the workspace's people list to empty.
      setPeople((prev) =>
        prev === null
          ? prev
          : prev.map((p) => {
              const change = changes.get(p.id)
              return change ? { ...p, timeOff: [...change.after] } : p
            }),
      )
      commit({ patches: [], leave: [...changes.values()] })
    },
    [source.people, setPeople, commit],
  )

  const setTimeOff = useCallback(
    (personId: string, nextTimeOff: readonly string[]): void => setTimeOffMany([{ personId, nextTimeOff }]),
    [setTimeOffMany],
  )

  const undo = useCallback(() => {
    const entry = historyRef.current.past.at(-1)
    if (!entry) return
    historyRef.current = { past: historyRef.current.past.slice(0, -1), future: [...historyRef.current.future, entry] }
    applyEntry(entry, 'backward')
    setRevision((n) => n + 1)
  }, [applyEntry])

  const redo = useCallback(() => {
    const entry = historyRef.current.future.at(-1)
    if (!entry) return
    historyRef.current = { past: [...historyRef.current.past, entry], future: historyRef.current.future.slice(0, -1) }
    applyEntry(entry, 'forward')
    setRevision((n) => n + 1)
  }, [applyEntry])

  return {
    swapDays,
    changeShift,
    setTimeOff,
    setTimeOffMany,
    undo,
    redo,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
  }
}
