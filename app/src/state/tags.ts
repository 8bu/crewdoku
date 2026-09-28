import { atom, useAtom } from 'jotai'
import { useCallback } from 'react'
import type { CoverageTable, Tag, TagGroup } from '@crewdoku/domain'

/**
 * The workspace-global tag catalog: groups, tags (with their rule lines), and
 * the per-tag coverage tables (H7, keyed by `Tag.id`). `null` until the
 * workspace hydrates; readers see the empty catalog meanwhile. People hold
 * tags through `Person.tagIds` in `state/roster.ts`.
 */
export const tagGroupsAtom = atom<TagGroup[] | null>(null)
export const tagsAtom = atom<Tag[] | null>(null)
export const tagCoverageAtom = atom<Record<string, CoverageTable> | null>(null)

const NO_GROUPS: TagGroup[] = []
const NO_TAGS: Tag[] = []
const NO_TAG_COVERAGE: Record<string, CoverageTable> = {}

export function useTagGroups(): [TagGroup[], (updater: (prev: TagGroup[]) => TagGroup[]) => void] {
  const [state, setState] = useAtom(tagGroupsAtom)
  const set = useCallback(
    (updater: (prev: TagGroup[]) => TagGroup[]) => setState((prev) => updater(prev ?? NO_GROUPS)),
    [setState],
  )
  return [state ?? NO_GROUPS, set]
}

export function useTags(): [Tag[], (updater: (prev: Tag[]) => Tag[]) => void] {
  const [state, setState] = useAtom(tagsAtom)
  const set = useCallback(
    (updater: (prev: Tag[]) => Tag[]) => setState((prev) => updater(prev ?? NO_TAGS)),
    [setState],
  )
  return [state ?? NO_TAGS, set]
}

export function useTagCoverage(): [
  Record<string, CoverageTable>,
  (updater: (prev: Record<string, CoverageTable>) => Record<string, CoverageTable>) => void,
] {
  const [state, setState] = useAtom(tagCoverageAtom)
  const set = useCallback(
    (updater: (prev: Record<string, CoverageTable>) => Record<string, CoverageTable>) =>
      setState((prev) => updater(prev ?? NO_TAG_COVERAGE)),
    [setState],
  )
  return [state ?? NO_TAG_COVERAGE, set]
}
