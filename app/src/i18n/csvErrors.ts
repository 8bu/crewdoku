import type { CsvError } from '../board/roster/csvImport'

type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * Turns a structured `CsvError` from `parseEmployeeCsv` into a localized
 * sentence. The parser returns facts (kinds + params); the words live in the
 * catalogs and are chosen here, at the UI boundary — the same "engine returns
 * facts, UI owns words" split the infeasible panel and import refusals use, so
 * a Vietnamese session never sees an English parse error.
 */
export function csvErrorText(t: Translate, error: CsvError): string {
  switch (error.kind) {
    case 'empty':
      return t('rtc.import.csvError.empty')
    case 'noHeader':
      return t('rtc.import.csvError.noHeader')
    case 'noRows':
      return t('rtc.import.csvError.noRows')
    case 'missingName':
      return t('rtc.import.csvError.missingName', { line: error.line })
  }
}
