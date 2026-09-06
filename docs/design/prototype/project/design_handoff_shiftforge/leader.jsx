/* Leader surface: tab strip (Board · Inbox · Solver) + approval inbox. */
const { LeaderSurface, InboxView } = (() => {
  const { useState, useMemo, useCallback } = React;

  function LeaderSurface({ app, dispatch }) {
    return (
      <div className="flex-1 flex flex-col min-h-0" data-screen-label="Leader">
        {app.leaderView === "board"  && <ScheduleBoard app={app} dispatch={dispatch} onGenerate={() => dispatch({ type: "LEADER_VIEW", view: "solver" })} />}
        {app.leaderView === "inbox"  && <InboxView app={app} dispatch={dispatch} />}
        {app.leaderView === "solver" && <GenerateSurface app={app} dispatch={dispatch} />}
      </div>
    );
  }

  const TYPE_LABEL = { dayoff: "DAY OFF", swap: "SWAP", sick: "SICK", pref: "PREF" };
  const STATUS_TONE = { pending: "warn", approved: "ok", rejected: "crit", countered: "prop" };

  function InboxView({ app, dispatch }) {
    const pending = app.requests.filter((r) => r.status === "pending");
    const resolved = app.requests.filter((r) => r.status !== "pending");
    const [selId, setSelId] = useState(pending[0] ? pending[0].id : null);
    const sel = app.requests.find((r) => r.id === selId);

    const getShift = useCallback((i, absDay) => {
      const o = app.overrides.get(i + "|" + absDay);
      if (o !== undefined) return o.code;
      const b = SF.baseAssign(i, absDay);
      return b === undefined ? null : b;
    }, [app.overrides]);

    const approve = (r) => {
      let cells = [];
      if ((r.type === "dayoff" || r.type === "sick") && r.absDay != null) {
        cells = [{ key: r.empIdx + "|" + r.absDay, code: null, viol: [] }];
      } else if (r.type === "swap" && r.swapWith != null && r.absDay != null) {
        const a = getShift(r.empIdx, r.absDay), b = getShift(r.swapWith, r.absDay);
        cells = [
          { key: r.empIdx + "|" + r.absDay, code: b ?? null, viol: b ? SF.checkViolations(r.empIdx, r.absDay, b, getShift) : [] },
          { key: r.swapWith + "|" + r.absDay, code: a ?? null, viol: a ? SF.checkViolations(r.swapWith, r.absDay, a, getShift) : [] },
        ];
      }
      dispatch({ type: "REQUEST_DECIDE", id: r.id, status: "approved", cells });
    };

    return (
      <div className="flex-1 flex flex-col min-h-0" data-screen-label="Leader / Approval inbox">
        <PageHeader title="Approval inbox" subtitle={pending.length + " pending request" + (pending.length !== 1 ? "s" : "") + " — each shows a solver pre-check before you decide"} />
        <div className="flex flex-1 min-h-0">
        {/* list */}
        <div className="w-[330px] shrink-0 border-r border-bd overflow-auto bg-surface">
          <p className="px-2.5 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-dim">Pending · {pending.length}</p>
          {pending.length === 0 && (
            <EmptyState glyph="✓" title="Inbox zero" body="New member requests appear here with a solver pre-check of their ripple effect." className="py-10" />
          )}
          {pending.map((r) => <InboxRow key={r.id} r={r} sel={selId === r.id} onClick={() => setSelId(r.id)} />)}
          {resolved.length > 0 && <p className="px-2.5 pt-3 pb-1 text-2xs font-semibold uppercase tracking-wider text-faint border-t border-bd mt-2">Resolved · {resolved.length}</p>}
          {resolved.map((r) => <InboxRow key={r.id} r={r} sel={selId === r.id} onClick={() => setSelId(r.id)} dim />)}
        </div>
        {/* detail */}
        <div className="flex-1 overflow-auto">
          {sel ? <RequestDetail r={sel} app={app} dispatch={dispatch} onApprove={() => approve(sel)} getShift={getShift} />
            : <EmptyState glyph="◇" title="Select a request" body="Pick a request from the queue to review its details and solver pre-check." className="h-full" />}
        </div>
        </div>
      </div>
    );
  }

  function InboxRow({ r, sel, onClick, dim }) {
    const emp = SF.EMPLOYEES[r.empIdx];
    return (
      <button type="button" onClick={onClick}
        className={cx("w-full text-left px-2.5 py-1.5 border-b border-[var(--grid-line)] block",
          sel ? "bg-[var(--sel-bg)] border-l-2 border-l-[var(--sel)]" : "border-l-2 border-l-transparent hover:bg-surface-2",
          dim && "opacity-60")}>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-2xs text-faint">{r.id}</span>
          <Badge>{TYPE_LABEL[r.type]}</Badge>
          <span className="flex-1"></span>
          <Badge tone={STATUS_TONE[r.status]}>{r.status.toUpperCase()}</Badge>
        </div>
        <p className="text-xs font-semibold mt-0.5">{emp.name}</p>
        <p className="text-2xs text-dim truncate">{r.detail}</p>
        {r.ripple && r.status === "pending" && (
          <p className="flex items-center gap-1.5 mt-1 text-2xs" style={{ color: TONES[r.ripple.level].color }}>
            <Dot tone={r.ripple.level} />
            {r.ripple.level === "crit" ? "Breaks a hard constraint" : r.ripple.level === "warn" ? "Tight — needs a fix" : "No impact"}
          </p>
        )}
      </button>
    );
  }

  function RequestDetail({ r, app, dispatch, onApprove, getShift }) {
    const emp = SF.EMPLOYEES[r.empIdx];
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState("Coverage risk — staffing already at minimum (H1)");
    const [counter, setCounter] = useState(false);
    const consentBlocked = r.type === "swap" && r.consent === "awaiting";
    const hours = SF.weekHours(r.empIdx, r.absDay != null ? Math.floor(r.absDay / 7) : 0, getShift);

    return (
      <div className="p-3 max-w-xl space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-md font-semibold">{r.title}</h2>
          <span className="font-mono text-2xs text-faint">{r.id} · submitted {r.submitted}</span>
          <span className="flex-1"></span>
          <Badge tone={STATUS_TONE[r.status]}>{r.status.toUpperCase()}</Badge>
        </div>

        <Panel pad={false}>
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <span className="w-7 h-7 flex items-center justify-center font-mono text-2xs font-bold rounded-[2px]" style={{ background: "var(--ink-solid)", color: "var(--text-inv)" }}>{SF.initials(emp.name)}</span>
            <div className="flex-1">
              <p className="text-xs font-semibold">{emp.name}</p>
              <p className="text-2xs text-dim">{emp.deptName} · {emp.id}</p>
            </div>
            <span className="font-mono text-2xs text-dim">{hours}h that week</span>
          </div>
          <div className="border-t border-bd px-2.5 py-2 text-xs">
            {r.detail}
            {r.absDay != null && (
              <span className="ml-2 text-2xs text-faint font-mono">current: {getShift(r.empIdx, r.absDay) ? SF.shift(getShift(r.empIdx, r.absDay)).name + " " + SF.shiftTime(getShift(r.empIdx, r.absDay)) : "day off"}</span>
            )}
          </div>
          {r.type === "swap" && (
            <div className="border-t border-bd px-2.5 py-2 flex items-center gap-2 text-xs">
              <span className="text-2xs font-semibold uppercase tracking-wider text-dim">Colleague consent</span>
              <Badge tone={r.consent === "accepted" ? "ok" : "warn"}>{r.consent === "accepted" ? "✓ ACCEPTED" : "AWAITING"}</Badge>
              {r.swapWith != null && <span className="text-dim">{SF.EMPLOYEES[r.swapWith].name}</span>}
            </div>
          )}
        </Panel>

        {r.ripple && (
          <Panel title="Solver pre-check" tone={r.ripple.level}>
            <div className="flex gap-2 items-start text-xs leading-relaxed">
              <Dot tone={r.ripple.level} />
              <p>{r.ripple.text}</p>
            </div>
            {r.absDay != null && (
              <Btn variant="ghost" className="mt-2" onClick={() => { dispatch({ type: "WEEK", set: Math.floor(r.absDay / 7) }); dispatch({ type: "LEADER_VIEW", view: "board" }); }}>
                Show on board →
              </Btn>
            )}
          </Panel>
        )}

        {r.status === "pending" && !rejecting && (
          <div className="flex items-center gap-2">
            <Btn variant="primary" onClick={onApprove} disabled={consentBlocked}
              title={consentBlocked ? "Colleague has not consented yet" : undefined}>✓ Approve{r.ripple && r.ripple.level !== "ok" ? " anyway" : ""}</Btn>
            <Btn onClick={() => setCounter(true)}>↩ Counter-propose</Btn>
            <Btn variant="danger" onClick={() => setRejecting(true)}>✕ Reject</Btn>
            {consentBlocked && <span className="text-2xs text-dim">Blocked until {SF.EMPLOYEES[r.swapWith].name} consents.</span>}
          </div>
        )}
        {rejecting && (
          <Panel title="Reject with reason" tone="crit">
            <div className="space-y-2">
              <SelectBox value={reason} onChange={setReason} className="w-full" options={[
                { v: "Coverage risk — staffing already at minimum (H1)", label: "Coverage risk — staffing already at minimum (H1)" },
                { v: "Would break the 11h rest rule (H3)", label: "Would break the 11h rest rule (H3)" },
                { v: "Too many absences already approved that day", label: "Too many absences already approved that day" },
                { v: "Other (add note)", label: "Other (add note)" },
              ]} />
              <p className="text-2xs text-faint">The reason is shown to {emp.name.split(" ")[0]} in their request tracker.</p>
              <div className="flex gap-2">
                <Btn variant="danger" onClick={() => { dispatch({ type: "REQUEST_DECIDE", id: r.id, status: "rejected", reason }); setRejecting(false); }}>Confirm reject</Btn>
                <Btn variant="ghost" onClick={() => setRejecting(false)}>Cancel</Btn>
              </div>
            </div>
          </Panel>
        )}
        {r.status === "rejected" && r.reason && <Banner level="crit" title="Rejected">{r.reason}{r.decidedBy ? " — " + r.decidedBy : ""}</Banner>}
        {r.status === "approved" && <Banner level="ok" title="Approved">Schedule updated{r.decidedBy ? " by " + r.decidedBy : ""}. Affected cells now show on the board; coverage chips reflect the change.</Banner>}
        {r.status === "countered" && <Banner level="prop" title="Counter-proposal sent">Waiting for {emp.name.split(" ")[0]} to accept or decline your alternative.</Banner>}

        {counter && (
          <Modal title={"Counter-propose · " + r.id} onClose={() => setCounter(false)}
            footer={<React.Fragment>
              <Btn variant="ghost" onClick={() => setCounter(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={() => { dispatch({ type: "REQUEST_DECIDE", id: r.id, status: "countered" }); setCounter(false); }}>Send counter-proposal</Btn>
            </React.Fragment>}>
            <div className="space-y-2 text-xs">
              <p className="text-dim">Suggest an alternative. The member can accept (auto-applies) or decline.</p>
              <textarea className="w-full h-20 border border-bds bg-surface p-2 text-xs rounded-[2px]"
                defaultValue={"Wed Jun 17 instead? Swing has +2 slack that day, so coverage holds without a reshuffle."} />
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return { LeaderSurface, InboxView };
})();
Object.assign(window, { LeaderSurface, InboxView });
