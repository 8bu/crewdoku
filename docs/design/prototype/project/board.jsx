/* Crewdoku schedule board.
   Rows = employees (grouped by dept, collapsible).
   Columns = 2-level header: Week range › Day of week.
   Each cell is filled (shift color) when assigned, empty otherwise. */
const ScheduleBoard = (() => {
  const { useState, useRef, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle, memo } = React;

  /* ---- context menu ---- */
  function ContextMenu({ x, y, items, onClose }) {
    const ref = useRef(null);
    useEffect(() => {
      const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
      const onKey  = (e) => { if (e.key === "Escape") onClose(); };
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown",   onKey);
      return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    }, [onClose]);
    const [adj, setAdj] = useState({ left: x, top: y });
    useEffect(() => {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      setAdj({ left: r.right > window.innerWidth ? x - r.width : x, top: r.bottom > window.innerHeight ? y - r.height : y });
    }, []);
    return (
      <div ref={ref} onContextMenu={e => e.preventDefault()}
        style={{ position: "fixed", left: adj.left, top: adj.top, zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,.13)" }}
        className="bg-surface border border-bd rounded-[2px] py-0.5 min-w-[192px]">
        {items.map((item, i) => item.divider
          ? <div key={i} className="border-t border-[var(--grid-line)] my-0.5" />
          : (
            <button key={i} type="button" disabled={item.disabled}
              onClick={() => { item.onClick?.(); onClose(); }}
              className={cx("w-full text-left px-3 h-7 text-xs flex items-center gap-2 transition-none",
                item.disabled ? "text-faint cursor-default" : "hover:bg-[var(--sel-bg)] hover:text-ink text-dim")}>
              <span className="font-mono text-xs w-3 text-center shrink-0 opacity-60">{item.icon || ""}</span>
              <span className="flex-1">{item.label}</span>
              {item.kbd && <span className="ml-2 font-mono text-2xs text-faint">{item.kbd}</span>}
            </button>
          )
        )}
      </div>
    );
  }

  /* ---- tooltip layer ---- */
  const TooltipLayer = forwardRef((_, ref) => {
    const [tip, setTip] = useState(null);
    useImperativeHandle(ref, () => ({
      show: (x, y, node) => setTip({ x, y, node }),
      hide: () => setTip(null),
    }));
    if (!tip) return null;
    const style = { left: Math.min(tip.x, window.innerWidth - 280), top: Math.min(tip.y + 10, window.innerHeight - 160) };
    return <div className="sf-tip" style={style}>{tip.node}</div>;
  });

  /* ---- employee action popover ---- */
  function EmpActionPopover({ emp, d, curShift, getShift, pins, viol, onAssign, onPin }) {
    return (
      <div className="text-xs">
        <div className="px-2.5 py-1.5 border-b border-bd bg-raised">
          <p className="font-semibold">{emp.name}</p>
          <p className="font-mono text-2xs text-dim">{emp.deptName} · {SF.dayLong(d)}</p>
        </div>
        <p className="px-2.5 pt-2 pb-0.5 text-2xs font-semibold uppercase tracking-wider text-faint">Assign shift</p>
        {SF.SHIFTS.map((s) => {
          const eligible = !emp.eligibleShiftIds || emp.eligibleShiftIds.includes(s.code);
          const v = SF.checkViolations(emp.i, d, s.code, getShift);
          /* Filter out the H6 violation from v since we already show the H6 badge */
          const vFiltered = eligible ? v : [];
          return (
            <button key={s.code} type="button"
              onClick={() => eligible ? onAssign(s.code) : undefined}
              className={cx(
                "w-full flex items-center gap-2 px-2.5 h-7 text-left",
                eligible ? "hover:bg-[var(--sel-bg)]" : "opacity-40 cursor-not-allowed"
              )}>
              <span className="w-5 h-5 inline-flex items-center justify-center font-mono text-xs font-semibold border shrink-0"
                style={{ background: "var(--sh-" + s.code + "-bg)", color: "var(--sh-" + s.code + "-fg)", borderColor: "var(--sh-" + s.code + "-bd)" }}>
                {s.code}
              </span>
              <span className="flex-1">{s.name}</span>
              <span className="font-mono text-2xs text-faint">{SF.shiftTime(s.code)}</span>
              {s.code === curShift && eligible && <span className="text-2xs text-faint font-mono">✓</span>}
              {!eligible && <span className="text-2xs font-mono" style={{ color: "var(--st-warn)" }}>H6</span>}
              {eligible && vFiltered.length > 0 && (
                <span className="font-bold" title={vFiltered.map(x => x.text).join("\n")} style={{ color: "var(--st-crit)" }}>⚠</span>
              )}
            </button>
          );
        })}
        <button type="button" onClick={() => onAssign(null)}
          className="w-full flex items-center gap-2 px-2.5 h-7 hover:bg-[var(--sel-bg)] text-left text-dim border-t border-bd mt-0.5">
          <span className="w-5 h-5 border border-dashed border-bds shrink-0 inline-block"></span>
          <span>Day off</span>
        </button>
        <div className="border-t border-bd px-2.5 py-1.5">
          <button type="button" className="text-2xs text-dim hover:text-ink" onClick={onPin}>
            ◢ {pins.has(emp.i + "|" + d) ? "Unpin" : "Pin for next generation"}
          </button>
        </div>
        {viol.length > 0 && (
          <div className="border-t border-bd px-2.5 py-1.5 space-y-0.5">
            {viol.map((v, k) => <p key={k} className="text-2xs" style={{ color: "var(--st-crit)" }}>⚠ {v.rule}: {v.text}</p>)}
          </div>
        )}
      </div>
    );
  }



  /* repeating diagonal hatch for weekend columns (no grey fill) */
  const WEEKEND_BG = "repeating-linear-gradient(45deg, var(--weekend-hatch) 0, var(--weekend-hatch) 1px, transparent 1px, transparent 6px)";

  /* ================================================================
     COVERAGE VIEW  (rows = Time/Shift, cols = Date, employees as chips)
  ================================================================ */
  function CoverageView({ days, app, dispatch, visibleEmps, getShift, onCellClick, tip }) {
    const { pins, overrides, diff } = app;
    const LABEL_W = 116;
    const DAY_MIN = 124;
    const TABLE_MIN_W = LABEL_W + days.length * DAY_MIN;

    const diffMap = useMemo(() => {
      if (!diff) return null;
      const m = new Map();
      diff.proposal.changes.forEach(c => m.set(c.key, c));
      return m;
    }, [diff && diff.proposal]);

    const decided = diff ? diff.decided : EMPTY_MAP;
    const empIdxSet = useMemo(() => new Set(visibleEmps.map(e => e.i)), [visibleEmps]);

    /* (day,shift) -> assigned employees among the visible set */
    const grid = useMemo(() => {
      const m = new Map();
      days.forEach(d => SF.SHIFTS.forEach(s => m.set(d + "|" + s.code, [])));
      visibleEmps.forEach(emp => {
        days.forEach(d => {
          const code = getShift(emp.i, d);
          if (code) m.get(d + "|" + code).push(emp);
        });
      });
      return m;
    }, [days, visibleEmps, getShift, overrides, diff]);

    return (
      <div className="flex-1 overflow-auto relative bg-surface" style={{ scrollSnapType: "x mandatory" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", minWidth: TABLE_MIN_W + "px" }}>
          <colgroup>
            <col style={{ width: LABEL_W + "px" }} />
            {days.map(d => <col key={d} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-30 bg-raised border-r border-b border-bd text-left align-bottom px-2.5 pb-1.5" style={{ top: 0 }}>
                <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Time / Shift</span>
              </th>
              {days.map(d => {
                const isWeekend = SF.isWeekend(d);
                const isToday = d === -3;
                return (
                  <th key={d} className="sticky z-20 border-r border-b border-bd text-center font-normal"
                    style={{ top: 0, height: "36px", scrollSnapAlign: "start", background: isToday ? "var(--sel-bg)" : isWeekend ? WEEKEND_BG + ", var(--surface-2)" : "var(--surface-2)" }}>
                    <p className="font-mono text-xs font-semibold" style={{ color: isToday ? "var(--sel)" : "var(--text-dim)" }}>
                      {SF.DOW[SF.mod(d, 7)].slice(0, 3)} {SF.dateOf(d).getDate()}
                    </p>
                    <p className="font-mono text-2xs text-faint">{SF.dateOf(d).toLocaleDateString("en-US", { month: "short" })}</p>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {SF.SHIFTS.map(s => (
              <tr key={s.code}>
                <td className="sticky left-0 z-10 border-r border-b border-bd px-2.5 align-top py-1.5"
                  style={{ background: "var(--sh-"+s.code+"-bg)" }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs font-semibold" style={{ color: "var(--sh-"+s.code+"-fg)" }}>
                      {SF.hh(s.start).replace(":","")}-{SF.hh(s.end).replace(":","")}
                    </span>
                  </div>
                </td>
                {days.map(d => {
                  const isWeekend = SF.isWeekend(d);
                  const inH       = SF.inHorizon(d);
                  const emps      = grid.get(d + "|" + s.code) || [];
                  return (
                    <td key={d}
                      className={cx("border-r border-b border-[var(--grid-line)] align-top p-1", !inH && "opacity-20")}
                      style={{ scrollSnapAlign: "start", background: isWeekend ? WEEKEND_BG : undefined }}>
                      <div className="flex flex-wrap gap-1">
                        {emps.map(emp => {
                          const key      = emp.i + "|" + d;
                          const ch       = diffMap && diffMap.get(key);
                          const dec      = ch ? decided.get(ch.key) : null;
                          const pinned   = pins.has(key);
                          const ovr      = overrides.get(key);
                          const violated = !!(ovr && ovr.viol && ovr.viol.length);
                          const propArr  = ch && !dec && ch.to === s.code && ch.from !== s.code;
                          return (
                            <button key={emp.i} type="button"
                              className={cx("inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-2xs font-medium leading-none border max-w-full bg-surface",
                                inH && "cursor-pointer hover:bg-raised",
                                propArr && "sf-proposed",
                                violated && "sf-viol")}
                              style={{ color: "var(--text)", borderColor: "var(--bd)" }}
                              onClick={e => { e.stopPropagation(); inH && onCellClick(e, emp, d, s.code, true, ch, dec); }}
                              onMouseEnter={e => {
                                const r = e.currentTarget.getBoundingClientRect();
                                tip.current && tip.current.show(r.left, r.bottom, (
                                  <div>
                                    <p className="font-semibold">{emp.name}</p>
                                    <p className="font-mono text-dim">{emp.deptName} · {s.name} {SF.shiftTime(s.code)}</p>
                                    {pinned   && <p className="mt-1">◢ Pinned</p>}
                                    {violated && ovr.viol.map((v, k) => <p key={k} className="mt-1" style={{ color: "var(--st-crit)" }}>✕ {v.rule}: {v.text}</p>)}
                                    {propArr  && <p className="mt-1" style={{ color: "var(--st-prop)" }}>◆ Proposed → {s.name}</p>}
                                  </div>
                                ));
                              }}
                              onMouseLeave={() => tip.current && tip.current.hide()}>
                              {pinned && <span style={{ color: "var(--st-pin)" }}>◢</span>}
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--dept-"+emp.dept+")" }}></span>
                              <span className="truncate">{emp.name.split(" ").slice(-1)[0]}</span>
                            </button>
                          );
                        })}
                        {emps.length === 0 && inH && (
                          <span className="text-2xs text-faint font-mono px-1 py-0.5">—</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* ================================================================
     MAIN
  ================================================================ */
  function ScheduleBoard({ app, dispatch, onExport, solverPhase, genOpen, onGenerateToggle }) {
    const { weekOffset, seedMode, pins, overrides, diff, emptySchedule } = app;
    const tip = useRef(null);
    const [pop, setPop]             = useState(null);
    const [ctxMenu, setCtxMenu]     = useState(null);
    const [collapsed, setCollapsed] = useState(() => new Set());
    const [filter, setFilter]       = useState("all");
    const [pivot,  setPivot]         = useState("emp");
    const [solvedView, setSolvedView] = useState(true);
    /* reset to solved view whenever a new proposal arrives */
    useEffect(() => { if (diff) setSolvedView(true); }, [!!diff]);

    /* days + week groups */
    const days = useMemo(() => {
      return Array.from({ length: 7 }, (_, k) => weekOffset * 7 + k);
    }, [weekOffset]);

    const weekGroups = useMemo(() => {
      const wgs = [];
      let cur = null;
      days.forEach((d) => {
        const wk = Math.floor(d / 7);
        if (!cur || cur.wk !== wk) {
          const fmt = (x) => SF.dateOf(x).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          cur = { wk, days: [], label: fmt(d) + " – " + fmt(d + 6) };
          wgs.push(cur);
        }
        cur.days.push(d);
      });
      return wgs;
    }, [days]);

    const getShift = useCallback((i, d) => {
      if (emptySchedule) return null;
      const o = overrides.get(i + "|" + d);
      if (o !== undefined) return o.code;
      const b = SF.baseAssign(i, d);
      return b === undefined ? null : b;
    }, [overrides, emptySchedule]);
    const gsRef = useRef(getShift); gsRef.current = getShift;

    const diffMap = useMemo(() => {
      if (!diff) return null;
      const m = new Map();
      diff.proposal.changes.forEach((c) => m.set(c.key, c));
      return m;
    }, [diff && diff.proposal]);

    const hoursByEmp = useMemo(() => {
      return SF.EMPLOYEES.map((e) => SF.weekHours(e.i, weekOffset, getShift));
    }, [weekOffset, getShift]);



    const rangeLabel = useMemo(() => {
      const f = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return f(SF.dateOf(days[0])) + " – " + f(SF.dateOf(days[days.length - 1])) + ", 2026";
    }, [days]);

    /* column geometry */
    const NAME_W    = 200;
    const CELL_MIN  = 86; /* min px per day col */
    const H_WEEK    = 26;
    const H_DAY     = 28;
    const TOTAL_COLS = 1 + days.length;
    const TABLE_MIN_W = NAME_W + days.length * CELL_MIN;
    const lastDaysOfWeek = useMemo(() => new Set(weekGroups.map(wg => wg.days[wg.days.length - 1])), [weekGroups]);

    const onCellClick = useCallback((e, emp, d, sc, assigned, ch, dec) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      const anchor = { x: r.left, y: r.bottom, y2: r.top };
      if (seedMode) { if (assigned) dispatch({ type: "PIN_TOGGLE", key: emp.i + "|" + d }); return; }

      const ovr = overrides.get(emp.i + "|" + d);
      setPop({ kind: "emp", emp, d, sc: assigned ? sc : null, anchor, viol: ovr ? ovr.viol || [] : [] });
    }, [seedMode, overrides, dispatch]);

    const openCtx = useCallback((e, items) => {
      e.preventDefault(); e.stopPropagation();
      setCtxMenu({ x: e.clientX + 2, y: e.clientY + 2, items });
    }, []);

    const exportEmpCSV = useCallback((emp) => {
      const allDays = Array.from({ length: 28 }, (_, k) => k - 14);
      const rows = [["Name","Date","Day","Shift","Start","End"]];
      allDays.forEach(d => {
        if (!SF.inHorizon(d)) return;
        const o = overrides.get(emp.i + "|" + d);
        const code = o !== undefined ? o.code : SF.baseAssign(emp.i, d);
        if (code === undefined) return;
        const s = code ? SF.SHIFTS.find(x => x.code === code) : null;
        const dt = SF.dateOf(d);
        const ds = dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
        rows.push([emp.name, ds, SF.DOW[SF.mod(d,7)], s?s.name:"Day off", s?SF.hh(s.start):"", s?SF.hh(s.end):""]);
      });
      const csv = rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
      a.download = "schedule-"+emp.name.replace(/\s+/g,"-").toLowerCase()+".csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }, [overrides]);

    const assignShift = (emp, d, code) => {
      const viol = code ? SF.checkViolations(emp.i, d, code, gsRef.current) : [];
      dispatch({ type: "SET_CELL", key: emp.i + "|" + d, code, viol });
      setPop(null);
    };

    const visibleDepts = SF.DEPTS.filter((d) => filter === "all" || d.id === filter);
    const visibleEmps  = useMemo(() => {
      if (filter === "all") return SF.EMPLOYEES;
      const dept = SF.DEPTS.find(d => d.id === filter);
      return dept ? SF.EMPLOYEES.slice(dept.from, dept.to + 1) : SF.EMPLOYEES;
    }, [filter]);

    return (
      <div className="flex-1 flex flex-col min-h-0" data-screen-label="Leader / Schedule board">

        {/* toolbar */}
        <div className="flex items-center gap-2 px-2 h-9 border-b border-bd bg-raised shrink-0">
          <span className="text-xs font-semibold pr-2 border-r border-bd mr-1 text-dim">Schedule board</span>
          <div className="flex gap-0.5">
            <Btn onClick={() => dispatch({ type: "WEEK", delta: -1 })}>◀</Btn>
            <Btn onClick={() => dispatch({ type: "WEEK", delta: 1 })}>▶</Btn>
          </div>
          <span className="font-mono text-xs font-medium min-w-36">{rangeLabel}</span>
          <Btn variant="ghost" onClick={() => dispatch({ type: "WEEK", set: -1 })}>Today</Btn>
          <span className="w-px h-4 bg-bd mx-1 shrink-0"></span>
          <Seg value={pivot} onChange={setPivot}
            options={[{ v: "emp", label: "By employee" }, { v: "cov", label: "By time" }]} />
          <div className="flex-1"></div>
          <SelectBox value={filter} onChange={setFilter}
            options={[{ v: "all", label: "All departments" }, ...SF.DEPTS.map((d) => ({ v: d.id, label: d.name }))]} />
          <Btn pressed={seedMode} onClick={() => dispatch({ type: "SEED_TOGGLE" })} kbd="S">
            ◢ Seed{pins.size > 0 ? " · " + pins.size : ""}
          </Btn>
          {onGenerateToggle && (
            <Btn pressed={genOpen} onClick={onGenerateToggle}>
              {(solverPhase === "queued" || solverPhase === "solving")
                ? <React.Fragment><span className="sf-spinner" style={{ display: "inline-block", width: "10px", height: "10px", marginRight: "5px", verticalAlign: "middle" }}></span>Solving…</React.Fragment>
                : app.diff
                ? "\u25C6 " + app.diff.proposal.changes.length + " proposed"
                : "\u25B8 Generate"}
            </Btn>
          )}
          {onExport && <Btn onClick={onExport}>\u2193 Export</Btn>}
        </div>

        {/* empty-schedule guidance banner */}
        {emptySchedule && !seedMode && (
          <div className="px-3 py-2 border-b flex items-center gap-3 shrink-0 text-xs"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
            <span className="font-mono text-base leading-none" style={{ color: "var(--text-faint)" }}>▦</span>
            <span style={{ color: "var(--text-dim)" }}>
              Schedule is empty — run the solver to generate your first schedule.
            </span>
            <div className="flex-1"></div>
            {onGenerateToggle && (
              <Btn variant="primary" onClick={onGenerateToggle}>▸ Generate</Btn>
            )}
          </div>
        )}

        {/* seed hint */}
        {seedMode && (
          <div className="px-2 py-1 border-b text-2xs flex items-center gap-2 shrink-0" style={{ background: "var(--sel-bg)", borderColor: "var(--sel)" }}>
            <span className="font-semibold" style={{ color: "var(--sel)" }}>SEED MODE</span>
            <span className="text-dim">Click an assigned cell to pin/unpin (◢ corner mark). Pinned cells are frozen for the next solver run.</span>
            <span className="ml-auto text-faint">Esc to exit</span>
          </div>
        )}

        {/* diff banner */}
        {diff && (
          <div className="px-2 py-1.5 border-b flex items-center gap-2 shrink-0" style={{ background: "var(--st-prop-bg)", borderColor: "var(--st-prop)" }}>
            <Badge tone="prop">◆ {diff.proposal.id}</Badge>
            <span className="text-xs"><b>{diff.proposal.changes.length} changes</b> · fairness <span className="font-mono">{diff.proposal.prevFairness}→<b>{diff.proposal.fairness}</b></span> · penalty <span className="font-mono">{diff.proposal.prevPenalty}→<b>{diff.proposal.penalty}</b></span></span>
            <div className="flex-1"></div>
            <Seg
              value={solvedView ? "solved" : "original"}
              onChange={v => setSolvedView(v === "solved")}
              options={[{ v: "original", label: "Original" }, { v: "solved", label: "Solved" }]}
            />
            <Btn variant="ghost" onClick={() => dispatch({ type: "DIFF_DISCARD" })}>Discard</Btn>
            <Btn variant="primary" onClick={() => dispatch({ type: "DIFF_APPLY" })}>Apply</Btn>
          </div>
        )}

        {/* legend */}
        <div className="flex items-center gap-3 px-2.5 border-b border-bd bg-raised shrink-0 text-xs" style={{ height: "32px" }}>
          <span className="font-semibold uppercase tracking-wider text-faint text-2xs">Status</span>
          <span className="text-faint">◢ pinned</span>
          <span style={{ color: "var(--st-prop)" }}>◆ proposed</span>
          <span style={{ color: "var(--st-crit)" }}>⚠ violation</span>
          <span className="flex-1"></span>
          {SF.SHIFTS.map((s) => (
            <span key={s.code} className="inline-flex items-center gap-1.5 font-mono text-xs font-medium"
              style={{ color: "var(--sh-" + s.code + "-fg)", background: "var(--sh-" + s.code + "-bg)", padding: "3px 8px", border: "1px solid var(--sh-" + s.code + "-bd)" }}>
              {s.code} {SF.hh(s.start).replace(":","")}-{SF.hh(s.end).replace(":","")}
            </span>
          ))}
        </div>

        <div className="flex-1 relative overflow-hidden flex flex-col min-h-0">
          {(solverPhase === "queued" || solverPhase === "solving") && (
            <React.Fragment>
              <div className="sf-scan-line" />
              <div className="sf-scan-glow" />
            </React.Fragment>
          )}
          {pivot === "cov"
          ? <CoverageView days={days} app={app} dispatch={dispatch} visibleEmps={visibleEmps} getShift={getShift} onCellClick={onCellClick} tip={tip} />
          : (
        <div className="flex-1 overflow-auto relative bg-surface">
          <table style={{
            borderCollapse: "collapse",
            tableLayout: "fixed",
            width: "100%",
            minWidth: TABLE_MIN_W + "px",
          }}>
            <colgroup>
              <col style={{ width: NAME_W + "px" }} />
              {days.map((d) => <col key={d} />)}
            </colgroup>

            <thead>
              {/* ---- Row 1: week range ---- */}
              <tr>
                <th rowSpan={2}
                  className="sticky left-0 z-30 bg-raised border-r border-b border-bd text-center align-bottom px-2.5 pb-1.5"
                  style={{ top: 0 }}
                  onContextMenu={e => openCtx(e, [
                    { label: "Expand all",   icon: "▾", onClick: () => setCollapsed(new Set()) },
                    { label: "Collapse all", icon: "▸", onClick: () => setCollapsed(new Set(SF.DEPTS.map(d => d.id))) },
                    { divider: true },
                    { label: "Clear all overrides", icon: "✕", disabled: overrides.size === 0, onClick: () => dispatch({ type: "CLEAR_EDITS" }) },
                    { label: "Unpin all",           icon: "◢", disabled: pins.size === 0,     onClick: () => dispatch({ type: "UNPIN_ALL" }) },
                  ])}>
                  <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Employee</span>
                </th>
                {weekGroups.map((wg) => (
                  <th key={wg.wk} colSpan={wg.days.length}
                    className="sticky z-20 bg-raised border-b border-bd text-left px-2 font-normal"
                    style={{ top: 0, height: H_WEEK + "px", borderRight: "2px solid var(--border-strong)" }}>
                    <span className="font-mono text-xs font-medium text-dim">{wg.label}</span>
                  </th>
                ))}
              </tr>

              {/* ---- Row 2: day of week + date ---- */}
              <tr>
                {days.map((d) => {
                  const today = d === -3;
                  return (
                    <th key={d}
                      className={cx("sticky z-20 border-b text-center font-normal")}
                      style={{ top: H_WEEK + "px", height: H_DAY + "px", background: today ? "var(--sel-bg)" : SF.isWeekend(d) ? WEEKEND_BG + ", var(--surface-2)" : "var(--surface-2)", borderRight: lastDaysOfWeek.has(d) ? "2px solid var(--border-strong)" : "1px solid var(--border)" }}
                      onContextMenu={e => openCtx(e, [
                        { label: SF.DOW[SF.mod(d,7)] + " " + SF.dateOf(d).toLocaleDateString("en-US",{month:"short",day:"numeric"}), disabled: true },
                        { divider: true },
                        { label: "Switch to By time", icon: "⊞", onClick: () => setPivot("cov") },
                        { divider: true },
                        { label: "Mark all day off", icon: "✕", onClick: () => visibleEmps.forEach(emp => dispatch({ type: "SET_CELL", key: emp.i+"|"+d, code: null, viol: [] })) },
                      ])}>
                      <div className="flex flex-col items-center justify-center h-full gap-[1px]">
                        <span className="font-mono text-xs font-semibold" style={{ color: today ? "var(--sel)" : "var(--text-dim)" }}>
                          {SF.DOW[SF.mod(d, 7)].slice(0, 3)}
                        </span>
                        <span className="font-mono text-2xs text-faint">{SF.dateOf(d).getDate()}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>


            </thead>

            <tbody>
              {visibleDepts.map((dept) => {
                const isCol = collapsed.has(dept.id);
                const emps  = SF.EMPLOYEES.slice(dept.from, dept.to + 1);
                return (
                  <React.Fragment key={dept.id}>
                    {/* dept group row */}
                    <tr>
                      <td colSpan={TOTAL_COLS}
                        className="sticky left-0 z-10 border-b border-bd h-6"
                        style={{ background: "var(--surface-2)" }}>
                        <button type="button"
                          className="flex items-center gap-1.5 px-2.5 h-full text-2xs font-semibold uppercase tracking-wider text-dim hover:text-ink w-full text-left"
                          onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(dept.id) ? n.delete(dept.id) : n.add(dept.id); return n; })}>
                          <span className="font-mono">{isCol ? "▸" : "▾"}</span>
                          {dept.name}
                          <span className="font-mono normal-case tracking-normal text-faint ml-1">{emps.length}</span>
                        </button>
                      </td>
                    </tr>

                    {/* employee rows */}
                    {!isCol && emps.map((emp, ei) => {
                      const hours = hoursByEmp ? hoursByEmp[emp.i] : null;
                      return (
                        <tr key={emp.i}
                          style={{ background: ei % 2 === 1 ? "color-mix(in oklab, var(--surface-2) 30%, var(--surface))" : undefined }}>
                          {/* sticky name column */}
                          <td className="sticky left-0 z-10 border-r border-b border-bd px-2.5"
                            style={{ height: "var(--row-h)", background: ei % 2 === 1 ? "color-mix(in oklab, var(--surface-2) 40%, var(--surface))" : "var(--surface)" }}
                            onContextMenu={e => openCtx(e, [
                              { label: emp.name,     disabled: true },
                              { label: emp.deptName, disabled: true },
                              { divider: true },
                              { label: "Export schedule (CSV)", icon: "↓", onClick: () => exportEmpCSV(emp) },
                              { divider: true },
                              { label: "Mark whole week as day off", icon: "✕", onClick: () => days.forEach(d => dispatch({ type: "SET_CELL", key: emp.i+"|"+d, code: null, viol: [] })) },
                            ])}>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-xs truncate flex-1">{emp.name}</span>
                              {hours != null && (
                                <span className={cx("font-mono text-2xs shrink-0",
                                  hours > 48 ? "font-semibold" : "text-faint")}
                                  style={hours > 48 ? { color: "var(--st-crit)" } : hours > 40 ? { color: "var(--st-warn)" } : {}}>
                                  {hours}h
                                </span>
                              )}
                            </div>
                          </td>

                          {/* one cell per day */}
                          {days.map((d) => {
                            const key      = emp.i + "|" + d;
                            const curCode  = getShift(emp.i, d);
                            const inH      = SF.inHorizon(d);
                            const ch       = diffMap && diffMap.get(key);
                            const isChanged = !!(ch && ch.from !== ch.to);
                            const pinned   = curCode && pins.has(key);
                            const ovr      = overrides.get(key);
                            const violated = curCode && !!(ovr && ovr.viol && ovr.viol.length);

                            const dispCode = (diff && solvedView && ch) ? (ch.to !== undefined ? ch.to : curCode) : curCode;

                            const s = dispCode ? SF.SHIFTS.find(x => x.code === dispCode) : null;
                            const bgColor = dispCode ? "var(--sh-" + dispCode + "-bg)" : undefined;
                            const wkEnd = SF.isWeekend(d);
                            const lastWk = lastDaysOfWeek.has(d);

                            const tipNode = () => (
                              <div>
                                <p className="font-semibold">{emp.name}</p>
                                <p className="font-mono text-dim">{SF.DOW[SF.mod(d, 7)]} {SF.dateOf(d).getDate()} · {s ? s.name + " " + SF.shiftTime(dispCode) : "Day off"}</p>
                                {pinned   && <p className="mt-1">◢ Pinned — locked for next generation.</p>}
                                {violated && ovr.viol.map((v, k) => <p key={k} className="mt-1" style={{ color: "var(--st-crit)" }}>✕ {v.rule}: {v.text}</p>)}
                                {isChanged && <p className="mt-1" style={{ color: "var(--st-prop)" }}>◆ {ch.from || "off"} → {ch.to || "off"}</p>}
                              </div>
                            );

                            return (
                              <td key={d}
                                className={cx("border-b relative text-center",
                                  inH && "cursor-pointer",
                                  !inH && "opacity-20",
                                  isChanged && "sf-proposed",
                                  violated && "sf-viol")}
                                style={{
                                  height: "var(--row-h)",
                                  background: bgColor || (wkEnd ? WEEKEND_BG : undefined),
                                  verticalAlign: "middle",
                                  borderRight: lastWk ? "2px solid var(--border-strong)" : "1px solid var(--border)",
                                }}
                                onClick={(e) => inH && onCellClick(e, emp, d, curCode, !!curCode, ch, null)}
                                onContextMenu={e => inH && openCtx(e, [
                                  { label: SF.dayLong(d) + " · " + emp.name, disabled: true },
                                  { divider: true },
                                  ...SF.SHIFTS.map(s => ({
                                    label: SF.hh(s.start).replace(":","")+"-"+SF.hh(s.end).replace(":",""),
                                    icon: curCode === s.code ? "✓" : "",
                                    onClick: () => assignShift(emp, d, s.code),
                                  })),
                                  { label: "Day off", icon: !curCode ? "✓" : "", onClick: () => assignShift(emp, d, null) },
                                  { divider: true },
                                  { label: pins.has(emp.i+"|"+d) ? "Unpin" : "Pin cell", icon: "◢", onClick: () => dispatch({ type: "PIN_TOGGLE", key: emp.i+"|"+d }) },
                                ])}
                                onMouseEnter={(e) => {
                                  if (!dispCode && !isChanged) return;
                                  const r = e.currentTarget.getBoundingClientRect();
                                  tip.current && tip.current.show(r.left, r.bottom, tipNode());
                                }}
                                onMouseLeave={() => tip.current && tip.current.hide()}>
                                {pinned && dispCode && (
                                  <span className="absolute top-0 left-0 z-[2]"
                                    style={{ borderTop: "6px solid var(--st-pin)", borderRight: "6px solid transparent" }} />
                                )}
                                {dispCode && s && (
                                  <span className="font-mono font-semibold whitespace-nowrap leading-none"
                                    style={{ fontSize: "11px", letterSpacing: "-0.02em", color: "var(--sh-" + dispCode + "-fg)" }}>
                                    {SF.hh(s.start).replace(":","")}-{SF.hh(s.end).replace(":","")}
                                  </span>
                                )}

                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        </div>

        <TooltipLayer ref={tip} />
        {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}

        {pop && pop.kind === "emp" && (
          <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={268}>
            <EmpActionPopover emp={pop.emp} d={pop.d} curShift={pop.sc}
              getShift={gsRef.current} pins={pins} viol={pop.viol}
              onAssign={(code) => assignShift(pop.emp, pop.d, code)}
              onPin={() => { dispatch({ type: "PIN_TOGGLE", key: pop.emp.i + "|" + pop.d }); setPop(null); }} />
          </Popover>
        )}

      </div>
    );
  }

  const EMPTY_MAP = new Map();
  return ScheduleBoard;
})();
window.ScheduleBoard = ScheduleBoard;
