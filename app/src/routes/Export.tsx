import { useT } from '../i18n/useT'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDefaultStore, useAtomValue } from 'jotai'
import { periodsAtom, selectedPeriodAtom, type Period } from '../state/shell'
import { seedBoardData } from '../board/periodSeed'
import {
  assignmentKey,
  DEFAULT_SHIFTS,
  OFF_ASSIGNMENT,
  periodLengthDays,
  type Assignment,
} from '@crewdoku/domain'
import { emptyAssignments } from '../board/mockBoard'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { useRosterShifts } from '../state/shifts'
import { scheduleByPeriodAtom, useBoardSchedule } from '../state/schedule'
import { overridesByPeriodAtom, useBoardOverrides } from '../state/boardOverrides'
import { buildTemplateRows, EXPORT_TEMPLATES, type ExportTemplateId } from '../export/templates'
import { EXPORT_FORMATS, serializeDelimited, serializeJson, type ExportFormatId } from '../export/serializers'
import { exportWorkspaceFile, importWorkspaceFile, workspaceFileName } from '@crewdoku/persistence'
import { collectWorkspace, hydrate } from '../state/workspaceStore'
import writeXlsxFile from 'write-excel-file/browser'
import { exportFileName, type ExportCell, type ExportInputs } from '../export/exportCsv'
import { Stub } from './Stub'

/**
 * Schedule export wizard screen (wayfinder ticket 18).
 *
 * 3-step export wizard:
 * 1. Period: select which period to export with schedule presence indicators.
 * 2. Template: choose from 4 export layouts (team grid, board, per-person list, coverage pivot).
 * 3. Format: choose format (CSV, TSV, JSON, XLSX, PDF), preview the rows, and download.
 */
export function Export() {
  const periods = useAtomValue(periodsAtom)
  const selectedPeriod = useAtomValue(selectedPeriodAtom)

  const firstPeriod = periods[0]
  const t = useT()
  if (!firstPeriod) {
    return <Stub title={t('onbex.export.title')} tickets="18" />
  }

  return (
    <ExportWizard
      periods={periods}
      fallbackPeriod={firstPeriod}
      initialPeriodId={selectedPeriod?.id ?? firstPeriod.id}
    />
  )
}

function downloadBlobText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function downloadXlsx(filename: string, rows: ExportCell[][]) {
  // '' means OFF in the grid — null renders a truly empty XLSX cell.
  const sheetData = rows.map((row) => row.map((cell) => (cell === '' ? null : cell)))
  await writeXlsxFile(sheetData, { sheet: 'Schedule', stickyRowsCount: 1 }).toFile(filename)
}

const THUMB_ROWS = 4
const THUMB_COLS = 5

/**
 * A template card's mini-sheet: the top-left corner of the real matrix,
 * dressed as a tiny spreadsheet (gridlines, dim uppercase header, mono
 * cells). Deliberately non-interactive — it is a picture of the shape,
 * the full preview lives on step 3.
 */
function TemplateThumb({ rows }: { rows: ExportCell[][] }) {
  const header = rows[0]
  if (!header || header.length === 0) return null
  const headCells = header.slice(0, THUMB_COLS)
  const bodyRows = rows.slice(1, 1 + THUMB_ROWS).map((row) => headCells.map((_, i) => row[i] ?? ''))
  const moreCols = header.length > THUMB_COLS
  const moreRows = rows.length - 1 > THUMB_ROWS

  return (
    <div className="pointer-events-none mt-2 w-full overflow-hidden rounded-sm border border-base-300 bg-base-100">
      <table className="w-full table-fixed border-collapse text-2xs leading-tight">
        <thead>
          <tr className="bg-base-200">
            {headCells.map((cell, i) => (
              <th
                key={i}
                className="truncate border-b border-r border-base-300 px-1 py-0.5 text-left font-semibold uppercase tracking-wide text-base-content/50 last:border-r-0"
              >
                {String(cell)}
                {moreCols && i === headCells.length - 1 && ' ⋯'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="truncate border-b border-r border-base-300 px-1 py-0.5 font-mono tabular-nums text-base-content/70 last:border-r-0"
                >
                  {String(cell) || '\u00A0'}
                </td>
              ))}
            </tr>
          ))}
          {moreRows && (
            <tr>
              <td colSpan={headCells.length} className="border-r-0 px-1 py-0.5 text-base-content/40">
                ⋯
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const PREVIEW_TEXT_ROWS = 8
const PREVIEW_JSON_RECORDS = 3
const PREVIEW_PDF_ROWS = 8
const PREVIEW_PDF_COLS = 10

/**
 * Format-aware preview (8bu): a plain table only tells the truth for
 * sheet-like formats. Each format previews a handful of records the way
 * the downloaded file will actually present them — raw delimited text for
 * CSV/TSV, pretty-printed objects for JSON, a sheet table for XLSX, and a
 * mock A4 page in the PDF writer's own styling for PDF.
 */
function FormatPreview({ formatId, rows, title }: { formatId: ExportFormatId; rows: ExportCell[][]; title: string }) {
  if (rows.length <= 1) return null
  const dataCount = rows.length - 1

  switch (formatId) {
    case 'csv':
    case 'tsv': {
      const text = serializeDelimited(rows.slice(0, 1 + PREVIEW_TEXT_ROWS), formatId === 'csv' ? ',' : '\t')
      return <TextFilePreview text={text} more={Math.max(0, dataCount - PREVIEW_TEXT_ROWS)} noun="rows" />
    }
    case 'json': {
      const text = serializeJson(rows.slice(0, 1 + PREVIEW_JSON_RECORDS))
      return <TextFilePreview text={text} more={Math.max(0, dataCount - PREVIEW_JSON_RECORDS)} noun="records" />
    }
    case 'xlsx':
      return <PreviewTable rows={rows} />
    case 'pdf':
      return <PdfPagePreview rows={rows} title={title} />
  }
}

/** The literal head of the text file, in a mono block — what a text editor would show. */
function TextFilePreview({ text, more, noun }: { text: string; more: number; noun: string }) {
  const t = useT()
  return (
    <div className="flex max-w-[720px] flex-col gap-1">
      <pre className="m-0 overflow-x-auto rounded border border-base-300 bg-base-200/40 p-3 font-mono text-2xs leading-relaxed text-base-content/80">
        {text.trimEnd()}
      </pre>
      {more > 0 && (
        <span className="text-2xs tabular-nums text-base-content/40">
          {t(noun === 'records' ? 'onbex.export.preview.moreRecords' : 'onbex.export.preview.moreRows', { count: more })}
        </span>
      )}
    </div>
  )
}

/**
 * A mock of the PDF's first page: white landscape sheet, title, and the
 * autotable grid in the writer's own palette (gray header fill, thin
 * gridlines, zebra rows). Fixed neutral colors on purpose — paper is
 * white regardless of the app theme.
 */
function PdfPagePreview({ rows, title }: { rows: ExportCell[][]; title: string }) {
  const t = useT()
  const header = rows[0] ?? []
  const headCells = header.slice(0, PREVIEW_PDF_COLS)
  const body = rows.slice(1, 1 + PREVIEW_PDF_ROWS).map((row) => headCells.map((_, i) => String(row[i] ?? '')))
  const clippedCols = header.length > PREVIEW_PDF_COLS

  return (
    <div className="flex max-w-[720px] flex-col gap-1">
      <div className="aspect-[297/210] w-full overflow-hidden rounded-sm border border-base-300 bg-white p-8 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-neutral-800">{title}</div>
        <table className="w-full border-collapse text-[8px] leading-tight text-neutral-800">
          <thead>
            <tr>
              {headCells.map((cell, i) => (
                <th key={i} className="border border-[#c8c8c8] bg-[#ebebeb] px-1 py-0.5 text-left font-bold">
                  {String(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 1 ? 'bg-[#fafafa]' : ''}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-[#c8c8c8] px-1 py-0.5">
                    {cell || '\u00A0'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="text-2xs tabular-nums text-base-content/40">
        {t('onbex.export.pdf.note')}
        {clippedCols ? t('onbex.export.pdf.clipped', { count: PREVIEW_PDF_COLS, total: header.length }) : ''}
      </span>
    </div>
  )
}

/** The first rows of the actual export data as a real table — not raw CSV text. */
function PreviewTable({ rows }: { rows: ExportCell[][] }) {
  const t = useT()
  const [header, ...body] = rows
  if (!header || body.length === 0) return null

  const visible = body.slice(0, 6)
  const remaining = body.length - visible.length

  return (
    <div className="overflow-x-auto border border-base-300">
      <table className="w-max border-collapse text-2xs">
        <thead>
          <tr className="border-b border-base-300 bg-base-200/50">
            {header.map((cell, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-2 py-1 text-left font-semibold uppercase tracking-wide text-base-content/40"
              >
                {String(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, r) => (
            <tr key={r} className="border-b border-base-300/60 last:border-b-0">
              {row.map((cell, c) => (
                <td key={c} className="whitespace-nowrap px-2 py-1 tabular-nums text-base-content/80">
                  {String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {remaining > 0 && (
        <div className="border-t border-base-300 px-2 py-1 text-2xs text-base-content/40">
          {t(remaining === 1 ? 'onbex.export.preview.remainingRow' : 'onbex.export.preview.remainingRows', { count: remaining })}
        </div>
      )}
    </div>
  )
}

type PeriodStatus = {
  status: 'applied' | 'edits' | 'empty'
  label: string
  isEmpty: boolean
  days: number
}

function ExportWizard({
  periods,
  fallbackPeriod,
  initialPeriodId,
}: {
  periods: Period[]
  fallbackPeriod: Period
  initialPeriodId: string
}) {
  const t = useT()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [periodId, setPeriodId] = useState<string>(initialPeriodId)
  const [templateId, setTemplateId] = useState<ExportTemplateId>('team-grid')
  const [formatId, setFormatId] = useState<ExportFormatId>('csv')

  const scheduleByPeriod = useAtomValue(scheduleByPeriodAtom)
  const overridesByPeriod = useAtomValue(overridesByPeriodAtom)

  const periodStatus = useMemo(() => {
    const statusRecord: Record<string, PeriodStatus> = {}
    for (const p of periods) {
      const pSchedule = scheduleByPeriod[p.id]
      const pOverrides = overridesByPeriod[p.id]
      const hasSched = pSchedule?.hasSchedule ?? false
      const hasEdits = (pOverrides?.size ?? 0) > 0
      const days = periodLengthDays(p.start, p.end)

      if (hasSched) {
        statusRecord[p.id] = { status: 'applied', label: 'applied schedule', isEmpty: false, days }
      } else if (hasEdits) {
        statusRecord[p.id] = { status: 'edits', label: 'hand edits only', isEmpty: false, days }
      } else {
        statusRecord[p.id] = { status: 'empty', label: 'empty', isEmpty: true, days }
      }
    }
    return statusRecord
  }, [periods, scheduleByPeriod, overridesByPeriod])

  const allEmpty = useMemo(() => periods.every((p) => periodStatus[p.id]?.isEmpty), [periods, periodStatus])

  const period = useMemo(() => periods.find((p) => p.id === periodId) ?? fallbackPeriod, [periods, periodId, fallbackPeriod])

  const initial = useMemo(() => seedBoardData(period), [period])
  const [people] = useRosterPeople(initial.people)
  const [teams] = useRosterTeams(initial.teams)
  const [shifts] = useRosterShifts(DEFAULT_SHIFTS)
  const initialAssignments = useMemo(() => emptyAssignments(initial.people, initial.dates), [initial])
  const [baseAssignments] = useBoardSchedule(period.id, initialAssignments)
  const [overrides] = useBoardOverrides(period.id)

  const getAssignment = useCallback(
    (personId: string, dateIso: string): Assignment =>
      overrides.get(assignmentKey(personId, dateIso)) ??
      baseAssignments.get(assignmentKey(personId, dateIso)) ??
      OFF_ASSIGNMENT,
    [overrides, baseAssignments],
  )

  const exportInputs: ExportInputs = useMemo(
    () => ({
      people,
      teams,
      shifts,
      dates: initial.dates,
      getAssignment,
    }),
    [people, teams, shifts, initial.dates, getAssignment],
  )

  // Every template's full matrix, built once per period/assignment set and
  // shared by the step-2 card thumbnails AND step 3's preview/download — so
  // switching steps or cards never recomputes anything (a 2→3→2 walk used to
  // rebuild all four). Four matrices ≈ 17k cells for the 100×42 mock: cheap,
  // and only invalidated when the schedule itself changes.
  const templateMatrices = useMemo(() => {
    const matrices: Partial<Record<ExportTemplateId, ExportCell[][]>> = {}
    for (const tmpl of EXPORT_TEMPLATES) {
      matrices[tmpl.id] = buildTemplateRows(tmpl.id, exportInputs)
    }
    return matrices
  }, [exportInputs])

  const rows = useMemo(() => templateMatrices[templateId] ?? [], [templateMatrices, templateId])


  const handleDownload = useCallback(async () => {
    if (rows.length === 0) return
    const fmt = EXPORT_FORMATS.find((f) => f.id === formatId)
    const tmpl = EXPORT_TEMPLATES.find((t) => t.id === templateId)
    if (!fmt || !tmpl) return
    const filename = exportFileName(period.label, templateId, fmt.ext)

    switch (formatId) {
      case 'csv': {
        const text = serializeDelimited(rows, ',')
        downloadBlobText(filename, text, fmt.mime)
        break
      }
      case 'tsv': {
        const text = serializeDelimited(rows, '\t')
        downloadBlobText(filename, text, fmt.mime)
        break
      }
      case 'json': {
        const text = serializeJson(rows)
        downloadBlobText(filename, text, fmt.mime)
        break
      }
      case 'xlsx': {
        await downloadXlsx(filename, rows)
        break
      }
      case 'pdf': {
        const stickyColumns = templateId === 'team-grid' || templateId === 'person-list' ? 2 : 1
        const title = `${period.label} — ${t(`onbex.export.template.${templateId}.label`)}`
        // Lazy-loaded: jspdf + jspdf-autotable (~272 kB gzip) stay out of the
        // main bundle and only download when the planner exports a PDF.
        const { downloadPdf } = await import('../export/pdf')
        downloadPdf(filename, title, rows, { stickyColumns })
        break
      }
    }
  }, [period, rows, formatId, templateId])

  // Workspace file (app ticket 06): save the whole workspace to a JSON file
  // and load one back over `@crewdoku/persistence`. Load replaces everything,
  // so it is guarded by a confirm; a bad file surfaces the port's plain refusal.
  const store = getDefaultStore()
  const [workspaceFileMsg, setWorkspaceFileMsg] = useState<string | null>(null)

  const saveWorkspace = useCallback(() => {
    const text = exportWorkspaceFile(collectWorkspace(store))
    const today = new Date().toISOString().slice(0, 10)
    downloadBlobText(workspaceFileName(today), text, 'application/json')
    setWorkspaceFileMsg(null)
  }, [store])

  const loadWorkspace = useCallback(
    async (file: File) => {
      const result = importWorkspaceFile(await file.text())
      if (!result.ok) {
        const key =
          result.reason === 'not-json'
            ? 'onbex.export.refusal.notJson'
            : result.reason === 'not-a-workspace'
              ? 'onbex.export.refusal.notWorkspace'
              : 'onbex.export.refusal.newerSchema'
        setWorkspaceFileMsg(t(key))
        return
      }
      if (!window.confirm(t('onbex.export.confirmLoad'))) return
      hydrate(store, result.workspace)
      setWorkspaceFileMsg(t('onbex.export.workspaceLoaded'))
    },
    [store, t],
  )

  const [header, ...body] = rows
  const bodyRowCount = body.length
  const colCount = header ? header.length : 0

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-base-300 px-4">
        <h1 className="m-0 text-sm font-semibold tracking-tight">{t('onbex.export.title')}</h1>
        <div className="flex items-center gap-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="cursor-pointer text-xs text-base-content/40 hover:text-base-content"
            >
              {t('onbex.export.step.period')}
            </button>
          ) : (
            <span className={`text-xs ${step === 1 ? 'font-semibold text-base-content' : 'text-base-content/40'}`}>
              {t('onbex.export.step.period')}
            </span>
          )}
          <span className="text-xs text-base-content/40">▸</span>
          {step > 2 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="cursor-pointer text-xs text-base-content/40 hover:text-base-content"
            >
              {t('onbex.export.step.template')}
            </button>
          ) : (
            <span className={`text-xs ${step === 2 ? 'font-semibold text-base-content' : 'text-base-content/40'}`}>
              {t('onbex.export.step.template')}
            </span>
          )}
          <span className="text-xs text-base-content/40">▸</span>
          <span className={`text-xs ${step === 3 ? 'font-semibold text-base-content' : 'text-base-content/40'}`}>
            {t('onbex.export.step.preview')}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {workspaceFileMsg && <span className="text-2xs text-base-content/50">{workspaceFileMsg}</span>}
          <button type="button" onClick={saveWorkspace} className="btn btn-ghost btn-xs">
            {t('onbex.export.saveWorkspace')}
          </button>
          <label className="btn btn-ghost btn-xs">
            {t('onbex.export.loadWorkspace')}
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void loadWorkspace(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-[880px] flex-col gap-6 px-4 py-5">
          {step === 1 && (
            <div className="flex max-w-[560px] flex-col gap-4">
              <div className="flex flex-col gap-2">
                {periods.map((p) => {
                  const info = periodStatus[p.id] ?? { status: 'empty', label: 'empty', isEmpty: true, days: 0 }
                  const isSelected = p.id === periodId
                  const isDisabled = info.isEmpty

                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => setPeriodId(p.id)}
                      className={`flex items-center justify-between gap-4 rounded border p-3 text-left transition-colors ${
                        isDisabled
                          ? 'cursor-not-allowed border-base-300 opacity-50'
                          : isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-base-300 hover:border-base-content/20'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-base-content">{p.label}</span>
                          <span
                            className={`text-xs ${
                              info.status === 'applied'
                                ? 'text-success'
                                : info.status === 'edits'
                                  ? 'text-warning'
                                  : 'text-base-content/40'
                            }`}
                          >
                            {t(`onbex.export.status.${info.status}`)}
                          </span>
                        </div>
                        <span className="text-xs text-base-content/60">
                          {p.start} → {p.end}
                        </span>
                      </div>
                      <span className="text-xs tabular-nums text-base-content/60">
                        {info.days} {info.days === 1 ? t('onbex.export.day') : t('onbex.export.days')}
                      </span>
                    </button>
                  )
                })}
              </div>

              {allEmpty && (
                <div className="flex flex-col gap-3">
                  <p className="m-0 text-sm text-[color:var(--text-dim)]">
                    {t('onbex.export.empty.msg')}
                  </p>
                  <div>
                    <Link to="/board" className="btn btn-primary btn-sm">
                      {t('onbex.export.empty.btn')}
                    </Link>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={periodStatus[periodId]?.isEmpty ?? true}
                  onClick={() => setStep(2)}
                  className="btn btn-primary btn-sm"
                >
                  {t('onbex.btn.next')}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex max-w-[720px] flex-col gap-6">
              <div className="grid grid-cols-2 gap-3">
                {EXPORT_TEMPLATES.map((tmpl) => {
                  const isSelected = tmpl.id === templateId
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => setTemplateId(tmpl.id)}
                      className={`flex flex-col gap-1 rounded border p-4 text-left transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-base-content/20'
                      }`}
                    >
                      <span className="text-sm font-semibold text-base-content">{t(`onbex.export.template.${tmpl.id}.label`)}</span>
                      <span className="text-xs text-base-content/60">{t(`onbex.export.template.${tmpl.id}.description`)}</span>
                      <TemplateThumb rows={templateMatrices[tmpl.id] ?? []} />
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setStep(1)} className="btn btn-ghost btn-sm">
                  {t('onbex.btn.back')}
                </button>
                <button type="button" onClick={() => setStep(3)} className="btn btn-primary btn-sm">
                  {t('onbex.btn.next')}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-6">
              {/* Format selector */}
              <div className="flex items-center gap-2">
                {EXPORT_FORMATS.map((fmt) => {
                  const isSelected = fmt.id === formatId
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setFormatId(fmt.id)}
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                    >
                      {t(`onbex.export.format.${fmt.id}`)}
                    </button>
                  )
                })}
              </div>

              {/* Format-aware preview — a few records the way the file will actually look */}
              <FormatPreview
                formatId={formatId}
                rows={rows}
                title={`${period.label} — ${t(`onbex.export.template.${templateId}.label`)}`}
              />

              {/* Meta line */}
              <div className="text-2xs tabular-nums text-base-content/40">
                {bodyRowCount} {bodyRowCount === 1 ? t('onbex.export.row') : t('onbex.export.rows')} × {colCount}{' '}
                {colCount === 1 ? t('onbex.export.col') : t('onbex.export.cols')}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setStep(2)} className="btn btn-ghost btn-sm">
                  {t('onbex.btn.back')}
                </button>
                <button
                  type="button"
                  disabled={rows.length === 0}
                  onClick={() => void handleDownload()}
                  className="btn btn-primary btn-sm"
                >
                  {t('onbex.export.download', { format: t(`onbex.export.format.${formatId}`) })}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
