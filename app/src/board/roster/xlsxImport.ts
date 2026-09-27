import readXlsxFile from 'read-excel-file/browser'
import { parseEmployeeCsv, parseEmployeeRows, type CsvParseResult } from './csvImport'

/**
 * Reads an `.xlsx` file into trimmed string cells — the shape
 * `parseEmployeeRows` consumes. Isolated here so the binary spreadsheet
 * dependency stays out of the pure parsers and the routes.
 *
 * `read-excel-file` v9's default export returns every sheet as
 * `{ sheet, data }`; we take the first sheet's rows.
 */
export async function readXlsxRows(file: File): Promise<string[][]> {
  const sheets = await readXlsxFile(file)
  const data = sheets[0]?.data ?? []
  return data.map((row) => row.map((cell) => (cell == null ? '' : String(cell).trim())))
}

/**
 * Reads *every* sheet of an `.xlsx` file into a sheet name -> trimmed string
 * rows map, the shape the batch-import parser consumes. Sheet names are kept
 * exactly as the workbook spells them (the parser matches them
 * case-insensitively) and cells are stringified like `readXlsxRows`, so both
 * readers agree on what a cell looks like.
 */
export async function readWorkbookSheets(file: File): Promise<Record<string, string[][]>> {
  const sheets = await readXlsxFile(file)
  const workbook: Record<string, string[][]> = {}
  for (const { sheet, data } of sheets) {
    workbook[sheet] = data.map((row) => row.map((cell) => (cell == null ? '' : String(cell).trim())))
  }
  return workbook
}

/**
 * The onboarding wizard's import dispatch: an `.xlsx` file goes through the
 * spreadsheet reader, anything else is read as CSV text. Kept here beside
 * `readXlsxRows` so the binary dependency stays out of the pure parsers;
 * callers own the try/catch and message localization.
 */
export async function readEmployeeFile(file: File): Promise<CsvParseResult> {
  return file.name.toLowerCase().endsWith('.xlsx')
    ? parseEmployeeRows(await readXlsxRows(file))
    : parseEmployeeCsv(await file.text())
}
