/**
 * Tags: a second grouping of people, across teams (religion, ethnicity,
 * language, study…). A tag carries rule lines the solver honours on top of
 * the person's team or personal preference; a tag can also carry its own
 * coverage table (`Workspace.tagCoverage`). Pure, UTC-only like `calendar.ts`.
 */

import { weekdayOf } from './calendar'
import type { ISODate } from './calendar'
import type { Person, ShiftCode, Team } from './entities'

/** A folder of tags. `exclusive`: a person holds at most one tag of this group. */
export type TagGroup = {
  id: string
  name: string
  exclusive: boolean
}

/** When a rule line applies. Every variant is matched on the UTC calendar date. */
export type TagWhen =
  | { type: 'always' }
  | { type: 'date'; iso: ISODate }
  /** Weekdays 0 Sun .. 6 Sat. */
  | { type: 'weekly'; weekdays: number[] }
  /** Day of month 1–31; a month without that day never matches. */
  | { type: 'monthlyDay'; day: number }
  /** `nth` 1–4, or -1 for the last such weekday of the month. */
  | { type: 'monthlyNth'; nth: number; weekday: number }
  /** Month 1–12, day 1–31. */
  | { type: 'yearly'; month: number; day: number }

export type TagRule = {
  id: string
  kind: 'avoid' | 'want'
  /** The shift the line is about; `null` means any shift (for an avoid: the whole day off). */
  shift: ShiftCode | null
  when: TagWhen
  /** Avoids only: the solver never breaks it while H6 is on. Ignored on wants. */
  strict?: boolean
}

export type Tag = {
  id: string
  name: string
  /** A `TagGroup.id`; absent for a loose tag. */
  groupId?: string
  rules: TagRule[]
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Whether `when` covers the date `iso`. */
export function tagWhenMatches(when: TagWhen, iso: ISODate): boolean {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  switch (when.type) {
    case 'always':
      return true
    case 'date':
      return when.iso === iso
    case 'weekly':
      return when.weekdays.includes(weekdayOf(iso))
    case 'monthlyDay':
      return when.day === day
    case 'monthlyNth':
      if (weekdayOf(iso) !== when.weekday) return false
      return when.nth === -1 ? day + 7 > daysInMonth(year, month) : Math.ceil(day / 7) === when.nth
    case 'yearly':
      return when.month === month && when.day === day
  }
}

/** Whether `rule` speaks about working `shiftCode` on `iso`. */
export function tagRuleApplies(rule: TagRule, shiftCode: ShiftCode, iso: ISODate): boolean {
  return (rule.shift === null || rule.shift === shiftCode) && tagWhenMatches(rule.when, iso)
}

/** The person's tags, in workspace tag order; unknown ids are skipped. */
export function personTags(person: Person, tags: readonly Tag[]): Tag[] {
  const ids = person.tagIds
  if (!ids || ids.length === 0) return []
  const held = new Set(ids)
  return tags.filter((tag) => held.has(tag.id))
}

/**
 * The team or personal preference a person runs on (S2). A person on a real
 * team inherits it unless `useTeamPreference` is explicitly false.
 */
export function basePreference(
  person: Person,
  team: Team | undefined,
): { wants: readonly ShiftCode[]; avoids: readonly ShiftCode[] } {
  const inherit = person.useTeamPreference ?? team !== undefined
  if (inherit && team) return { wants: team.wants, avoids: team.avoids }
  return { wants: person.wants ?? [], avoids: person.avoids ?? [] }
}

/**
 * What every preference source says about one person working one shift on
 * one date, after precedence: any avoid (team, personal, or tag) cancels
 * every want for that cell.
 */
export type CellPreference = {
  /** Team or personal avoid (S2). */
  baseAvoid: boolean
  /** Team or personal want (S2); false whenever any avoid applies. */
  baseWant: boolean
  /** Soft tag avoid (S6). Includes strict avoids while `strictIsHard` is false. */
  tagAvoid: boolean
  /** Tag want (S6); false whenever any avoid applies. */
  tagWant: boolean
  /** A strict tag avoid matches and `strictIsHard`: the cell is forbidden (H6). */
  strictAvoid: boolean
}

/**
 * Resolves `CellPreference`. `heldTags` is `personTags(person, tags)`;
 * `strictIsHard` is whether H6 is enabled — when it is off, strict avoids
 * fall back to ordinary soft tag avoids.
 */
export function cellPreference(
  person: Person,
  team: Team | undefined,
  heldTags: readonly Tag[],
  shiftCode: ShiftCode,
  iso: ISODate,
  strictIsHard: boolean,
): CellPreference {
  const base = basePreference(person, team)
  const baseAvoid = base.avoids.includes(shiftCode)
  let tagAvoid = false
  let tagWant = false
  let strictAvoid = false
  for (const tag of heldTags) {
    for (const rule of tag.rules) {
      if (!tagRuleApplies(rule, shiftCode, iso)) continue
      if (rule.kind === 'want') tagWant = true
      else if (rule.strict && strictIsHard) strictAvoid = true
      else tagAvoid = true
    }
  }
  const anyAvoid = baseAvoid || tagAvoid || strictAvoid
  return {
    baseAvoid,
    baseWant: !anyAvoid && base.wants.includes(shiftCode),
    tagAvoid,
    tagWant: !anyAvoid && tagWant,
    strictAvoid,
  }
}

/**
 * `tagIds` cleaned against the catalog: unknown ids and duplicates dropped,
 * and within an exclusive group only the last listed tag kept.
 */
export function normalizeTagIds(
  tagIds: readonly string[],
  tags: readonly Tag[],
  groups: readonly TagGroup[],
): string[] {
  const byId = new Map(tags.map((tag) => [tag.id, tag]))
  const exclusive = new Set(groups.filter((g) => g.exclusive).map((g) => g.id))
  const kept: string[] = []
  for (let i = tagIds.length - 1; i >= 0; i--) {
    const id = tagIds[i]
    const tag = id === undefined ? undefined : byId.get(id)
    if (!tag || kept.includes(tag.id)) continue
    const group = tag.groupId
    if (group !== undefined && exclusive.has(group) && kept.some((k) => byId.get(k)?.groupId === group)) continue
    kept.push(tag.id)
  }
  return kept.reverse()
}

/** Adds or removes `tagId`; adding into an exclusive group replaces its other tag. */
export function togglePersonTag(
  tagIds: readonly string[],
  tagId: string,
  tags: readonly Tag[],
  groups: readonly TagGroup[],
): string[] {
  if (tagIds.includes(tagId)) return tagIds.filter((id) => id !== tagId)
  return normalizeTagIds([...tagIds, tagId], tags, groups)
}
