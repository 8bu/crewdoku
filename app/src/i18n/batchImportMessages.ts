import type { BatchImportError, BatchImportWarning } from '../board/roster/batchImport'

type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * Turns a structured `BatchImportError` from `parseWorkbook` into a localized
 * sentence. The parser returns facts (kinds + params); the words live in the
 * catalogs and are chosen here, at the UI boundary — the same "engine returns
 * facts, UI owns words" split `csvErrors.ts` uses for the CSV import, so a
 * Vietnamese session never sees an English parse error.
 */
export function batchImportErrorText(t: Translate, error: BatchImportError): string {
  switch (error.kind) {
    case 'noSheets':
      return t('rtc.batch.err.noSheets')
    case 'noPeopleOrTeams':
      return t('rtc.batch.err.noPeopleOrTeams')
    case 'missingNameHeader':
      return t('rtc.batch.err.missingNameHeader', { sheet: error.sheet })
    case 'unreadable':
      return t('rtc.batch.err.unreadable')
  }
}

/**
 * The per-cell counterpart: a row the import read but could not use. Warnings
 * never block the import, so they are phrased as skipped values, each carrying
 * the spreadsheet row it came from.
 */
export function batchImportWarningText(t: Translate, warning: BatchImportWarning): string {
  switch (warning.kind) {
    case 'unknownCode':
      return t('rtc.batch.warn.unknownCode', { row: warning.row, code: warning.code })
    case 'badDate':
      return t('rtc.batch.warn.badDate', { row: warning.row, value: warning.value })
    case 'badWeekday':
      return t('rtc.batch.warn.badWeekday', { row: warning.row, value: warning.value })
    case 'teamAutoCreated':
      return t('rtc.batch.warn.teamAutoCreated', { name: warning.name })
    case 'unknownPerson':
      return t('rtc.batch.warn.unknownPerson', { row: warning.row, name: warning.name })
  }
}
