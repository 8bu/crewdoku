import { useState } from 'react'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import { I18nProvider, useI18n } from './i18n/I18nProvider'
import { LocaleSwitcher } from './i18n/LocaleSwitcher'
import { Board } from './features/board/Board'
import { SolvePanel } from './features/solve/SolvePanel'
import { Config } from './features/config/Config'
import { Onboarding } from './features/onboarding/Onboarding'
import { ExportModal } from './features/export/ExportModal'
import { VersionBadge } from './ui/VersionBadge'
import { Btn, cx, StatusBar } from './ui'
import type { AppStore, ViewMode } from './store/store'

interface NavItem {
  view: ViewMode
  /** Chrome label key (translated via i18n). */
  key: string
}

const NAV: NavItem[] = [
  { view: 'board', key: 'Board' },
  { view: 'config', key: 'Configuration' },
  { view: 'onboarding', key: 'Onboarding' },
]

function Sidebar({
  store,
  onExport,
}: {
  store: StoreApi<AppStore>
  onExport: () => void
}) {
  const { t } = useI18n()
  const view = useStore(store, (s) => s.view)
  const setView = useStore(store, (s) => s.setView)
  const loadDemo = useStore(store, (s) => s.loadDemo)

  return (
    <nav
      aria-label={t('Board')}
      className="w-48 shrink-0 flex flex-col border-r border-bd bg-raised"
      style={{ width: 192 }}
    >
      <div className="flex items-center gap-2 px-2 h-9 border-b border-bd">
        <span className="font-semibold text-sm">Crewdoku</span>
        <span className="ml-auto">
          <VersionBadge />
        </span>
      </div>

      <div className="flex-1 overflow-auto p-1.5 flex flex-col gap-0.5">
        {NAV.map((item) => (
          <button
            key={item.view}
            type="button"
            aria-current={view === item.view ? 'page' : undefined}
            onClick={() => setView(item.view)}
            className={cx(
              'text-left px-2 h-7 text-xs rounded-[2px] flex items-center',
              view === item.view
                ? 'bg-[var(--sel-bg)] text-[var(--sel)] font-semibold'
                : 'text-dim hover:bg-surface-2 hover:text-ink',
            )}
          >
            {t(item.key)}
          </button>
        ))}
      </div>

      <div className="p-1.5 border-t border-bd flex flex-col gap-1.5">
        <Btn variant="default" onClick={onExport}>
          {t('Export')}
        </Btn>
        <Btn variant="default" onClick={() => loadDemo()}>
          {t('Load demo')}
        </Btn>
        <LocaleSwitcher />
      </div>
    </nav>
  )
}

/**
 * Board surface — the board plus a collapsible 300px SolvePanel on the right
 * (the combined view from CLAUDE.md). A toolbar toggle opens/closes the panel.
 */
function BoardSurface({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const proposal = useStore(store, (s) => s.proposal)
  const phase = useStore(store, (s) => s.solverPhase)
  const [open, setOpen] = useState(true)

  const label =
    phase === 'solving'
      ? t('Solving…')
      : proposal
        ? `◆ ${proposal.changes.length} ${t('proposed')}`
        : `▸ ${t('Generate')}`

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-9 shrink-0 border-b border-bd bg-raised flex items-center gap-2 px-2">
        <span className="text-2xs uppercase tracking-wider text-dim font-semibold">
          {t('Board')}
        </span>
        <span className="ml-auto">
          <Btn pressed={open} onClick={() => setOpen((v) => !v)}>
            {label}
          </Btn>
        </span>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <Board store={store} />
        </div>
        {open && <SolvePanel store={store} />}
      </div>
    </div>
  )
}

function Content({ store }: { store: StoreApi<AppStore> }) {
  const view = useStore(store, (s) => s.view)
  const setView = useStore(store, (s) => s.setView)
  return (
    <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* `solve` and `export` are not standalone views: solving is a panel on the
          board and exporting is a modal. Both fold into the board surface. */}
      {(view === 'board' || view === 'solve' || view === 'export') && (
        <BoardSurface store={store} />
      )}
      {view === 'config' && <Config store={store} />}
      {view === 'onboarding' && <Onboarding store={store} onDone={() => setView('board')} />}
    </main>
  )
}

function Status({ store }: { store: StoreApi<AppStore> }) {
  const { t } = useI18n()
  const solverPhase = useStore(store, (s) => s.solverPhase)
  const employees = useStore(store, (s) => s.employees)
  return (
    <StatusBar
      left={
        <>
          <span>
            {employees.length} {employees.length === 1 ? 'employee' : 'employees'}
          </span>
          {/* aria-live region: solver status announced to assistive tech */}
          <span aria-live="polite" aria-atomic="true">
            {solverPhase === 'idle' ? t('Solver idle') : solverPhase}
          </span>
        </>
      }
      right={<span>{t('Ready')}</span>}
    />
  )
}

/**
 * App shell — single-user, view modes (NOT roles). Layout:
 *   [ Sidebar 192px | Content (main) ] over a StatusBar (24px).
 * Landmarks (nav/main/status), an aria-live solver region, and a chrome-only
 * locale switcher form the a11y/i18n baseline. The store is injected so tests
 * can drive it; main.tsx provides the singleton + real adapters.
 */
export function App({ store }: { store: StoreApi<AppStore> }) {
  const [exportOpen, setExportOpen] = useState(false)
  return (
    <I18nProvider>
      <div className="h-screen flex flex-col bg-bg text-ink font-ui">
        <div className="flex-1 min-h-0 flex">
          <Sidebar store={store} onExport={() => setExportOpen(true)} />
          <Content store={store} />
        </div>
        <Status store={store} />
        {exportOpen && <ExportModal store={store} onClose={() => setExportOpen(false)} />}
      </div>
    </I18nProvider>
  )
}
