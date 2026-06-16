import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { makeShift, type Shift } from '@crewdoku/domain'
import type { AppStore } from '../../store/store'
import { useI18n } from '../../i18n/I18nProvider'
import { Btn, Panel } from '../../ui'

/**
 * Shift definitions editor — code, name, start/end hour and the `isNight` flag
 * per shift (AC-12). Edits dispatch upsertShift; Add creates a blank shift.
 * Shift names/codes are USER DATA and never routed through i18n.
 */
export function ShiftsConfig({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const shifts = useStore(store, (s) => s.shifts)
  const upsertShift = useStore(store, (s) => s.upsertShift)
  const removeShift = useStore(store, (s) => s.removeShift)

  const patch = (sh: Shift, p: Partial<Shift>): void => upsertShift({ ...sh, ...p })

  return (
    <Panel
      title={t('Shift definitions')}
      actions={
        <Btn
          onClick={() =>
            upsertShift(makeShift({ code: 'X', name: 'New shift', startHour: 9, endHour: 17, isNight: false }))
          }
        >
          {t('Add shift')}
        </Btn>
      }
    >
      <div className="flex flex-col gap-2 max-w-3xl">
        <div className="grid grid-cols-[3rem_1fr_4rem_4rem_5rem_2rem] gap-2 text-2xs uppercase tracking-wider text-faint px-1">
          <span>{t('Code')}</span>
          <span>{t('Name')}</span>
          <span>{t('Start')}</span>
          <span>{t('End')}</span>
          <span>{t('Night')}</span>
          <span />
        </div>
        {shifts.map((sh) => (
          <div
            key={sh.id}
            className="grid grid-cols-[3rem_1fr_4rem_4rem_5rem_2rem] gap-2 items-center"
          >
            <input
              aria-label={`code ${sh.code}`}
              value={sh.code}
              onChange={(e) => patch(sh, { code: e.target.value })}
              className="h-7 border border-bds rounded-[2px] bg-surface px-1 font-mono text-xs"
            />
            <input
              aria-label={`name ${sh.code}`}
              value={sh.name}
              onChange={(e) => patch(sh, { name: e.target.value })}
              className="h-7 border border-bds rounded-[2px] bg-surface px-2 text-xs"
            />
            <input
              type="number"
              aria-label={`start ${sh.code}`}
              value={sh.startHour}
              onChange={(e) => patch(sh, { startHour: Number(e.target.value) })}
              className="h-7 border border-bds rounded-[2px] bg-surface px-1 font-mono text-xs"
            />
            <input
              type="number"
              aria-label={`end ${sh.code}`}
              value={sh.endHour}
              onChange={(e) => patch(sh, { endHour: Number(e.target.value) })}
              className="h-7 border border-bds rounded-[2px] bg-surface px-1 font-mono text-xs"
            />
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                aria-label={`night ${sh.code}`}
                checked={sh.isNight}
                onChange={(e) => patch(sh, { isNight: e.target.checked })}
              />
              <span className="text-dim">{t('Night')}</span>
            </label>
            <Btn variant="danger" ariaLabel={`remove ${sh.code}`} onClick={() => removeShift(sh.id)}>
              <span aria-hidden="true">✕</span>
            </Btn>
          </div>
        ))}
        {shifts.length === 0 && <p className="text-xs text-faint">{t('No shifts defined.')}</p>}
      </div>
    </Panel>
  )
}
