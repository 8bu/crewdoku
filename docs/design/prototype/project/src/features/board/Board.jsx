/* ScheduleBoard — main schedule grid with scan overlay and diff support. */
import { useState, useRef, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import SF from '../../data/sf'
import { cx, Btn, Badge, Seg, SelectBox, Popover } from '../../components/ui'
import { ContextMenu, EmpActionPopover, DiffPopover } from './Popovers'
import CoverageView from './CoverageView'

const WEEKEND_BG = 'repeating-linear-gradient(45deg, var(--weekend-hatch) 0, var(--weekend-hatch) 1px, transparent 1px, transparent 6px)'
const EMPTY_MAP  = new Map()

/* ---- tooltip layer ---- */
const TooltipLayer = forwardRef((_, ref) => {
  const [tip, setTip] = useState(null)
  useImperativeHandle(ref, () => ({
    show: (x, y, node) => setTip({ x, y, node }),
    hide: () => setTip(null),
  }))
  if (!tip) return null
  const style = {
    left: Math.min(tip.x, window.innerWidth  - 280),
    top:  Math.min(tip.y + 10, window.innerHeight - 160),
  }
  return <div className="sf-tip" style={style}>{tip.node}</div>
})

/* ================================================================
   MAIN
================================================================ */
export default function ScheduleBoard({ app, dispatch, onExport, solverPhase, genOpen, onGenerateToggle }) {
  const { zoom, weekOffset, seedMode, pins, overrides, diff } = app
  const requests = app.swaps || []
  const tip = useRef(null)
  const [pop,       setPop]       = useState(null)
  const [ctxMenu,   setCtxMenu]   = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [filter,    setFilter]    = useState('all')
  const [pivot,     setPivot]     = useState('emp')

  /* days + week groups */
  const days = useMemo(() => Array.from({ length: 7 }, (_, k) => weekOffset * 7 + k), [weekOffset])

  const weekGroups = useMemo(() => {
    const wgs = []
    let cur = null
    days.forEach((d) => {
      const wk = Math.floor(d / 7)
      if (!cur || cur.wk !== wk) {
        const fmt = (x) => SF.dateOf(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        cur = { wk, days: [], label: fmt(d) + ' – ' + fmt(d + 6) }
        wgs.push(cur)
      }
      cur.days.push(d)
    })
    return wgs
  }, [days])

  const getShift = useCallback((i, d) => {
    const o = overrides.get(i + '|' + d)
    if (o !== undefined) return o.code
    const b = SF.baseAssign(i, d)
    return b === undefined ? null : b
  }, [overrides])
  const gsRef = useRef(getShift); gsRef.current = getShift

  const diffMap = useMemo(() => {
    if (!diff) return null
    const m = new Map()
    diff.proposal.changes.forEach((c) => m.set(c.key, c))
    return m
  }, [diff && diff.proposal])

  const pendingMap = useMemo(() => {
    const m = new Map()
    requests.forEach((r) => { if (r.status === 'pending' && r.absDay != null) m.set(r.empIdx + '|' + r.absDay, r) })
    return m
  }, [requests])

  const hoursByEmp = useMemo(() => SF.EMPLOYEES.map((e) => SF.weekHours(e.i, weekOffset, getShift)), [weekOffset, getShift])

  const decided       = diff ? diff.decided : EMPTY_MAP
  const acceptedCount = diff ? [...diff.decided.values()].filter((v) => v === 'accept').length : 0
  const decidedCount  = diff ? [...diff.decided.values()].filter(Boolean).length : 0

  const rangeLabel = useMemo(() => {
    const f = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return f(SF.dateOf(days[0])) + ' – ' + f(SF.dateOf(days[days.length - 1])) + ', 2026'
  }, [days])

  const NAME_W   = 200
  const CELL_MIN = 86
  const H_WEEK   = 26
  const H_DAY    = 28
  const TOTAL_COLS  = 1 + days.length
  const TABLE_MIN_W = NAME_W + days.length * CELL_MIN
  const lastDaysOfWeek = useMemo(() => new Set(weekGroups.map(wg => wg.days[wg.days.length - 1])), [weekGroups])

  const onCellClick = useCallback((e, emp, d, sc, assigned, ch, dec) => {
    e.stopPropagation()
    const r      = e.currentTarget.getBoundingClientRect()
    const anchor = { x: r.left, y: r.bottom, y2: r.top }
    if (seedMode) { if (assigned) dispatch({ type: 'PIN_TOGGLE', key: emp.i + '|' + d }); return }
    if (ch && !dec) { setPop({ kind: 'diff', emp, ch, anchor, decision: null }); return }
    const ovr = overrides.get(emp.i + '|' + d)
    setPop({ kind: 'emp', emp, d, sc: assigned ? sc : null, anchor, viol: ovr ? ovr.viol || [] : [] })
  }, [seedMode, overrides, dispatch])

  const openCtx = useCallback((e, items) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({ x: e.clientX + 2, y: e.clientY + 2, items })
  }, [])

  const exportEmpCSV = useCallback((emp) => {
    const allDays = Array.from({ length: 28 }, (_, k) => k - 14)
    const rows = [['Name','Date','Day','Shift','Start','End']]
    allDays.forEach(d => {
      if (!SF.inHorizon(d)) return
      const o    = overrides.get(emp.i + '|' + d)
      const code = o !== undefined ? o.code : SF.baseAssign(emp.i, d)
      if (code === undefined) return
      const s  = code ? SF.SHIFTS.find(x => x.code === code) : null
      const dt = SF.dateOf(d)
      const ds = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0')
      rows.push([emp.name, ds, SF.DOW[SF.mod(d,7)], s?s.name:'Day off', s?SF.hh(s.start):'', s?SF.hh(s.end):''])
    })
    const csv = rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download = 'schedule-'+emp.name.replace(/\s+/g,'-').toLowerCase()+'.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(()=>URL.revokeObjectURL(a.href),1000)
  }, [overrides])

  const assignShift = (emp, d, code) => {
    const viol = code ? SF.checkViolations(emp.i, d, code, gsRef.current) : []
    dispatch({ type: 'SET_CELL', key: emp.i + '|' + d, code, viol })
    setPop(null)
  }

  const visibleDepts = SF.DEPTS.filter((d) => filter === 'all' || d.id === filter)
  const visibleEmps  = useMemo(() => {
    if (filter === 'all') return SF.EMPLOYEES
    const dept = SF.DEPTS.find(d => d.id === filter)
    return dept ? SF.EMPLOYEES.slice(dept.from, dept.to + 1) : SF.EMPLOYEES
  }, [filter])

  const scanning = solverPhase === 'queued' || solverPhase === 'solving'

  return (
    <div className="flex-1 flex flex-col min-h-0" data-screen-label="Leader / Schedule board">

      {/* toolbar */}
      <div className="flex items-center gap-2 px-2 h-9 border-b border-bd bg-raised shrink-0">
        <span className="text-xs font-semibold pr-2 border-r border-bd mr-1 text-dim">Schedule board</span>
        <div className="flex gap-0.5">
          <Btn onClick={() => dispatch({ type: 'WEEK', delta: -1 })}>◀</Btn>
          <Btn onClick={() => dispatch({ type: 'WEEK', delta:  1 })}>▶</Btn>
        </div>
        <span className="font-mono text-xs font-medium min-w-36">{rangeLabel}</span>
        <Btn variant="ghost" onClick={() => dispatch({ type: 'WEEK', set: -1 })}>Today</Btn>
        <span className="w-px h-4 bg-bd mx-1 shrink-0"></span>
        <Seg value={pivot} onChange={setPivot}
          options={[{ v: 'emp', label: 'By employee' }, { v: 'cov', label: 'By time' }]} />
        <div className="flex-1"></div>
        <SelectBox value={filter} onChange={setFilter}
          options={[{ v: 'all', label: 'All departments' }, ...SF.DEPTS.map((d) => ({ v: d.id, label: d.name }))]} />
        <Btn pressed={seedMode} onClick={() => dispatch({ type: 'SEED_TOGGLE' })} kbd="S">
          ◢ Seed{pins.size > 0 ? ' · ' + pins.size : ''}
        </Btn>
        {onGenerateToggle && (
          <Btn pressed={genOpen} onClick={onGenerateToggle}>
            {scanning
              ? <><span className="sf-spinner" style={{ display: 'inline-block', width: '10px', height: '10px', marginRight: '5px', verticalAlign: 'middle' }}></span>Solving…</>
              : app.diff
              ? '◆ ' + app.diff.proposal.changes.length + ' proposed'
              : '▸ Generate'}
          </Btn>
        )}
        {onExport && <Btn onClick={onExport}>↓ Export</Btn>}
      </div>

      {/* seed hint */}
      {seedMode && (
        <div className="px-2 py-1 border-b text-2xs flex items-center gap-2 shrink-0" style={{ background: 'var(--sel-bg)', borderColor: 'var(--sel)' }}>
          <span className="font-semibold" style={{ color: 'var(--sel)' }}>SEED MODE</span>
          <span className="text-dim">Click an assigned cell to pin/unpin (◢ corner mark). Pinned cells are frozen for the next solver run.</span>
          <span className="ml-auto text-faint">Esc to exit</span>
        </div>
      )}

      {/* diff banner */}
      {diff && (
        <div className="px-2 py-1.5 border-b flex items-center gap-2 shrink-0 flex-wrap" style={{ background: 'var(--st-prop-bg)', borderColor: 'var(--st-prop)' }}>
          <Badge tone="prop">PROPOSAL {diff.proposal.id}</Badge>
          <span className="text-xs"><b>{diff.proposal.changes.length} changes</b> · fairness <span className="font-mono">{diff.proposal.prevFairness}→<b>{diff.proposal.fairness}</b></span> · penalty <span className="font-mono">{diff.proposal.prevPenalty}→<b>{diff.proposal.penalty}</b></span></span>
          <span className="text-2xs text-dim">{decidedCount}/{diff.proposal.changes.length} decided — click a violet cell to decide</span>
          <div className="flex-1"></div>
          <Btn onClick={() => dispatch({ type: 'DIFF_ALL', decision: 'accept' })}>Accept all</Btn>
          <Btn onClick={() => dispatch({ type: 'DIFF_ALL', decision: 'reject' })}>Reject all</Btn>
          <Btn variant="primary" disabled={acceptedCount === 0 && decidedCount === 0} onClick={() => dispatch({ type: 'DIFF_APPLY' })}>Apply {acceptedCount} accepted</Btn>
          <Btn variant="ghost" onClick={() => dispatch({ type: 'DIFF_DISCARD' })}>Discard</Btn>
        </div>
      )}

      {/* legend */}
      <div className="flex items-center gap-3 px-2.5 border-b border-bd bg-raised shrink-0 text-xs" style={{ height: '32px' }}>
        <span className="font-semibold uppercase tracking-wider text-faint text-2xs">Status</span>
        <span className="text-faint">◢ pinned</span>
        <span style={{ color: 'var(--st-warn)' }}>⋯ pending</span>
        <span style={{ color: 'var(--st-prop)' }}>◆ proposed</span>
        <span style={{ color: 'var(--st-crit)' }}>⚠ violation</span>
        <span className="flex-1"></span>
        {SF.SHIFTS.map((s) => (
          <span key={s.code} className="inline-flex items-center gap-1.5 font-mono text-xs font-medium"
            style={{ color: 'var(--sh-'+s.code+'-fg)', background: 'var(--sh-'+s.code+'-bg)', padding: '3px 8px', border: '1px solid var(--sh-'+s.code+'-bd)' }}>
            {s.code} {SF.hh(s.start).replace(':','')}-{SF.hh(s.end).replace(':','')}
          </span>
        ))}
      </div>

      {/* board content + scan overlay */}
      <div className="flex-1 relative overflow-hidden flex flex-col min-h-0">
        {scanning && (
          <>
            <div className="sf-scan-line" />
            <div className="sf-scan-glow" />
          </>
        )}

        {pivot === 'cov'
          ? <CoverageView days={days} app={app} dispatch={dispatch} visibleEmps={visibleEmps} getShift={getShift} onCellClick={onCellClick} tip={tip} />
          : (
          <div className="flex-1 overflow-auto relative bg-surface">
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: TABLE_MIN_W + 'px' }}>
              <colgroup>
                <col style={{ width: NAME_W + 'px' }} />
                {days.map((d) => <col key={d} />)}
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2}
                    className="sticky left-0 z-30 bg-raised border-r border-b border-bd text-center align-bottom px-2.5 pb-1.5"
                    style={{ top: 0 }}
                    onContextMenu={e => openCtx(e, [
                      { label: 'Expand all',           icon: '▾', onClick: () => setCollapsed(new Set()) },
                      { label: 'Collapse all',          icon: '▸', onClick: () => setCollapsed(new Set(SF.DEPTS.map(d => d.id))) },
                      { divider: true },
                      { label: 'Clear all overrides',  icon: '✕', disabled: overrides.size === 0, onClick: () => dispatch({ type: 'CLEAR_EDITS' }) },
                      { label: 'Unpin all',             icon: '◢', disabled: pins.size === 0,     onClick: () => dispatch({ type: 'UNPIN_ALL' }) },
                    ])}>
                    <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Employee</span>
                  </th>
                  {weekGroups.map((wg) => (
                    <th key={wg.wk} colSpan={wg.days.length}
                      className="sticky z-20 bg-raised border-b border-bd text-left px-2 font-normal"
                      style={{ top: 0, height: H_WEEK + 'px', borderRight: '2px solid var(--border-strong)' }}>
                      <span className="font-mono text-xs font-medium text-dim">{wg.label}</span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {days.map((d) => {
                    const today = d === -3
                    return (
                      <th key={d} className="sticky z-20 border-b text-center font-normal"
                        style={{ top: H_WEEK + 'px', height: H_DAY + 'px', background: today ? 'var(--sel-bg)' : SF.isWeekend(d) ? WEEKEND_BG + ', var(--surface-2)' : 'var(--surface-2)', borderRight: lastDaysOfWeek.has(d) ? '2px solid var(--border-strong)' : '1px solid var(--border)' }}
                        onContextMenu={e => openCtx(e, [
                          { label: SF.DOW[SF.mod(d,7)] + ' ' + SF.dateOf(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}), disabled: true },
                          { divider: true },
                          { label: 'Switch to By time', icon: '⊞', onClick: () => setPivot('cov') },
                          { divider: true },
                          { label: 'Mark all day off',  icon: '✕', onClick: () => visibleEmps.forEach(emp => dispatch({ type: 'SET_CELL', key: emp.i+'|'+d, code: null, viol: [] })) },
                        ])}>
                        <div className="flex flex-col items-center justify-center h-full gap-[1px]">
                          <span className="font-mono text-xs font-semibold" style={{ color: today ? 'var(--sel)' : 'var(--text-dim)' }}>
                            {SF.DOW[SF.mod(d, 7)].slice(0, 3)}
                          </span>
                          <span className="font-mono text-2xs text-faint">{SF.dateOf(d).getDate()}</span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody>
                {visibleDepts.map((dept) => {
                  const isCol = collapsed.has(dept.id)
                  const emps  = SF.EMPLOYEES.slice(dept.from, dept.to + 1)
                  return (
                    <React.Fragment key={dept.id}>
                      <tr>
                        <td colSpan={TOTAL_COLS} className="sticky left-0 z-10 border-b border-bd h-6" style={{ background: 'var(--surface-2)' }}>
                          <button type="button"
                            className="flex items-center gap-1.5 px-2.5 h-full text-2xs font-semibold uppercase tracking-wider text-dim hover:text-ink w-full text-left"
                            onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(dept.id) ? n.delete(dept.id) : n.add(dept.id); return n })}>
                            <span className="font-mono">{isCol ? '▸' : '▾'}</span>
                            {dept.name}
                            <span className="font-mono normal-case tracking-normal text-faint ml-1">{emps.length}</span>
                          </button>
                        </td>
                      </tr>

                      {!isCol && emps.map((emp, ei) => {
                        const hours = hoursByEmp ? hoursByEmp[emp.i] : null
                        return (
                          <tr key={emp.i} style={{ background: ei % 2 === 1 ? 'color-mix(in oklab, var(--surface-2) 30%, var(--surface))' : undefined }}>
                            <td className="sticky left-0 z-10 border-r border-b border-bd px-2.5"
                              style={{ height: 'var(--row-h)', background: ei % 2 === 1 ? 'color-mix(in oklab, var(--surface-2) 40%, var(--surface))' : 'var(--surface)' }}
                              onContextMenu={e => openCtx(e, [
                                { label: emp.name,     disabled: true },
                                { label: emp.deptName, disabled: true },
                                { divider: true },
                                { label: 'View ' + emp.name.split(' ')[0] + '\'s schedule', icon: '▦', onClick: () => { dispatch({ type: 'SET_EMPIDX', idx: emp.i }); dispatch({ type: 'SET_ROLE', role: 'member' }); dispatch({ type: 'EMP_VIEW', view: 'schedule' }) } },
                                { label: 'Export schedule (CSV)', icon: '↓', onClick: () => exportEmpCSV(emp) },
                                { divider: true },
                                { label: 'Mark whole week as day off', icon: '✕', onClick: () => days.forEach(d => dispatch({ type: 'SET_CELL', key: emp.i+'|'+d, code: null, viol: [] })) },
                              ])}>
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-xs truncate flex-1">{emp.name}</span>
                                {hours != null && (
                                  <span className={cx('font-mono text-2xs shrink-0', hours > 48 ? 'font-semibold' : 'text-faint')}
                                    style={hours > 48 ? { color: 'var(--st-crit)' } : hours > 40 ? { color: 'var(--st-warn)' } : {}}>
                                    {hours}h
                                  </span>
                                )}
                              </div>
                            </td>

                            {days.map((d) => {
                              const key      = emp.i + '|' + d
                              const curCode  = getShift(emp.i, d)
                              const inH      = SF.inHorizon(d)
                              const ch       = diffMap && diffMap.get(key)
                              const dec      = ch ? decided.get(ch.key) : null
                              const isProposed = ch && !dec
                              const pinned   = curCode && pins.has(key)
                              const pending  = !!pendingMap.get(key)
                              const ovr      = overrides.get(key)
                              const violated = curCode && !!(ovr && ovr.viol && ovr.viol.length)
                              let dispCode   = curCode
                              if (dec === 'accept' && ch) dispCode = ch.to
                              const s      = dispCode ? SF.SHIFTS.find(x => x.code === dispCode) : null
                              const bgColor = dispCode ? 'var(--sh-' + dispCode + '-bg)' : undefined
                              const wkEnd   = SF.isWeekend(d)
                              const lastWk  = lastDaysOfWeek.has(d)
                              return (
                                <td key={d}
                                  className={cx('border-b relative text-center',
                                    inH && 'cursor-pointer',
                                    !inH && 'opacity-20',
                                    pending && curCode && 'sf-pending',
                                    isProposed && 'sf-proposed',
                                    violated && 'sf-viol')}
                                  style={{ height: 'var(--row-h)', background: bgColor || (wkEnd ? WEEKEND_BG : undefined), verticalAlign: 'middle', borderRight: lastWk ? '2px solid var(--border-strong)' : '1px solid var(--border)' }}
                                  onClick={(e) => inH && onCellClick(e, emp, d, curCode, !!curCode, ch, dec)}
                                  onContextMenu={e => inH && openCtx(e, [
                                    { label: SF.dayLong(d) + ' · ' + emp.name, disabled: true },
                                    { divider: true },
                                    ...SF.SHIFTS.map(s => ({ label: SF.hh(s.start).replace(':','')+'-'+SF.hh(s.end).replace(':',''), icon: curCode === s.code ? '✓' : '', onClick: () => assignShift(emp, d, s.code) })),
                                    { label: 'Day off', icon: !curCode ? '✓' : '', onClick: () => assignShift(emp, d, null) },
                                    { divider: true },
                                    { label: pins.has(emp.i+'|'+d) ? 'Unpin' : 'Pin cell', icon: '◢', onClick: () => dispatch({ type: 'PIN_TOGGLE', key: emp.i+'|'+d }) },
                                  ])}
                                  onMouseEnter={(e) => {
                                    if (!dispCode && !isProposed) return
                                    const r = e.currentTarget.getBoundingClientRect()
                                    tip.current && tip.current.show(r.left, r.bottom, (
                                      <div>
                                        <p className="font-semibold">{emp.name}</p>
                                        <p className="font-mono text-dim">{SF.DOW[SF.mod(d, 7)]} {SF.dateOf(d).getDate()} · {s ? s.name + ' ' + SF.shiftTime(dispCode) : 'Day off'}</p>
                                        {pinned   && <p className="mt-1">◢ Pinned — locked for next generation.</p>}
                                        {pending  && <p className="mt-1" style={{ color: 'var(--st-warn)' }}>⚠ Pending swap</p>}
                                        {violated && ovr.viol.map((v, k) => <p key={k} className="mt-1" style={{ color: 'var(--st-crit)' }}>✕ {v.rule}: {v.text}</p>)}
                                        {isProposed && <p className="mt-1" style={{ color: 'var(--st-prop)' }}>◆ Proposed: {ch.from||'off'} → {ch.to||'off'}. Click to decide.</p>}
                                      </div>
                                    ))
                                  }}
                                  onMouseLeave={() => tip.current && tip.current.hide()}>
                                  {pinned && dispCode && (
                                    <span className="absolute top-0 left-0 z-[2]"
                                      style={{ borderTop: '6px solid var(--st-pin)', borderRight: '6px solid transparent' }} />
                                  )}
                                  {dispCode && s && (
                                    <span className="font-mono font-semibold whitespace-nowrap leading-none"
                                      style={{ fontSize: '11px', letterSpacing: '-0.02em', color: 'var(--sh-' + dispCode + '-fg)' }}>
                                      {SF.hh(s.start).replace(':','')}-{SF.hh(s.end).replace(':','')}
                                    </span>
                                  )}
                                  {isProposed && !dispCode && ch.to && (
                                    <span className="font-mono text-xs font-bold" style={{ color: 'var(--st-prop)' }}>{ch.to}</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>

      <TooltipLayer ref={tip} />
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}

      {pop && pop.kind === 'emp' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={268}>
          <EmpActionPopover emp={pop.emp} d={pop.d} curShift={pop.sc}
            getShift={gsRef.current} pins={pins} viol={pop.viol}
            onAssign={(code) => assignShift(pop.emp, pop.d, code)}
            onPin={() => { dispatch({ type: 'PIN_TOGGLE', key: pop.emp.i + '|' + pop.d }); setPop(null) }} />
        </Popover>
      )}
      {pop && pop.kind === 'diff' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={268}>
          <DiffPopover emp={pop.emp} ch={pop.ch} decision={pop.decision}
            onDecide={(d) => { dispatch({ type: 'DIFF_DECIDE', key: pop.ch.key, decision: d }); setPop(null) }} />
        </Popover>
      )}
    </div>
  )
}
