/* Sysadmin surface: shift definitions, rules, teams, permissions, solver weights.
   Validation is computed live so infeasible configs warn immediately. */
const AdminSurface = (() => {
  const { useState, useMemo } = React;

  const SECTIONS = [
    { v: "shifts", label: "Shift definitions" },
    { v: "rules", label: "Scheduling rules" },
    { v: "teams", label: "Teams & structure" },
    { v: "perms", label: "Role permissions" },
    { v: "weights", label: "Solver weights" },
  ];

  function AdminSurface({ app, dispatch }) {
    const section = app.adminSection || "shifts";
    const meta = SECTIONS.find((s) => s.v === section) || SECTIONS[0];
    return (
      <div className="flex-1 flex flex-col min-h-0" data-screen-label="Sysadmin">
        <PageHeader title={meta.label} subtitle="Changes apply to the next solver run · Sysadmin" />
        <div className="flex-1 overflow-auto p-3">
          {section === "shifts"  && <ShiftConfig />}
          {section === "rules"   && <RulesConfig />}
          {section === "teams"   && <TeamsConfig />}
          {section === "perms"   && <PermsConfig />}
          {section === "weights" && <WeightsConfig />}
        </div>
      </div>
    );
  }

  /* ---- Shift definitions + live feasibility math ---- */
  function ShiftConfig() {
    const [rows, setRows] = useState(() => SF.SHIFTS.map((s) => ({ ...s })));
    const upd = (i, patch) => setRows((r) => r.map((row, k) => (k === i ? { ...row, ...patch } : row)));

    const requiredPD = rows.reduce((a, r) => a + (r.req || 0), 0) * 7;
    const capacityPD = 100 * 5; // 100 staff × 5 workdays
    const pct = Math.round((requiredPD / capacityPD) * 100);
    const level = requiredPD > capacityPD ? "crit" : pct >= 95 ? "warn" : "ok";

    return (
      <div className="max-w-3xl space-y-3" data-screen-label="Sysadmin / Shifts">
        <Panel title="Shift definitions" pad={false}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-dim bg-raised border-b border-bd">
                <th className="text-left font-semibold px-2.5 py-1.5">Shift</th>
                <th className="text-left font-semibold px-2">Start</th>
                <th className="text-left font-semibold px-2">End</th>
                <th className="text-right font-semibold px-2" title="Hard constraint H1">Required</th>
                <th className="text-right font-semibold px-2" title="Max assignable">Capacity</th>
                <th className="text-right font-semibold px-2.5">Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const overCap = r.req > r.cap;
                return (
                  <tr key={r.code} className="border-b border-[var(--grid-line)] last:border-b-0">
                    <td className="px-2.5 py-1">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-4 h-4 flex items-center justify-center font-mono text-2xs font-semibold border"
                          style={{ background: "var(--sh-" + r.code + "-bg)", color: "var(--sh-" + r.code + "-fg)", borderColor: "var(--sh-" + r.code + "-bd)" }}>{r.code}</span>
                        <TextInput value={r.name} onChange={(v) => upd(i, { name: v })} className="w-24" />
                      </span>
                    </td>
                    <td className="px-2 font-mono text-dim">{SF.hh(r.start)}</td>
                    <td className="px-2 font-mono text-dim">{SF.hh(r.end)}{r.end > 24 && <span className="text-2xs text-faint"> +1d</span>}</td>
                    <td className="px-2 text-right">
                      <NumInput value={r.req} min={0} max={40} onChange={(v) => upd(i, { req: v })}
                        className={overCap ? "!border-[var(--st-crit)]" : undefined} />
                    </td>
                    <td className="px-2 text-right"><NumInput value={r.cap} min={0} max={40} onChange={(v) => upd(i, { cap: v })} /></td>
                    <td className="px-2.5 text-right font-mono text-dim">{r.end - r.start}h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-2.5 py-1.5 border-t border-bd text-2xs text-faint">
            Coverage is hard constraint H1. Overlaps (1h between adjacent shifts) are intentional handover windows.
          </p>
        </Panel>

        {level === "crit" && (
          <Banner level="crit" title="Mathematically infeasible — the solver cannot satisfy this">
            Required staffing is <b className="font-mono">{requiredPD}</b> person-days/week, but 100 staff × 5 workdays
            gives only <b className="font-mono">{capacityPD}</b>. Lower required headcounts by at least
            <b className="font-mono"> {Math.ceil((requiredPD - capacityPD) / 7)}</b> per day, hire, or allow 6-day weeks.
          </Banner>
        )}
        {level === "warn" && (
          <Banner level="warn" title={"Tight: " + requiredPD + " of " + capacityPD + " person-days used (" + pct + "%)"}>
            Feasible, but with almost no slack the solver will trade away soft constraints (fairness, preferences)
            and any sick day forces a violation. 90% or less is comfortable.
          </Banner>
        )}
        {level === "ok" && (
          <Banner level="ok" title={"Feasible: " + requiredPD + " of " + capacityPD + " person-days used (" + pct + "%)"}>
            Headcount requirements fit the available workforce with slack for absences.
          </Banner>
        )}
      </div>
    );
  }

  /* ---- Global rules ---- */
  function RulesConfig() {
    const [maxWeek, setMaxWeek] = useState(48);
    const [minRest, setMinRest] = useState(11);
    const [maxConsec, setMaxConsec] = useState(6);
    const warns = [];
    if (minRest > 18) warns.push({ level: "crit", text: "With 5–6h shifts, rest above 18h makes consecutive workdays impossible — no weekly pattern can exist." });
    else if (minRest > 13) warns.push({ level: "warn", text: "Rest above 13h blocks most shift-to-shift rotations (e.g. Late→Mid). Expect many infeasible runs." });
    if (maxWeek < 30) warns.push({ level: "crit", text: "A 30h cap × 100 staff cannot cover " + (70 * 7 * 6) + "h of weekly demand. Raise the cap or required headcounts must drop." });
    return (
      <div className="max-w-xl space-y-3" data-screen-label="Sysadmin / Rules">
        <Panel title="Hard limits (apply to everyone)">
          <div className="space-y-3">
            <Field row label="Max hours / week" hint="">
              <NumInput value={maxWeek} min={8} max={80} onChange={setMaxWeek} />
              <span className="text-2xs text-faint">H2 — hard. EU working-time style cap; counted per ISO week.</span>
            </Field>
            <Field row label="Min rest between shifts">
              <NumInput value={minRest} min={0} max={24} onChange={setMinRest} />
              <span className="text-2xs text-faint">H3 — hard. Hours between one shift's end and the next one's start.</span>
            </Field>
            <Field row label="Max consecutive workdays">
              <NumInput value={maxConsec} min={1} max={14} onChange={setMaxConsec} />
              <span className="text-2xs text-faint">H6 — hard. A rest day is forced after this many days in a row.</span>
            </Field>
          </div>
        </Panel>
        {warns.map((w, i) => <Banner key={i} level={w.level} title={w.level === "crit" ? "This makes scheduling infeasible" : "This will fight the solver"}>{w.text}</Banner>)}
        {warns.length === 0 && <Banner level="ok" title="Rules are consistent">Current limits leave the solver enough freedom for all 5 departments.</Banner>}
      </div>
    );
  }

  /* ---- Teams ---- */
  function TeamsConfig() {
    const leaders = ["M. Fischer", "R. Sorensen", "K. Tanaka", "J. Visser", "A. Petrov"];
    return (
      <div className="max-w-2xl space-y-3" data-screen-label="Sysadmin / Teams">
        <Panel title="Departments" pad={false}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-dim bg-raised border-b border-bd">
                <th className="text-left font-semibold px-2.5 py-1.5">Department</th>
                <th className="text-right font-semibold px-2">Staff</th>
                <th className="text-left font-semibold px-2">Team leader</th>
                <th className="text-right font-semibold px-2.5" title="Can be assigned to Night">Night-qualified</th>
              </tr>
            </thead>
            <tbody>
              {SF.DEPTS.map((d, i) => (
                <tr key={d.id} className="border-b border-[var(--grid-line)] last:border-b-0">
                  <td className="px-2.5 py-1 font-medium">{d.name}</td>
                  <td className="px-2 text-right font-mono">{d.to - d.from + 1}</td>
                  <td className="px-2"><SelectBox value={leaders[i]} onChange={() => {}} options={leaders.map((l) => ({ v: l, label: l }))} /></td>
                  <td className="px-2.5 text-right font-mono text-dim">{Math.round((d.to - d.from + 1) * 0.6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2.5 py-1.5 border-t border-bd"><Btn variant="ghost">+ Add department</Btn></div>
        </Panel>
        <p className="text-2xs text-faint max-w-md">Night-qualified counts feed feasibility checks: if a day's Night requirement exceeds qualified staff on duty, pre-flight flags it before the solver runs.</p>
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
    "Fairness-first": [10, 5, 2, 6, 3],
    "Stability-first": [5, 4, 9, 4, 5],
  };
  function WeightsConfig() {
    const [w, setW] = useState(() => SF.SOFT.map((s) => s.weight));
    const preset = Object.keys(PRESETS).find((k) => PRESETS[k].every((v, i) => v === w[i])) || "Custom";
    return (
      <div className="max-w-2xl space-y-3" data-screen-label="Sysadmin / Weights">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Preset</span>
          <Seg value={preset} onChange={(v) => v !== "Custom" && setW([...PRESETS[v]])}
            options={[...Object.keys(PRESETS).map((k) => ({ v: k, label: k })), ...(preset === "Custom" ? [{ v: "Custom", label: "Custom" }] : [])]} />
        </div>
        <Panel title="Soft-constraint penalty weights" pad={false}>
          {SF.SOFT.map((s, i) => (
            <div key={s.id} className="px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0">
              <div className="flex items-center gap-2.5">
                <Badge>{s.id}</Badge>
                <span className="text-xs font-medium w-44">{s.name}</span>
                <input type="range" min={0} max={10} step={1} value={w[i]} onChange={(e) => setW((a) => a.map((x, k) => (k === i ? Number(e.target.value) : x)))} className="flex-1" />
                <span className="font-mono text-xs w-6 text-right font-semibold">{w[i]}</span>
              </div>
              <p className="text-2xs text-faint mt-1 ml-9">{s.blurb}{w[i] === 0 && <b style={{ color: "var(--st-warn)" }}> — at 0, this is ignored entirely.</b>}</p>
            </div>
          ))}
        </Panel>
        <Banner level={w[2] >= 8 ? "warn" : "ok"} title={w[2] >= 8 ? "High stability weight" : "How weights trade off"}>
          {w[2] >= 8
            ? "“Minimal changes” at " + w[2] + " means the solver keeps a mediocre schedule rather than fixing fairness. Intentional?"
            : "Weights are relative: at S1=" + w[0] + " and S2=" + w[1] + ", one unfair Night allocation outweighs " + (w[1] ? Math.round(w[0] / w[1] * 10) / 10 : "∞") + " ignored preferences. Changes apply to the next generation."}
        </Banner>
      </div>
    );
  }

  return AdminSurface;
})();
window.AdminSurface = AdminSurface;
