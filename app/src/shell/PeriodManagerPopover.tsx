import { X, Check, Plus } from '../ui/icons'
import { useT } from '../i18n/useT'
import { useEffect, useState, type ReactNode } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  PERIOD_DURATIONS,
  addDaysISO,
  addPeriodAtom,
  createPeriod,
  periodsAtom,
  selectedPeriodIdAtom,
  type Period,
  type PeriodDuration,
  type PeriodSetup,
} from '../state/shell'
import { deletePeriodAtom, updatePeriodAtom } from '../state/periodOps'
import { track } from '../analytics'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'

const POPOVER_WIDTH = 340

type StartMode = PeriodSetup

/**
 * The period manager (ticket 17's `<Select>` + '+ New period' grown up):
 * switch/rename/delete/create stopped being separable concerns once a
 * manager could import a finished schedule instead of starting from an
 * empty roster — no single verb owns this popover, so list and create form
 * share one floating surface anchored to the header trigger, same
 * convention as `routes/teams/DeleteTeamPopover.tsx`.
 */
export function PeriodManagerPopover({
  rect,
  onClose,
}: {
  rect: { left: number; bottom: number }
  onClose: () => void
}) {
  const t = useT()
  const periods = useAtomValue(periodsAtom)
  const selectedId = useAtomValue(selectedPeriodIdAtom)
  const setSelectedId = useSetAtom(selectedPeriodIdAtom)
  const addPeriod = useSetAtom(addPeriodAtom)
  const updatePeriod = useSetAtom(updatePeriodAtom)
  const deletePeriod = useSetAtom(deletePeriodAtom)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    function closeIfOutside(e: MouseEvent) {
      if ((e.target as HTMLElement | null)?.closest('.cd-period-manager-popover')) return
      onClose()
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', closeIfOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeIfOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const sortedPeriods = [...periods].sort((a, b) => a.start.localeCompare(b.start))
  const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)


  function handleCreate(label: string, start: string, duration: PeriodDuration, setup: PeriodSetup) {
    const period = createPeriod(label, start, duration, setup)
    addPeriod(period)
    // The duration is the planner's own choice, made here; the periods a
    // workspace is seeded with at boot never reach this handler.
    track('period_created', { duration })
    onClose()
  }

  return (
    <div
      className="cd-period-manager-popover fixed z-20 flex w-[340px] flex-col gap-3 rounded-lg border border-base-300 bg-base-100 p-4 shadow-lg"
      style={{ left, top: rect.bottom + 6 }}
    >
      <ul className="m-0 flex max-h-64 list-none flex-col gap-0.5 overflow-y-auto p-0">
        {sortedPeriods.map((period) =>
          editingId === period.id ? (
            <EditPeriodForm
              key={period.id}
              period={period}
              onSave={(label, start, end) => {
                updatePeriod({ id: period.id, label, start, end })
                setEditingId(null)
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <PeriodRow
              key={period.id}
              period={period}
              isSelected={period.id === selectedId}
              isOnly={periods.length === 1}
              isConfirmingDelete={confirmDeleteId === period.id}
              onSwitch={() => {
                setSelectedId(period.id)
                onClose()
              }}
              onStartEdit={() => {
                setConfirmDeleteId(null)
                setEditingId(period.id)
              }}
              onStartDelete={() => {
                setEditingId(null)
                setConfirmDeleteId(period.id)
              }}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onConfirmDelete={() => {
                deletePeriod(period.id)
                setConfirmDeleteId(null)
              }}
            />
          ),
        )}
      </ul>

      <div className="border-t border-base-300 pt-3">
        {creating ? (
          <CreatePeriodForm periods={sortedPeriods} onCreate={handleCreate} onCancel={() => setCreating(false)} />
        ) : (
          <button type="button" className="btn btn-ghost btn-xs gap-1 rounded-md" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('chrome.periodManager.newPeriod')}
          </button>
        )}
      </div>
    </div>
  )
}

function PeriodRow({
  period,
  isSelected,
  isOnly,
  isConfirmingDelete,
  onSwitch,
  onStartEdit,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  period: Period
  isSelected: boolean
  isOnly: boolean
  isConfirmingDelete: boolean
  onSwitch: () => void
  onStartEdit: () => void
  onStartDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const t = useT()
  if (isConfirmingDelete) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5">
        <span className="truncate text-sm text-base-content/60">{t('chrome.periodManager.deleteConfirm', { label: period.label })}</span>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onCancelDelete}
            className="cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors duration-150 hover:text-base-content"
          >
            {t('chrome.periodManager.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            className="cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-error transition-colors duration-150 hover:bg-error/10"
          >
            {t('chrome.periodManager.delete')}
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="group relative flex items-center gap-0.5 rounded-md transition-colors duration-150 hover:bg-base-200">
      <button
        type="button"
        onClick={onSwitch}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-2.5 py-1.5 text-left"
      >
        <span className="w-3 shrink-0 text-primary">{isSelected && <Check className="h-3.5 w-3.5" />}</span>
        <span className="truncate text-sm font-semibold text-base-content">{period.label}</span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-base-content/60 transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0">
          {period.start} → {period.end}
        </span>
      </button>
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={onStartEdit}
            title={t('chrome.periodManager.editPeriod')}
            className="cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors duration-150 hover:text-base-content"
          >
            {t('chrome.periodManager.edit')}
          </button>
          <button
            type="button"
            onClick={onStartDelete}
            disabled={isOnly}
            title={isOnly ? t('chrome.periodManager.cannotDeleteOnly') : t('chrome.periodManager.deletePeriod')}
            className="cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 text-xs text-base-content/40 transition-colors duration-150 hover:text-error disabled:cursor-not-allowed disabled:opacity-30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
    </li>
  )
}

/**
 * The row's Edit affordance grown out of inline rename: label, start, and
 * end are all editable after creation (dates used to be create-time only).
 * Escape cancels the edit without closing the whole popover — the form
 * swallows the keydown before the popover's window-level listener sees it.
 */
function EditPeriodForm({
  period,
  onSave,
  onCancel,
}: {
  period: Period
  onSave: (label: string, start: string, end: string) => void
  onCancel: () => void
}) {
  const t = useT()
  const [label, setLabel] = useState(period.label)
  const [start, setStart] = useState(period.start)
  const [end, setEnd] = useState(period.end)

  const trimmedLabel = label.trim()
  const valid = trimmedLabel.length > 0 && start.length > 0 && end.length > 0 && start <= end

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-base-300 px-2.5 py-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
        if (e.key === 'Enter' && valid) onSave(trimmedLabel, start, end)
      }}
    >
      <Input
        type="text"
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="min-w-0"
      />
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="min-w-0 flex-1 tabular-nums"
        />
        <span className="shrink-0 text-xs text-base-content/40">→</span>
        <Input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="min-w-0 flex-1 tabular-nums"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors duration-150 hover:text-base-content"
        >
          {t('chrome.periodManager.cancel')}
        </button>
        <button type="button" disabled={!valid} onClick={() => onSave(trimmedLabel, start, end)} className="btn btn-primary btn-xs">
          {t('chrome.periodManager.save')}
        </button>
      </div>
    </li>
  )
}

function StartModeOption({
  name,
  label,
  description,
  checked,
  onSelect,
  children,
}: {
  name: string
  label: string
  description: string
  checked: boolean
  onSelect: () => void
  children?: ReactNode
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-1 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-base-200">
      <span className="flex items-center gap-2">
        <input type="radio" name={name} checked={checked} onChange={onSelect} className="radio radio-xs" />
        <span className="text-sm text-base-content">{label}</span>
      </span>
      <span className="pl-[22px] text-2xs text-base-content/60">{description}</span>
      {checked && children && <div className="pl-[22px]">{children}</div>}
    </label>
  )
}

/**
 * The create form's second question — a new period is not always a blank
 * roster waiting on the onboarding wizard: 'Import an old schedule' skips
 * setup entirely and lands on a CSV-driven schedule import instead of the
 * empty board + wizard. People, teams, the shift catalog and coverage
 * rules are workspace-global now, so there's nothing left to carry over
 * between periods — a new period only ever needs its own schedule.
 */
function CreatePeriodForm({
  periods,
  onCreate,
  onCancel,
}: {
  periods: Period[]
  onCreate: (label: string, start: string, duration: PeriodDuration, setup: PeriodSetup) => void
  onCancel: () => void
}) {
  const t = useT()
  const durationLabels: Record<PeriodDuration, string> = {
    week: t('chrome.period.duration.week'),
    biweek: t('chrome.period.duration.biweek'),
    month: t('chrome.period.duration.month'),
  }
  const latestEnd = periods.reduce((max, p) => (p.end > max ? p.end : max), periods[0]?.end ?? '')
  const defaultStart = latestEnd ? addDaysISO(latestEnd, 1) : new Date().toISOString().slice(0, 10)

  const [label, setLabel] = useState('')
  const [start, setStart] = useState(defaultStart)
  const [duration, setDuration] = useState<PeriodDuration>('biweek')
  const [mode, setMode] = useState<StartMode>('ready')

  const trimmedLabel = label.trim()

  function handleCreate() {
    if (!trimmedLabel) return
    onCreate(trimmedLabel, start, duration, mode)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-base-content">{t('chrome.periodManager.createTitle')}</p>

      <div className="flex flex-col gap-1">
        <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('chrome.periodManager.labelField')}</label>
        <Input
          type="text"
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('chrome.periodManager.labelPlaceholder')}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('chrome.periodManager.startsField')}</label>
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('chrome.periodManager.lengthField')}</label>
        <Select
          className="w-full"
          value={duration}
          onChange={(v) => setDuration(v as PeriodDuration)}
          options={PERIOD_DURATIONS.map((d) => ({ value: d.value, label: durationLabels[d.value] ?? d.label }))}
        />
      </div>

      <div className="flex flex-col gap-0.5">
        <label className="text-2xs font-semibold uppercase tracking-wide text-base-content/40">{t('chrome.periodManager.startWithField')}</label>
        <StartModeOption
          name="period-start-mode"
          label={t('chrome.periodManager.modeReadyLabel')}
          description={t('chrome.periodManager.modeReadyDesc')}
          checked={mode === 'ready'}
          onSelect={() => setMode('ready')}
        />
        <StartModeOption
          name="period-start-mode"
          label={t('chrome.periodManager.modeImportLabel')}
          description={t('chrome.periodManager.modeImportDesc')}
          checked={mode === 'import'}
          onSelect={() => setMode('import')}
        />
      </div>

      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-md border-none bg-transparent px-1.5 py-1 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors duration-150 hover:text-base-content"
        >
          {t('chrome.periodManager.cancel')}
        </button>
        <button type="button" disabled={!trimmedLabel} onClick={handleCreate} className="btn btn-primary btn-xs">
          {t('chrome.periodManager.create')}
        </button>
      </div>
    </div>
  )
}
