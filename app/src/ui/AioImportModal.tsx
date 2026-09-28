/**
 * The all-in-one batch import dialog (wayfinder ticket 24): download the
 * spreadsheet template, fill it in, read it back, and see — before committing —
 * exactly what the import would create and update.
 *
 * It owns the whole job rather than being handed its words as props: it picks
 * its own catalog keys (app-specific titles, the template download, the
 * `.xlsx`/CSV reader) and shows a live preview rendered from
 * `applyBatchImport`'s counts, so a user can spot a mis-mapped file before
 * touching the roster.
 */
import { useEffect, useRef, useState } from 'react'
import type { Person, ShiftDef, Tag, TagGroup, Team } from '@crewdoku/domain'
import {
  applyBatchImport,
  parseWorkbook,
  type BatchImportParse,
  type BatchImportResult,
} from '../board/roster/batchImport'
import { readWorkbookSheets } from '../board/roster/xlsxImport'
import { buildImportWorkbook, downloadImportTemplate } from '../onboarding/importTemplate'
import { useT } from '../i18n/useT'
import { batchImportErrorText, batchImportWarningText } from '../i18n/batchImportMessages'
import { Download, Upload, X } from './icons'

export type AioImportModalProps = {
  people: Person[]
  teams: Team[]
  shifts: ShiftDef[]
  tagGroups: TagGroup[]
  tags: Tag[]
  onApply: (
    result: { people: Person[]; teams: Team[]; tagGroups: TagGroup[]; tags: Tag[] },
    meta: {
      source: 'xlsx' | 'csv'
      teamsCreated: number
      teamsUpdated: number
      teamsAutoCreated: number
      peopleAdded: number
      warnings: number
    },
  ) => void
  onCancel: () => void
}

type ImportSource = 'xlsx' | 'csv'

/** A file the user picked, already parsed and already applied to a copy of the roster — everything the preview and the Apply button need. */
type ParsedWorkbook = { source: ImportSource; parse: BatchImportParse; result: BatchImportResult }

/** What the template download is called on disk. */
const TEMPLATE_FILE_NAME = 'crewdoku-import-template.xlsx'

/** One CSV cell: trimmed, with a pair of surrounding quotes stripped. */
function csvCell(raw: string): string {
  const trimmed = raw.trim()
  return /^".*"$/s.test(trimmed) ? trimmed.slice(1, -1) : trimmed
}

/**
 * A plain CSV of people, in the shape a workbook has: one `People` sheet. Cells
 * are split on commas without quote awareness beyond the surrounding pair —
 * the format the hint describes, and the one `parseWorkbook` already reads.
 */
function csvSheets(text: string): Record<string, string[][]> {
  return { People: text.split(/\r\n|\r|\n/).map((line) => line.split(',').map(csvCell)) }
}

export function AioImportModal(props: AioImportModalProps) {
  const { people, teams, shifts, tagGroups, tags, onApply, onCancel } = props
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  async function downloadTemplate() {
    try {
      await downloadImportTemplate(
        TEMPLATE_FILE_NAME,
        buildImportWorkbook({ shifts, teams, people, tagGroups, tags }),
      )
    } catch (error) {
      // A blocked download must not interrupt the import the user came here for;
      // the button is right there to press again.
      console.error('Failed to download the import template', error)
    }
  }

  async function pickFile(file: File) {
    setReadFailed(false)
    setBusy(true)
    const source: ImportSource = file.name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv'
    try {
      const sheets = source === 'xlsx' ? await readWorkbookSheets(file) : csvSheets(await file.text())
      const parse = parseWorkbook(sheets)
      setParsed({
        source,
        parse,
        result: applyBatchImport(people, teams, shifts, parse, { tagGroups, tags }),
      })
    } catch (error) {
      // Either the reader rejected the bytes or `file.text()` failed — both mean
      // the file is not something we can import, which is all the user needs.
      console.error('Failed to read the import file', error)
      setParsed(null)
      setReadFailed(true)
    } finally {
      setBusy(false)
    }
  }

  /** What the import would change, in one line: people, new teams, updated teams, new tag groups/tags, tag rule lines and warnings, each pluralised per its own count. */
  function summaryLine(result: BatchImportResult): string {
    const {
      teamsCreated,
      teamsUpdated,
      teamsAutoCreated,
      peopleAdded,
      tagGroupsCreated,
      tagsCreated,
      tagRulesImported,
    } = result.counts
    const newTeams = teamsCreated + teamsAutoCreated
    const warnings = result.warnings.length
    const parts = [
      t(peopleAdded === 1 ? 'rtc.roster.count.person' : 'rtc.roster.count.people', { count: peopleAdded }),
      t(newTeams === 1 ? 'rtc.batch.summary.newTeam' : 'rtc.batch.summary.newTeams', { count: newTeams }),
    ]
    if (teamsUpdated > 0) {
      parts.push(
        t(teamsUpdated === 1 ? 'rtc.batch.summary.updatedTeam' : 'rtc.batch.summary.updatedTeams', {
          count: teamsUpdated,
        }),
      )
    }
    if (tagGroupsCreated > 0) {
      parts.push(
        t(tagGroupsCreated === 1 ? 'rtc.batch.summary.newTagGroup' : 'rtc.batch.summary.newTagGroups', {
          count: tagGroupsCreated,
        }),
      )
    }
    if (tagsCreated > 0) {
      parts.push(
        t(tagsCreated === 1 ? 'rtc.batch.summary.newTag' : 'rtc.batch.summary.newTags', { count: tagsCreated }),
      )
    }
    if (tagRulesImported > 0) {
      parts.push(
        t(tagRulesImported === 1 ? 'rtc.batch.summary.tagRule' : 'rtc.batch.summary.tagRules', {
          count: tagRulesImported,
        }),
      )
    }
    if (warnings > 0) {
      parts.push(
        t(warnings === 1 ? 'rtc.batch.summary.warning' : 'rtc.batch.summary.warnings', { count: warnings }),
      )
    }
    return parts.join(' · ')
  }

  const errors = parsed?.parse.errors ?? []
  const counts = parsed?.result.counts
  const changes = counts
    ? counts.peopleAdded +
      counts.teamsCreated +
      counts.teamsUpdated +
      counts.teamsAutoCreated +
      counts.tagGroupsCreated +
      counts.tagsCreated +
      counts.tagRulesImported
    : 0
  const canApply = parsed !== null && errors.length === 0 && changes > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[1px] md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aio-import-title"
      onMouseDown={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          onCancel()
        }
      }}
    >
      <div
        ref={modalRef}
        className="flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-2xl border border-x-0 border-b-0 border-base-300 bg-base-100 px-4 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] shadow-lg md:max-h-none md:max-w-[540px] md:overflow-visible md:rounded-lg md:border-x md:border-b md:p-5"
      >
        <div className="flex items-start justify-between gap-3 border-b border-base-300/80 pb-3">
          <div>
            <h2 id="aio-import-title" className="m-0 text-base font-semibold tracking-tight text-base-content">
              {t('rtc.batch.title')}
            </h2>
            <p className="m-0 mt-0.5 text-xs text-base-content/60">{t('rtc.batch.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('rtc.common.cancel')}
            className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void downloadTemplate()} className="btn btn-outline btn-sm gap-2">
            <Download className="h-4 w-4" />
            {t('rtc.batch.downloadTemplate')}
          </button>
          <label className="btn btn-ghost btn-sm gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            {t('rtc.batch.chooseFile')}
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const picked = e.target.files?.[0]
                if (picked) void pickFile(picked)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        <p className="m-0 text-xs text-base-content/60">{t('rtc.batch.hint')}</p>

        <div className="flex flex-col gap-2 text-sm text-base-content/70">
          {readFailed && <p className="m-0 font-medium text-error">{t('rtc.batch.err.unreadable')}</p>}

          {!parsed && !readFailed && <p className="m-0">{t('rtc.batch.empty')}</p>}

          {parsed && errors.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs font-medium text-error">
              {errors.map((error, i) => (
                <li key={i}>{batchImportErrorText(t, error)}</li>
              ))}
            </ul>
          )}

          {parsed && errors.length === 0 && (
            <>
              <p className="m-0">{summaryLine(parsed.result)}</p>
              {parsed.result.warnings.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-base-300/80 pt-2">
                  <p className="m-0 text-xs font-medium text-warning/90">{t('rtc.batch.warningsTitle')}</p>
                  <ul className="m-0 flex max-h-32 list-none flex-col gap-1 overflow-y-auto p-0 text-xs text-base-content/60">
                    {parsed.result.warnings.map((warning, i) => (
                      <li key={i}>{batchImportWarningText(t, warning)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-base-300/80 pt-3">
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
            {t('rtc.common.cancel')}
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={() => {
              if (!parsed) return
              const result = parsed.result
              onApply(
                {
                  people: result.people,
                  teams: result.teams,
                  tagGroups: result.tagGroups,
                  tags: result.tags,
                },
                {
                  source: parsed.source,
                  teamsCreated: result.counts.teamsCreated,
                  teamsUpdated: result.counts.teamsUpdated,
                  teamsAutoCreated: result.counts.teamsAutoCreated,
                  peopleAdded: result.counts.peopleAdded,
                  warnings: result.warnings.length,
                },
              )
              onCancel()
            }}
            className="btn btn-primary btn-sm"
          >
            {t('rtc.import.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
