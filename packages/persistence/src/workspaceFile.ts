import type { ISODate, Workspace } from '@crewdoku/domain'
import { fromWorkspaceDTO, migrate, toWorkspaceDTO } from './dto'

export type ImportResult =
  | {
      ok: true
      workspace: Workspace
    }
  | {
      ok: false
      reason: 'not-json' | 'not-a-workspace' | 'newer-schema'
      message: string
    }

export function exportWorkspaceFile(workspace: Workspace): string {
  return JSON.stringify(toWorkspaceDTO(workspace), null, 2)
}

export function workspaceFileName(today: ISODate): string {
  return `crewdoku-workspace-${today}.json`
}

export function importWorkspaceFile(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return {
      ok: false,
      reason: 'not-json',
      message: 'This file is not a Crewdoku workspace file.',
    }
  }

  const isNewerSchema =
    typeof raw === 'object' &&
    raw !== null &&
    'schemaVersion' in raw &&
    typeof raw.schemaVersion === 'number' &&
    raw.schemaVersion > 1

  if (isNewerSchema) {
    return {
      ok: false,
      reason: 'newer-schema',
      message: 'This file was made by a newer version of Crewdoku. Update the app to open it.',
    }
  }

  const dto = migrate(raw)
  if (dto === null) {
    return {
      ok: false,
      reason: 'not-a-workspace',
      message: 'This file does not contain a Crewdoku workspace.',
    }
  }

  return {
    ok: true,
    workspace: fromWorkspaceDTO(dto),
  }
}
