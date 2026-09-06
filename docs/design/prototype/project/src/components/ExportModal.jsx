import { useState } from 'react'
import SF from '../data/sf'
import { Btn, Seg, Field, SelectBox, Modal } from './ui'

/* --- CSV / print helpers --- */
const _m    = (n, m) => ((n % m) + m) % m
const _dlCSV = (csv, filename) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
const _buildCSV = (rows) =>
  rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')

export function exportTeamCSV(overrides, weekOffset) {
  const days = Array.from({ length: 7 }, (_, k) => weekOffset * 7 + k)
  const rows = [['Name','ID','Department','Date','Day','Shift','Code','Start','End','Hours']]
  SF.EMPLOYEES.forEach(emp => {
    days.forEach(d => {
      if (!SF.inHorizon(d)) return
      const o    = overrides.get(emp.i + '|' + d)
      const code = o !== undefined ? o.code : SF.baseAssign(emp.i, d)
      if (code === undefined) return
      const s  = code ? SF.SHIFTS.find(x => x.code === code) : null
      const dt = SF.dateOf(d)
      const ds = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0')
      rows.push([emp.name, emp.id, emp.deptName, ds, SF.DOW[_m(d,7)],
        s ? s.name : 'Day off', code || '', s ? SF.hh(s.start) : '', s ? SF.hh(s.end) : '', s ? s.end - s.start : 0])
    })
  })
  _dlCSV(_buildCSV(rows), 'shiftforge-team-week' + weekOffset + '.csv')
}

export function exportPersonCSV(empIdx, overrides) {
  const emp  = SF.EMPLOYEES[empIdx]
  const days = Array.from({ length: 28 }, (_, k) => k - 14)
  const rows = [['Name','Date','Day','Shift','Code','Start','End','Hours']]
  days.forEach(d => {
    if (!SF.inHorizon(d)) return
    const o    = overrides.get(empIdx + '|' + d)
    const code = o !== undefined ? o.code : SF.baseAssign(empIdx, d)
    if (code === undefined) return
    const s  = code ? SF.SHIFTS.find(x => x.code === code) : null
    const dt = SF.dateOf(d)
    const ds = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0')
    rows.push([emp.name, ds, SF.DOW[_m(d,7)], s ? s.name : 'Day off', code || '',
      s ? SF.hh(s.start) : '', s ? SF.hh(s.end) : '', s ? s.end - s.start : 0])
  })
  _dlCSV(_buildCSV(rows), 'shiftforge-' + emp.name.replace(/\s+/g,'-').toLowerCase() + '.csv')
}

export function printSchedule(overrides, weekOffset, empIdx) {
  const isSingle = empIdx != null
  const emps     = isSingle ? [SF.EMPLOYEES[empIdx]] : SF.EMPLOYEES
  const days     = Array.from({ length: 7 }, (_, k) => weekOffset * 7 + k)
  const weekStart = SF.dateOf(days[0]).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const SC = { N:'#c7d7f5', E:'#b8e8d8', M:'#d8ebb8', A:'#eed8b0', L:'#ecc0c0' }
  const rows = emps.map(emp => {
    const cells = days.map(d => {
      const o    = overrides.get(emp.i + '|' + d)
      const code = o !== undefined ? o.code : SF.baseAssign(emp.i, d)
      if (code === undefined) return `<td style="color:#bbb;text-align:center">–</td>`
      if (!code) return `<td style="color:#aaa;text-align:center;font-size:7px">OFF</td>`
      const s = SF.SHIFTS.find(x => x.code === code)
      return `<td style="background:${SC[code]||'#eee'};text-align:center;font-weight:600">${code}<br><span style="font-weight:400;font-size:7px;opacity:.75">${SF.hh(s.start)}-${SF.hh(s.end)}</span></td>`
    }).join('')
    return `<tr><td style="white-space:nowrap;padding-right:8px;font-weight:500">${emp.name}</td><td style="color:#888;padding-right:8px;font-size:8px;white-space:nowrap">${emp.deptName}</td>${cells}</tr>`
  }).join('')
  const html = `<!DOCTYPE html><html><head><title>Schedule · ${weekStart}</title><style>*{box-sizing:border-box}body{font-family:sans-serif;font-size:9px;color:#111;margin:0;padding:14px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #e4e4e4;padding:3px 4px}th{background:#f6f6f6;font-weight:600;text-align:center}@page{size:A4 landscape;margin:8mm}</style></head><body><h1 style="font-size:13px;font-weight:700;margin:0 0 3px">${isSingle ? SF.EMPLOYEES[empIdx].name + ' — Personal schedule' : 'Team schedule'}</h1><p style="font-size:8px;color:#777;margin:0 0 10px">Week of ${weekStart} · ShiftForge · ${new Date().toLocaleDateString('en-US')}</p><table><thead><tr><th style="width:130px;text-align:left">Name</th><th style="width:90px;text-align:left">Department</th>${days.map(d=>`<th>${SF.DOW[_m(d,7)]}<br>${SF.dateOf(d).getDate()}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></body></html>`
  const win = window.open('', '_blank')
  if (!win) { alert('Please allow popups to print / save as PDF'); return }
  win.document.write(html); win.document.close()
  win.onload = () => { win.focus(); win.print() }
}

/* --- Modal component --- */
export default function ExportModal({ app, onClose }) {
  const [scope, setScope] = useState('team')
  const [pick,  setPick]  = useState(app.empIdx)

  return (
    <Modal title="Export / Print" onClose={onClose} width={400}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => {
            scope === 'team' ? exportTeamCSV(app.overrides, app.weekOffset) : exportPersonCSV(pick, app.overrides)
            onClose()
          }}>↓ Download CSV</Btn>
          <Btn variant="primary" onClick={() => {
            printSchedule(app.overrides, app.weekOffset, scope === 'person' ? pick : null)
            onClose()
          }}>⎙ Print / PDF</Btn>
        </>
      }>
      <div className="space-y-3 text-xs">
        <Seg value={scope} onChange={setScope} className="w-full"
          options={[{ v: 'team', label: 'Full team (current week)' }, { v: 'person', label: 'Single employee (4 weeks)' }]} />
        {scope === 'person' && (
          <Field label="Employee">
            <SelectBox value={String(pick)} onChange={v => setPick(Number(v))} className="w-full"
              options={SF.EMPLOYEES.map(e => ({ v: String(e.i), label: e.name + ' · ' + e.deptName }))} />
          </Field>
        )}
        <div className="text-2xs text-dim leading-snug pt-0.5">
          CSV imports directly into Google Sheets or Excel.<br />
          PDF: browser print dialog → "Save as PDF".
        </div>
      </div>
    </Modal>
  )
}
