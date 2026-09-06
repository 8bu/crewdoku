import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from './store/store'
import DB from './data/db'
import Sidebar from './components/Sidebar'
import ExportModal from './components/ExportModal'
import { StatusBar, Modal, KeyHint, Dot } from './components/ui'
import LeaderSurface  from './features/leader/LeaderSurface'
import MemberSurface  from './features/member/MemberSurface'

export default function App() {
  const app      = useAppStore(s => s.app)
  const dispatch = useAppStore(s => s.dispatch)

  const [shortcuts,   setShortcuts]   = useState(false)
  const [exportModal, setExportModal] = useState(false)
  const saveTimer = useRef(null)

  /* IndexedDB — load on mount */
  useEffect(() => {
    DB.get('sf_state_v3')
      .then(data => dispatch({ type: 'DB_LOAD', data: data || {} }))
      .catch(()  => dispatch({ type: 'DB_LOAD', data: {} }))
  }, [])

  /* IndexedDB — save on change (debounced 800ms) */
  useEffect(() => {
    if (!app.dbLoaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      DB.set('sf_state_v3', {
        overrides: DB.mapToObj(app.overrides),
        swaps:     app.swaps,
        prefs:     app.prefs,
      })
    }, 800)
    return () => clearTimeout(saveTimer.current)
  }, [app.overrides, app.swaps, app.prefs, app.dbLoaded])

  /* Keyboard shortcuts */
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey) return
      if (e.key === '?') { setShortcuts(v => !v); return }
      if (e.key === 'Escape') { dispatch({ type: 'SEED_OFF' }); return }
      if (app.role !== 'admin') return
      const k = e.key.toLowerCase()
      if      (k === 's')             dispatch({ type: 'SEED_TOGGLE' })
      else if (k === 'g')             dispatch({ type: 'ADMIN_VIEW', view: 'generate' })
      else if (k === 't')             dispatch({ type: 'WEEK', set: 0 })
      else if (e.key === 'ArrowLeft') dispatch({ type: 'WEEK', delta: -1 })
      else if (e.key === 'ArrowRight')dispatch({ type: 'WEEK', delta:  1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app.role])

  const violations = useMemo(() => {
    let n = 0
    app.overrides.forEach(o => { if (o.viol && o.viol.length) n++ })
    return n
  }, [app.overrides])

  const edits   = app.overrides.size
  const inSwaps = (app.swaps || []).filter(s => s.toEmp === app.empIdx && s.status === 'pending').length

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar app={app} dispatch={dispatch} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {app.role === 'admin'  && <LeaderSurface app={app} dispatch={dispatch} onExport={() => setExportModal(true)} />}
          {app.role === 'member' && <MemberSurface app={app} dispatch={dispatch} />}
        </div>
      </div>

      <StatusBar
        left={
          <>
            <span className="flex items-center gap-1.5"><Dot tone="ok" />{app.dbLoaded ? 'saved' : 'loading'}</span>
            {violations > 0 && <span className="flex items-center gap-1 font-semibold" style={{ color: 'var(--st-crit)' }}>⚠ {violations} violation{violations > 1 ? 's' : ''}</span>}
            {edits > 0      && <span>{edits} override{edits > 1 ? 's' : ''}</span>}
            {app.pins.size > 0 && <span>◢ {app.pins.size} pinned</span>}
            {inSwaps > 0    && <span style={{ color: 'var(--st-warn)' }}>⇄ {inSwaps} swap{inSwaps > 1 ? 's' : ''} awaiting you</span>}
          </>
        }
        right={
          <>
            <span>100 staff · 5 shifts · offline</span>
            <button type="button" className="hover:text-ink" onClick={() => setShortcuts(true)}>? shortcuts</button>
          </>
        }
      />

      {shortcuts && (
        <Modal title="Keyboard shortcuts" onClose={() => setShortcuts(false)} width={340}>
          <table className="w-full text-xs">
            <tbody>
              {[['← →','Previous / next week'],['T','Go to current week'],['S','Toggle seed mode'],['G','Open generator'],['Esc','Exit seed mode'],['?','This panel']].map(([k,d]) => (
                <tr key={k} className="border-b border-[var(--grid-line)] last:border-b-0">
                  <td className="py-1.5 w-24"><KeyHint>{k}</KeyHint></td>
                  <td className="py-1.5 text-dim">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {exportModal && <ExportModal app={app} onClose={() => setExportModal(false)} />}
    </div>
  )
}
