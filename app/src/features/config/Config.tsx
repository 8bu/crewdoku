import { useState } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import type { AppStore } from '../../store/store'
import { useI18n } from '../../i18n/I18nProvider'
import { cx } from '../../ui'
import { ShiftsConfig } from './ShiftsConfig'
import { RulesConfig } from './RulesConfig'
import { TeamsConfig } from './TeamsConfig'
import { CoverageConfig } from './CoverageConfig'
import { EmployeesConfig } from './EmployeesConfig'

type Section = 'shifts' | 'coverage' | 'rules' | 'teams' | 'employees'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'shifts', label: 'Shift definitions' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'rules', label: 'Scheduling rules' },
  { id: 'teams', label: 'Teams & structure' },
  { id: 'employees', label: 'Employees' },
]

/**
 * Configuration surface — a left section rail switching between the five config
 * editors. Replaces the P6a Placeholder for the `config` view.
 */
export function Config({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const [section, setSection] = useState<Section>('shifts')

  return (
    <div className="flex-1 min-h-0 flex">
      <nav
        aria-label={t('Configuration')}
        className="w-44 shrink-0 border-r border-bd bg-raised p-1.5 flex flex-col gap-0.5"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={section === s.id ? 'page' : undefined}
            onClick={() => setSection(s.id)}
            className={cx(
              'text-left px-2 h-7 text-xs rounded-[2px] flex items-center',
              section === s.id
                ? 'bg-[var(--sel-bg)] text-[var(--sel)] font-semibold'
                : 'text-dim hover:bg-surface-2 hover:text-ink',
            )}
          >
            {t(s.label)}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-w-0 overflow-auto p-3">
        {section === 'shifts' && <ShiftsConfig store={store} />}
        {section === 'coverage' && <CoverageConfig store={store} />}
        {section === 'rules' && <RulesConfig store={store} />}
        {section === 'teams' && <TeamsConfig store={store} />}
        {section === 'employees' && <EmployeesConfig store={store} />}
      </div>
    </div>
  )
}
