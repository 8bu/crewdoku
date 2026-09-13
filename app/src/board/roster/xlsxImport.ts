import readXlsxFile from 'read-excel-file/browser'
import { parseEmployeeCsv, parseEmployeeRows, type CsvParseResult } from './csvImport'

/**
 * Reads an `.xlsx` file into trimmed string cells — the shape
 * `parseEmployeeRows`/`parseTeamNameRows` consume. Isolated here so the binary
 * spreadsheet dependency stays out of the pure parsers and the routes.
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
 * The single import dispatch both surfaces (Roster route + onboarding) use: an
 * `.xlsx` file goes through the spreadsheet reader, anything else is read as
 * CSV text. Kept here beside `readXlsxRows` so the binary dependency stays out
 * of the pure parsers; callers own the try/catch and message localization.
 */
export async function readEmployeeFile(file: File): Promise<CsvParseResult> {
  return file.name.toLowerCase().endsWith('.xlsx')
    ? parseEmployeeRows(await readXlsxRows(file))
    : parseEmployeeCsv(await file.text())
}
