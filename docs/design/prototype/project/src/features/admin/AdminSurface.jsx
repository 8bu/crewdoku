/* AdminSurface — shift definitions, rules, teams, preferences, permissions, weights. */
import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import SF from '../../data/sf'
import {
  cx, Btn, Seg, TextInput, NumInput, SelectBox,
  Panel, Banner, Badge, EmptyState,
} from '../../components/ui'
import PageHeader from '../../components/PageHeader'

const DEFAULT_PREFS = { nightPref: 'willing', weekendPref: 'willing', daysOff: [], maxShiftsWeek: 5, notes: '' }

const SECTIONS = [
  { v: "shifts", label: "Shift definitions"    },
  { v: "rules",  label: "Scheduling rules"     },
  { v: "teams",  label: "Teams & structure"    },
  { v: "prefs",  label: "Employee preferences" },
  { v: "perms",  label: "Role permissions"     },
  { v: "weights",label: "Schedule priorities"  },
];

const DEFAULT_PREFS = { nightPref: "willing", weekendPref: "willing", daysOff: [], maxShiftsWeek: 5, notes: "" };

function AdminSurface({ app, dispatch }) {
  const section = app.adminSection || "shifts";
  const meta = SECTIONS.find((s) => s.v === section) || SECTIONS[0];

  /* Shared employee state — lifted so Teams and Preferences views stay in sync */
  const [employees, setEmployees] = useState(() => SF.EMPLOYEES.map(e => ({
    ...e, depts: [e.dept], prefs: { ...DEFAULT_PREFS },
  })));

  return (
    <div className="flex-1 flex flex-col min-h-0" data-screen-label="Sysadmin">
      <PageHeader title={meta.label} subtitle="Changes apply to the next solver run · Sysadmin" />
      <div className="flex-1 overflow-auto p-3">
        {section === "shifts"  && <ShiftConfig dispatch={dispatch} />}
        {section === "rules"   && <RulesConfig />}
        {section === "teams"   && <TeamsConfig employees={employees} setEmployees={setEmployees} />}
        {section === "prefs"   && <PreferencesConfig employees={employees} setEmployees={setEmployees} />}
        {section === "perms"   && <PermsConfig />}
        {section === "weights" && <WeightsConfig />}
      </div>
    </div>
  );
}

/* ---- Shift definitions — editable, live validation, applies to board ---- */
const PALETTE = [
  { bg: "oklch(0.33 0.035 265)", fg: "oklch(0.92 0.015 265)", bd: "oklch(0.44 0.04 265)"  },
  { bg: "oklch(0.93 0.055 80)",  fg: "oklch(0.43 0.10 70)",   bd: "oklch(0.84 0.07 80)"   },
  { bg: "oklch(0.93 0.05 150)",  fg: "oklch(0.40 0.09 150)",  bd: "oklch(0.84 0.065 150)" },
  { bg: "oklch(0.93 0.045 230)", fg: "oklch(0.42 0.095 240)", bd: "oklch(0.84 0.06 230)"  },
  { bg: "oklch(0.93 0.05 310)",  fg: "oklch(0.43 0.10 310)",  bd: "oklch(0.85 0.065 310)" },
  { bg: "oklch(0.93 0.06 25)",   fg: "oklch(0.40 0.12 20)",   bd: "oklch(0.84 0.08 25)"   },
  { bg: "oklch(0.93 0.06 350)",  fg: "oklch(0.38 0.12 345)",  bd: "oklch(0.84 0.08 350)"  },
  { bg: "oklch(0.93 0.02 280)",  fg: "oklch(0.38 0.04 280)",  bd: "oklch(0.84 0.02 280)"  },
];
const SHIFT_DEFAULTS = [
  { code: "N", name: "Night", start: 1,  end: 6,  req: 10, cap: 12, ...PALETTE[0] },
  { code: "E", name: "Early", start: 5,  end: 11, req: 14, cap: 16, ...PALETTE[1] },
  { code: "M", name: "Mid",   start: 10, end: 16, req: 16, cap: 18, ...PALETTE[2] },
  { code: "A", name: "Swing", start: 15, end: 21, req: 16, cap: 18, ...PALETTE[3] },
  { code: "L", name: "Late",  start: 20, end: 26, req: 14, cap: 16, ...PALETTE[4] },
];

function ShiftConfig({ dispatch }) {
  const initRows = () => SF.SHIFTS.map((s, i) => ({
    ...s,
    bg: s.bg || PALETTE[i % PALETTE.length].bg,
    fg: s.fg || PALETTE[i % PALETTE.length].fg,
    bd: s.bd || PALETTE[i % PALETTE.length].bd,
  }));
  const [rows, setRows]               = useState(initRows);
  const [applied, setApplied]         = useState(false);
  const [showPalette, setShowPalette] = useState(null);

  const upd     = (i, p) => { setApplied(false); setRows(r => r.map((row, k) => k === i ? { ...row, ...p } : row)); };
  const remove  = (i)    => { if (rows.length > 1) setRows(r => r.filter((_, k) => k !== i)); };
  const move    = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    setRows(r => { const a = [...r]; [a[i], a[j]] = [a[j], a[i]]; return a; });
  };
  const addRow = () => {
    const p = PALETTE[rows.length % PALETTE.length];
    setRows(r => [...r, { code: "X", name: "New shift", start: 8, end: 16, req: 8, cap: 12, ...p }]);
  };
  const shortCode = (r) => {
    const pad = h => String(((h % 24) + 24) % 24).padStart(2,"0") + "00";
    return pad(r.start) + "-" + pad(r.end);
  };

  const codes      = rows.map(r => r.code.trim().toUpperCase());
  const hasDupCode = codes.some((c, i) => codes.indexOf(c) !== i);
  const hasError   = hasDupCode || rows.some(r => r.end <= r.start || r.req > r.cap || !r.code.trim());

  const apply = () => {
    const cleaned = rows.map(r => ({ ...r, code: r.code.trim().toUpperCase() }));
    SF.SHIFTS.length = 0;
    cleaned.forEach(r => SF.SHIFTS.push({ ...r }));
    if (SF.rebuildShiftIdx) SF.rebuildShiftIdx();
    const root = document.documentElement;
    cleaned.forEach(r => {
      root.style.setProperty("--sh-"+r.code+"-bg", r.bg);
      root.style.setProperty("--sh-"+r.code+"-fg", r.fg);
      root.style.setProperty("--sh-"+r.code+"-bd", r.bd);
    });
    setApplied(true);
    setTimeout(() => dispatch({ type: "ADMIN_VIEW", view: "board" }), 700);
  };
  const reset = () => {
    SF.SHIFTS.length = 0;
    SHIFT_DEFAULTS.forEach(s => SF.SHIFTS.push({ ...s }));
    if (SF.rebuildShiftIdx) SF.rebuildShiftIdx();
    const root = document.documentElement;
    SHIFT_DEFAULTS.forEach(s => {
      root.style.setProperty("--sh-"+s.code+"-bg", s.bg);
      root.style.setProperty("--sh-"+s.code+"-fg", s.fg);
      root.style.setProperty("--sh-"+s.code+"-bd", s.bd);
    });
    setRows(SHIFT_DEFAULTS.map(s => ({ ...s })));
    setApplied(false);
  };

  const requiredPD = rows.reduce((a, r) => a + (r.req || 0), 0) * 7;
  const capacityPD = SF.EMPLOYEES.length * 5;
  const pct = Math.round((requiredPD / capacityPD) * 100);
  const feasLevel = requiredPD > capacityPD ? "crit" : pct >= 95 ? "warn" : "ok";

  return (
    <div className="max-w-3xl space-y-3" data-screen-label="Sysadmin / Shifts">
      <Panel title="Shift definitions" pad={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-dim bg-raised border-b border-bd">
              <th className="px-1 py-1.5 w-8"></th>
              <th className="text-left font-semibold px-2">Code</th>
              <th className="text-left font-semibold px-2">Name</th>
              <th className="text-left font-semibold px-2">Start h</th>
              <th className="text-left font-semibold px-2">End h</th>
              <th className="text-left font-semibold px-2">Short code</th>
              <th className="text-right font-semibold px-2">Required</th>
              <th className="text-right font-semibold px-2">Capacity</th>
              <th className="text-right font-semibold px-2">Hrs</th>
              <th className="text-left font-semibold px-2">Color</th>
              <th className="w-8 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const hrs     = r.end - r.start;
              const badHrs  = hrs <= 0;
              const overCap = r.req > r.cap;
              const dupCode = codes.indexOf(r.code.trim().toUpperCase()) !== i;
              return (
                <tr key={i} className="border-b border-[var(--grid-line)] last:border-b-0 group">
                  <td className="px-1 text-center align-middle">
                    <div className="flex flex-col leading-none">
                      <button type="button" className="text-faint hover:text-ink px-1 py-0.5 disabled:opacity-20" onClick={() => move(i,-1)} disabled={i===0}>▴</button>
                      <button type="button" className="text-faint hover:text-ink px-1 py-0.5 disabled:opacity-20" onClick={() => move(i,1)}  disabled={i===rows.length-1}>▾</button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <TextInput value={r.code} onChange={v => upd(i,{code:v.toUpperCase().slice(0,2)})}
                      className={cx("w-10 font-mono text-center uppercase", dupCode ? "!border-[var(--st-crit)]" : "")} />
                  </td>
                  <td className="px-2"><TextInput value={r.name} onChange={v => upd(i,{name:v})} className="w-24" /></td>
                  <td className="px-2"><NumInput value={r.start} min={0} max={23} onChange={v => upd(i,{start:v})} className={badHrs ? "!border-[var(--st-crit)]" : ""} /></td>
                  <td className="px-2"><NumInput value={r.end}   min={1} max={32} onChange={v => upd(i,{end:v})}   className={badHrs ? "!border-[var(--st-crit)]" : ""} /></td>
                  <td className="px-2">
                    <span className="font-mono text-2xs px-1.5 py-0.5 border rounded-[2px] whitespace-nowrap"
                      style={{ background: r.bg, color: r.fg, borderColor: r.bd }}>{shortCode(r)}</span>
                  </td>
                  <td className="px-2 text-right"><NumInput value={r.req} min={0} max={SF.EMPLOYEES.length} onChange={v => upd(i,{req:v})} className={overCap ? "!border-[var(--st-crit)]" : ""} /></td>
                  <td className="px-2 text-right"><NumInput value={r.cap} min={0} max={SF.EMPLOYEES.length} onChange={v => upd(i,{cap:v})} /></td>
                  <td className="px-2 text-right font-mono" style={{ color: badHrs ? "var(--st-crit)" : "var(--text-dim)" }}>{badHrs ? "⚠" : hrs+"h"}</td>
                  <td className="px-2 relative">
                    <button type="button"
                      onClick={() => setShowPalette(showPalette === i ? null : i)}
                      className="w-5 h-5 border-2 rounded-[2px] hover:scale-110 transition-transform"
                      style={{ background: r.bg, borderColor: r.bd }} />
                    {showPalette === i && (
                      <div className="absolute top-7 left-0 z-50 flex gap-1 p-1.5 bg-surface border border-bd rounded-[2px]"
                        style={{ boxShadow: "0 4px 12px rgba(0,0,0,.12)" }}>
                        {PALETTE.map((p, pi) => (
                          <button key={pi} type="button"
                            onClick={() => { upd(i,{bg:p.bg,fg:p.fg,bd:p.bd}); setShowPalette(null); }}
                            className="w-5 h-5 border rounded-[2px] hover:scale-110 transition-transform"
                            style={{ background: p.bg, borderColor: p.bd }} />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2">
                    <Btn variant="ghost" disabled={rows.length <= 1} onClick={() => remove(i)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity">✕</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center gap-2 px-2.5 py-2 border-t border-bd bg-raised flex-wrap">
          <Btn onClick={addRow}>+ Add shift</Btn>
          <span className="w-px h-4 bg-bd shrink-0"></span>
          <Btn variant="primary" disabled={hasError} onClick={apply}>▸ Apply to board</Btn>
          <Btn variant="ghost" onClick={reset}>Reset defaults</Btn>
          {applied    && <span className="text-2xs text-faint">✓ Applied — opening board…</span>}
          {hasDupCode && <span className="text-2xs" style={{color:"var(--st-crit)"}}>Duplicate shift codes</span>}
          <span className="flex-1"></span>
          <span className="text-2xs text-faint">End &gt; 24 = overnight</span>
        </div>
      </Panel>
      {feasLevel === "crit" && (
        <Banner level="crit" title="Infeasible — required headcount exceeds workforce capacity">
          {requiredPD.toLocaleString()} person-days/week required vs {capacityPD} available.
          Cut ≥ {Math.ceil((requiredPD-capacityPD)/7)} total per day across shifts.
        </Banner>
      )}
      {feasLevel === "warn" && (
        <Banner level="warn" title={pct+"% of workforce used — tight"}>
          Feasible but near capacity. Any absence risks a H1 violation.
        </Banner>
      )}
      {feasLevel === "ok" && (
        <Banner level="ok" title={"Feasible · "+pct+"% · "+requiredPD+" of "+capacityPD+" person-days/week"}>
          Good slack for absences and rotations.
        </Banner>
      )}
    </div>
  );
}

/* ---- Global rules ---- */
const RULE_DEFS = [
  { id:"H2", group:"hard",    name:"Max hours / week",         desc:"EU working-time cap; counted per ISO week.",                 value:48, unit:"h",        min:8,  max:80, affects:100 },
  { id:"H3", group:"hard",    name:"Min rest between shifts",  desc:"Hours between one shift's end and the next start.",         value:11, unit:"h",        min:0,  max:24, affects:100 },
  { id:"H6", group:"hard",    name:"Max consecutive workdays", desc:"A rest day is forced after this many days in a row.",       value:6,  unit:"days",     min:1,  max:14, affects:100 },
  { id:"H7", group:"hard",    name:"Min days off / week",      desc:"Guaranteed rest per rolling 7-day window.",                 value:2,  unit:"days",     min:1,  max:4,  affects:100 },
  { id:"P1", group:"policy",  name:"Max night shifts / month", desc:"Per-employee cap in a rolling 30-day window.",              value:8,  unit:"shifts",   min:1,  max:20, affects:60  },
  { id:"P2", group:"policy",  name:"Max weekends / 4 weeks",   desc:"Weekend rotation — no employee works more than this many.", value:2,  unit:"weekends", min:1,  max:4,  affects:100 },
  { id:"P3", group:"policy",  name:"PT weekly hour cap",       desc:"Separate max-hours limit for part-time contracts.",         value:24, unit:"h",        min:4,  max:40, affects:20  },
  { id:"F1", group:"fairness",name:"Night equity tolerance",   desc:"Max gap in Night shift count between employees in dept.",   value:3,  unit:"shifts",   min:0,  max:10, affects:60  },
  { id:"F2", group:"fairness",name:"Weekend equity tolerance", desc:"Max diff in weekend shifts within the same department.",    value:2,  unit:"shifts",   min:0,  max:6,  affects:100 },
];
const RULE_GROUPS = [
  { id:"hard",    label:"Hard constraints",    color:"var(--st-crit)", desc:"Block generation if violated" },
  { id:"policy",  label:"Scheduling policies", color:"var(--st-warn)", desc:"Applied to every solver run" },
  { id:"fairness",label:"Fairness rules",      color:"var(--st-prop)", desc:"Soft — traded against solver weights" },
];

function RuleRow({ rule, color, onUpdate }) {
  const isOff = rule.status === "off";
  const statusOpts = [{ v:"on", label:"On" }, { v:"warn", label:"Warn" }, { v:"off", label:"Off" }];
  return (
    <div className="flex items-center gap-3 px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0"
      style={{ borderLeft: "3px solid " + (isOff ? "var(--border)" : color), opacity: isOff ? 0.4 : 1 }}>
      <div className="shrink-0">
        <Seg value={rule.status} onChange={v => onUpdate({ status: v })} options={statusOpts} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge>{rule.id}</Badge>
          <span className="text-xs font-medium">{rule.name}</span>
        </div>
        <p className="text-2xs text-faint mt-0.5">{rule.desc}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <NumInput value={rule.value} min={rule.min} max={rule.max}
          onChange={v => onUpdate({ value: v })} disabled={isOff} />
        <span className="text-2xs text-faint w-14">{rule.unit}</span>
      </div>
      <span className="font-mono text-2xs text-right w-16 shrink-0"
        style={{ color: isOff ? "var(--text-faint)" : "var(--text-dim)" }}>
        {rule.affects} staff
      </span>
    </div>
  );
}

function TransitionEditor({ shifts, forbidden, setForbidden }) {
  const toggle = (from, to) => {
    const k = from + ":" + to;
    setForbidden(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };
  return (
    <div className="p-2.5">
      <p className="text-2xs text-faint mb-3">
        Click a cell to forbid that back-to-back transition. Row = shift worked, column = shift that follows.
        Banned regardless of rest hours.
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-2xs text-faint font-normal px-1 pb-1.5 text-left">From &#8595; &nbsp; To &#8594;</th>
              {shifts.map(s => (
                <th key={s.code} className="text-center px-1 pb-1.5 min-w-[72px]">
                  <span className="text-2xs px-1.5 py-0.5 rounded-[2px] font-mono font-medium"
                    style={{ background: s.bg, color: s.fg }}>{s.code} {s.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shifts.map(from => (
              <tr key={from.code}>
                <td className="px-1 py-1">
                  <span className="text-2xs px-1.5 py-0.5 rounded-[2px] font-mono font-medium"
                    style={{ background: from.bg, color: from.fg }}>{from.code} {from.name}</span>
                </td>
                {shifts.map(to => {
                  const same = from.code === to.code;
                  const key  = from.code + ":" + to.code;
                  const forb = forbidden.has(key);
                  return (
                    <td key={to.code} className="text-center px-1 py-1">
                      {same
                        ? <span className="text-faint text-xs">—</span>
                        : <button onClick={() => toggle(from.code, to.code)}
                            className="w-12 h-6 text-2xs rounded-[2px] border transition-colors"
                            style={{
                              background:  forb ? "var(--st-crit-bg)" : "var(--raised)",
                              borderColor: forb ? "var(--st-crit)"    : "var(--border)",
                              color:       forb ? "var(--st-crit)"    : "var(--text-faint)",
                            }}>
                            {forb ? "✕ ban" : "ok"}
                          </button>
                      }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {forbidden.size > 0 && (
        <p className="text-2xs mt-2.5" style={{ color: "var(--st-warn)" }}>
          &#9888; {forbidden.size} transition{forbidden.size > 1 ? "s" : ""} banned — solver will never schedule these back-to-back.
        </p>
      )}
    </div>
  );
}

function ScopeOverrides({ rules, tab, deptOv, setDeptOv, contractOv, setContractOv }) {
  const COLS = rules.filter(r => ["H2","H3","P1","P2"].includes(r.id));
  const ov    = tab === "dept" ? deptOv    : contractOv;
  const setOv = tab === "dept" ? setDeptOv : setContractOv;
  const rows  = tab === "dept"
    ? SF.DEPTS.map(d => ({ key: d.id, label: d.name }))
    : [{ key:"ft", label:"Full-time" }, { key:"pt", label:"Part-time" }, { key:"agency", label:"Agency / Temp" }];
  const get   = (row, id)    => ov[row + ":" + id];
  const set_  = (row, id, v) => setOv(p => ({ ...p, [row + ":" + id]: v }));
  const clear = (row, id)    => setOv(p => { const n = { ...p }; delete n[row + ":" + id]; return n; });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-2xs uppercase tracking-wider text-dim bg-raised border-b border-bd">
            <th className="text-left font-semibold px-2.5 py-1.5 w-32">
              {tab === "dept" ? "Department" : "Contract type"}
            </th>
            {COLS.map(r => (
              <th key={r.id} className="text-center font-semibold px-2 min-w-[110px]">
                <div>{r.name}</div>
                <div className="font-mono text-faint normal-case tracking-normal font-normal">
                  global: {r.value} {r.unit}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-b border-[var(--grid-line)] last:border-b-0">
              <td className="px-2.5 py-1.5 font-medium">{row.label}</td>
              {COLS.map(r => {
                const val = get(row.key, r.id);
                return (
                  <td key={r.id} className="px-2 text-center py-1.5">
                    {val !== undefined
                      ? <div className="flex items-center justify-center gap-1">
                          <NumInput value={val} min={r.min} max={r.max} onChange={v => set_(row.key, r.id, v)} />
                          <button onClick={() => clear(row.key, r.id)} className="text-faint hover:text-ink text-xs">✕</button>
                        </div>
                      : <button onClick={() => set_(row.key, r.id, r.value)}
                          className="text-2xs text-faint hover:text-ink px-2 py-0.5 border border-transparent hover:border-bd rounded-[2px] transition-colors">
                          — override
                        </button>
                    }
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2.5 py-1.5 border-t border-bd text-2xs text-faint">
        Leave — to inherit the global value. Overrides are validated against the same feasibility checks.
      </p>
    </div>
  );
}

/* National holidays: import from file — see HolidayEditor */
const _NH_REMOVED = {
  DE: { name: "Germany", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-01-06", name:"Epiphany" },
    { date:"2026-04-03", name:"Good Friday" },    { date:"2026-04-06", name:"Easter Monday" },
    { date:"2026-05-01", name:"Labour Day" },     { date:"2026-05-14", name:"Ascension Day" },
    { date:"2026-05-25", name:"Whit Monday" },    { date:"2026-06-04", name:"Corpus Christi" },
    { date:"2026-10-03", name:"German Unity Day" },{ date:"2026-11-01", name:"All Saints Day" },
    { date:"2026-12-25", name:"Christmas Day" },  { date:"2026-12-26", name:"St. Stephen's Day" },
  ]},
  FR: { name: "France", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-04-06", name:"Easter Monday" },
    { date:"2026-05-01", name:"Labour Day" },     { date:"2026-05-08", name:"Victory in Europe Day" },
    { date:"2026-05-14", name:"Ascension Day" },  { date:"2026-05-25", name:"Whit Monday" },
    { date:"2026-07-14", name:"Bastille Day" },   { date:"2026-08-15", name:"Assumption of Mary" },
    { date:"2026-11-01", name:"All Saints' Day" },{ date:"2026-11-11", name:"Armistice Day" },
    { date:"2026-12-25", name:"Christmas Day" },
  ]},
  GB: { name: "United Kingdom", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-04-03", name:"Good Friday" },
    { date:"2026-04-06", name:"Easter Monday" },  { date:"2026-05-04", name:"Early May Bank Holiday" },
    { date:"2026-05-25", name:"Spring Bank Holiday" }, { date:"2026-08-31", name:"Summer Bank Holiday" },
    { date:"2026-12-25", name:"Christmas Day" },  { date:"2026-12-28", name:"Boxing Day (substitute)" },
  ]},
  NL: { name: "Netherlands", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-04-03", name:"Good Friday" },
    { date:"2026-04-06", name:"Easter Monday" },  { date:"2026-04-27", name:"King's Day" },
    { date:"2026-05-14", name:"Ascension Day" },  { date:"2026-05-25", name:"Whit Monday" },
    { date:"2026-12-25", name:"Christmas Day" },  { date:"2026-12-26", name:"Second Christmas Day" },
  ]},
  BE: { name: "Belgium", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-04-06", name:"Easter Monday" },
    { date:"2026-05-01", name:"Labour Day" },     { date:"2026-05-14", name:"Ascension Day" },
    { date:"2026-05-25", name:"Whit Monday" },    { date:"2026-07-21", name:"Belgian National Day" },
    { date:"2026-08-15", name:"Assumption of Mary" }, { date:"2026-11-01", name:"All Saints' Day" },
    { date:"2026-11-11", name:"Armistice Day" },  { date:"2026-12-25", name:"Christmas Day" },
  ]},
  PL: { name: "Poland", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-01-06", name:"Epiphany" },
    { date:"2026-04-06", name:"Easter Monday" },  { date:"2026-05-01", name:"Labour Day" },
    { date:"2026-05-03", name:"Constitution Day" },{ date:"2026-06-04", name:"Corpus Christi" },
    { date:"2026-08-15", name:"Assumption of Mary" }, { date:"2026-11-01", name:"All Saints' Day" },
    { date:"2026-11-11", name:"Independence Day" },{ date:"2026-12-25", name:"Christmas Day" },
    { date:"2026-12-26", name:"St. Stephen's Day" },
  ]},
  SE: { name: "Sweden", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-01-06", name:"Epiphany" },
    { date:"2026-04-03", name:"Good Friday" },    { date:"2026-04-06", name:"Easter Monday" },
    { date:"2026-05-01", name:"Labour Day" },     { date:"2026-05-14", name:"Ascension Day" },
    { date:"2026-06-06", name:"National Day" },   { date:"2026-06-20", name:"Midsummer Day" },
    { date:"2026-10-31", name:"All Saints' Day" },{ date:"2026-12-25", name:"Christmas Day" },
    { date:"2026-12-26", name:"Boxing Day" },
  ]},
  US: { name: "United States", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-01-19", name:"MLK Day" },
    { date:"2026-02-16", name:"Presidents' Day" },{ date:"2026-05-25", name:"Memorial Day" },
    { date:"2026-06-19", name:"Juneteenth" },     { date:"2026-07-03", name:"Independence Day (obs.)" },
    { date:"2026-09-07", name:"Labor Day" },      { date:"2026-10-12", name:"Columbus Day" },
    { date:"2026-11-11", name:"Veterans Day" },   { date:"2026-11-26", name:"Thanksgiving Day" },
    { date:"2026-12-25", name:"Christmas Day" },
  ]},
  ES: { name: "Spain", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-01-06", name:"Epiphany" },
    { date:"2026-04-03", name:"Good Friday" },    { date:"2026-05-01", name:"Labour Day" },
    { date:"2026-08-15", name:"Assumption of Mary" }, { date:"2026-10-12", name:"National Day" },
    { date:"2026-11-01", name:"All Saints' Day" },{ date:"2026-12-06", name:"Constitution Day" },
    { date:"2026-12-08", name:"Immaculate Conception" },{ date:"2026-12-25", name:"Christmas Day" },
  ]},
  IT: { name: "Italy", hols: [
    { date:"2026-01-01", name:"New Year's Day" }, { date:"2026-01-06", name:"Epiphany" },
    { date:"2026-04-06", name:"Easter Monday" },  { date:"2026-04-25", name:"Liberation Day" },
    { date:"2026-05-01", name:"Labour Day" },     { date:"2026-06-02", name:"Republic Day" },
    { date:"2026-08-15", name:"Assumption of Mary" }, { date:"2026-11-01", name:"All Saints' Day" },
    { date:"2026-12-08", name:"Immaculate Conception" },{ date:"2026-12-25", name:"Christmas Day" },
    { date:"2026-12-26", name:"St. Stephen's Day" },
  ]},
};

function HolidayEditor({ holidays, setHolidays }) {
  const [nameInput, setName]      = useState("");
  const [dateInput, setDate]      = useState("");
  const [importMsg, setImportMsg] = useState(null);
  const [showFmts, setShowFmts]  = useState(false);
  const fileRef = useRef();

  const annual = holidays.filter(h => h.annual);
  const once   = holidays.filter(h => !h.annual);

  const parseDate = raw => {
    raw = (raw || "").trim();
    if (/^\d{2}-\d{2}$/.test(raw))       return { date: raw, annual: true  };
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { date: raw, annual: false };
    return null;
  };

  const fmtAnnual = mmdd => {
    try { const [m,d] = mmdd.split("-").map(Number); return new Date(2026,m-1,d).toLocaleDateString("en-GB",{day:"numeric",month:"short"}); }
    catch(e) { return mmdd; }
  };
  const fmtOnce = date => {
    try { return new Date(date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}); }
    catch(e) { return date; }
  };

  /* ---- Format parsers ---- */
  const parseICS = text => {
    const results = [];
    text.split("BEGIN:VEVENT").slice(1).forEach(block => {
      const uf    = block.replace(/\r?\n[ \t]/g, "");
      const lines = uf.split(/\r?\n/);
      const get   = key => { const l = lines.find(l => l.toUpperCase().startsWith(key.toUpperCase())); return l ? l.split(":").slice(1).join(":").trim() : null; };
      let dt = get("DTSTART;VALUE=DATE") || get("DTSTART") || "";
      if (/^\d{8}$/.test(dt)) dt = dt.slice(0,4)+"-"+dt.slice(4,6)+"-"+dt.slice(6,8);
      dt = dt.split("T")[0].replace(/Z$/,"");
      const name   = (get("SUMMARY")||  "").replace(/\\,/g,",").replace(/\\n/g," ").replace(/\\/g,"");
      const annual = (get("RRULE")||"" ).toUpperCase().includes("FREQ=YEARLY");
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) return;
      results.push({ name, date: annual ? dt.slice(5) : dt, annual });
    });
    return { data: results, format: "iCalendar (.ics)" };
  };

  const parseJSONArr = arr => {
    // Nager.Date  { date, localName, name, countryCode, fixed }
    if (arr[0] && arr[0].countryCode !== undefined) return {
      format: "Nager.Date",
      data: arr.map(r => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null;
        return { name: r.localName || r.name || r.date, date: r.fixed ? r.date.slice(5) : r.date, annual: !!r.fixed };
      }).filter(Boolean),
    };
    // OpenHolidays API  { startDate, name:[{language,text}] }
    if (arr[0] && arr[0].startDate !== undefined) return {
      format: "OpenHolidays API",
      data: arr.map(r => {
        if (!r.startDate) return null;
        const nm = Array.isArray(r.name)
          ? ((r.name.find(n => n.language==="EN") || r.name[0] || {}).text || r.startDate)
          : (r.name || r.startDate);
        return { name: nm, date: r.startDate, annual: false };
      }).filter(Boolean),
    };
    // Generic / own format  { date, name }
    return {
      format: "JSON",
      data: arr.map(r => {
        const raw = r.date || r.Date || r.mmdd || ""; const p = parseDate(raw); if (!p) return null;
        return { name: r.name || r.Name || r.label || raw, ...p };
      }).filter(Boolean),
    };
  };

  const parseImport = (text, filename) => {
    const ext = (filename||"").split(".").pop().toLowerCase();
    if (text.trim().startsWith("BEGIN:VCALENDAR") || ext==="ics") return parseICS(text);
    const t = text.trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        let arr = JSON.parse(text);
        if (!Array.isArray(arr)) arr = arr.holidays || arr.items || arr.data || Object.values(arr)[0] || [];
        if (Array.isArray(arr) && arr.length) return parseJSONArr(arr);
      } catch(e) {}
    }
    return { format: "CSV / plain text", data: text.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>{
      const parts = l.split(/,|\t/).map(p=>p.trim()); const p = parseDate(parts[0]); if (!p) return null;
      return { name: parts.slice(1).join(",").trim()||parts[0], ...p };
    }).filter(Boolean) };
  };

  const handleFile = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const { data, format } = parseImport(ev.target.result, file.name);
      if (!data.length) { setImportMsg({ ok:false, text:"No holidays found — check format." }); return; }
      setHolidays(ex => {
        const newOnes = data.filter(p => !ex.some(x => x.date===p.date));
        const skipped = data.length - newOnes.length;
        setImportMsg({ ok:true, text: newOnes.length+" added · "+format+(skipped ? " · "+skipped+" already present" : "") });
        setTimeout(() => setImportMsg(null), 5000);
        return [...ex, ...newOnes].sort((a,b)=>a.date.localeCompare(b.date));
      });
    };
    reader.readAsText(file); e.target.value = "";
  };

  const addManual = () => {
    const p = parseDate(dateInput);
    if (!p) return;
    if (holidays.some(h => h.date === p.date)) return;
    const name = nameInput.trim() || p.date;
    setHolidays(h => [...h, { name, ...p }].sort((a,b) => a.date.localeCompare(b.date)));
    setName(""); setDate("");
  };

  const remove = date => setHolidays(h => h.filter(x => x.date !== date));

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-bd bg-raised flex-wrap">
        <Btn onClick={() => fileRef.current && fileRef.current.click()}>&#8593; Import file</Btn>
        <input ref={fileRef} type="file" accept=".json,.csv,.txt,.ics" style={{display:"none"}} onChange={handleFile} />
        {showFmts && (
          <div className="w-full pt-1 pb-0.5 border-t border-bd mt-1 space-y-0.5">
            {[
              ["iCalendar (.ics)",    "Any country's .ics holiday calendar — government or Google Calendar export"],
              ["Nager.Date JSON",     "date + countryCode + fixed fields — nager.date/api/v3/publicholidays/YEAR/CC"],
              ["OpenHolidays API JSON","startDate + name:[{language,text}] — openholidaysapi.org"],
              ["JSON",               "[{\"date\":\"MM-DD\",\"name\":\"...\"}] — our own simple format"],
              ["CSV / TXT",          "MM-DD,Name or YYYY-MM-DD,Name — one per line, # for comments"],
            ].map(([fmt, hint]) => (
              <div key={fmt} className="flex gap-2 text-2xs">
                <span className="font-mono w-40 shrink-0" style={{color:"var(--st-ok)"}}>{fmt}</span>
                <span className="text-faint">{hint}</span>
              </div>
            ))}
          </div>
        )}

        {importMsg && (
          <span className="text-2xs" style={{color: importMsg.ok ? "var(--st-ok)" : "var(--st-crit)"}}>
            {importMsg.ok ? "\u2713" : "\u26a0"} {importMsg.text}
          </span>
        )}
        <button onClick={() => setShowFmts(f=>!f)}
          className="text-2xs text-faint hover:text-ink ml-auto">formats &#x3F;</button>
      </div>

      {/* Annual */}
      <div className="flex items-center gap-2 px-2.5 py-1 border-b border-bd">
        <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Annual</span>
        <span className="text-2xs text-faint">repeats every year &middot; {annual.length} defined</span>
      </div>
      {annual.length === 0
        ? <p className="px-2.5 py-1.5 text-2xs text-faint">None — add <span className="font-mono">MM-DD</span> below or import a file.</p>
        : annual.map(h => (
            <div key={h.date} className="flex items-center gap-2 px-2.5 py-1 border-b border-[var(--grid-line)]">
              <span className="font-mono text-2xs w-10 text-faint shrink-0">{h.date}</span>
              <span className="text-xs flex-1">{h.name}</span>
              <span className="text-2xs text-faint shrink-0">{fmtAnnual(h.date)}</span>
              <Btn variant="ghost" onClick={() => remove(h.date)}>✕</Btn>
            </div>
          ))
      }

      {/* One-time */}
      <div className="flex items-center gap-2 px-2.5 py-1 border-b border-bd border-t border-t-bd mt-0">
        <span className="text-2xs font-semibold uppercase tracking-wider text-dim">One-time closures</span>
        <span className="text-2xs text-faint">{once.length} defined</span>
      </div>
      {once.length === 0
        ? <p className="px-2.5 py-1.5 text-2xs text-faint">None — add <span className="font-mono">YYYY-MM-DD</span> below for a specific date.</p>
        : once.map(h => (
            <div key={h.date} className="flex items-center gap-2 px-2.5 py-1 border-b border-[var(--grid-line)]">
              <span className="font-mono text-xs w-24 text-faint shrink-0">{h.date}</span>
              <span className="text-xs flex-1">{h.name}</span>
              <span className="text-2xs text-faint shrink-0">{fmtOnce(h.date)}</span>
              <Btn variant="ghost" onClick={() => remove(h.date)}>✕</Btn>
            </div>
          ))
      }

      {/* Manual add */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-bd bg-raised flex-wrap">
        <input value={nameInput} onChange={e => setName(e.target.value)} placeholder="Name (optional)"
          className="text-xs bg-transparent border border-bd rounded-[2px] px-1.5 py-0.5 w-36 outline-none focus:border-[var(--sel)]" />
        <input value={dateInput} onChange={e => setDate(e.target.value)} placeholder="MM-DD or YYYY-MM-DD"
          onKeyDown={e => e.key === "Enter" && addManual()}
          className="font-mono text-xs bg-transparent border border-bd rounded-[2px] px-1.5 py-0.5 w-40 outline-none focus:border-[var(--sel)]" />
        <Btn onClick={addManual}>+ Add</Btn>
        <span className="text-2xs text-faint flex-1">H1 skipped on these dates.</span>
      </div>
    </div>
  );
}

function RulesConfig() {
  const initRules = () => RULE_DEFS.map(r => ({ ...r, status: r.id === "F1" ? "warn" : "on" }));
  const [rules, setRules]           = useState(initRules);
  const [scopeTab, setScopeTab]     = useState("dept");
  const [forbidden, setForbidden]   = useState(() => new Set(["N:E"]));
  const [deptOv, setDeptOv]         = useState({});
  const [contractOv, setContractOv] = useState({});
  const [holidays, setHolidays]     = useState([
    { name: "Christmas Day",  date: "12-25", annual: true },
    { name: "New Year's Day", date: "01-01", annual: true },
  ]);

  const upd = (id, patch) => setRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  const activeCount = rules.filter(r => r.status !== "off").length;
  const warnCount   = rules.filter(r => r.status === "warn").length;
  const offCount    = rules.filter(r => r.status === "off").length;

  const maxHrs  = (rules.find(r => r.id === "H2") || {}).value || 48;
  const minRest = (rules.find(r => r.id === "H3") || {}).value || 11;
  const warns   = [];
  if (minRest > 13) warns.push({ level:"warn", text:"Rest above 13h blocks most shift rotations (e.g. Late→Mid). Expect many infeasible runs." });
  if (maxHrs  < 30) warns.push({ level:"crit", text:"A " + maxHrs + "h/week cap cannot cover weekly demand. Raise the cap or cut required headcounts." });

  return (
    <div className="max-w-3xl space-y-3" data-screen-label="Sysadmin / Rules">

      {/* Health bar */}
      <div className="flex items-center gap-3 px-2.5 py-1.5 border border-bd rounded-[2px] bg-surface">
        <span className="text-xs font-semibold">{rules.length} rules configured</span>
        <span className="w-px h-3 bg-bd shrink-0"></span>
        <span className="text-2xs" style={{ color:"var(--st-ok)" }}>&#9679; {activeCount} active</span>
        {warnCount > 0 && <span className="text-2xs" style={{ color:"var(--st-warn)" }}>&#9888; {warnCount} warn-only</span>}
        {offCount  > 0 && <span className="text-2xs text-faint">&#9675; {offCount} disabled</span>}
        <span className="flex-1"></span>
        <span className="text-2xs text-faint">{forbidden.size} forbidden transitions &middot; {holidays.length} holidays</span>
      </div>

      {/* Column header ghost row */}
      <div className="flex items-center gap-3 px-2.5">
        <span className="text-2xs uppercase tracking-wider text-faint w-[88px] shrink-0">Status</span>
        <span className="text-2xs uppercase tracking-wider text-faint flex-1">Rule</span>
        <span className="text-2xs uppercase tracking-wider text-faint w-28 text-right shrink-0">Value</span>
        <span className="text-2xs uppercase tracking-wider text-faint w-16 text-right shrink-0">Affects</span>
      </div>

      {RULE_GROUPS.map(g => {
        const groupRules = rules.filter(r => r.group === g.id);
        return (
          <Panel key={g.id} title={g.label} pad={false}>
            <div className="flex items-center gap-2 px-2.5 py-1 border-b border-bd bg-raised">
              <span className="w-2 h-2 rounded-[1px] shrink-0" style={{ background: g.color }}></span>
              <span className="text-2xs text-faint">{g.desc}</span>
            </div>
            {groupRules.map(r => (
              <RuleRow key={r.id} rule={r} color={g.color} onUpdate={p => upd(r.id, p)} />
            ))}
          </Panel>
        );
      })}

      {/* Forbidden transitions */}
      <Panel title="Forbidden shift transitions" pad={false}>
        <TransitionEditor shifts={SF.SHIFTS} forbidden={forbidden} setForbidden={setForbidden} />
      </Panel>

      {/* Scope overrides */}
      <Panel title="Scope overrides" pad={false}>
        <div className="flex border-b border-bd px-2.5">
          {["dept","contract"].map(t => (
            <button key={t} onClick={() => setScopeTab(t)}
              className="text-xs px-3 py-1.5 border-b-2 -mb-px transition-colors"
              style={{
                borderColor: scopeTab === t ? "var(--sel)" : "transparent",
                color: scopeTab === t ? "var(--text)" : "var(--text-faint)",
              }}>
              {t === "dept" ? "Departments" : "Contract types"}
            </button>
          ))}
        </div>
        <ScopeOverrides rules={rules} tab={scopeTab}
          deptOv={deptOv} setDeptOv={setDeptOv}
          contractOv={contractOv} setContractOv={setContractOv} />
      </Panel>

      {/* Holidays */}
      <Panel title="Holidays & closures" pad={false}>
        <HolidayEditor holidays={holidays} setHolidays={setHolidays} />
      </Panel>

      {warns.map((w,i) => (
        <Banner key={i} level={w.level}
          title={w.level === "crit" ? "Infeasible configuration" : "This will fight the solver"}>
          {w.text}
        </Banner>
      ))}
      {warns.length === 0 && (
        <Banner level="ok" title="Rules consistent">All hard limits leave the solver enough freedom across 5 departments.</Banner>
      )}
    </div>
  );
}

/* ---- Teams ---- */

/* DeptMembersPanel: defined outside TeamsConfig so React sees a stable reference */
function DeptMembersPanel({ dept, employees, onAdd, onRemove }) {
  const [q, setQ] = useState("");
  const members    = employees.filter(e => (e.depts || [e.dept]).includes(dept.id));
  const nonMembers = employees
    .filter(e => !(e.depts || [e.dept]).includes(dept.id))
    .filter(e => {
      if (!q.trim()) return true;
      const lq = q.toLowerCase();
      return e.name.toLowerCase().includes(lq) || e.id.toLowerCase().includes(lq);
    })
    .slice(0, 8);

  return (
    <div style={{ background: "var(--raised)", borderTop: "1px solid var(--border)" }}>
      {/* Current members */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="text-2xs font-semibold uppercase tracking-wider text-dim mb-1.5">
          Members · {members.length}
        </div>
        <div className="flex flex-wrap gap-1.5 min-h-[24px]">
          {members.length === 0 && (
            <span className="text-2xs text-faint italic">No members yet — search below to add.</span>
          )}
          {members.map(emp => {
            const s = SF.SHIFTS[emp.home];
            return (
              <div key={emp.id}
                className="flex items-center gap-1 pl-1.5 pr-1 py-0.5 border border-bd rounded-[2px] text-2xs"
                style={{ background: "var(--surface)" }}>
                <span className="font-medium leading-none">{emp.name}</span>
                {s && (
                  <span className="font-mono leading-none px-0.5 rounded-[1px]"
                    style={{ background: "var(--sh-"+s.code+"-bg)", color: "var(--sh-"+s.code+"-fg)", fontSize: "9px" }}>
                    {s.code}
                  </span>
                )}
                <button onClick={() => onRemove(emp.id, dept.id)}
                  className="text-faint hover:text-ink ml-0.5 leading-none">✕</button>
              </div>
            );
          })}
        </div>
      </div>
      {/* Typeahead search to add */}
      <div className="px-3 pb-2 border-t border-[var(--grid-line)] pt-1.5 relative">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name or ID to add…"
          className="w-full text-xs bg-transparent border border-bd rounded-[2px] px-1.5 py-0.5 outline-none focus:border-[var(--sel)]"
        />
        {nonMembers.length > 0 && (
          <div className="mt-0.5 border border-bd rounded-[2px] overflow-hidden"
            style={{ background: "var(--surface)", boxShadow: "0 4px 12px rgba(0,0,0,.10)" }}>
            {nonMembers.map(emp => {
              const s = SF.SHIFTS[emp.home];
              const empDepts = (emp.depts || [emp.dept]).map(did => SF.DEPTS.find(d => d.id === did)).filter(Boolean);
              return (
                <div key={emp.id}
                  onClick={() => { onAdd(emp.id, dept.id); setQ(""); }}
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-raised border-b border-[var(--grid-line)] last:border-b-0 transition-colors">
                  <span className="text-xs font-medium flex-1 truncate">{emp.name}</span>
                  <div className="flex gap-0.5 shrink-0">
                    {empDepts.map(d => (
                      <span key={d.id} className="text-faint border border-bd rounded-[2px] px-0.5"
                        style={{ fontSize: "9px", background: "var(--raised)" }}>{d.name}</span>
                    ))}
                  </div>
                  {s && (
                    <span className="font-mono text-2xs px-1 py-0.5 border rounded-[2px] shrink-0"
                      style={{ background: "var(--sh-"+s.code+"-bg)", color: "var(--sh-"+s.code+"-fg)", borderColor: "var(--sh-"+s.code+"-bd)" }}>
                      {s.code}
                    </span>
                  )}
                  <span className="text-2xs font-medium shrink-0" style={{ color: "var(--sel)" }}>+ Add</span>
                </div>
              );
            })}
          </div>
        )}
        {q.trim() && nonMembers.length === 0 && (
          <p className="text-2xs text-faint mt-1 italic">No matches outside this department.</p>
        )}
      </div>
    </div>
  );
}

/* EmployeeModal — full detail + preferred constraints editor */
function EmployeeModal({ emp, onSave, onClose }) {
  const [name,  setName]  = useState(emp.name);
  const [depts, setDepts] = useState(emp.depts || [emp.dept]);
  const [home,  setHome]  = useState(emp.home);
  const [prefs, setPrefs] = useState(() => ({
    nightPref:      "willing",
    weekendPref:    "willing",
    daysOff:        [],
    maxShiftsWeek:  5,
    notes:          "",
    ...(emp.prefs || {}),
  }));
  const setP = (k, v) => setPrefs(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const PREF_OPTS = [
    { v: "willing", label: "Willing" },
    { v: "avoid",   label: "Avoid"   },
    { v: "never",   label: "Never"   },
  ];

  const save = () => onSave({ ...emp, name: name.trim() || emp.name, depts, home, prefs });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.4)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-[2px] border border-bd flex flex-col"
        style={{ background: "var(--surface)", boxShadow: "0 16px 48px rgba(0,0,0,.24)", width: 560, maxHeight: "85vh" }}>

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-bd shrink-0">
          <span className="font-mono text-faint" style={{ fontSize: "10px" }}>{emp.id}</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="text-sm font-semibold flex-1 bg-transparent outline-none border-b border-transparent focus:border-[var(--sel)] pb-px"
          />
          <button onClick={onClose} className="text-faint hover:text-ink">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-auto flex-1 p-4 space-y-4">

          {/* Departments */}
          <div>
            <div className="text-2xs font-semibold uppercase tracking-wider text-dim mb-1.5">Departments</div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {SF.DEPTS.map(d => (
                <label key={d.id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                  <input type="checkbox"
                    checked={depts.includes(d.id)}
                    onChange={e => setDepts(prev =>
                      e.target.checked ? [...prev, d.id] : prev.filter(x => x !== d.id)
                    )} />
                  {d.name}
                </label>
              ))}
            </div>
          </div>

          <div className="h-px" style={{ background: "var(--border)" }}></div>

          {/* Preferred shift */}
          <div>
            <div className="text-2xs font-semibold uppercase tracking-wider text-dim mb-1.5">Preferred shift</div>
            <SelectBox
              value={SF.SHIFTS[home]?.code || ""}
              onChange={v => setHome(SF.SHIFTS.findIndex(s => s.code === v))}
              options={SF.SHIFTS.map(s => ({ v: s.code, label: s.code + " · " + s.name }))}
            />
          </div>

          <div className="h-px" style={{ background: "var(--border)" }}></div>

          {/* Scheduling preferences */}
          <div>
            <div className="text-2xs font-semibold uppercase tracking-wider text-dim mb-0.5">Scheduling preferences</div>
            <p className="text-2xs text-faint mb-3">Feeds solver soft-constraint S2 (preference satisfaction). “Never” is treated as a hard block.</p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="text-xs w-36 shrink-0">Night shifts</span>
                <Seg value={prefs.nightPref} onChange={v => setP("nightPref", v)} options={PREF_OPTS} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs w-36 shrink-0">Weekend work</span>
                <Seg value={prefs.weekendPref} onChange={v => setP("weekendPref", v)} options={PREF_OPTS} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs w-36 shrink-0">Max shifts / week</span>
                <NumInput value={prefs.maxShiftsWeek} min={1} max={7} onChange={v => setP("maxShiftsWeek", v)} />
                <span className="text-2xs text-faint">soft cap — S3 penalises exceeding</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-xs w-36 shrink-0 mt-0.5">Preferred days off</span>
                <div className="flex gap-1">
                  {DAYS.map(d => {
                    const on = prefs.daysOff.includes(d);
                    return (
                      <button key={d}
                        onClick={() => setP("daysOff", on ? prefs.daysOff.filter(x => x !== d) : [...prefs.daysOff, d])}
                        className="font-mono text-2xs px-1.5 py-0.5 border rounded-[2px] transition-colors"
                        style={{
                          background:  on ? "var(--sel)" : "var(--raised)",
                          color:       on ? "#fff"       : "var(--text-dim)",
                          borderColor: on ? "var(--sel)" : "var(--border)",
                        }}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="h-px" style={{ background: "var(--border)" }}></div>

          {/* Notes */}
          <div>
            <div className="text-2xs font-semibold uppercase tracking-wider text-dim mb-1.5">Notes</div>
            <textarea
              value={prefs.notes}
              onChange={e => setP("notes", e.target.value)}
              placeholder="Internal notes visible to leaders and sysadmin…"
              rows={2}
              className="w-full text-xs bg-transparent border border-bd rounded-[2px] px-2 py-1.5 outline-none focus:border-[var(--sel)] resize-y"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-bd bg-raised shrink-0">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save}>Save changes</Btn>
        </div>
      </div>
    </div>
  );
}

function TeamsConfig({ employees, setEmployees }) {
  const fileRef = useRef();

  /* Department leaders — optional; "" = unassigned */
  const [deptLeaders, setDeptLeaders] = useState(() =>
    Object.fromEntries(SF.DEPTS.map(d => [d.id, ""]))
  );

  /* Employees received as props — shared with PreferencesConfig */
  const [expandedDept, setExpandedDept] = useState(null);
  const [search,       setSearch]       = useState("");
  const [filterDept,   setFilterDept]   = useState("all");

  /* Panels & feedback */
  const [panel,         setPanel]         = useState(null);
  const [importMsg,     setImportMsg]     = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null); // { id, name }
  const [editingEmp,    setEditingEmp]    = useState(null); // full emp object

  /* Add-single state — newDepts is an array for multi-dept */
  const [newName,  setNewName]  = useState("");
  const [newDepts, setNewDepts] = useState([SF.DEPTS[0].id]);
  const [newShift, setNewShift] = useState(SF.SHIFTS[2].code);

  /* Bulk-add state */
  const [bulkText,  setBulkText]  = useState("");
  const [bulkDept,  setBulkDept]  = useState(SF.DEPTS[0].id);
  const [bulkShift, setBulkShift] = useState(SF.SHIFTS[2].code);

  const togglePanel = p => setPanel(prev => prev === p ? null : p);

  /* Dept membership helpers */
  const addToDept = (empId, deptId) =>
    setEmployees(prev => prev.map(e =>
      e.id === empId ? { ...e, depts: [...new Set([...e.depts, deptId])] } : e
    ));
  const removeFromDept = (empId, deptId) =>
    setEmployees(prev => prev.map(e =>
      e.id === empId ? { ...e, depts: e.depts.filter(d => d !== deptId) } : e
    ));

  /* Leader options: — None + members of that dept */
  const leaderOptions = deptId => [
    { v: "", label: "— None" },
    ...employees.filter(e => e.depts.includes(deptId)).map(e => ({ v: e.id, label: e.name })),
  ];

  /* Filtered list */
  const visibleEmps = useMemo(() => {
    let list = employees;
    if (filterDept !== "all") list = list.filter(e => e.depts.includes(filterDept));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    }
    return list;
  }, [employees, search, filterDept]);

  /* ---- Add single ---- */
  const addSingle = () => {
    if (!newName.trim() || !newDepts.length) return;
    const primaryDept = SF.DEPTS.find(d => d.id === newDepts[0]);
    const shiftIdx    = SF.SHIFTS.findIndex(s => s.code === newShift);
    setEmployees(prev => [...prev, {
      i: prev.length,
      id: "E" + (200 + prev.length),
      name: newName.trim(),
      dept: newDepts[0],
      deptName: primaryDept?.name || newDepts[0],
      depts: [...newDepts],
      home: shiftIdx >= 0 ? shiftIdx : 2,
      prefs: { ...DEFAULT_PREFS },
    }]);
    setNewName(""); setNewDepts([SF.DEPTS[0].id]); setPanel(null);
  };

  /* ---- Bulk add (textarea) ---- */
  const addMultiple = () => {
    const lines = bulkText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const parsed = lines.map(line => {
      const parts    = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => p.trim().replace(/^"|"$/g, ""));
      const name     = parts[0]; if (!name) return null;
      const deptRaw  = (parts[1] || "").toLowerCase();
      const deptObj  = SF.DEPTS.find(d => d.id === deptRaw || d.name.toLowerCase() === deptRaw) ||
                       SF.DEPTS.find(d => d.id === bulkDept);
      const shiftRaw = (parts[2] || "").toUpperCase();
      const shiftObj = SF.SHIFTS.find(s => s.code === shiftRaw);
      const shiftIdx = shiftObj ? SF.SHIFTS.indexOf(shiftObj) : SF.SHIFTS.findIndex(s => s.code === bulkShift);
      return { name, dept: deptObj.id, deptName: deptObj.name, depts: [deptObj.id], home: shiftIdx >= 0 ? shiftIdx : 2, prefs: { ...DEFAULT_PREFS } };
    }).filter(Boolean);
    setEmployees(prev => [
      ...prev,
      ...parsed.map((e, k) => ({ ...e, i: prev.length + k, id: "E" + (200 + prev.length + k) })),
    ]);
    setBulkText(""); setPanel(null);
  };

  /* ---- File import (CSV / TSV / JSON) ---- */
  const parseImportFile = (text) => {
    const t = text.trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        let arr = JSON.parse(text);
        if (!Array.isArray(arr)) arr = arr.employees || arr.staff || arr.data || [];
        const data = arr.map(r => {
          const name = (r.name || r.full_name ||
            ([r.first_name, r.last_name].filter(Boolean).join(" ")) || r.employee || "").trim();
          if (!name) return null;
          const deptRaw  = (r.dept || r.department || r.team || "").toLowerCase();
          const deptObj  = SF.DEPTS.find(d => d.id === deptRaw || d.name.toLowerCase() === deptRaw) || SF.DEPTS[0];
          const shiftRaw = (r.shift || r.preferred_shift || r.home_shift || r.homeShift || "").toUpperCase();
          const shiftObj = SF.SHIFTS.find(s => s.code === shiftRaw);
          return { name, dept: deptObj.id, deptName: deptObj.name, depts: [deptObj.id], home: shiftObj ? SF.SHIFTS.indexOf(shiftObj) : 2, prefs: { ...DEFAULT_PREFS } };
        }).filter(Boolean);
        return { format: "JSON", data };
      } catch(e) {}
    }
    const sep      = text.includes("\t") ? "\t" : ",";
    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    if (!rawLines.length) return { format: "CSV", data: [] };
    const firstLow  = rawLines[0].toLowerCase();
    const hasHeader = ["name","employee","first","last","staff"].some(k => firstLow.includes(k));
    const headers   = hasHeader ? rawLines[0].split(sep).map(h => h.replace(/^"|"$/g,"").trim().toLowerCase()) : [];
    const dataRows  = hasHeader ? rawLines.slice(1) : rawLines;
    const ci = (...keys) => { for (const k of keys) { const i = headers.findIndex(h => h.includes(k)); if (i >= 0) return i; } return -1; };
    const nameI  = headers.length ? (ci("name","employee","full","first") >= 0 ? ci("name","employee","full","first") : 0) : 0;
    const lastI  = ci("last");
    const deptI  = ci("dept","department","team","group");
    const shiftI = ci("shift","preferred","home");
    const data = dataRows.map(line => {
      const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g,""));
      let name = cols[nameI] || "";
      if (lastI >= 0 && cols[lastI]) name = (name + " " + cols[lastI]).trim();
      if (!name) return null;
      const deptRaw  = (deptI >= 0 ? cols[deptI] : "").toLowerCase();
      const deptObj  = SF.DEPTS.find(d => d.id === deptRaw || d.name.toLowerCase() === deptRaw) || SF.DEPTS[0];
      const shiftRaw = (shiftI >= 0 ? cols[shiftI] : "").toUpperCase();
      const shiftObj = SF.SHIFTS.find(s => s.code === shiftRaw);
      return { name, dept: deptObj.id, deptName: deptObj.name, depts: [deptObj.id], home: shiftObj ? SF.SHIFTS.indexOf(shiftObj) : 2, prefs: { ...DEFAULT_PREFS } };
    }).filter(Boolean);
    return { format: "CSV", data };
  };

  const handleFile = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const { data, format } = parseImportFile(ev.target.result);
      if (!data.length) {
        setImportMsg({ ok: false, text: "No employees found — check format." });
        setTimeout(() => setImportMsg(null), 5000); return;
      }
      setEmployees(prev => {
        const existingNames = new Set(prev.map(e => e.name.toLowerCase()));
        const newOnes = data.filter(e => !existingNames.has(e.name.toLowerCase()));
        const skipped = data.length - newOnes.length;
        const base    = prev.length;
        const added   = newOnes.map((e, k) => ({ ...e, i: base + k, id: "E" + (200 + base + k) }));
        setImportMsg({ ok: true, text: added.length + " imported · " + format + (skipped ? " · " + skipped + " skipped (duplicate)" : "") });
        setTimeout(() => setImportMsg(null), 6000);
        return [...prev, ...added];
      });
    };
    reader.readAsText(file); e.target.value = "";
  };

  const confirmAndRemove = () => {
    if (!confirmRemove) return;
    setEmployees(prev => prev.filter(e => e.id !== confirmRemove.id));
    setConfirmRemove(null);
  };

  const saveEmpEdits = updated => {
    setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
    setEditingEmp(null);
  };

  const bulkLineCount = bulkText.split(/\r?\n/).filter(l => l.trim()).length;

  return (
    <div className="max-w-3xl space-y-3" data-screen-label="Sysadmin / Teams">

      {/* ---- Employee detail modal ---- */}
      {editingEmp && (
        <EmployeeModal
          emp={editingEmp}
          onSave={saveEmpEdits}
          onClose={() => setEditingEmp(null)}
        />
      )}

      {/* ---- Confirm remove modal ---- */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,.35)" }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmRemove(null); }}>
          <div className="border border-bd rounded-[2px] p-4 w-72"
            style={{ background: "var(--surface)", boxShadow: "0 8px 32px rgba(0,0,0,.20)" }}>
            <p className="text-sm font-semibold mb-1">Remove employee?</p>
            <p className="text-xs text-dim mb-4">
              <span className="font-medium" style={{ color: "var(--text)" }}>{confirmRemove.name}</span> will be
              removed from the roster and all departments. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setConfirmRemove(null)}>Cancel</Btn>
              <Btn onClick={confirmAndRemove}
                style={{ background: "var(--st-crit)", color: "#fff", borderColor: "var(--st-crit)" }}>
                Remove
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ---- Departments ---- */}
      <Panel title="Departments" pad={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-dim bg-raised border-b border-bd">
              <th className="text-left font-semibold px-2.5 py-1.5">Department</th>
              <th className="text-right font-semibold px-2">Staff ▸</th>
              <th className="text-left font-semibold px-2 min-w-[200px]">
                Team leader <span className="ml-1 normal-case font-normal text-faint">optional</span>
              </th>
              <th className="text-right font-semibold px-2.5">Night-eligible</th>
            </tr>
          </thead>
          <tbody>
            {SF.DEPTS.map(d => {
              const members    = employees.filter(e => e.depts.includes(d.id));
              const isExpanded = expandedDept === d.id;
              return (
                <Fragment key={d.id}>
                  <tr className="border-b border-[var(--grid-line)]"
                    style={isExpanded ? { background: "var(--raised)" } : {}}>
                    <td className="px-2.5 py-1 font-medium">{d.name}</td>
                    <td className="px-2 text-right">
                      <button
                        onClick={() => setExpandedDept(prev => prev === d.id ? null : d.id)}
                        className="font-mono text-xs flex items-center gap-1 ml-auto transition-colors hover:text-ink"
                        style={{ color: isExpanded ? "var(--text)" : "var(--text-dim)" }}>
                        {members.length}
                        <span className="text-2xs">{isExpanded ? "▾" : "▸"}</span>
                      </button>
                    </td>
                    <td className="px-2 py-1">
                      <SelectBox
                        value={deptLeaders[d.id] || ""}
                        onChange={v => setDeptLeaders(prev => ({ ...prev, [d.id]: v }))}
                        options={leaderOptions(d.id)}
                      />
                    </td>
                    <td className="px-2.5 text-right font-mono text-dim">
                      {Math.round(members.length * 0.6)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={4} className="p-0">
                        <DeptMembersPanel
                          dept={d}
                          employees={employees}
                          onAdd={addToDept}
                          onRemove={removeFromDept}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        <div className="px-2.5 py-1.5 border-t border-bd">
          <Btn variant="ghost">+ Add department</Btn>
        </div>
      </Panel>

      {/* ---- Employee roster ---- */}
      <Panel title={"Employee roster · " + employees.length} pad={false}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-bd bg-raised flex-wrap">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or ID…"
            className="text-xs bg-transparent border border-bd rounded-[2px] px-1.5 py-0.5 w-40 outline-none focus:border-[var(--sel)]"
          />
          <SelectBox
            value={filterDept}
            onChange={setFilterDept}
            options={[{ v: "all", label: "All depts" }, ...SF.DEPTS.map(d => ({ v: d.id, label: d.name }))]}
          />
          <span className="flex-1"></span>
          <Btn onClick={() => fileRef.current && fileRef.current.click()}>&#8593; Import file</Btn>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json" style={{ display: "none" }} onChange={handleFile} />
          <Btn onClick={() => togglePanel("addMulti")}
            style={{ background: panel === "addMulti" ? "var(--raised)" : undefined }}>
            + Bulk add
          </Btn>
          <Btn variant="primary" onClick={() => togglePanel("addSingle")}>+ Add employee</Btn>
        </div>

        {importMsg && (
          <div className="px-2.5 py-1 border-b border-bd">
            <span className="text-2xs" style={{ color: importMsg.ok ? "var(--st-ok)" : "var(--st-crit)" }}>
              {importMsg.ok ? "✓" : "⚠"} {importMsg.text}
            </span>
          </div>
        )}

        {/* Add single */}
        {panel === "addSingle" && (
          <div className="px-2.5 py-2 border-b border-bd bg-surface space-y-2"
            style={{ borderLeft: "2px solid var(--sel)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xs font-semibold uppercase tracking-wider text-dim shrink-0">New employee</span>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addSingle()}
                placeholder="Full name"
                autoFocus
                className="text-xs bg-transparent border border-bd rounded-[2px] px-1.5 py-0.5 w-44 outline-none focus:border-[var(--sel)]"
              />
              <SelectBox value={newShift} onChange={setNewShift}
                options={SF.SHIFTS.map(s => ({ v: s.code, label: s.code + " · " + s.name }))} />
            </div>
            <div>
              <span className="text-2xs text-dim block mb-1">Departments</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {SF.DEPTS.map(d => (
                  <label key={d.id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input type="checkbox"
                      checked={newDepts.includes(d.id)}
                      onChange={e => setNewDepts(prev =>
                        e.target.checked ? [...prev, d.id] : prev.filter(x => x !== d.id)
                      )} />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5">
              <Btn variant="primary" disabled={!newName.trim() || !newDepts.length} onClick={addSingle}>Add</Btn>
              <Btn variant="ghost" onClick={() => { setPanel(null); setNewName(""); setNewDepts([SF.DEPTS[0].id]); }}>Cancel</Btn>
            </div>
          </div>
        )}

        {/* Bulk add */}
        {panel === "addMulti" && (
          <div className="px-2.5 py-2 border-b border-bd bg-surface space-y-2"
            style={{ borderLeft: "2px solid var(--sel)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Bulk add</span>
              <span className="text-2xs text-faint flex-1">Default dept &amp; shift for rows without values</span>
              <SelectBox value={bulkDept} onChange={setBulkDept}
                options={SF.DEPTS.map(d => ({ v: d.id, label: d.name }))} />
              <SelectBox value={bulkShift} onChange={setBulkShift}
                options={SF.SHIFTS.map(s => ({ v: s.code, label: s.code + " · " + s.name }))} />
            </div>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={"One name per line — or include dept and shift:\n\nJohn Smith\nJane Doe, prodB, E\nAlice Johnson, qa, M"}
              rows={5}
              className="w-full text-xs bg-transparent border border-bd rounded-[2px] px-2 py-1.5 outline-none focus:border-[var(--sel)] resize-y"
              style={{ fontFamily: "var(--font-mono)" }}
            />
            <div className="flex items-center gap-1.5">
              {bulkLineCount > 0 && (
                <span className="text-2xs text-faint flex-1">
                  {bulkLineCount} {bulkLineCount === 1 ? "employee" : "employees"} to add
                </span>
              )}
              <Btn variant="primary" disabled={!bulkText.trim()} onClick={addMultiple}>Add all</Btn>
              <Btn variant="ghost" onClick={() => { setPanel(null); setBulkText(""); }}>Cancel</Btn>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-auto" style={{ maxHeight: 340 }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-dim bg-raised border-b border-bd"
                style={{ position: "sticky", top: 0 }}>
                <th className="text-left font-semibold px-2.5 py-1.5 w-14">ID</th>
                <th className="text-left font-semibold px-2">Name</th>
                <th className="text-left font-semibold px-2">Departments</th>
                <th className="text-left font-semibold px-2">Preferred shift</th>
                <th className="w-8 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibleEmps.map(emp => {
                const shiftObj = SF.SHIFTS[emp.home];
                return (
                  <tr key={emp.id}
                    onClick={() => setEditingEmp(emp)}
                    className="border-b border-[var(--grid-line)] last:border-b-0 group hover:bg-raised transition-colors cursor-pointer">
                    <td className="px-2.5 py-1 font-mono text-faint" style={{ fontSize: "10px" }}>{emp.id}</td>
                    <td className="px-2 font-medium whitespace-nowrap">{emp.name}</td>
                    <td className="px-2 py-1">
                      <div className="flex flex-wrap gap-1">
                        {emp.depts.map(did => {
                          const d = SF.DEPTS.find(x => x.id === did);
                          return d ? (
                            <span key={did} className="text-2xs px-1 py-0.5 border border-bd rounded-[2px]"
                              style={{ background: "var(--raised)" }}>{d.name}</span>
                          ) : null;
                        })}
                      </div>
                    </td>
                    <td className="px-2">
                      {shiftObj && (
                        <span className="font-mono text-2xs px-1.5 py-0.5 border rounded-[2px] whitespace-nowrap"
                          style={{
                            background:  "var(--sh-"+shiftObj.code+"-bg)",
                            color:       "var(--sh-"+shiftObj.code+"-fg)",
                            borderColor: "var(--sh-"+shiftObj.code+"-bd)",
                          }}>
                          {shiftObj.code} {shiftObj.name}
                        </span>
                      )}
                    </td>
                    <td className="px-2">
                      <Btn variant="ghost"
                        onClick={e => { e.stopPropagation(); setConfirmRemove({ id: emp.id, name: emp.name }); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity">✕</Btn>
                    </td>
                  </tr>
                );
              })}
              {visibleEmps.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2.5 py-4 text-2xs text-faint text-center">
                    No employees match — adjust search or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(search || filterDept !== "all") && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-bd">
            <span className="text-2xs text-faint">{visibleEmps.length} of {employees.length} shown</span>
            <Btn variant="ghost" onClick={() => { setSearch(""); setFilterDept("all"); }}>Clear filter</Btn>
          </div>
        )}
      </Panel>

      {/* ---- Import format guide ---- */}
      <Panel title="Import formats" pad={false}>
        <div className="px-2.5 py-2 space-y-2">
          {[
            ["CSV", "name, department, preferred_shift — one row per employee. Header auto-detected. Dept accepts ID (prodA) or full name."],
            ["TSV", "Same as CSV but tab-separated. Export from Excel / Google Sheets as .tsv or .txt."],
            ["JSON", '[{"name":"…","dept":"prodA","shift":"M"}] — also accepts first_name/last_name split and camelCase keys.'],
          ].map(([fmt, hint]) => (
            <div key={fmt} className="flex gap-3 text-2xs leading-relaxed">
              <span className="font-mono w-10 shrink-0 mt-0.5" style={{ color: "var(--st-ok)" }}>{fmt}</span>
              <span className="text-faint">{hint}</span>
            </div>
          ))}
        </div>
        <div className="px-2.5 py-1.5 border-t border-bd">
          <button className="text-2xs hover:underline" style={{ color: "var(--sel)" }}
            onClick={() => {
              const csv = "name,department,preferred_shift\nJohn Smith,prodA,M\nJane Doe,qa,E\nAlex Turner,maint,N";
              const blob = new Blob([csv], { type: "text/csv" });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href = url; a.download = "employees_template.csv"; a.click();
              URL.revokeObjectURL(url);
            }}>
            &#8595; Download CSV template
          </button>
        </div>
      </Panel>

      <p className="text-2xs text-faint max-w-md">
        Night-eligible counts feed pre-flight feasibility checks — a day's Night requirement is flagged if qualified staff on shift fall short.
      </p>
    </div>
  );
}

/* ---- Permissions ---- */
function PermsConfig() {
  const CAPS = ["View all schedules", "Pin / seed cells", "Trigger generation", "Approve requests", "Manual override", "Edit shift definitions", "Tune solver weights"];
  const [grid, setGrid] = useState({
    Member: [false, false, false, false, false, false, false],
    Leader: [true, true, true, true, true, false, false],
    Sysadmin: [true, true, true, true, true, true, true],
  });
  return (
    <div className="max-w-xl" data-screen-label="Sysadmin / Permissions">
      <Panel title="Role permissions" pad={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-dim bg-raised border-b border-bd">
              <th className="text-left font-semibold px-2.5 py-1.5">Capability</th>
              {Object.keys(grid).map((r) => <th key={r} className="font-semibold px-2 text-center w-20">{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {CAPS.map((c, ci) => (
              <tr key={c} className="border-b border-[var(--grid-line)] last:border-b-0">
                <td className="px-2.5 py-1">{c}</td>
                {Object.keys(grid).map((r) => (
                  <td key={r} className="text-center">
                    <Check checked={grid[r][ci]} disabled={r === "Sysadmin"}
                      onChange={(v) => setGrid((g) => ({ ...g, [r]: g[r].map((x, k) => (k === ci ? v : x)) }))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-2.5 py-1.5 border-t border-bd text-2xs text-faint">Members always see their own schedule and can submit requests — that's not revocable.</p>
      </Panel>
    </div>
  );
}

/* ---- Solver weights ---- */
const PRESETS = {
  Balanced: [8, 6, 4, 5, 3],
  "Fair for all": [10, 5, 2, 6, 3],
  "Keep it steady": [5, 4, 9, 4, 5],
};
const LEVEL_LABELS = ["Off", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Very important"];
function WeightsConfig() {
  const [w, setW] = useState(() => SF.SOFT.map((s) => s.weight));
  const preset = Object.keys(PRESETS).find((k) => PRESETS[k].every((v, i) => v === w[i])) || "Custom";
  return (
    <div className="max-w-2xl space-y-3" data-screen-label="Sysadmin / Weights">
      <p className="text-xs text-faint">Drag the sliders to tell the scheduler what matters most. Higher = more important. Changes take effect on the next schedule run.</p>
      <div className="flex items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Quick set</span>
        <Seg value={preset} onChange={(v) => v !== "Custom" && setW([...PRESETS[v]])}
          options={[...Object.keys(PRESETS).map((k) => ({ v: k, label: k })), ...(preset === "Custom" ? [{ v: "Custom", label: "Custom" }] : [])]} />
      </div>
      <Panel title="What should the schedule care about?" pad={false}>
        {SF.SOFT.map((s, i) => (
          <div key={s.id} className="px-2.5 py-2.5 border-b border-[var(--grid-line)] last:border-b-0">
            <div className="flex items-center gap-2.5 mb-1">
              <span className="text-xs font-semibold flex-1">{s.name}</span>
              <span className="text-2xs font-semibold px-2 py-0.5 rounded-[2px] min-w-[80px] text-center"
                style={{ background: w[i] === 0 ? "var(--raised)" : w[i] >= 8 ? "var(--st-ok-bg)" : "var(--raised)",
                         color: w[i] === 0 ? "var(--text-faint)" : w[i] >= 8 ? "var(--st-ok)" : "var(--text-dim)" }}>
                {w[i] === 0 ? "Not used" : w[i] >= 8 ? "Very important" : w[i] >= 5 ? "Important" : "Nice to have"}
              </span>
            </div>
            <p className="text-2xs text-faint mb-2">{s.blurb}</p>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-faint w-12 text-right">Not used</span>
              <input type="range" min={0} max={10} step={1} value={w[i]}
                onChange={(e) => setW((a) => a.map((x, k) => (k === i ? Number(e.target.value) : x)))}
                className="flex-1" />
              <span className="text-2xs text-faint w-16">Must have</span>
            </div>
            {w[i] === 0 && <p className="text-2xs mt-1" style={{ color: "var(--st-warn)" }}>&#9888; Turned off — the scheduler will ignore this completely.</p>}
          </div>
        ))}
      </Panel>
      <Banner level={w[2] >= 8 ? "warn" : "ok"} title={w[2] >= 8 ? "Heads up: stability is turned up very high" : "Looking good"}>
        {w[2] >= 8
          ? "When \u201cKeep things stable\u201d is set this high, the scheduler will resist fixing unfair shifts just to avoid making changes. Is that what you want?"
          : "These priorities look well-balanced. The scheduler will do its best to honour all of them when building the next schedule."}
      </Banner>
    </div>
  );
}

/* ---- Employee preferences (bulk editor) ---- */
function PreferencesConfig({ employees, setEmployees }) {
  const [search,     setSearch]     = useState("");
  const [filterDept, setFilterDept] = useState("all");

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const PREF_OPTS = [
    { v: "willing", label: "OK"    },
    { v: "avoid",   label: "Avoid" },
    { v: "never",   label: "Never" },
  ];

  const setEmpPref = (id, k, v) =>
    setEmployees(prev => prev.map(e =>
      e.id === id ? { ...e, prefs: { ...(e.prefs || DEFAULT_PREFS), [k]: v } } : e
    ));

  const toggleDay = (id, day) =>
    setEmployees(prev => prev.map(e => {
      if (e.id !== id) return e;
      const cur = e.prefs?.daysOff || [];
      return { ...e, prefs: { ...(e.prefs || DEFAULT_PREFS), daysOff: cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day] } };
    }));

  const visible = useMemo(() => {
    let list = employees;
    if (filterDept !== "all") list = list.filter(e => (e.depts || [e.dept]).includes(filterDept));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    }
    return list;
  }, [employees, search, filterDept]);

  return (
    <div className="space-y-3" data-screen-label="Sysadmin / Preferences">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or ID…"
          className="text-xs bg-transparent border border-bd rounded-[2px] px-1.5 py-0.5 w-40 outline-none focus:border-[var(--sel)]"
        />
        <SelectBox
          value={filterDept}
          onChange={setFilterDept}
          options={[{ v: "all", label: "All departments" }, ...SF.DEPTS.map(d => ({ v: d.id, label: d.name }))]}
        />
        {(search || filterDept !== "all") && (
          <Btn variant="ghost" onClick={() => { setSearch(""); setFilterDept("all"); }}>Clear</Btn>
        )}
        <span className="text-2xs text-faint ml-auto">{visible.length} of {employees.length} employees</span>
      </div>

      <Panel title="Scheduling preferences" pad={false}>
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 196px)" }}>
          <table className="text-xs" style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%" }}>
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-dim bg-raised border-b border-bd"
                style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <th className="text-left font-semibold px-2.5 py-1.5" style={{ minWidth: 160 }}>Employee</th>
                <th className="text-left font-semibold px-2.5" style={{ minWidth: 160 }}>Departments</th>
                <th className="text-left font-semibold px-2" style={{ minWidth: 148 }}>Night shifts</th>
                <th className="text-left font-semibold px-2" style={{ minWidth: 148 }}>Weekend work</th>
                <th className="text-center font-semibold px-2" style={{ minWidth: 64 }}>Max/wk</th>
                <th className="text-left font-semibold px-2" style={{ minWidth: 170 }}>
                  Days off <span className="normal-case font-normal text-faint">preferred</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(emp => {
                const p = emp.prefs || DEFAULT_PREFS;
                return (
                  <tr key={emp.id} className="border-b border-[var(--grid-line)] hover:bg-raised transition-colors">
                    <td className="px-2.5 py-1 font-medium whitespace-nowrap">{emp.name}</td>
                    <td className="px-2.5 py-1">
                      <div className="flex flex-wrap gap-0.5">
                        {(emp.depts || [emp.dept]).map(did => {
                          const d = SF.DEPTS.find(x => x.id === did);
                          return d ? (
                            <span key={did} className="text-faint border border-bd rounded-[2px] px-0.5"
                              style={{ fontSize: "9px", background: "var(--raised)" }}>{d.name}</span>
                          ) : null;
                        })}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <Seg value={p.nightPref || "willing"} onChange={v => setEmpPref(emp.id, "nightPref", v)} options={PREF_OPTS} />
                    </td>
                    <td className="px-2 py-1">
                      <Seg value={p.weekendPref || "willing"} onChange={v => setEmpPref(emp.id, "weekendPref", v)} options={PREF_OPTS} />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <NumInput value={p.maxShiftsWeek || 5} min={1} max={7} onChange={v => setEmpPref(emp.id, "maxShiftsWeek", v)} />
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex gap-0.5">
                        {DAYS.map(day => {
                          const on = (p.daysOff || []).includes(day);
                          return (
                            <button key={day} onClick={() => toggleDay(emp.id, day)}
                              className="font-mono text-2xs border rounded-[2px] transition-colors"
                              style={{
                                width: 20, height: 20, flexShrink: 0,
                                background:  on ? "var(--sel)" : "var(--raised)",
                                color:       on ? "#fff"       : "var(--text-dim)",
                                borderColor: on ? "var(--sel)" : "var(--border)",
                              }}>
                              {day[0]}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2.5 py-4 text-2xs text-faint text-center">No employees match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-2xs text-faint max-w-lg">Preferences feed solver soft-constraint S2. Changes sync with each employee's detail modal in Teams &amp; structure.</p>
    </div>
  );
}

export default AdminSurface;
