/* Crewdoku — combined schedule board + generate panel.
   Solver state is lifted here so both the board scan overlay and the
   generate panel share the same phase/elapsed values. */
const { LeaderSurface } = (() => {
  const { useState, useEffect, useRef } = React;

  function LeaderSurface({ app, dispatch, onExport }) {
    const [genOpen, setGenOpen] = useState(app.adminView === "generate");
    const [solverState, setSolverState] = useState({
      phase:   app.diff ? "review" : "idle",
      elapsed: 0,
      relaxed: null,
    });
    const [outcome, setOutcome] = useState("optimal");
    const timer = useRef(null);

    /* sidebar "Generate" nav → open panel */
    useEffect(() => {
      if (app.adminView === "generate") setGenOpen(true);
    }, [app.adminView]);

    /* solver timer */
    useEffect(() => {
      clearInterval(timer.current);
      clearTimeout(timer.current);
      if (solverState.phase === "queued") {
        timer.current = setTimeout(
          () => setSolverState(s => ({ ...s, phase: "solving", elapsed: 0 })),
          700
        );
      } else if (solverState.phase === "solving") {
        timer.current = setInterval(() => {
          setSolverState(s => {
            const e = s.elapsed + 90;
            if (e >= 3100) {
              return { ...s, elapsed: e, phase: outcome === "infeasible" ? "infeasible" : "done" };
            }
            return { ...s, elapsed: e };
          });
        }, 90);
      }
      return () => { clearInterval(timer.current); clearTimeout(timer.current); };
    }, [solverState.phase, outcome]);

    /* when done → dispatch proposal to app state */
    useEffect(() => {
      if (solverState.phase === "done") {
        dispatch({ type: "SET_PROPOSAL", proposal: SF.makeProposal(app.pins) });
      }
    }, [solverState.phase]);

    /* keep phase in sync with diff coming/going */
    const prevDiff = useRef(!!app.diff);
    useEffect(() => {
      const had = prevDiff.current;
      const has  = !!app.diff;
      prevDiff.current = has;
      if (has && !had) {
        /* new proposal arrived → review */
        setSolverState(s => ({ ...s, phase: "review" }));
        setGenOpen(true);
        dispatch({ type: "ADMIN_VIEW", view: "generate" });
      }
      if (!has && had) {
        /* proposal applied or discarded */
        setSolverState(s => s.phase === "review" ? { ...s, phase: "idle" } : s);
      }
    }, [!!app.diff]);

    const openPanel  = () => { setGenOpen(true);  dispatch({ type: "ADMIN_VIEW", view: "generate" }); };
    const closePanel = () => { setGenOpen(false); dispatch({ type: "ADMIN_VIEW", view: "board"    }); };

    /* config views are full-screen */
    if (app.adminView === "config") {
      return (
        <div className="flex-1 flex flex-col min-h-0" data-screen-label="Admin config">
          <AdminSurface app={app} dispatch={dispatch} />
        </div>
      );
    }

    return (
      <div className="flex-1 flex min-h-0 overflow-hidden" data-screen-label="Admin">
        <ScheduleBoard
          app={app}
          dispatch={dispatch}
          onExport={onExport}
          solverPhase={solverState.phase}
          genOpen={genOpen}
          onGenerateToggle={openPanel}
        />
        {genOpen && (
          <GeneratePanel
            app={app}
            dispatch={dispatch}
            solverState={solverState}
            setSolverState={setSolverState}
            outcome={outcome}
            setOutcome={setOutcome}
            onClose={closePanel}
          />
        )}
      </div>
    );
  }

  return { LeaderSurface };
})();
Object.assign(window, { LeaderSurface });
