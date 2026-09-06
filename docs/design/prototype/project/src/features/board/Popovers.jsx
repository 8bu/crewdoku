/* Board sub-components: ContextMenu, EmpActionPopover, DiffPopover */
import { useState, useRef, useEffect } from 'react'
import SF from '../../data/sf'
import { cx, Badge, Btn } from '../../components/ui'

export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey  = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown',   onKey)
    }
  }, [onClose])

  const [adj, setAdj] = useState({ left: x, top: y })
  useEffect(() => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setAdj({
      left: r.right  > window.innerWidth  ? x - r.width  : x,
      top:  r.bottom > window.innerHeight ? y - r.height : y,
    })
  }, [])

  return (
    <div ref={ref} onContextMenu={e => e.preventDefault()}
      style={{ position: 'fixed', left: adj.left, top: adj.top, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,.13)' }}
      className="bg-surface border border-bd rounded-[2px] py-0.5 min-w-[192px]">
      {items.map((item, i) => item.divider
        ? <div key={i} className="border-t border-[var(--grid-line)] my-0.5" />
        : (
          <button key={i} type="button" disabled={item.disabled}
            onClick={() => { item.onClick?.(); onClose() }}
            className={cx('w-full text-left px-3 h-7 text-xs flex items-center gap-2 transition-none',
              item.disabled ? 'text-faint cursor-default' : 'hover:bg-[var(--sel-bg)] hover:text-ink text-dim')}>
            <span className="font-mono text-xs w-3 text-center shrink-0 opacity-60">{item.icon || ''}</span>
            <span className="flex-1">{item.label}</span>
            {item.kbd && <span className="ml-2 font-mono text-2xs text-faint">{item.kbd}</span>}
          </button>
        )
      )}
    </div>
  )
}

export function EmpActionPopover({ emp, d, curShift, getShift, pins, viol, onAssign, onPin }) {
  return (
    <div className="text-xs">
      <div className="px-2.5 py-1.5 border-b border-bd bg-raised">
        <p className="font-semibold">{emp.name}</p>
        <p className="font-mono text-2xs text-dim">{emp.deptName} · {SF.dayLong(d)}</p>
      </div>
      <p className="px-2.5 pt-2 pb-0.5 text-2xs font-semibold uppercase tracking-wider text-faint">Assign shift</p>
      {SF.SHIFTS.map((s) => {
        const v = SF.checkViolations(emp.i, d, s.code, getShift)
        return (
          <button key={s.code} type="button" onClick={() => onAssign(s.code)}
            className="w-full flex items-center gap-2 px-2.5 h-7 hover:bg-[var(--sel-bg)] text-left">
            <span className="w-5 h-5 inline-flex items-center justify-center font-mono text-xs font-semibold border shrink-0"
              style={{ background: 'var(--sh-'+s.code+'-bg)', color: 'var(--sh-'+s.code+'-fg)', borderColor: 'var(--sh-'+s.code+'-bd)' }}>
              {s.code}
            </span>
            <span className="flex-1">{s.name}</span>
            <span className="font-mono text-2xs text-faint">{SF.shiftTime(s.code)}</span>
            {s.code === curShift && <span className="text-2xs text-faint font-mono">✓</span>}
            {v.length > 0 && <span className="font-bold" title={v.map(x => x.text).join('\n')} style={{ color: 'var(--st-crit)' }}>⚠</span>}
          </button>
        )
      })}
      <button type="button" onClick={() => onAssign(null)}
        className="w-full flex items-center gap-2 px-2.5 h-7 hover:bg-[var(--sel-bg)] text-left text-dim border-t border-bd mt-0.5">
        <span className="w-5 h-5 border border-dashed border-bds shrink-0 inline-block"></span>
        <span>Day off</span>
      </button>
      <div className="border-t border-bd px-2.5 py-1.5">
        <button type="button" className="text-2xs text-dim hover:text-ink" onClick={onPin}>
          ◢ {pins.has(emp.i + '|' + d) ? 'Unpin' : 'Pin for next generation'}
        </button>
      </div>
      {viol.length > 0 && (
        <div className="border-t border-bd px-2.5 py-1.5 space-y-0.5">
          {viol.map((v, k) => (
            <p key={k} className="text-2xs" style={{ color: 'var(--st-crit)' }}>⚠ {v.rule}: {v.text}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export function DiffPopover({ emp, ch, decision, onDecide }) {
  return (
    <div className="text-xs">
      <div className="px-2.5 py-1.5 border-b border-bd bg-raised">
        <p className="font-semibold flex items-center gap-2">{emp.name} <Badge tone="prop">proposed</Badge></p>
        <p className="font-mono text-2xs text-dim">{SF.dayLong(ch.absDay)}</p>
      </div>
      <div className="px-2.5 py-2 space-y-1">
        <p className="font-mono">
          {ch.from ? SF.shift(ch.from).name + ' ' + SF.shiftTime(ch.from) : 'Day off'}
          <span className="mx-2" style={{ color: 'var(--st-prop)' }}>→</span>
          <b>{ch.to ? SF.shift(ch.to).name + ' ' + SF.shiftTime(ch.to) : 'Day off'}</b>
        </p>
        <p className="text-2xs text-dim">{ch.note}</p>
      </div>
      <div className="flex gap-1.5 px-2.5 pb-2.5">
        <Btn variant={decision === 'accept' ? 'primary' : 'default'} onClick={() => onDecide('accept')} className="flex-1 justify-center">✓ Accept</Btn>
        <Btn variant={decision === 'reject' ? 'primary' : 'default'} onClick={() => onDecide('reject')} className="flex-1 justify-center">✕ Reject</Btn>
        {decision && <Btn variant="ghost" onClick={() => onDecide(null)}>↺</Btn>}
      </div>
    </div>
  )
}
