/**
 * Pure helpers behind the calendar's leave: the dialog's day count, the
 * maximal runs a leave chip's menu acts on, and the one write every leave edit
 * funnels through. Leave here is dated only (`Person.timeOff`); recurring
 * weekday offs are a separate surface.
 */
import type { Person } from '@crewdoku/domain'
import { addDaysISO } from '../../state/shell'

/** A maximal run of consecutive leave days; ISO dates, `end` INCLUSIVE. */
export interface LeaveRange {
  start: string
  end: string
}

/** Sorted, de-duplicated, consecutive calendar days merged into maximal runs. Input may be unsorted/duplicated. */
export function toLeaveRanges(timeOff: readonly string[]): LeaveRange[] {
  const days = [...new Set(timeOff)].sort()
  const ranges: LeaveRange[] = []
  for (const day of days) {
    const last = ranges.at(-1)
    if (last !== undefined && addDaysISO(last.end, 1) === day) {
      last.end = day
    } else {
      ranges.push({ start: day, end: day })
    }
  }
  return ranges
}

/** Every ISO day from start..end inclusive (UTC-safe; crosses month/year boundaries). Empty if end < start. */
export function expandRange(range: LeaveRange): string[] {
  const days: string[] = []
  for (let day = range.start; day <= range.end; day = addDaysISO(day, 1)) {
    days.push(day)
  }
  return days
}

/** Days between two ISO dates, inclusive count (end - start + 1). */
export function rangeLength(range: LeaveRange): number {
  const start = Date.parse(`${range.start}T00:00:00Z`)
  const end = Date.parse(`${range.end}T00:00:00Z`)
  const days = Math.round((end - start) / 86_400_000) + 1
  return days > 0 ? days : 0
}

/**
 * Replace one person's leave: removes every day of `from` (if non-null), then adds every day of `to`
 * (if non-null); result `timeOff` sorted + de-duplicated. Other people returned untouched (same object refs).
 * from=null => pure add (book); to=null => pure remove; both => move/resize/edit.
 */
export function replacePersonLeave(
  people: readonly Person[],
  personId: string,
  from: LeaveRange | null,
  to: LeaveRange | null,
): Person[] {
  const removed = new Set(from === null ? [] : expandRange(from))
  const added = to === null ? [] : expandRange(to)
  return people.map((person) => {
    if (person.id !== personId) return person
    const kept = (person.timeOff ?? []).filter((day) => !removed.has(day))
    const timeOff = [...new Set([...kept, ...added])].sort()
    return { ...person, timeOff }
  })
}
