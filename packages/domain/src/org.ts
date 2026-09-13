/// <reference path="./globals.d.ts" />

/**
 * Org / workspace identity — the registry layer that scopes each Workspace
 * aggregate. An Org (company/tenant) owns one or more named workspaces; each
 * WorkspaceMeta identifies one Workspace data blob. Kept separate from the
 * Workspace payload so a future accounts/cloud-sync layer can attach
 * credentials and remote ids without reshaping stored schedule data.
 */

export type Org = {
  id: string
  name: string
  createdAt: string
}

export type WorkspaceMeta = {
  id: string
  orgId: string
  name: string
  createdAt: string
  updatedAt: string
}

export type WorkspaceRegistry = {
  schemaVersion: 1
  orgs: Org[]
  workspaces: WorkspaceMeta[]
  activeWorkspaceId: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

export function makeOrg(name: string): Org {
  return { id: `org-${crypto.randomUUID()}`, name, createdAt: nowIso() }
}

export function makeWorkspaceMeta(orgId: string, name: string): WorkspaceMeta {
  const createdAt = nowIso()
  return { id: `workspace-${crypto.randomUUID()}`, orgId, name, createdAt, updatedAt: createdAt }
}

export function emptyRegistry(): WorkspaceRegistry {
  return { schemaVersion: 1, orgs: [], workspaces: [], activeWorkspaceId: null }
}
