/* Generation screen: pre-flight → run states (queued/solving/done/infeasible) → result or conflict core. */
const GenerateSurface = (() => {
  const { useState, useEffect, useRef } = React;

  function GenerateSurface({ app, dispatch }) {
    const [run, setRun] = useState({ phase: app.diff ? "review" : "idle", elapsed: 0, relaxed: null });
    const [outcome, setOutcome] = useState("optimal");
    const [relax, setRelax] = useState(null);
    const timer = useRef(null);

    const start = (relaxedText) => setRun({ phase: "queued", elapsed: 0, relaxed: relaxedText || null });

    useEffect(() => {
      clearInterval(timer.current); clearTimeout(timer.current);
      if (run.phase === "queued") {
        timer.current = setTimeout(() => setRun((r) => ({ ...r, phase: "solving", elapsed: 0 })), 700);
      } else if (run.phase === "solving") {
        timer.current = setInterval(() => {
          setRun((r) => {
            const e = r.elapsed + 90;
            if (e >= 3100) return { ...r, elapsed: e, phase: outcome === "infeasible" ? "infeasible" : "done" };
            return { ...r, elapsed: e };
          });
        }, 90);
      }
      return () => { clearInterval(timer.current); clearTimeout(timer.current); };
    }, [run.phase, outcome]);

    useEffect(() => {
      if (run.phase === "done") dispatch({ type: "SET_PROPOSAL", proposal: SF.makeProposal(app.pins) });
    }, [run.phase]);

    const pendingReqs = app.requests.filter((r) => r.status === "pending").length;
    const hardInstances = SF.HARD.reduce((a, h) => a + h.instances, 0);
    const softWeight = SF.SOFT.reduce((a, s) => a + s.weight, 0);

    return (
      <div className="flex-1 overflow-auto" data-screen-label="Generation screen">
        <div className="p-3 grid gap-3 items-start max-w-6xl" style={{ gridTemplateColumns: "300px minmax(420px,1fr)" }}>
          {/* ---- pre-flight ---- */}
          <div className="space-y-3">
            <Panel title="Pre-flight · week of Jun 15" pad={false}>
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ["Horizon", "7 days · Mon–Sun"],
                    ["Staff in scope", "100 across 5 departments"],
                    ["Hard constraints", "5 families · " + hardInstances.toLocaleString() + " instances"],
                    ["Soft terms", "5 · total weight " + softWeight],
                    ["Pinned cells", app.pins.size + " (locked)"],
                    ["Open requests", pendingReqs + " pending — not blocking"],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-[var(--grid-line)] last:border-b-0">
                      <td className="px-2.5 py-1.5 text-dim whitespace-nowrap">{k}</td>
                      <td className="px-2.5 py-1.5 font-mono text-right">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Hard constraint families" pad={false}>
              {SF.HARD.map((h) => (
                <div key={h.id} className="flex items-center gap-2 px-2.5 h-7 border-b border-[var(--grid-line)] last:border-b-0 text-xs">
                  <Badge>{h.id}</Badge><span className="flex-1 truncate" title={h.desc}>{h.name}</span>
                  <span className="font-mono text-2xs text-faint">{h.instances.toLocaleString()}</span>
                </div>
              ))}
            </Panel>
            <Panel title="Demo control" tone="sel">
              <div className="space-y-1.5">
                <Seg value={outcome} onChange={setOutcome} className="w-full"
                  options={[{ v: "optimal", label: "Optimal result" }, { v: "infeasible", label: "Infeasible" }]} />
                <p className="text-2xs text-faint leading-snug">◇ Prototype-only switch to preview both solver outcomes.</p>
              </div>
            </Panel>
            <Btn variant="primary" size="lg" className="w-full justify-center"
              disabled={run.phase === "queued" || run.phase === "solving"}
              onClick={() => { setRelax(null); start(run.relaxed); }}>
              ▸ Run solver
            </Btn>
          </div>

          {/* ---- right: state ---- */}
          <div className="space-y-3 min-w-0">
            {run.phase === "idle" && !app.diff && (
              <Panel className="min-h-72">
                <EmptyState glyph="▸" title="Solver idle"
                  body={"Pre-flight looks good: " + app.pins.size + " pinned cells, no blocking warnings. Generation typically takes 2–8s at this scale."} />
              </Panel>
            )}

            {(run.phase === "queued" || run.phase === "solving") && (
              <Panel title="Solver run · CP-SAT">
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="sf-spinner"></span>
                  <span className="text-xs font-semibold">{run.phase === "queued" ? "Queued — position 1" : "Solving…"}</span>
                  <span className="font-mono text-xs text-dim">{(run.elapsed / 1000).toFixed(1)}s</span>
                  <span className="flex-1"></span>
                  <Btn variant="ghost" onClick={() => setRun({ phase: "idle", elapsed: 0, relaxed: null })}>Cancel</Btn>
                </div>
                <div className="border border-bd bg-surface-2 p-2 h-40 overflow-auto font-mono text-2xs text-dim leading-relaxed">
                  {run.relaxed && <p style={{ color: "var(--st-warn)" }}>relaxation active: {run.relaxed}</p>}
                  {SF.SOLVER_LOG.filter((l) => run.phase === "solving" && l.t <= run.elapsed).map((l) => (
                    <p key={l.t}>[{(l.t / 1000).toFixed(2)}s] {l.s}</p>
                  ))}
                  <p className="sf-blink">▌</p>
                </div>
              </Panel>
            )}

            {(run.phase === "done" || run.phase === "review") && app.diff && (
              <ResultPanel app={app} dispatch={dispatch} relaxed={run.relaxed}
                onDiscard={() => { dispatch({ type: "DIFF_DISCARD" }); setRun({ phase: "idle", elapsed: 0, relaxed: null }); }} />
            )}
            {(run.phase === "done" || run.phase === "review") && !app.diff && (
              <Panel className="min-h-72">
                <EmptyState glyph="✓" title="Proposal applied"
                  body="The last proposal was reviewed and applied on the board. Run the solver again for a fresh one." />
              </Panel>
            )}

            {run.phase === "infeasible" && (
              <InfeasiblePanel relax={relax} setRelax={setRelax}
                onRerun={() => { const r = SF.INFEASIBLE.relaxations.find((x) => x.id === relax); setOutcome("optimal"); start(r ? r.text : null); }} />
            )}
          </div>
        </div>
      </div>
    );
  }

  function StatBig({ label, value, suffix, delta, deltaTone }) {
    return (
      <Panel className="flex-1">
        <p className="text-2xs font-semibold uppercase tracking-wider text-dim">{label}</p>
        <p className="font-mono text-2xl font-semibold leading-tight mt-1">
          {value}<span className="text-sm text-faint">{suffix}</span>
          {delta && <Badge tone={deltaTone} className="ml-2 align-middle">{delta}</Badge>}
        </p>
      </Panel>
    );
  }

  function ResultPanel({ app, dispatch, relaxed, onDiscard }) {
    const p = app.diff.proposal;
    const hist = SF.workloadHistogram(0);
    return (
      <React.Fragment>
        {relaxed && <Banner level="warn" title="Solved with relaxation">{relaxed}</Banner>}
        <Banner level="ok" title={"Optimal solution found · proposal " + p.id}>
          All {SF.HARD.reduce((a, h) => a + h.instances, 0).toLocaleString()} hard constraint instances satisfied.
          {" "}{p.changes.length} cells differ from the current schedule.
        </Banner>
        <div className="flex gap-3">
          <StatBig label="Fairness score" value={p.fairness} suffix=" /100" delta={"+" + (p.fairness - p.prevFairness)} deltaTone="ok" />
          <StatBig label="Total penalty" value={p.penalty} delta={String(p.penalty - p.prevPenalty)} deltaTone="ok" />
          <StatBig label="Changed cells" value={p.changes.length} suffix={" of 700"} />
        </div>
        <Panel title="Penalty breakdown — by soft term (gray = before)">
          <Bars rows={p.breakdown.map((b) => ({ label: b.id + " · " + b.name, value: b.now, prev: b.prev }))} />
        </Panel>
        <Panel title="Workload distribution — hours per person, this week">
          <Hist buckets={hist} />
        </Panel>
        <div className="flex gap-2">
          <Btn variant="primary" size="lg" onClick={() => dispatch({ type: "LEADER_VIEW", view: "board" })}>
            Review {p.changes.length} changes on board →
          </Btn>
          <Btn variant="ghost" size="lg" onClick={onDiscard}>Discard proposal</Btn>
        </div>
      </React.Fragment>
    );
  }

  function InfeasiblePanel({ relax, setRelax, onRerun }) {
    return (
      <React.Fragment>
        <Banner level="crit" title="No feasible schedule exists">{SF.INFEASIBLE.summary}</Banner>
        <Panel title="Conflict core — these 3 cannot all hold" tone="crit" pad={false}>
          {SF.INFEASIBLE.core.map((c) => (
            <div key={c.cid} className="flex items-start gap-2 px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0 text-xs">
              <Badge tone="crit">{c.cid}</Badge>
              <span className="leading-snug">{c.text}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Suggested relaxations — pick one" pad={false}>
          {SF.INFEASIBLE.relaxations.map((r) => (
            <label key={r.id} className={cx("flex items-start gap-2.5 px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0 cursor-pointer text-xs", relax === r.id && "bg-[var(--sel-bg)]")}>
              <input type="radio" name="relax" checked={relax === r.id} onChange={() => setRelax(r.id)} className="mt-0.5" />
              <span className="leading-snug">
                <b className="font-medium">{r.text}</b>
                <span className="block text-2xs text-dim mt-0.5">{r.detail}</span>
              </span>
            </label>
          ))}
        </Panel>
        <div className="flex gap-2 items-center">
          <Btn variant="primary" size="lg" disabled={!relax} onClick={onRerun}>↻ Re-run with selected relaxation</Btn>
          <span className="text-2xs text-faint">or adjust shift requirements in Sysadmin → Shift definitions</span>
        </div>
      </React.Fragment>
    );
  }

  return GenerateSurface;
})();
window.GenerateSurface = GenerateSurface;
