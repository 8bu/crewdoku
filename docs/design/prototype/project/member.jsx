/* Member / Employee surface — self-service, no approval flow.
   Day off: applies immediately. Swaps: peer-to-peer, no manager needed. */
const MemberSurface = (() => {
  const { useState, useMemo, useCallback } = React;

  /* ---- container ---- */
  function MemberSurface({ app, dispatch }) {
    const empIdx = app.empIdx ?? 12;
    const me     = SF.EMPLOYEES[empIdx];
    const view   = app.empView || "schedule";

    const getShift = useCallback((i, d) => {
      const o = app.overrides.get(i + "|" + d);
      if (o !== undefined) return o.code;
      const b = SF.baseAssign(i, d);
      return b === undefined ? null : b;
    }, [app.overrides]);

    const incomingSwaps = (app.swaps || []).filter(s => s.toEmp === empIdx && s.status === "pending");
    const weekLabel = (() => {
      const d0 = SF.dateOf(app.weekOffset * 7);
      const d6 = SF.dateOf(app.weekOffset * 7 + 6);
      const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return fmt(d0) + " – " + fmt(d6) + ", " + d0.getFullYear();
    })();

    const titles = {
      schedule: { title: "My schedule",   sub: me.name + " · " + me.deptName + " · " + weekLabel },
      swaps:    { title: "Swaps",          sub: incomingSwaps.length + " incoming · " + (app.swaps || []).filter(s => s.fromEmp === empIdx).length + " outgoing" },
      prefs:    { title: "Preferences",    sub: "Recurring soft constraints — best-effort" },
      team:     { title: "Team schedule",  sub: "Read-only overview" },
    };
    const pg = titles[view] || titles.schedule;

    return (
      <div className="flex-1 flex flex-col min-h-0" data-screen-label="Employee">
        <PageHeader title={pg.title} subtitle={pg.sub}
          actions={view === "swaps" && incomingSwaps.length > 0 &&
            <Badge tone="warn">{incomingSwaps.length} incoming</Badge>} />
        <div className="flex-1 overflow-auto">
          {view === "schedule" && <MySchedule  app={app} dispatch={dispatch} empIdx={empIdx} me={me} getShift={getShift} />}
          {view === "swaps"    && <MySwaps     app={app} dispatch={dispatch} empIdx={empIdx} me={me} incomingSwaps={incomingSwaps} getShift={getShift} />}
          {view === "prefs"    && <MyPrefs     app={app} dispatch={dispatch} empIdx={empIdx} />}
          {view === "team"     && <ScheduleBoard app={app} dispatch={dispatch} />}
        </div>
      </div>
    );
  }

  /* ---- my schedule (7-day, inline actions) ---- */
  function MySchedule({ app, dispatch, empIdx, me, getShift }) {
    const days = useMemo(() => Array.from({ length: 7 }, (_, k) => app.weekOffset * 7 + k), [app.weekOffset]);
    const [swapDay, setSwapDay] = useState(null); // absDay being proposed

    const teammates = useMemo(() =>
      SF.EMPLOYEES.filter(e => e.dept === me.dept && e.i !== empIdx), [me.dept, empIdx]);

    const takeDayOff = (d) =>
      dispatch({ type: "SET_CELL", key: empIdx + "|" + d, code: null, viol: [] });

    const weekHours = useMemo(() => {
      let h = 0;
      days.forEach(d => {
        const code = getShift(empIdx, d);
        if (code) h += SF.SHIFTS.find(s => s.code === code).end - SF.SHIFTS.find(s => s.code === code).start;
      });
      return h;
    }, [days, empIdx, getShift, app.overrides]);

    return (
      <div className="p-3 max-w-lg space-y-2">
        {/* week nav */}
        <div className="flex items-center gap-1.5">
          <Btn variant="ghost" onClick={() => dispatch({ type: "WEEK", delta: -1 })}>◀</Btn>
          <Btn variant="ghost" onClick={() => dispatch({ type: "WEEK", set: 0 })}>Today</Btn>
          <Btn variant="ghost" onClick={() => dispatch({ type: "WEEK", delta:  1 })}>▶</Btn>
          <span className="flex-1"></span>
          <span className="font-mono text-xs text-dim">{weekHours}h this week</span>
        </div>

        <div className="border border-bd bg-surface rounded-[2px] overflow-hidden">
          {days.map(d => {
            const code    = getShift(empIdx, d);
            const inH     = SF.inHorizon(d);
            const today   = d === -3;
            const pinned  = app.pins.has(empIdx + "|" + d);
            const pending = (app.swaps || []).find(s => s.fromEmp === empIdx && s.absDay === d && s.status === "pending");

            return (
              <div key={d}
                className="flex items-center gap-2.5 px-2.5 border-b border-[var(--grid-line)] last:border-b-0"
                style={{ minHeight: "36px", background: today ? "var(--sel-bg)" : undefined }}>
                <span className={cx("font-mono text-xs w-20 shrink-0", today ? "font-bold" : "text-dim")}
                  style={today ? { color: "var(--sel)" } : null}>
                  {SF.dayLabel(d)}
                </span>
                {code
                  ? <ShiftChip code={code} time />
                  : <span className="text-xs text-faint italic">Day off</span>}
                <span className="flex-1"></span>
                {pinned  && <span className="font-mono text-2xs text-faint">◢ pinned</span>}
                {pending && <Badge tone="warn">SWAP PENDING</Badge>}
                {inH && code && !pinned && (
                  <React.Fragment>
                    <Btn variant="ghost" onClick={() => setSwapDay(d)}>⇄ Swap</Btn>
                    <Btn variant="ghost" onClick={() => takeDayOff(d)}>✕ Day off</Btn>
                  </React.Fragment>
                )}
                {inH && !code && !pinned && (
                  <span className="text-2xs text-faint">rest day</span>
                )}
              </div>
            );
          })}
        </div>

        {swapDay !== null && (
          <SwapModal
            absDay={swapDay}
            myShift={getShift(empIdx, swapDay)}
            me={me}
            empIdx={empIdx}
            teammates={teammates}
            getShift={getShift}
            onPropose={(toEmp, toShift) => {
              dispatch({ type: "SWAP_PROPOSE", fromEmp: empIdx, toEmp, absDay: swapDay, fromShift: getShift(empIdx, swapDay), toShift });
              setSwapDay(null);
            }}
            onClose={() => setSwapDay(null)}
          />
        )}
      </div>
    );
  }

  /* ---- swap proposal modal ---- */
  function SwapModal({ absDay, myShift, me, empIdx, teammates, getShift, onPropose, onClose }) {
    const [targetIdx, setTargetIdx] = useState(String(teammates[0]?.i ?? ""));
    const target      = targetIdx ? SF.EMPLOYEES[Number(targetIdx)] : null;
    const targetShift = target ? getShift(target.i, absDay) : null;
    const canSwap     = !!(target && targetShift);

    return (
      <Modal title={"Propose swap · " + SF.dayLong(absDay)} onClose={onClose} width={380}
        footer={
          <React.Fragment>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" disabled={!canSwap}
              onClick={() => onPropose(Number(targetIdx), targetShift)}>
              Send swap request
            </Btn>
          </React.Fragment>
        }>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 px-2.5 py-2 border border-bd rounded-[2px] bg-raised">
            <span className="text-2xs font-semibold uppercase text-dim w-10 shrink-0">You</span>
            <span className="text-xs font-medium flex-1">{me.name}</span>
            {myShift && <ShiftChip code={myShift} time />}
          </div>
          <div className="flex items-center gap-2.5 px-2.5 py-2 border border-bd rounded-[2px] bg-raised">
            <span className="text-2xs font-semibold uppercase text-dim w-10 shrink-0">With</span>
            <SelectBox value={targetIdx} onChange={setTargetIdx} className="flex-1"
              options={teammates.map(e => ({ v: String(e.i), label: e.name }))} />
            <span className="w-28 text-right shrink-0">
              {targetShift
                ? <ShiftChip code={targetShift} time />
                : <span className="text-xs text-faint">{target ? "Day off" : "—"}</span>}
            </span>
          </div>
          {target && !targetShift && (
            <Banner level="warn">{target.name.split(" ")[0]} is off that day — can't swap a rest day.</Banner>
          )}
          <p className="text-2xs text-dim leading-snug">
            The swap takes effect as soon as {target?.name.split(" ")[0] || "they"} accepts in their schedule view.
          </p>
        </div>
      </Modal>
    );
  }

  /* ---- swaps hub (incoming + outgoing) ---- */
  function MySwaps({ app, dispatch, empIdx, me, incomingSwaps, getShift }) {
    const outgoing = (app.swaps || []).filter(s => s.fromEmp === empIdx);

    const TONE = { pending: "warn", accepted: "ok", declined: "crit", cancelled: "neutral" };

    function SwapRow({ sw, incoming }) {
      const other = SF.EMPLOYEES[incoming ? sw.fromEmp : sw.toEmp];
      const myShift    = incoming ? sw.toShift   : sw.fromShift;
      const theirShift = incoming ? sw.fromShift : sw.toShift;
      return (
        <div className="px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xs text-faint">{sw.id}</span>
            <span className="text-xs font-semibold flex-1">{SF.dayLong(sw.absDay)}</span>
            <Badge tone={TONE[sw.status] || "neutral"}>{sw.status.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-2xs text-dim">
            <ShiftChip code={myShift} />
            <span>⇄</span>
            <ShiftChip code={theirShift} />
            <span className="ml-1">{incoming ? "from" : "with"} {other.name}</span>
          </div>
          {sw.status === "pending" && (
            <div className="flex gap-1.5 mt-1.5">
              {incoming && (
                <React.Fragment>
                  <Btn variant="primary" onClick={() => dispatch({ type: "SWAP_ACCEPT",  id: sw.id })}>✓ Accept</Btn>
                  <Btn variant="danger"  onClick={() => dispatch({ type: "SWAP_DECLINE", id: sw.id })}>✕ Decline</Btn>
                </React.Fragment>
              )}
              {!incoming && (
                <Btn variant="ghost" onClick={() => dispatch({ type: "SWAP_CANCEL", id: sw.id })}>Cancel request</Btn>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="p-3 grid gap-3 items-start" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: "760px" }}>
        <Panel title={"Incoming · " + incomingSwaps.length} pad={false}>
          {incomingSwaps.length === 0
            ? <EmptyState glyph="◇" title="No incoming swaps" body="When a teammate proposes a swap with you, it appears here to accept or decline." />
            : incomingSwaps.map(sw => <SwapRow key={sw.id} sw={sw} incoming />)
          }
        </Panel>
        <Panel title={"Outgoing · " + outgoing.length} pad={false}>
          {outgoing.length === 0
            ? <EmptyState glyph="◇" title="No outgoing swaps" body="Swap proposals you send from My schedule appear here." />
            : outgoing.map(sw => <SwapRow key={sw.id} sw={sw} />)
          }
        </Panel>
      </div>
    );
  }

  /* ---- preferences ---- */
  function MyPrefs({ app, dispatch, empIdx }) {
    const [kind,  setKind]  = useState("avoid");
    const [shift, setShift] = useState("N");
    const [scope, setScope] = useState("Mondays");
    const mine = app.prefs.filter(p => p.empIdx === empIdx);

    return (
      <div className="p-3 max-w-xl space-y-3" data-screen-label="Employee / Preferences">
        <p className="text-2xs text-dim leading-snug px-0.5">
          Preferences are soft constraints (S2, weight 6). The schedule generator honours them where possible —
          coverage and rest rules always take priority.
        </p>
        <Panel title={"Preferences · " + mine.length} pad={false}>
          {mine.length === 0
            ? <EmptyState glyph="◇" title="No preferences set" body='Add recurring soft constraints like "avoid Night shifts on Mondays".' />
            : mine.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-2.5 h-8 border-b border-[var(--grid-line)] last:border-b-0 text-xs">
                <span className="font-mono text-2xs px-1 border border-bd rounded-[1px] text-dim">
                  {p.kind === "avoid" ? "AVOID" : "PREFER"}
                </span>
                <ShiftChip code={p.shift} />
                <span className="text-dim">· {p.scope}</span>
                <span className="flex-1"></span>
                <Btn variant="ghost" onClick={() => dispatch({ type: "PREF_REMOVE", id: p.id })}>✕</Btn>
              </div>
            ))
          }
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-bd bg-raised flex-wrap">
            <SelectBox value={kind}  onChange={setKind}
              options={[{ v: "avoid", label: "Avoid" }, { v: "prefer", label: "Prefer" }]} />
            <SelectBox value={shift} onChange={setShift}
              options={SF.SHIFTS.map(s => ({ v: s.code, label: s.name + " " + SF.shiftTime(s.code) }))} />
            <span className="text-2xs text-dim">on</span>
            <SelectBox value={scope} onChange={setScope}
              options={["Any day","Mondays","Tuesdays","Wednesdays","Thursdays","Fridays","Weekends"]
                .map(s => ({ v: s, label: s }))} />
            <Btn onClick={() => dispatch({ type: "PREF_ADD", pref: { id: "p" + Date.now(), empIdx, kind, shift, scope } })}>
              + Add
            </Btn>
          </div>
        </Panel>
      </div>
    );
  }

  return MemberSurface;
})();
window.MemberSurface = MemberSurface;
