import { useState } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import type { AppStore } from '../../store/store'
import { useI18n } from '../../i18n/I18nProvider'
import { Btn, Modal, Seg } from '../../ui'
import { buildMemberCsvForDownload, buildTeamCsvForDownload } from './exportActions'

/** Trigger a browser download of a text file. App-layer DOM is allowed here. */
function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * CSV export modal — choose a team grid export or a single member's list, then
 * download. Calls the pure domain exporters via exportActions; the Blob+anchor
 * download trigger lives here in the app layer (allowed). Chrome strings are
 * i18n'd; employee/org names are NOT.
 */
export function ExportModal({
  store,
  onClose,
}: {
  store: StoreApi<AppStore>
  onClose: () => void
}) {
  const { t } = useI18n()
  const employees = useStore(store, (s) => s.employees)
  const [mode, setMode] = useState<'team' | 'member'>('team')
  const [memberId, setMemberId] = useState<string>(employees[0]?.id ?? '')

  const doExport = (): void => {
    const st = store.getState()
    if (mode === 'team') {
      downloadCsv('crewdoku-team.csv', buildTeamCsvForDownload(st))
    } else if (memberId) {
      const emp = employees.find((e) => e.id === memberId)
      const safe = (emp?.name ?? memberId).replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      downloadCsv(`crewdoku-${safe}.csv`, buildMemberCsvForDownload(st, memberId))
    }
    onClose()
  }

  return (
    <Modal
      title={t('Export')}
      onClose={onClose}
      closeLabel={t('Close')}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Btn>
          <Btn variant="primary" onClick={doExport} disabled={mode === 'member' && !memberId}>
            {t('Download CSV')}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-dim">{t('Export')}</span>
          <Seg
            ariaLabel={t('Export')}
            value={mode}
            onChange={(v) => setMode(v as 'team' | 'member')}
            options={[
              { v: 'team', label: t('Team grid') },
              { v: 'member', label: t('Single member') },
            ]}
          />
        </div>

        {mode === 'member' && (
          <label className="flex flex-col gap-1">
            <span className="text-dim">{t('Member')}</span>
            <select
              className="h-7 border border-bds rounded-[2px] bg-surface px-2 text-xs"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              aria-label={t('Member')}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="text-faint leading-relaxed">
          {mode === 'team'
            ? t('Exports every employee as a row with one column per date.')
            : t('Exports one row per scheduled shift for the chosen member.')}
        </p>
      </div>
    </Modal>
  )
}
