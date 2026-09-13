import { describe, expect, it } from 'vitest'
import { emptyRegistry, makeOrg, makeWorkspaceMeta } from './org'

describe('org identity factories', () => {
  it('makeOrg produces an org- prefixed id and a parseable createdAt', () => {
    const org = makeOrg('Acme')
    expect(org.id.startsWith('org-')).toBe(true)
    expect(org.name).toBe('Acme')
    expect(org.createdAt.length).toBeGreaterThan(0)
    expect(Number.isNaN(Date.parse(org.createdAt))).toBe(false)
  })

  it('makeWorkspaceMeta links to its org and sets equal created/updated stamps', () => {
    const meta = makeWorkspaceMeta('org-1', 'Main')
    expect(meta.id.startsWith('workspace-')).toBe(true)
    expect(meta.orgId).toBe('org-1')
    expect(meta.name).toBe('Main')
    expect(meta.createdAt).toBe(meta.updatedAt)
    expect(Number.isNaN(Date.parse(meta.createdAt))).toBe(false)
  })

  it('mints distinct ids across calls', () => {
    expect(makeOrg('A').id).not.toBe(makeOrg('A').id)
    expect(makeWorkspaceMeta('o', 'W').id).not.toBe(makeWorkspaceMeta('o', 'W').id)
  })

  it('emptyRegistry is a blank v1 registry', () => {
    expect(emptyRegistry()).toEqual({
      schemaVersion: 1,
      orgs: [],
      workspaces: [],
      activeWorkspaceId: null,
    })
  })
})
