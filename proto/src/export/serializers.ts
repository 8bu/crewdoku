import type { ExportCell } from './exportCsv'

export type ExportFormatId = 'csv' | 'tsv' | 'json' | 'xlsx' | 'pdf'

export type ExportFormat = {
  id: ExportFormatId
  label: string
  ext: string
  mime: string
}

export const EXPORT_FORMATS: ExportFormat[] = [
  { id: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv;charset=utf-8' },
  { id: 'tsv', label: 'TSV', ext: 'tsv', mime: 'text/tab-separated-values;charset=utf-8' },
  { id: 'json', label: 'JSON', ext: 'json', mime: 'application/json;charset=utf-8' },
  {
    id: 'xlsx',
    label: 'XLSX',
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  { id: 'pdf', label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
]

function escapeDelimitedCell(value: string, delimiter: ',' | '\t'): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Serializes rows using RFC 4180 escaping generalized to the specified delimiter.
 * Numbers are serialized bare via `String(cell)`.
 */
export function serializeDelimited(rows: ExportCell[][], delimiter: ',' | '\t'): string {
  return rows.map((row) => row.map((cell) => escapeDelimitedCell(String(cell), delimiter)).join(delimiter)).join('\n') + '\n'
}

/**
 * Serializes rows as a formatted JSON array of objects keyed by the header row.
 * Numeric cells remain numbers, string cells remain strings (including empty strings).
 * If there are no data rows, returns "[]\n".
 */
export function serializeJson(rows: ExportCell[][]): string {
  const headerRow = rows[0]
  if (rows.length <= 1 || !headerRow) {
    return '[]\n'
  }
  const dataRows = rows.slice(1)
  const headers = headerRow.map((cell) => String(cell))
  const items = dataRows.map((row) => {
    const item: Record<string, ExportCell> = {}
    headers.forEach((header, i) => {
      item[header] = row[i] ?? ''
    })
    return item
  })
  return JSON.stringify(items, null, 2) + '\n'
}
