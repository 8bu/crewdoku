import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { makeTeam, type Team } from '@crewdoku/domain'
import type { AppStore } from '../../store/store'
import { useI18n } from '../../i18n/I18nProvider'
import { Btn, Panel } from '../../ui'

/**
 * Teams & structure — team name plus the set of shift IDs the team operates.
 * Team/shift names are user data (not i18n'd).
 */
export function TeamsConfig({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const teams = useStore(store, (s) => s.teams)
  const shifts = useStore(store, (s) => s.shifts)
  const upsertTeam = useStore(store, (s) => s.upsertTeam)

  const toggleShift = (team: Team, shiftId: string): void => {
    const has = team.shiftIds.includes(shiftId)
    upsertTeam({
      ...team,
      shiftIds: has ? team.shiftIds.filter((id) => id !== shiftId) : [...team.shiftIds, shiftId],
    })
  }

  return (
    <Panel
      title={t('Teams & structure')}
      actions={<Btn onClick={() => upsertTeam(makeTeam({ name: 'New team', shiftIds: [] }))}>{t('Add team')}</Btn>}
    >
      <div className="flex flex-col gap-3 max-w-2xl">
        {teams.map((team) => (
          <div key={team.id} className="border border-bd rounded-[2px] p-2 flex flex-col gap-2">
            <input
              aria-label={`team name ${team.name}`}
              value={team.name}
              onChange={(e) => upsertTeam({ ...team, name: e.target.value })}
              className="h-7 border border-bds rounded-[2px] bg-surface px-2 text-xs font-medium"
            />
            <div className="flex flex-wrap gap-2">
              {shifts.map((sh) => (
                <label key={sh.id} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    aria-label={`${team.name} operates ${sh.code}`}
                    checked={team.shiftIds.includes(sh.id)}
                    onChange={() => toggleShift(team, sh.id)}
                  />
                  <span className="font-mono">{sh.code}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {teams.length === 0 && <p className="text-xs text-faint">{t('No teams yet.')}</p>}
      </div>
    </Panel>
  )
}
