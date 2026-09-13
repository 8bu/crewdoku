/**
 * @crewdoku/persistence — workspace storage port, IndexedDB adapter, and DTOs.
 * Depends only on @crewdoku/domain.
 */

export type {
  CoverageBandDTO,
  CoverageRowDTO,
  CoverageTableDTO,
  ScheduleCellDTO,
  ScheduleDTO,
  WorkspaceDTO,
} from './dto'
export {
  fromWorkspaceDTO,
  migrate,
  toWorkspaceDTO,
} from './dto'

export type { WorkspaceStorage } from './idbAdapter'
export { IdbWorkspaceStorage } from './idbAdapter'

export type { ImportResult } from './workspaceFile'
export {
  exportWorkspaceFile,
  importWorkspaceFile,
  workspaceFileName,
} from './workspaceFile'

export type { MultiWorkspaceStorage } from './multiWorkspace'
export { IdbMultiWorkspaceStorage } from './multiWorkspace'
export { migrateRegistry } from './dto'
