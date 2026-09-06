/* Crewdoku — onboarding wizard v2
   Steps: Welcome → Organisation → Shifts → Rules → Team → Summary
   Steps 1–4 each carry a per-step "⤓ demo" shortcut.
   Demo data is no longer surfaced in the empty-board state — it lives here only.
*/
const { OnboardingWizard } = (() => {
  const { useState, useMemo, useRef, useEffect } = React;

  const STEP_LABELS  = ["Welcome", "Organisation", "Shifts", "Rules", "Team", "Summary"];
  const SETUP_LABELS = ["Organisation", "Shifts", "Rules", "Team"]; // indices 1–4

  /* ── dept colour palette ──────────────────────────────────────── */
  const DEPT_COLORS = [
    "oklch(0.52 0.12 250)",  // blue
    "oklch(0.52 0.12 152)",  // green
    "oklch(0.58 0.12 75)",   // amber
    "oklch(0.54 0.14 27)",   // red-orange
    "oklch(0.50 0.14 295)",  // violet
    "oklch(0.52 0.12 200)",  // cyan
    "oklch(0.52 0.12 355)",  // rose
    "oklch(0.46 0.02 250)",  // slate
  ];

  const SHIFT_KNOWN_BG = { N:"var(--sh-N-bg)", E:"var(--sh-E-bg)", M:"var(--sh-M-bg)", A:"var(--sh-A-bg)", L:"var(--sh-L-bg)" };
  const SHIFT_KNOWN_FG = { N:"var(--sh-N-fg)", E:"var(--sh-E-fg)", M:"var(--sh-M-fg)", A:"var(--sh-A-fg)", L:"var(--sh-L-fg)" };

  /* ── shared sub-components ───────────────────────────────────── */

  /** Horizontal step dots — shown only on steps 1–4 */
  function StepDots({ step }) {
    if (step === 0 || step >= STEP_LABELS.length - 1) return null;
    const idx = step - 1; // 0-based index into SETUP_LABELS
    return (
      <div className="mb-7 select-none">
        <div className="flex items-start">
          {SETUP_LABELS.map((label, i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1.5" style={{ minWidth: 56 }}>
                <div
                  className="w-5 h-5 flex items-center justify-center font-mono text-2xs font-bold rounded-[2px] border transition-colors"
                  style={{
                    background:  i <= idx ? "var(--ink-solid)" : "transparent",
                    borderColor: i <= idx ? "var(--ink-solid)" : "var(--border-strong)",
                    color:       i <= idx ? "var(--text-inv)"  : "var(--text-faint)",
                  }}>
                  {i < idx ? "✓" : i + 1}
                </div>
                <span className="text-2xs text-center leading-tight"
                  style={{ color: i === idx ? "var(--text)" : "var(--text-faint)", fontWeight: i === idx ? 600 : 400 }}>
                  {label}
                </span>
              </div>
              {i < SETUP_LABELS.length - 1 && (
                <div className="flex-1 mt-2.5 h-[1px] mx-1 transition-colors"
                  style={{ background: i < idx ? "var(--ink-solid)" : "var(--border)" }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  /** Subtle "⤓ demo …" link in the nav row */
  function DemoLink({ label, onFill }) {
    const [hov, setHov] = useState(false);
    return (
      <button type="button" onClick={onFill}
        className="text-2xs font-mono"
        style={{ color: hov ? "var(--sel)" : "var(--text-faint)", transition: "color 0.1s" }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}>
        ⤓ {label}
      </button>
    );
  }

  /** Pill toggle */
  function Toggle({ value, onChange }) {
    return (
      <button type="button" role="switch" aria-checked={value}
        onClick={() => onChange(!value)}
        className="relative shrink-0 rounded-full border transition-colors"
        style={{
          width: 28, height: 16,
          background: value ? "var(--ink-solid)" : "var(--surface-2)",
          borderColor: value ? "var(--ink-solid)" : "var(--border-strong)",
        }}>
        <span className="absolute rounded-full transition-all"
          style={{
            width: 10, height: 10, top: 2,
            left: value ? 14 : 2,
            background: value ? "var(--text-inv)" : "var(--text-faint)",
          }} />
      </button>
    );
  }

  /** Inline number input with suffix */
  function NumField({ value, onChange, min, max, suffix }) {
    return (
      <div className="flex items-center gap-1.5">
        <input type="number" value={value} min={min} max={max}
          onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
          className="font-mono text-xs text-right border rounded-[2px] px-1 outline-none"
          style={{ width: 44, height: 18, borderColor: "var(--border)", background: "var(--bg)" }} />
        {suffix && <span className="text-2xs" style={{ color: "var(--text-faint)" }}>{suffix}</span>}
      </div>
    );
  }

  /* ── STEP 0 — Welcome ────────────────────────────────────────── */
  function StepWelcome() {
    return (
      <div className="space-y-7">
        <div>
          <img src="assets/logo.svg" width="40" height="40" alt="Crewdoku" className="mb-5" style={{ display: "block" }} />
          <h1 className="font-bold mb-2 leading-tight" style={{ fontSize: "var(--fs-lg)" }}>
            Build your team schedule
          </h1>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Set up your organisation in 4 steps. Crewdoku uses your constraints
            to generate compliant schedules — you review, adjust, and export.
          </p>
        </div>

        <div className="space-y-3 pl-4 border-l-2" style={{ borderColor: "var(--border-strong)" }}>
          {[
            ["◎", "Organisation", "Name your org and configure departments"],
            ["≡", "Shifts",       "Define shift types, times and headcount targets"],
            ["§", "Rules",        "Set hard constraints — max hours, rest windows"],
            ["◫", "Team",         "Add your employees — paste, type or import CSV"],
          ].map(([icon, title, desc]) => (
            <div key={title} className="flex items-start gap-2.5">
              <span className="font-mono text-xs shrink-0 mt-0.5" style={{ color: "var(--text-faint)" }}>{icon}</span>
              <div>
                <p className="text-xs font-semibold leading-tight">{title}</p>
                <p className="text-2xs leading-snug mt-0.5" style={{ color: "var(--text-dim)" }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-2xs" style={{ color: "var(--text-faint)" }}>
          Takes about 3 minutes. Everything is editable in Configuration after setup.
        </p>
      </div>
    );
  }

  /* ── STEP 1 — Organisation + Departments ─────────────────────── */
  function StepOrg({ orgName, setOrgName, depts, setDepts, errors }) {
    const nameRef = useRef();
    useEffect(() => { nameRef.current?.focus(); }, []);

    const addDept = () => setDepts(d => [...d, {
      id: "d" + Date.now(), name: "",
      color: DEPT_COLORS[d.length % DEPT_COLORS.length], open: false,
    }]);
    const upd = (i, patch) => setDepts(d => d.map((x, k) => k === i ? { ...x, ...patch } : x));
    const rem = (i) => setDepts(d => d.filter((_, k) => k !== i));

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-bold mb-1">Organisation</h2>
          <p className="text-2xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Departments group employees on the schedule board. You can rename or add more in Configuration later.
          </p>
        </div>

        {/* Org name */}
        <div className="space-y-1">
          <label className="text-2xs font-semibold uppercase tracking-wider block"
            style={{ color: "var(--text-faint)" }}>
            Organisation name<span style={{ color: "var(--st-crit)" }}>*</span>
          </label>
          <input
            ref={nameRef} value={orgName}
            onChange={e => setOrgName(e.target.value)}
            placeholder="e.g. Riverside General Hospital"
            className="w-full text-xs border rounded-[2px] px-2.5 outline-none"
            style={{
              height: "var(--ctl-h)", background: "var(--surface)",
              borderColor: errors.orgName ? "var(--st-crit)" : "var(--border-strong)",
              fontFamily: "var(--font-ui)",
            }}
            onFocus={e => e.target.style.borderColor = "var(--sel)"}
            onBlur={e => e.target.style.borderColor = errors.orgName ? "var(--st-crit)" : "var(--border-strong)"}
          />
          {errors.orgName && <p className="text-2xs" style={{ color: "var(--st-crit)" }}>{errors.orgName}</p>}
        </div>

        {/* Departments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-2xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}>
              Departments
            </label>
            <span className="text-2xs" style={{ color: "var(--text-faint)" }}>
              {depts.filter(d => d.name.trim()).length} defined
            </span>
          </div>

          <div className="space-y-1.5">
            {depts.map((d, i) => (
              <div key={d.id} className="border rounded-[2px] overflow-hidden"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                {/* Row */}
                <div className="flex items-center gap-2 px-2" style={{ height: "var(--row-h)" }}>
                  <button type="button"
                    onClick={() => upd(i, { open: !d.open })}
                    className="w-3.5 h-3.5 rounded-[2px] shrink-0 border-0 transition-opacity hover:opacity-70"
                    style={{ background: d.color }}
                    title="Change colour" />
                  <input
                    value={d.name}
                    onChange={e => upd(i, { name: e.target.value })}
                    onKeyDown={e => e.key === "Enter" && addDept()}
                    placeholder={"Department " + (i + 1)}
                    className="flex-1 text-xs bg-transparent outline-none min-w-0"
                    style={{ fontFamily: "var(--font-ui)" }}
                  />
                  <button type="button"
                    onClick={() => upd(i, { open: !d.open })}
                    className="font-mono text-2xs w-4 text-center shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                    style={{ color: "var(--text-faint)" }}>
                    {d.open ? "▲" : "▾"}
                  </button>
                  {depts.length > 1 && (
                    <button type="button" onClick={() => rem(i)}
                      className="font-mono text-2xs w-4 text-center shrink-0 opacity-25 hover:opacity-100 transition-opacity"
                      style={{ color: "var(--st-crit)" }}>✕</button>
                  )}
                </div>

                {/* Colour picker (expanded) */}
                {d.open && (
                  <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                    <p className="text-2xs font-semibold uppercase tracking-wider mb-2"
                      style={{ color: "var(--text-faint)" }}>Colour</p>
                    <div className="flex gap-2 flex-wrap">
                      {DEPT_COLORS.map((c, ci) => (
                        <button key={ci} type="button"
                          onClick={() => upd(i, { color: c, open: false })}
                          className="w-5 h-5 rounded-[2px] hover:scale-110 transition-transform"
                          style={{
                            background: c,
                            outline: d.color === c ? "2px solid var(--sel)" : "none",
                            outlineOffset: 1,
                          }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {errors.depts && <p className="text-2xs" style={{ color: "var(--st-crit)" }}>{errors.depts}</p>}
          <Btn variant="ghost" onClick={addDept}>+ Add department</Btn>
        </div>
      </div>
    );
  }

  /* ── STEP 2 — Shifts ─────────────────────────────────────────── */
  const SHIFT_TEMPLATES = [
    { label: "3-shift · 8h", rows: [
      { code: "N", name: "Night",   start: 22, dur: 8, req: 4, cap: "" },
      { code: "D", name: "Day",     start: 6,  dur: 8, req: 6, cap: "" },
      { code: "E", name: "Evening", start: 14, dur: 8, req: 5, cap: "" },
    ]},
    { label: "2-shift · 12h", rows: [
      { code: "D", name: "Day",   start: 7,  dur: 12, req: 8, cap: "" },
      { code: "N", name: "Night", start: 19, dur: 12, req: 6, cap: "" },
    ]},
    { label: "Custom", rows: [
      { code: "", name: "", start: 8, dur: 8, req: 4, cap: "" },
    ]},
  ];

  function StepShifts({ shifts, setShifts, errors }) {
    const add = () => setShifts(s => [...s, { id: "s" + Date.now(), code: "", name: "", start: 8, dur: 8, req: 4, cap: "" }]);
    const upd = (i, patch) => setShifts(s => s.map((x, k) => k === i ? { ...x, ...patch } : x));
    const rem = (i) => setShifts(s => s.filter((_, k) => k !== i));
    const hh  = (h) => String(((h % 24) + 24) % 24).padStart(2, "0") + ":00";

    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-bold mb-1">Shift definitions</h2>
          <p className="text-2xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Define the shift types in your rotation. <strong>Min headcount</strong> is the minimum staff required per day; <strong>max headcount</strong> is the upper cap (leave blank for uncapped).
          </p>
        </div>

        {/* Template picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xs font-semibold uppercase tracking-wider shrink-0"
            style={{ color: "var(--text-faint)" }}>Template:</span>
          {SHIFT_TEMPLATES.map(({ label, rows }) => (
            <button key={label} type="button"
              onClick={() => setShifts(rows.map((r, i) => ({ id: "t" + i, ...r })))}
              className="text-2xs border rounded-[2px] px-2 transition-colors hover:bg-[var(--surface-2)]"
              style={{ height: 18, borderColor: "var(--border-strong)", background: "var(--surface)" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="border rounded-[2px] overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "40px 1fr 136px 70px 70px 20px",
            gap: 6,
            height: 22, paddingInline: 8,
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
            alignItems: "center",
            color: "var(--text-faint)",
            fontSize: "var(--fs-2xs)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            <span>Code</span>
            <span>Name</span>
            <span>Start + Duration</span>
            <span style={{ textAlign: "right" }}>Min head</span>
            <span style={{ textAlign: "right" }}>Max head</span>
            <span></span>
          </div>

          {/* Rows */}
          {shifts.map((s, i) => {
            const bg = SHIFT_KNOWN_BG[s.code];
            const fg = SHIFT_KNOWN_FG[s.code];
            const endH = s.start + (s.dur || 8);
            return (
              <div key={s.id} style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 136px 70px 70px 20px",
                gap: 6,
                minHeight: 36, paddingInline: 8, paddingBlock: 6,
                background: i % 2 === 0 ? "var(--surface)" : "var(--bg)",
                borderBottom: i < shifts.length - 1 ? "1px solid var(--border)" : "none",
                alignItems: "center",
              }}>
                {/* Code */}
                <input value={s.code} maxLength={2}
                  onChange={e => upd(i, { code: e.target.value.toUpperCase() })}
                  placeholder="N"
                  className="text-xs font-mono font-bold text-center border rounded-[2px] outline-none"
                  style={{
                    height: 18, width: 32,
                    background: bg || "var(--bg)",
                    color: fg || "inherit",
                    borderColor: "var(--border)",
                  }} />
                {/* Name */}
                <input value={s.name}
                  onChange={e => upd(i, { name: e.target.value })}
                  placeholder="Name"
                  className="text-xs bg-transparent outline-none min-w-0 truncate"
                  style={{ fontFamily: "var(--font-ui)" }} />
                {/* Start + Duration */}
                <div className="flex items-center gap-1.5">
                  <select value={s.start}
                    onChange={e => upd(i, { start: Number(e.target.value) })}
                    className="text-2xs font-mono border rounded-[2px] outline-none"
                    style={{ height: 22, paddingInline: 4, borderColor: "var(--border)", background: "var(--bg)" }}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                  <span className="text-2xs" style={{ color: "var(--text-faint)" }}>+</span>
                  <select value={s.dur || 8}
                    onChange={e => upd(i, { dur: Number(e.target.value) })}
                    className="text-2xs font-mono border rounded-[2px] outline-none"
                    style={{ height: 22, paddingInline: 4, borderColor: "var(--border)", background: "var(--bg)" }}>
                    {[4,5,6,7,8,9,10,11,12].map(h => (
                      <option key={h} value={h}>{h}h</option>
                    ))}
                  </select>
                </div>
                {/* Min head */}
                <input type="number" min={0} max={99} value={s.req}
                  onChange={e => upd(i, { req: Number(e.target.value) })}
                  className="text-xs font-mono border rounded-[2px] px-1 outline-none text-right w-full"
                  style={{ height: 22, borderColor: "var(--border)", background: "var(--bg)" }} />
                {/* Max head (optional) */}
                <input type="number" min={0} max={999} value={s.cap ?? ""}
                  onChange={e => upd(i, { cap: e.target.value === "" ? "" : Number(e.target.value) })}
                  placeholder="—"
                  className="text-xs font-mono border rounded-[2px] px-1 outline-none text-right w-full"
                  style={{ height: 22, borderColor: "var(--border)", background: "var(--bg)", color: s.cap === "" ? "var(--text-faint)" : "inherit" }} />
                {/* Remove */}
                <button type="button" onClick={() => rem(i)}
                  className="font-mono text-2xs text-center opacity-20 hover:opacity-90 transition-opacity"
                  style={{ color: "var(--st-crit)" }}>✕</button>
              </div>
            );
          })}
        </div>

        {errors.shifts && <p className="text-2xs" style={{ color: "var(--st-crit)" }}>{errors.shifts}</p>}

        <div className="flex items-center justify-between">
          <Btn variant="ghost" onClick={add}>+ Add shift</Btn>
          <span className="text-2xs" style={{ color: "var(--text-faint)" }}>
            Overnight shifts (e.g. 22:00 + 8h) are handled automatically
          </span>
        </div>
      </div>
    );
  }

  /* ── STEP 3 — Rules ──────────────────────────────────────────── */
  function StepRules({ rules, setRules }) {
    const upd = (key, val) => setRules(r => ({ ...r, [key]: val }));

    const rows = [
      {
        code: "H2",
        label: "Weekly hour cap",
        desc:  "Maximum hours an employee can be scheduled in a single week.",
        right: <NumField value={rules.maxHours} onChange={v => upd("maxHours", v)} min={8} max={84} suffix="h/wk" />,
      },
      {
        code: "H3",
        label: "Rest gap between shifts",
        desc:  "Minimum time between the end of one shift and the start of the next — catches back-to-back scheduling across midnight.",
        right: <NumField value={rules.minRest} onChange={v => upd("minRest", v)} min={6} max={24} suffix="h gap" />,
      },
      {
        code: "H4",
        label: "Block same-day double shifts",
        desc:  "Prevents two shifts on the same calendar day regardless of timing (stricter than the rest gap alone).",
        right: <Toggle value={rules.onePerDay} onChange={v => upd("onePerDay", v)} />,
      },
      {
        code: "H6",
        label: "Enforce shift eligibility",
        desc:  "Only assign employees to shifts explicitly listed in their eligible shifts — blocks cross-training violations.",
        right: <Toggle value={rules.eligibility} onChange={v => upd("eligibility", v)} />,
      },
    ];

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-bold mb-1">Scheduling rules</h2>
          <p className="text-2xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Hard constraints are always enforced during generation. Adjustable any time in
            Configuration → Scheduling rules.
          </p>
        </div>

        <div className="border rounded-[2px] overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="px-3 text-2xs font-semibold uppercase tracking-wider border-b"
            style={{
              height: 22, background: "var(--surface-2)", color: "var(--text-faint)",
              borderColor: "var(--border)", display: "flex", alignItems: "center",
            }}>
            Hard constraints — always enforced
          </div>

          {rows.map((row, i) => (
            <div key={row.code}
              className="flex items-start justify-between gap-3 px-3 py-2"
              style={{
                background: "var(--surface)",
                borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
              }}>
              <div className="flex items-start gap-2 min-w-0">
                <span className="font-mono text-2xs border rounded-[2px] px-1 shrink-0 mt-0.5"
                  style={{ borderColor: "var(--border-strong)", color: "var(--text-faint)", background: "var(--surface-2)" }}>
                  {row.code}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight">{row.label}</p>
                  <p className="text-2xs leading-snug mt-0.5" style={{ color: "var(--text-dim)" }}>{row.desc}</p>
                </div>
              </div>
              <div className="shrink-0 mt-0.5">{row.right}</div>
            </div>
          ))}
        </div>

        <p className="text-2xs leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Soft constraints — fairness, shift preferences, weekend rotation — are pre-set with
          sensible weights. Fine-tune them in Configuration → Schedule priorities.
        </p>
      </div>
    );
  }

  /* ── STEP 4 — Team ───────────────────────────────────────────── */
  function StepTeam({ depts, empText, setEmpText, parsed, errors }) {
    const fileRef = useRef();
    const firstName = depts[0]?.name || "Dept";

    const handleFile = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ev => setEmpText(ev.target.result);
      r.readAsText(f);
      e.target.value = "";
    };

    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-bold mb-1">Team roster</h2>
          <p className="text-2xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
            One name per line. Optionally append a department:{" "}
            <code className="border rounded-[2px] px-1 text-2xs"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", fontFamily: "var(--font-mono)" }}>
              Alice Smith, {firstName}
            </code>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Btn onClick={() => fileRef.current?.click()}>↑ Import CSV</Btn>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv"
            style={{ display: "none" }} onChange={handleFile} />
          <span className="text-2xs" style={{ color: "var(--text-faint)" }}>or type / paste below</span>
        </div>

        <textarea
          value={empText}
          onChange={e => setEmpText(e.target.value)}
          autoFocus
          placeholder={"Alice Johnson\nBob Smith, " + firstName + "\nCarla Torres"}
          rows={9}
          className="w-full text-xs border rounded-[2px] px-2.5 py-2 outline-none resize-y"
          style={{
            fontFamily: "var(--font-mono)",
            background: "var(--surface)",
            borderColor: errors.emps ? "var(--st-crit)" : "var(--border-strong)",
          }}
          onFocus={e => e.target.style.borderColor = "var(--sel)"}
          onBlur={e => e.target.style.borderColor = errors.emps ? "var(--st-crit)" : "var(--border-strong)"}
        />

        {parsed.length > 0 && (() => {
          const unmatched = parsed.filter(e => e.deptId === (depts[0]?.id || "d1") && empText.split("\n").some(l => {
            const parts = l.split(",").map(p => p.trim());
            return parts[0] === e.name && parts[1] && !depts.find(d => d.name.toLowerCase() === parts[1].toLowerCase());
          })).length;
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Dot tone="ok" />
                <span className="text-2xs" style={{ color: "var(--text-dim)" }}>
                  {parsed.length} employee{parsed.length !== 1 ? "s" : ""} ready to import
                </span>
              </div>
              {unmatched > 0 && (
                <div className="flex items-center gap-2">
                  <Dot tone="warn" />
                  <span className="text-2xs" style={{ color: "var(--st-warn)" }}>
                    {unmatched} row{unmatched !== 1 ? "s" : ""} had an unrecognised department — assigned to <strong>{firstName}</strong>
                  </span>
                </div>
              )}
            </div>
          );
        })()}
        {parsed.length === 0 && empText.trim() && (
          <div className="flex items-center gap-2">
            <Dot tone="warn" />
            <span className="text-2xs" style={{ color: "var(--st-warn)" }}>No valid names found — check format</span>
          </div>
        )}
        {errors.emps && <p className="text-2xs" style={{ color: "var(--st-crit)" }}>{errors.emps}</p>}
      </div>
    );
  }

  /* ── STEP 5 — Summary ────────────────────────────────────────── */
  function StepSummary({ orgName, depts, shifts, rules, parsed, onGoTo }) {
    const hh = h => String(((h % 24) + 24) % 24).padStart(2, "0") + ":00";

    const cards = [
      {
        step: 1, icon: "◎", title: "Organisation",
        primary: orgName || "—",
        lines: depts.map(d => d.name).join(" · ") || "No departments",
        dots: depts.map(d => d.color),
      },
      {
        step: 2, icon: "≡", title: "Shifts",
        primary: shifts.length + " shift" + (shifts.length !== 1 ? "s" : "") + " defined",
        lines: shifts.map(s => s.code + " · " + s.name + " · " + hh(s.start) + "–" + hh(s.start + (s.dur || 8))).join("\n"),
      },
      {
        step: 3, icon: "§", title: "Rules",
        primary: "Max " + rules.maxHours + "h/week · " + rules.minRest + "h rest",
        lines: [rules.onePerDay && "1 shift/day", rules.eligibility && "eligibility on"].filter(Boolean).join(" · ") || "—",
      },
      {
        step: 4, icon: "◫", title: "Team",
        primary: parsed.length + " employee" + (parsed.length !== 1 ? "s" : ""),
        lines: parsed.length > 0 ? parsed.slice(0, 3).map(e => e.name).join(", ") + (parsed.length > 3 ? " +" + (parsed.length - 3) + " more" : "") : "—",
      },
    ];

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-bold mb-1">Ready to schedule</h2>
          <p className="text-2xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Review your setup below. Hover a card to go back and edit it.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {cards.map(c => (
            <div key={c.step}
              className="border rounded-[2px] p-3 group relative"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}>

              {/* Edit link — appears on hover */}
              <button type="button"
                onClick={() => onGoTo(c.step)}
                className="absolute top-2 right-2 text-2xs opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--sel)" }}>
                Edit ←
              </button>

              <div className="flex items-center gap-1.5 mb-2">
                <span className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>{c.icon}</span>
                <span className="text-2xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-faint)" }}>{c.title}</span>
              </div>

              <p className="text-xs font-semibold leading-tight truncate mb-0.5">{c.primary}</p>
              <p className="text-2xs leading-snug truncate" style={{ color: "var(--text-dim)" }}>{c.lines}</p>

              {c.dots && c.dots.length > 0 && (
                <div className="flex items-center gap-1 mt-2">
                  {c.dots.map((color, i) => (
                    <span key={i} className="w-2 h-2 rounded-[2px] shrink-0"
                      style={{ background: color }} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── WIZARD ROOT ─────────────────────────────────────────────── */
  function OnboardingWizard({ dispatch }) {
    const [step,   setStep]   = useState(0);
    const [errors, setErrors] = useState({});

    /* Step 1 */
    const [orgName, setOrgName] = useState("");
    const [depts,   setDepts]   = useState([
      { id: "d1", name: "", color: DEPT_COLORS[0], open: false },
    ]);

    /* Step 2 */
    const [shifts, setShifts] = useState([
      { id: "s1", code: "N", name: "Night",   start: 22, dur: 8, req: 4, cap: "" },
      { id: "s2", code: "D", name: "Day",     start: 6,  dur: 8, req: 6, cap: "" },
      { id: "s3", code: "E", name: "Evening", start: 14, dur: 8, req: 5, cap: "" },
    ]);

    /* Step 3 */
    const [rules, setRules] = useState({ maxHours: 48, minRest: 11, onePerDay: true, eligibility: true });

    /* Step 4 */
    const [empText, setEmpText] = useState("");

    /* Derived */
    const validDepts  = depts.filter(d => d.name.trim());
    const validShifts = shifts.filter(s => s.code.trim() && s.name.trim());

    const parsedEmps = useMemo(() => {
      return empText.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
        const parts = line.split(",").map(p => p.trim());
        const name  = parts[0]; if (!name) return null;
        const match = validDepts.find(d => d.name.toLowerCase() === (parts[1] || "").toLowerCase());
        return { name, deptId: match ? match.id : (validDepts[0]?.id || "d1") };
      }).filter(Boolean);
    }, [empText, validDepts]);

    /* ── Validation (on-submit) ── */
    const validate = s => {
      const e = {};
      if (s === 1) {
        if (!orgName.trim())         e.orgName = "Organisation name is required";
        if (validDepts.length === 0) e.depts   = "Add at least one department";
      }
      if (s === 2) {
        if (validShifts.length === 0) {
          e.shifts = "Add at least one shift with a code and name";
        } else {
          const codes = validShifts.map(x => x.code);
          const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
          if (dupes.length) e.shifts = "Shift codes must be unique: " + dupes.join(", ");
        }
      }
      if (s === 4) {
        if (parsedEmps.length === 0) e.emps = "Add at least one employee";
      }
      return e;
    };

    /* ── Demo fill per step ── */
    const DEMO_LABELS = { 1: "demo org", 2: "demo shifts", 3: "demo rules", 4: "demo team" };

    const fillDemo = () => {
      if (step === 1) {
        setOrgName("Riverside General Hospital");
        setDepts(SF.DEPTS.map((d, i) => ({
          id: "ddemo" + i, name: d.name,
          color: DEPT_COLORS[i % DEPT_COLORS.length], open: false,
        })));
      } else if (step === 2) {
        setShifts(SF.SHIFTS.map((s, i) => ({
          id: "sdemo" + i, code: s.code, name: s.name,
          start: s.start, dur: s.end - s.start, req: s.req, cap: s.cap ?? "",
        })));
      } else if (step === 3) {
        setRules({ maxHours: 48, minRest: 11, onePerDay: true, eligibility: true });
      } else if (step === 4) {
        setEmpText(
          SF.EMPLOYEES.slice(0, 30).map(e => e.name + ", " + e.deptName).join("\n")
        );
      }
    };

    /* ── Navigation ── */
    const goNext = () => {
      const e = validate(step);
      if (Object.keys(e).length) { setErrors(e); return; }
      setErrors({});
      if (step < STEP_LABELS.length - 1) setStep(s => s + 1);
      else finish();
    };

    const goBack = () => { setErrors({}); setStep(s => s - 1); };

    /* ── Finish: commit to SF globals ── */
    const finish = () => {
      const grouped = {};
      validDepts.forEach(d => { grouped[d.id] = []; });
      parsedEmps.forEach(e => {
        const targetId = grouped[e.deptId] !== undefined ? e.deptId : validDepts[0]?.id;
        if (targetId && grouped[targetId] !== undefined) grouped[targetId].push(e);
      });

      let cursor = 0;
      const newDepts = validDepts.map((d, i) => {
        const count  = (grouped[d.id] || []).length;
        const safeId = d.name.toLowerCase()
          .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 16) || ("dept" + i);
        const entry  = { id: safeId, name: d.name, from: cursor, to: cursor + count - 1 };
        cursor += count;
        return entry;
      });

      const newEmps = [];
      let idx = 0;
      validDepts.forEach((dept, di) => {
        const deptObj = newDepts[di];
        (grouped[dept.id] || []).forEach(e => {
          newEmps.push({
            i: idx, id: "E" + String(100 + idx),
            name: e.name, dept: deptObj.id, deptName: deptObj.name,
            depts: [deptObj.id], home: idx % Math.max(1, validShifts.length),
            eligibleShiftIds: validShifts.map(s => s.code),
            prefs: { nightPref: 0, weekendPref: 0, daysOff: [], maxShiftsWeek: Math.floor(rules.maxHours / 8), notes: "" },
          });
          idx++;
        });
      });

      SF.SHIFTS.length = 0;
      validShifts.forEach(s => {
        const dur = s.dur || 8;
        const end = s.start + dur;
        SF.SHIFTS.push({
          code: s.code, name: s.name, start: s.start, end,
          req: s.req, cap: s.cap !== "" && s.cap > 0 ? s.cap : Math.ceil(s.req * 1.2),
          byDow: Array.from({ length: 7 }, (_, dow) => ({
            min: dow >= 5 ? Math.floor(s.req * 0.7) : s.req,
            max: dow >= 5 ? Math.ceil(s.req * 0.9)  : Math.ceil(s.req * 1.2),
          })),
        });
      });
      SF.rebuildShiftIdx();

      SF.DEPTS.length    = 0; newDepts.forEach(d => SF.DEPTS.push(d));
      SF.EMPLOYEES.length = 0; newEmps.forEach(e => SF.EMPLOYEES.push(e));

      dispatch({ type: "LOAD_CUSTOM" });
    };

    const isLast      = step === STEP_LABELS.length - 1;
    const hasDemoFill = step >= 1 && step <= 4;
    const nextLabel   = step === 0 ? "Start setup →" : isLast ? "Start scheduling →" : "Continue →";

    return (
      <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-8"
        style={{ background: "var(--bg)" }}
        data-screen-label="Onboarding wizard">



        <div style={{ width: "100%", maxWidth: 560 }}>

          {/* step counter — sidebar has the logo */}
          <div className="flex items-center justify-end mb-4 select-none" style={{ minHeight: 16 }}>
            {hasDemoFill && (
              <span className="font-mono text-2xs" style={{ color: "var(--text-faint)" }}>
                {step} / {STEP_LABELS.length - 2}
              </span>
            )}
            {isLast && (
              <span className="text-2xs font-semibold" style={{ color: "var(--st-ok)" }}>
                ✓ Setup complete
              </span>
            )}
          </div>

          {/* Step dots */}
          <StepDots step={step} />

          {/* Step content */}
          <div style={{ minHeight: 320 }}>
            {step === 0 && <StepWelcome />}
            {step === 1 && (
              <StepOrg orgName={orgName} setOrgName={setOrgName}
                depts={depts} setDepts={setDepts} errors={errors} />
            )}
            {step === 2 && (
              <StepShifts shifts={shifts} setShifts={setShifts} errors={errors} />
            )}
            {step === 3 && <StepRules rules={rules} setRules={setRules} />}
            {step === 4 && (
              <StepTeam depts={validDepts} empText={empText}
                setEmpText={setEmpText} parsed={parsedEmps} errors={errors} />
            )}
            {step === 5 && (
              <StepSummary
                orgName={orgName} depts={validDepts}
                shifts={validShifts} rules={rules} parsed={parsedEmps}
                onGoTo={s => { setErrors({}); setStep(s); }} />
            )}
          </div>

          {/* Nav */}
          <div className="flex items-center gap-3 pt-5 mt-8 border-t"
            style={{ borderColor: "var(--border)" }}>
            {step > 0 && (
              <Btn variant="ghost" onClick={goBack}>← Back</Btn>
            )}
            {hasDemoFill && (
              <DemoLink label={DEMO_LABELS[step]} onFill={fillDemo} />
            )}
            <span className="flex-1"></span>
            <Btn variant="primary" onClick={goNext}>{nextLabel}</Btn>
          </div>

        </div>
      </div>
    );
  }

  return { OnboardingWizard };
})();
Object.assign(window, { OnboardingWizard });
