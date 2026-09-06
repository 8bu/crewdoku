/* GeneratePanel — compact right sidebar for the combined board + generate view.
   Solver state is lifted to leader.jsx and passed as props.
   GenerateSurface stub kept for backwards compatibility. */
const GeneratePanel = (() => {
  const { useState, useEffect, useRef } = React;

  /* ---- pre-flight table ---- */
  function PreflightTable({ app }) {
    const hardInst     = SF.HARD.reduce((a, h) => a + h.instances, 0);
    const softW        = SF.SOFT.reduce((a, s) => a + s.weight, 0);
    return (
      <table className="w-full text-xs">
        <tbody>
          {[
            ["Horizon",       "7 days · Mon–Sun"],
            ["Staff",         SF.EMPLOYEES.length + " · " + SF.DEPTS.length + " depts"],
            ["Hard",          SF.HARD.length + " families · " + hardInst.toLocaleString() + " inst."],
            ["Soft",          SF.SOFT.length + " terms · weight " + softW],
            ["Pinned cells",  app.pins.size ? app.pins.size + " locked" : "—"],
          ].map(([k, v]) => (
            <tr key={k} className="border-b border-[var(--grid-line)] last:border-b-0">
              <td className="px-2.5 py-1 text-dim whitespace-nowrap">{k}</td>
              <td className="px-2.5 py-1 font-mono text-right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  /* ---- live solver log ---- */
  function SolverLog({ phase, elapsed, relaxed }) {
    const ref = useRef(null);
    const entries = SF.SOLVER_LOG.filter(l => phase === "solving" && l.t <= elapsed);
    useEffect(() => {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }, [entries.length]);
    return (
      <div ref={ref}
        className="h-28 overflow-auto font-mono text-2xs text-dim leading-relaxed p-2 bg-surface border border-bd">
        {relaxed && <p style={{ color: "var(--st-warn)" }}>relaxation active: {relaxed}</p>}
        {phase === "queued" && <p className="text-faint">Position 1 in queue…</p>}
        {entries.map(l => (
          <p key={l.t}>[{(l.t / 1000).toFixed(2)}s] {l.s}</p>
        ))}
        {phase === "solving" && <p className="sf-blink">▌</p>}
      </div>
    );
  }

  /* ---- compact penalty bars ---- */
  function PenaltyBars({ rows }) {
    const max = Math.max(...rows.map(r => Math.max(r.value, r.prev || 0)), 1);
    return (
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.label}>
            <div className="flex justify-between text-2xs mb-0.5">
              <span className="text-dim truncate mr-2">{r.label}</span>
              <span className="font-mono shrink-0">
                {r.prev !== undefined && (
                  <span className="text-faint line-through mr-1.5">{r.prev}</span>
                )}
                <span style={{ color: r.prev !== undefined && r.value < r.prev ? "var(--st-ok)" : "var(--text)" }}>
                  {r.value}
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-[var(--surface-2)] rounded-[1px] relative overflow-hidden">
              {r.prev !== undefined && (
                <div className="absolute inset-y-0 left-0 rounded-[1px]"
                  style={{ width: (r.prev / max * 100) + "%", background: "var(--grid-line)" }} />
              )}
              <div className="absolute inset-y-0 left-0 rounded-[1px] transition-all duration-500"
                style={{ width: (r.value / max * 100) + "%", background: "var(--st-prop)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* ---- compact workload histogram ---- */
  function CompactHist({ buckets }) {
    if (!buckets || !buckets.length) return null;
    const maxH = Math.max(...buckets.map(b => b.count), 1);
    return (
      <div>
        <div className="flex items-end gap-px h-10">
          {buckets.map((b, i) => (
            <div key={i} className="flex-1 rounded-[1px] transition-all duration-500"
              style={{
                height: Math.max((b.count / maxH) * 38, b.count ? 2 : 0) + "px",
                background: b.hrs > 48 ? "var(--st-crit)" : b.hrs > 40 ? "var(--st-warn)" : "var(--st-prop)",
                opacity: b.count === 0 ? 0.15 : 1,
              }} />
          ))}
        </div>
        <div className="flex justify-between text-2xs text-faint font-mono mt-1">
          <span>0h</span><span>24h</span><span>48h</span><span>72h+</span>
        </div>
      </div>
    );
  }

  /* ================================================================
     MAIN PANEL
  ================================================================ */
  function GeneratePanel({ app, dispatch, solverState, setSolverState, outcome, setOutcome, onClose }) {
    const { phase, elapsed, relaxed } = solverState;
    const [relax, setRelax] = useState(null);

    const running  = phase === "queued" || phase === "solving";
    const done     = phase === "done";
    const progress = Math.min(elapsed / 3100, 1);

    const start = (relaxedText) => {
      setRelax(null);
      setSolverState({ phase: "queued", elapsed: 0, relaxed: relaxedText || null });
    };
    const cancel = () => setSolverState({ phase: "idle", elapsed: 0, relaxed: null });

    const p = app.diff ? app.diff.proposal : null;

    return (
      <div className="flex flex-col min-h-0 shrink-0 border-l border-bd"
        style={{ width: "300px", background: "var(--raised)" }}
        data-screen-label="Generate panel">

        {/* ---- header ---- */}
        <div className="flex items-center gap-1.5 px-2.5 h-9 border-b border-bd shrink-0">
          {running ? (
            <React.Fragment>
              <span className="sf-spinner shrink-0" style={{ display: "inline-block" }}></span>
              <span className="text-xs font-semibold flex-1">
                {phase === "queued" ? "Queued…" : "Solving…"}
              </span>
              <span className="font-mono text-xs text-dim tabular-nums">{(elapsed / 1000).toFixed(1)}s</span>
              <Btn variant="ghost" onClick={cancel}>Cancel</Btn>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <span className="text-xs font-semibold flex-1">Generate</span>
              {app.diff && <Badge tone="prop">◆ {p.changes.length} proposed</Badge>}
            </React.Fragment>
          )}
          <button type="button" onClick={onClose}
            className="ml-0.5 w-6 h-6 flex items-center justify-center rounded-[2px] text-faint hover:text-ink hover:bg-[var(--surface-2)] text-xs leading-none">
            ✕
          </button>
        </div>

        {/* ---- progress strip ---- */}
        <div className="h-[2px] bg-[var(--surface-2)] shrink-0 overflow-hidden">
          <div className="h-full transition-[width] duration-100"
            style={{
              width: running ? (progress * 100) + "%" : (app.diff || done) ? "100%" : "0%",
              background: "var(--st-prop)",
              opacity: (running || app.diff || done) ? 1 : 0,
            }} />
        </div>

        {/* ---- scrollable body ---- */}
        <div className="flex-1 overflow-auto p-2.5 space-y-2.5">

          {/* pre-flight */}
          <Panel title="Pre-flight · Jun 15 week" pad={false}>
            <PreflightTable app={app} />
          </Panel>

          {/* hard constraints */}
          <Panel title="Hard constraints" pad={false}>
            {SF.HARD.map(h => (
              <div key={h.id}
                className="flex items-center gap-2 px-2.5 h-7 border-b border-[var(--grid-line)] last:border-b-0 text-xs">
                <Badge>{h.id}</Badge>
                <span className="flex-1 truncate" title={h.desc}>{h.name}</span>
                <span className="font-mono text-2xs text-faint">{h.instances.toLocaleString()}</span>
              </div>
            ))}
          </Panel>

          {/* demo scenario */}
          <Panel title="Demo scenario" tone="sel">
            <div className="space-y-1.5">
              <Seg value={outcome} onChange={setOutcome} className="w-full"
                options={[{ v: "optimal", label: "Optimal" }, { v: "infeasible", label: "Infeasible" }]} />
              <p className="text-2xs text-faint leading-snug">
                Prototype-only toggle — preview both solver outcomes.
              </p>
            </div>
          </Panel>

          {/* run button */}
          <Btn variant="primary" size="lg" className="w-full justify-center"
            disabled={running}
            onClick={() => start(solverState.relaxed)}>
            {running ? "…Running" : "▸ Run solver"}
          </Btn>

          {/* live solver log */}
          {running && (
            <Panel title="Solver log · CP-SAT" pad={false}>
              <div className="p-1.5">
                <SolverLog phase={phase} elapsed={elapsed} relaxed={relaxed} />
              </div>
            </Panel>
          )}

          {/* optimal result */}
          {done && p && (
            <React.Fragment>
              <Banner level="ok" title={"Optimal · Proposal " + p.id}>
                All hard constraints satisfied. {p.changes.length} cells changed.
              </Banner>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: "Fairness", value: p.fairness,       delta: "+" + (p.fairness - p.prevFairness), tone: "ok" },
                  { label: "Penalty",  value: p.penalty,        delta: String(p.penalty - p.prevPenalty),   tone: "ok" },
                  { label: "Changes",  value: p.changes.length, delta: "of 700",                            tone: null },
                ].map(s => (
                  <div key={s.label}
                    className="border border-bd bg-surface rounded-[2px] px-2 py-1.5 text-center">
                    <p className="text-2xs text-dim">{s.label}</p>
                    <p className="font-mono text-sm font-semibold leading-tight mt-0.5">{s.value}</p>
                    {s.tone && <Badge tone={s.tone} className="mt-0.5">{s.delta}</Badge>}
                  </div>
                ))}
              </div>

              <Panel title="Penalty breakdown">
                <PenaltyBars rows={p.breakdown.map(b => ({
                  label: b.id + " · " + b.name,
                  value: b.now,
                  prev:  b.prev,
                }))} />
              </Panel>

              <Panel title="Workload · hrs/person this week">
                <CompactHist buckets={SF.workloadHistogram(0)} />
              </Panel>

              {app.diff && (
                <div className="flex gap-1.5 pt-1">
                  <Btn variant="ghost" className="flex-1 justify-center"
                    onClick={() => dispatch({ type: "DIFF_DISCARD" })}>
                    Discard
                  </Btn>
                  <Btn variant="primary" className="flex-1 justify-center"
                    onClick={() => dispatch({ type: "DIFF_APPLY" })}>
                    ✓ Apply
                  </Btn>
                </div>
              )}
            </React.Fragment>
          )}



          {/* infeasible */}
          {phase === "infeasible" && (
            <React.Fragment>
              <Banner level="crit" title="No feasible schedule">{SF.INFEASIBLE.summary}</Banner>
              <Panel title="Conflict core" tone="crit" pad={false}>
                {SF.INFEASIBLE.core.map(c => (
                  <div key={c.cid}
                    className="flex items-start gap-2 px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0 text-xs">
                    <Badge tone="crit">{c.cid}</Badge>
                    <span className="leading-snug">{c.text}</span>
                  </div>
                ))}
              </Panel>
              <Panel title="Suggested relaxations" pad={false}>
                {SF.INFEASIBLE.relaxations.map(r => (
                  <label key={r.id}
                    className={cx(
                      "flex items-start gap-2.5 px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0 cursor-pointer text-xs",
                      relax === r.id && "bg-[var(--sel-bg)]"
                    )}>
                    <input type="radio" name="gen-relax" checked={relax === r.id}
                      onChange={() => setRelax(r.id)} className="mt-0.5 shrink-0" />
                    <span className="leading-snug">
                      <b className="font-medium">{r.text}</b>
                      <span className="block text-2xs text-dim mt-0.5">{r.detail}</span>
                    </span>
                  </label>
                ))}
              </Panel>
              <Btn variant="primary" size="lg" className="w-full justify-center"
                disabled={!relax}
                onClick={() => {
                  const r = SF.INFEASIBLE.relaxations.find(x => x.id === relax);
                  setOutcome("optimal");
                  start(r ? r.text : null);
                }}>
                ↻ Re-run with relaxation
              </Btn>
            </React.Fragment>
          )}

          {/* idle state */}
          {phase === "idle" && !app.diff && (
            <div className="text-center py-6">
              <div className="font-mono text-2xl text-faint">▸</div>
              <p className="text-xs text-dim mt-2">Ready to generate</p>
              <p className="text-2xs text-faint mt-1 font-mono">
                {app.pins.size} pinned · est. 2–8s
              </p>
            </div>
          )}

        </div>
      </div>
    );
  }

  return GeneratePanel;
})();
window.GeneratePanel = GeneratePanel;
