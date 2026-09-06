/* CoverageView — "By time" pivot: rows = shifts, cols = days, cells = employee chips */
import { useMemo } from 'react'
import SF from '../../data/sf'
import { cx } from '../../components/ui'

const WEEKEND_BG = 'repeating-linear-gradient(45deg, var(--weekend-hatch) 0, var(--weekend-hatch) 1px, transparent 1px, transparent 6px)'
const EMPTY_MAP  = new Map()

export default function CoverageView({ days, app, dispatch, visibleEmps, getShift, onCellClick, tip }) {
  const { pins, overrides, diff } = app
  const requests = app.swaps || []
  const LABEL_W  = 116
  const DAY_MIN  = 124

  const diffMap = useMemo(() => {
    if (!diff) return null
    const m = new Map()
    diff.proposal.changes.forEach(c => m.set(c.key, c))
    return m
  }, [diff && diff.proposal])

  const pendingMap = useMemo(() => {
    const m = new Map()
    requests.forEach(r => { if (r.status === 'pending' && r.absDay != null) m.set(r.empIdx + '|' + r.absDay, r) })
    return m
  }, [requests])

  const decided = diff ? diff.decided : EMPTY_MAP

  const grid = useMemo(() => {
    const m = new Map()
    days.forEach(d => SF.SHIFTS.forEach(s => m.set(d + '|' + s.code, [])))
    visibleEmps.forEach(emp => {
      days.forEach(d => {
        const code = getShift(emp.i, d)
        if (code) m.get(d + '|' + code).push(emp)
      })
    })
    return m
  }, [days, visibleEmps, getShift, overrides, diff])

  return (
    <div className="flex-1 overflow-auto relative bg-surface" style={{ scrollSnapType: 'x mandatory' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: (LABEL_W + days.length * DAY_MIN) + 'px' }}>
        <colgroup>
          <col style={{ width: LABEL_W + 'px' }} />
          {days.map(d => <col key={d} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 z-30 bg-raised border-r border-b border-bd text-left align-bottom px-2.5 pb-1.5" style={{ top: 0 }}>
              <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Time / Shift</span>
            </th>
            {days.map(d => {
              const isWeekend = SF.isWeekend(d)
              const isToday   = d === -3
              return (
                <th key={d} className="sticky z-20 border-r border-b border-bd text-center font-normal"
                  style={{ top: 0, height: '36px', scrollSnapAlign: 'start', background: isToday ? 'var(--sel-bg)' : isWeekend ? WEEKEND_BG + ', var(--surface-2)' : 'var(--surface-2)' }}>
                  <p className="font-mono text-xs font-semibold" style={{ color: isToday ? 'var(--sel)' : 'var(--text-dim)' }}>
                    {SF.DOW[SF.mod(d, 7)].slice(0, 3)} {SF.dateOf(d).getDate()}
                  </p>
                  <p className="font-mono text-2xs text-faint">{SF.dateOf(d).toLocaleDateString('en-US', { month: 'short' })}</p>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {SF.SHIFTS.map(s => (
            <tr key={s.code}>
              <td className="sticky left-0 z-10 border-r border-b border-bd px-2.5 align-top py-1.5"
                style={{ background: 'var(--sh-'+s.code+'-bg)' }}>
                <span className="font-mono text-xs font-semibold" style={{ color: 'var(--sh-'+s.code+'-fg)' }}>
                  {SF.hh(s.start).replace(':','')}-{SF.hh(s.end).replace(':','')}
                </span>
              </td>
              {days.map(d => {
                const isWeekend = SF.isWeekend(d)
                const inH       = SF.inHorizon(d)
                const emps      = grid.get(d + '|' + s.code) || []
                return (
                  <td key={d}
                    className={cx('border-r border-b border-[var(--grid-line)] align-top p-1', !inH && 'opacity-20')}
                    style={{ scrollSnapAlign: 'start', background: isWeekend ? WEEKEND_BG : undefined }}>
                    <div className="flex flex-wrap gap-1">
                      {emps.map(emp => {
                        const key     = emp.i + '|' + d
                        const ch      = diffMap && diffMap.get(key)
                        const dec     = ch ? decided.get(ch.key) : null
                        const pinned  = pins.has(key)
                        const pending = !!(pendingMap.get(key))
                        const ovr     = overrides.get(key)
                        const violated = !!(ovr && ovr.viol && ovr.viol.length)
                        const propArr  = ch && !dec && ch.to === s.code && ch.from !== s.code
                        return (
                          <button key={emp.i} type="button"
                            className={cx('inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-2xs font-medium leading-none border max-w-full bg-surface',
                              inH && 'cursor-pointer hover:bg-raised',
                              pending && 'sf-pending',
                              propArr && 'sf-proposed',
                              violated && 'sf-viol')}
                            style={{ color: 'var(--text)', borderColor: 'var(--bd)' }}
                            onClick={e => { e.stopPropagation(); inH && onCellClick(e, emp, d, s.code, true, ch, dec) }}
                            onMouseEnter={e => {
                              const r = e.currentTarget.getBoundingClientRect()
                              tip.current && tip.current.show(r.left, r.bottom, (
                                <div>
                                  <p className="font-semibold">{emp.name}</p>
                                  <p className="font-mono text-dim">{emp.deptName} · {s.name} {SF.shiftTime(s.code)}</p>
                                  {pinned   && <p className="mt-1">◢ Pinned</p>}
                                  {pending  && <p className="mt-1" style={{ color: 'var(--st-warn)' }}>⚠ Pending request</p>}
                                  {violated && ovr.viol.map((v, k) => <p key={k} className="mt-1" style={{ color: 'var(--st-crit)' }}>✕ {v.rule}: {v.text}</p>)}
                                  {propArr  && <p className="mt-1" style={{ color: 'var(--st-prop)' }}>◆ Proposed → {s.name}</p>}
                                </div>
                              ))
                            }}
                            onMouseLeave={() => tip.current && tip.current.hide()}>
                            {pinned && <span style={{ color: 'var(--st-pin)' }}>◢</span>}
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--dept-'+emp.dept+')' }}></span>
                            <span className="truncate">{emp.name.split(' ').slice(-1)[0]}</span>
                          </button>
                        )
                      })}
                      {emps.length === 0 && inH && (
                        <span className="text-2xs text-faint font-mono px-1 py-0.5">—</span>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
