import { atom, useAtomValue } from 'jotai'
import type { Org, WorkspaceMeta } from '@crewdoku/domain'

/**
 * The workspace registry, split from the Workspace data aggregate. These atoms
 * hold the Org + WorkspaceMeta index and the current selection; the actual
 * schedule data for the active workspace lives in the workspace-affecting atoms
 * (roster, teams, shifts, coverage, settings, periods, schedules) that
 * `workspaceStore` hydrates on boot/switch. `workspaceStore` owns all writes to
 * these atoms and their persistence; components only read them.
 *
 * Two separate selections: `activeOrgId` is which organization you have entered
 * (chosen on the full-page org picker, Netflix-style) and `activeWorkspaceId` is
 * which workspace within it (switched from the compact nav switcher,
 * Slack/Linear-style). Only `activeWorkspaceId` is persisted in the registry;
 * `activeOrgId` is derived on boot and held in app state so "Switch
 * organization" can return to the picker without a stored flag.
 */
export const orgsAtom = atom<Org[]>([])
export const workspaceMetasAtom = atom<WorkspaceMeta[]>([])
export const activeOrgIdAtom = atom<string | null>(null)
export const activeWorkspaceIdAtom = atom<string | null>(null)

/** The entered org, or null when the org picker should show. */
export const activeOrgAtom = atom<Org | null>((get) => {
  const id = get(activeOrgIdAtom)
  return get(orgsAtom).find((o) => o.id === id) ?? null
})

/** The active workspace's metadata, or null when a workspace must be created/picked. */
export const activeWorkspaceMetaAtom = atom<WorkspaceMeta | null>((get) => {
  const id = get(activeWorkspaceIdAtom)
  return get(workspaceMetasAtom).find((w) => w.id === id) ?? null
})

/** The workspaces belonging to the entered org. */
export const activeOrgWorkspacesAtom = atom<WorkspaceMeta[]>((get) => {
  const orgId = get(activeOrgIdAtom)
  if (!orgId) return []
  return get(workspaceMetasAtom).filter((w) => w.orgId === orgId)
})

export function useOrgs(): Org[] {
  return useAtomValue(orgsAtom)
}

export function useActiveOrgId(): string | null {
  return useAtomValue(activeOrgIdAtom)
}

export function useActiveOrg(): Org | null {
  return useAtomValue(activeOrgAtom)
}

export function useActiveWorkspaceId(): string | null {
  return useAtomValue(activeWorkspaceIdAtom)
}

export function useActiveWorkspaceMeta(): WorkspaceMeta | null {
  return useAtomValue(activeWorkspaceMetaAtom)
}

export function useActiveOrgWorkspaces(): WorkspaceMeta[] {
  return useAtomValue(activeOrgWorkspacesAtom)
}
