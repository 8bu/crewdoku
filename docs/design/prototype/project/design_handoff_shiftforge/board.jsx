/* ShiftForge schedule board v4.
   Rows = employees (grouped by dept, collapsible).
   Columns = 3-level hierarchy: Week range › Day › Shift time range.
   Each cell is filled (shift color) when assigned, empty otherwise. */
const ScheduleBoard = (() => {
  const { useState, useRef, useMemo, useCallback, forwardRef, useImperativeHandle, memo } = React;

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
          const v = SF.checkViolations(emp.i, d, s.code, getShift);
          return (
            <button key={s.code} type="button" onClick={() => onAssign(s.code)}
              className="w-full flex items-center gap-2 px-2.5 h-7 hover:bg-[var(--sel-bg)] text-left">
              <span className="w-5 h-5 inline-flex items-center justify-center font-mono text-xs font-semibold border shrink-0"
                style={{ background: "var(--sh-" + s.code + "-bg)", color: "var(--sh-" + s.code + "-fg)", borderColor: "var(--sh-" + s.code + "-bd)" }}>
                {s.code}
              </span>
              <span className="flex-1">{s.name}</span>
              <span className="font-mono text-2xs text-faint">{SF.shiftTime(s.code)}</span>
              {s.code === curShift && <span className="text-2xs text-faint font-mono">✓</span>}
              {v.length > 0 && <span className="font-bold" title={v.map((x) => x.text).join("\n")} style={{ color: "var(--st-crit)" }}>⚠</span>}
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

  /* ---- diff popover ---- */
  function DiffPopover({ emp, ch, decision, onDecide }) {
    return (
      <div className="text-xs">
        <div className="px-2.5 py-1.5 border-b border-bd bg-raised">
          <p className="font-semibold flex items-center gap-2">{emp.name} <Badge tone="prop">proposed</Badge></p>
          <p className="font-mono text-2xs text-dim">{SF.dayLong(ch.absDay)}</p>
        </div>
        <div className="px-2.5 py-2 space-y-1">
          <p className="font-mono">
            {ch.from ? SF.shift(ch.from).name + " " + SF.shiftTime(ch.from) : "Day off"}
            <span className="mx-2" style={{ color: "var(--st-prop)" }}>→</span>
            <b>{ch.to ? SF.shift(ch.to).name + " " + SF.shiftTime(ch.to) : "Day off"}</b>
          </p>
          <p className="text-2xs text-dim">{ch.note}</p>
        </div>
        <div className="flex gap-1.5 px-2.5 pb-2.5">
          <Btn variant={decision === "accept" ? "primary" : "default"} onClick={() => onDecide("accept")} className="flex-1 justify-center">✓ Accept</Btn>
          <Btn variant={decision === "reject" ? "primary" : "default"} onClick={() => onDecide("reject")} className="flex-1 justify-center">✕ Reject</Btn>
          {decision && <Btn variant="ghost" onClick={() => onDecide(null)}>↺</Btn>}
        </div>
      </div>
    );
  }

  /* ================================================================
     MAIN
  ================================================================ */
  function ScheduleBoard({ app, dispatch, onGenerate }) {
    const { zoom, weekOffset, seedMode, pins, overrides, diff, requests } = app;
    const tip = useRef(null);
    const [pop, setPop]             = useState(null);
    const [collapsed, setCollapsed] = useState(() => new Set());
    const [filter, setFilter]       = useState("all");

    /* days + week groups */
    const days = useMemo(() => {
      const n = zoom === "week" ? 7 : 28;
      return Array.from({ length: n }, (_, k) => weekOffset * 7 + k);
    }, [zoom, weekOffset]);

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
      const o = overrides.get(i + "|" + d);
      if (o !== undefined) return o.code;
      const b = SF.baseAssign(i, d);
      return b === undefined ? null : b;
    }, [overrides]);
    const gsRef = useRef(getShift); gsRef.current = getShift;

    const diffMap = useMemo(() => {
      if (!diff) return null;
      const m = new Map();
      diff.proposal.changes.forEach((c) => m.set(c.key, c));
      return m;
    }, [diff && diff.proposal]);

    const pendingMap = useMemo(() => {
      const m = new Map();
      requests.forEach((r) => { if (r.status === "pending" && r.absDay != null) m.set(r.empIdx + "|" + r.absDay, r); });
      return m;
    }, [requests]);

    const hoursByEmp = useMemo(() => {
      if (zoom !== "week") return null;
      return SF.EMPLOYEES.map((e) => SF.weekHours(e.i, weekOffset, getShift));
    }, [zoom, weekOffset, getShift]);

    const decided       = diff ? diff.decided : EMPTY_MAP;
    const acceptedCount = diff ? [...diff.decided.values()].filter((v) => v === "accept").length : 0;
    const decidedCount  = diff ? [...diff.decided.values()].filter(Boolean).length : 0;

    const rangeLabel = useMemo(() => {
      const f = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return f(SF.dateOf(days[0])) + " – " + f(SF.dateOf(days[days.length - 1])) + ", 2026";
    }, [days]);

    /* column geometry */
    const CELL_W  = zoom === "week" ? 32 : 18;
    const NAME_W  = 200;
    const H_WEEK  = 26; /* height of row 1 (week label) */
    const H_DAY   = 26; /* height of row 2 (day of week) */
    const H_SHIFT = 58; /* height of row 3 (rotated time) */
    const TOTAL_COLS = 1 + days.length * SF.SHIFTS.length;

    const onCellClick = useCallback((e, emp, d, sc, assigned, ch, dec) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      const anchor = { x: r.left, y: r.bottom, y2: r.top };
      if (seedMode) { if (assigned) dispatch({ type: "PIN_TOGGLE", key: emp.i + "|" + d }); return; }
      if (ch && !dec) { setPop({ kind: "diff", emp, ch, anchor, decision: null }); return; }
      const ovr = overrides.get(emp.i + "|" + d);
      setPop({ kind: "emp", emp, d, sc: assigned ? sc : null, anchor, viol: ovr ? ovr.viol || [] : [] });
    }, [seedMode, overrides, dispatch]);

    const assignShift = (emp, d, code) => {
      const viol = code ? SF.checkViolations(emp.i, d, code, gsRef.current) : [];
      dispatch({ type: "SET_CELL", key: emp.i + "|" + d, code, viol });
      setPop(null);
    };

    const visibleDepts = SF.DEPTS.filter((d) => filter === "all" || d.id === filter);

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
          <Seg value={zoom} onChange={(v) => dispatch({ type: "ZOOM", zoom: v })}
            options={[{ v: "week", label: "Week", kbd: "W" }, { v: "month", label: "4 weeks", kbd: "M" }]} />
          <div className="flex-1"></div>
          <SelectBox value={filter} onChange={setFilter}
            options={[{ v: "all", label: "All departments" }, ...SF.DEPTS.map((d) => ({ v: d.id, label: d.name }))]} />
          <Btn pressed={seedMode} onClick={() => dispatch({ type: "SEED_TOGGLE" })} kbd="S">
            ◢ Seed{pins.size > 0 ? " · " + pins.size : ""}
          </Btn>
        </div>

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
          <div className="px-2 py-1.5 border-b flex items-center gap-2 shrink-0 flex-wrap" style={{ background: "var(--st-prop-bg)", borderColor: "var(--st-prop)" }}>
            <Badge tone="prop">PROPOSAL {diff.proposal.id}</Badge>
            <span className="text-xs"><b>{diff.proposal.changes.length} changes</b> · fairness <span className="font-mono">{diff.proposal.prevFairness}→<b>{diff.proposal.fairness}</b></span> · penalty <span className="font-mono">{diff.proposal.prevPenalty}→<b>{diff.proposal.penalty}</b></span></span>
            <span className="text-2xs text-dim">{decidedCount}/{diff.proposal.changes.length} decided — click a violet cell to decide</span>
            <div className="flex-1"></div>
            <Btn onClick={() => dispatch({ type: "DIFF_ALL", decision: "accept" })}>Accept all</Btn>
            <Btn onClick={() => dispatch({ type: "DIFF_ALL", decision: "reject" })}>Reject all</Btn>
            <Btn variant="primary" disabled={acceptedCount === 0 && decidedCount === 0} onClick={() => dispatch({ type: "DIFF_APPLY" })}>Apply {acceptedCount} accepted</Btn>
            <Btn variant="ghost" onClick={() => dispatch({ type: "DIFF_DISCARD" })}>Discard</Btn>
          </div>
        )}

        {/* legend */}
        <div className="flex items-center gap-2 px-2.5 h-7 border-b border-bd bg-raised shrink-0 text-2xs">
          <span className="font-semibold uppercase tracking-wider text-faint">Status</span>
          <span className="text-faint">◢ pinned</span>
          <span style={{ color: "var(--st-warn)" }}>⋯ pending</span>
          <span style={{ color: "var(--st-prop)" }}>◆ proposed</span>
          <span style={{ color: "var(--st-crit)" }}>⚠ violation</span>
          <span className="flex-1"></span>
          {SF.SHIFTS.map((s) => (
            <span key={s.code} className="inline-flex items-center gap-1 font-mono"
              style={{ color: "var(--sh-" + s.code + "-fg)", background: "var(--sh-" + s.code + "-bg)", padding: "1px 6px", border: "1px solid var(--sh-" + s.code + "-bd)" }}>
              {s.code} {SF.hh(s.start)}–{SF.hh(s.end)}
            </span>
          ))}
        </div>

        {/* ---- TABLE ---- */}
        <div className="flex-1 overflow-auto relative bg-surface">
          <table style={{
            borderCollapse: "collapse",
            tableLayout: "fixed",
            minWidth: (NAME_W + days.length * SF.SHIFTS.length * CELL_W) + "px",
          }}>
            <colgroup>
              <col style={{ width: NAME_W + "px" }} />
              {days.map((d) => SF.SHIFTS.map((s) => <col key={s.code + "|" + d} style={{ width: CELL_W + "px" }} />))}
            </colgroup>

            <thead>
              {/* ---- Row 1: week range ---- */}
              <tr>
                <th rowSpan={3}
                  className="sticky left-0 z-30 bg-raised border-r border-b border-bd text-left align-bottom px-2.5 pb-1.5"
                  style={{ top: 0 }}>
                  <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Employee</span>
                </th>
                {weekGroups.map((wg) => (
                  <th key={wg.wk} colSpan={wg.days.length * SF.SHIFTS.length}
                    className="sticky z-20 bg-raised border-r border-b border-bd text-left px-2 font-normal"
                    style={{ top: 0, height: H_WEEK + "px" }}>
                    <span className="font-mono text-xs font-medium text-dim">{wg.label}</span>
                  </th>
                ))}
              </tr>

              {/* ---- Row 2: day of week + date ---- */}
              <tr>
                {days.map((d) => {
                  const today = d === -3;
                  return (
                    <th key={d} colSpan={SF.SHIFTS.length}
                      className={cx("sticky z-20 border-r border-b border-[var(--grid-line)] text-center font-normal",
                        SF.isWeekend(d) && "bg-[var(--weekend-tint)]")}
                      style={{ top: H_WEEK + "px", height: H_DAY + "px", background: today ? "var(--sel-bg)" : undefined }}>
                      <span className="font-mono text-xs font-semibold" style={{ color: today ? "var(--sel)" : "var(--text-dim)" }}>
                        {SF.DOW[SF.mod(d, 7)].slice(0, 3)}
                      </span>
                      <span className="font-mono text-2xs text-faint ml-1">{SF.dateOf(d).getDate()}</span>
                    </th>
                  );
                })}
              </tr>

              {/* ---- Row 3: shift time ranges (vertical / rotated) ---- */}
              <tr>
                {days.map((d) => SF.SHIFTS.map((s) => (
                  <th key={s.code + "|" + d}
                    className={cx("sticky z-20 border-r border-b border-[var(--grid-line)] p-0 font-normal overflow-hidden",
                      SF.isWeekend(d) && "bg-[var(--weekend-tint)]")}
                    style={{ top: (H_WEEK + H_DAY) + "px", height: H_SHIFT + "px" }}>
                    <div className="flex items-center justify-center w-full h-full"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                      <span className="font-mono whitespace-nowrap px-0.5 py-1 text-center"
                        style={{ fontSize: "9px", color: "var(--sh-" + s.code + "-fg)", background: "var(--sh-" + s.code + "-bg)" }}>
                        {SF.hh(s.start)}–{SF.hh(s.end)}
                      </span>
                    </div>
                  </th>
                )))}
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
                            style={{ height: "var(--row-h)", background: ei % 2 === 1 ? "color-mix(in oklab, var(--surface-2) 40%, var(--surface))" : "var(--surface)" }}>
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

                          {/* shift×day cells */}
                          {days.map((d) => SF.SHIFTS.map((s) => {
                            const key      = emp.i + "|" + d;
                            const curShift = getShift(emp.i, d);
                            const assigned = curShift === s.code;
                            const inH      = SF.inHorizon(d);
                            const ch       = diffMap && diffMap.get(key);
                            const dec      = ch ? decided.get(ch.key) : null;
                            const propArr  = ch && !dec && ch.to   === s.code && ch.from !== s.code;
                            const propDep  = ch && !dec && ch.from === s.code && ch.to   !== s.code;
                            const pinned   = assigned && pins.has(key);
                            const pending  = assigned && !!pendingMap.get(key);
                            const ovr      = overrides.get(key);
                            const violated = assigned && !!(ovr && ovr.viol && ovr.viol.length);

                            /* what to show */
                            let show = assigned;
                            if (dec === "accept") show = s.code === ch.to;
                            if (dec === "reject")  show = assigned;

                            let bgColor = undefined;
                            if (show)     bgColor = "var(--sh-" + s.code + "-bg)";
                            else if (propArr) bgColor = "var(--st-prop-bg)";
                            else if (SF.isWeekend(d)) bgColor = "var(--weekend-tint)";

                            const hasStatus = (show && (pending || violated || pinned)) || propArr || propDep;

                            const tipNode = () => (
                              <div>
                                <p className="font-semibold">{emp.name}</p>
                                <p className="font-mono text-dim">{SF.DOW[SF.mod(d, 7)]} {SF.dateOf(d).getDate()} · {s.name} {SF.shiftTime(s.code)}</p>
                                {pinned   && <p className="mt-1">◢ Pinned — locked for next generation.</p>}
                                {pending  && <p className="mt-1" style={{ color: "var(--st-warn)" }}>⚠ Pending request</p>}
                                {violated && ovr.viol.map((v, k) => <p key={k} className="mt-1" style={{ color: "var(--st-crit)" }}>✕ {v.rule}: {v.text}</p>)}
                                {propArr  && <p className="mt-1" style={{ color: "var(--st-prop)" }}>◆ Proposed → {s.name}. Click to accept/reject.</p>}
                                {propDep  && <p className="mt-1" style={{ color: "var(--st-prop)" }}>◆ Proposed move away from {s.name}. Click to accept/reject.</p>}
                              </div>
                            );

                            return (
                              <td key={s.code + "|" + d}
                                className={cx("border-r border-b border-[var(--grid-line)] relative",
                                  inH && "cursor-pointer",
                                  !inH && "opacity-20",
                                  pending && show && "sf-pending",
                                  (propArr || propDep) && "sf-proposed",
                                  violated && "sf-viol")}
                                style={{ height: "var(--row-h)", background: bgColor, verticalAlign: "middle" }}
                                onClick={(e) => inH && onCellClick(e, emp, d, s.code, assigned, ch, dec)}
                                onMouseEnter={(e) => {
                                  if (!show && !propArr && !propDep) return;
                                  const r = e.currentTarget.getBoundingClientRect();
                                  tip.current && tip.current.show(r.left, r.bottom, tipNode());
                                }}
                                onMouseLeave={() => tip.current && tip.current.hide()}>
                                {/* pin wedge */}
                                {pinned && show && (
                                  <span className="absolute top-0 left-0 z-[2]"
                                    style={{ borderTop: "6px solid var(--st-pin)", borderRight: "6px solid transparent" }}>
                                  </span>
                                )}
                              </td>
                            );
                          }))}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <TooltipLayer ref={tip} />

        {pop && pop.kind === "emp" && (
          <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={268}>
            <EmpActionPopover emp={pop.emp} d={pop.d} curShift={pop.sc}
              getShift={gsRef.current} pins={pins} viol={pop.viol}
              onAssign={(code) => assignShift(pop.emp, pop.d, code)}
              onPin={() => { dispatch({ type: "PIN_TOGGLE", key: pop.emp.i + "|" + pop.d }); setPop(null); }} />
          </Popover>
        )}
        {pop && pop.kind === "diff" && (
          <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={268}>
            <DiffPopover emp={pop.emp} ch={pop.ch} decision={pop.decision}
              onDecide={(d) => { dispatch({ type: "DIFF_DECIDE", key: pop.ch.key, decision: d }); setPop(null); }} />
          </Popover>
        )}
      </div>
    );
  }

  const EMPTY_MAP = new Map();
  return ScheduleBoard;
})();
window.ScheduleBoard = ScheduleBoard;
