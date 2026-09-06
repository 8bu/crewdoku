/* ShiftForge app shell v2 — persistent left sidebar + prominent role switcher */
const { useState, useEffect, useReducer, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "rowH": 28
}/*EDITMODE-END*/;

/* ---- state ---- */
const initialState = {
  role: "leader",
  leaderView: "board",
  memberView: "schedule",
  adminSection: "shifts",
  zoom: "week",
  weekOffset: 0,
  seedMode: false,
  pins: new Set(SF.PINS),
  overrides: new Map(),
  diff: null,
  requests: SF.REQUESTS.map((r) => ({ ...r })),
  prefs: [
    { id: "p1", empIdx: 12, kind: "avoid", shift: "N", scope: "Mondays" },
    { id: "p2", empIdx: 12, kind: "prefer", shift: "M", scope: "Any day" },
  ],
};

function reducer(state, a) {
  switch (a.type) {
    case "SET_ROLE":    return { ...state, role: a.role, seedMode: false };
    case "LEADER_VIEW": return { ...state, leaderView: a.view, role: "leader" };
    case "MEMBER_VIEW": return { ...state, memberView: a.view };
    case "ADMIN_SECTION": return { ...state, adminSection: a.section };
    case "ZOOM":        return { ...state, zoom: a.zoom };
    case "WEEK":        return { ...state, weekOffset: a.set !== undefined ? a.set : state.weekOffset + a.delta };
    case "SEED_TOGGLE": return { ...state, seedMode: !state.seedMode };
    case "SEED_OFF":    return { ...state, seedMode: false };
    case "PIN_TOGGLE": {
      const pins = new Set(state.pins);
      pins.has(a.key) ? pins.delete(a.key) : pins.add(a.key);
      return { ...state, pins };
    }
    case "SET_CELL": {
      const overrides = new Map(state.overrides);
      overrides.set(a.key, { code: a.code, viol: a.viol || [] });
      return { ...state, overrides };
    }
    case "MOVE_CELL": {
      const overrides = new Map(state.overrides);
      overrides.set(a.src.key, { code: a.src.code, viol: a.src.viol || [] });
      overrides.set(a.dst.key, { code: a.dst.code, viol: a.dst.viol || [] });
      return { ...state, overrides };
    }
    case "SET_PROPOSAL": return { ...state, diff: { proposal: a.proposal, decided: new Map() } };
    case "DIFF_DECIDE": {
      const decided = new Map(state.diff.decided);
      a.decision ? decided.set(a.key, a.decision) : decided.delete(a.key);
      return { ...state, diff: { ...state.diff, decided } };
    }
    case "DIFF_ALL": {
      const decided = new Map();
      state.diff.proposal.changes.forEach((c) => decided.set(c.key, a.decision));
      return { ...state, diff: { ...state.diff, decided } };
    }
    case "DIFF_APPLY": {
      const overrides = new Map(state.overrides);
      state.diff.proposal.changes.forEach((c) => {
        if (state.diff.decided.get(c.key) === "accept") overrides.set(c.key, { code: c.to, viol: [] });
      });
      return { ...state, overrides, diff: null };
    }
    case "DIFF_DISCARD": return { ...state, diff: null };
    case "REQUEST_DECIDE": {
      const requests = state.requests.map((r) => r.id === a.id ? { ...r, status: a.status, reason: a.reason, decidedBy: "you" } : r);
      let overrides = state.overrides;
      if (a.cells && a.cells.length) {
        overrides = new Map(state.overrides);
        a.cells.forEach((c) => overrides.set(c.key, { code: c.code, viol: c.viol || [] }));
      }
      return { ...state, requests, overrides };
    }
    case "ADD_REQUEST": return { ...state, requests: [a.req, ...state.requests] };
    case "PREF_ADD":    return { ...state, prefs: [...state.prefs, a.pref] };
    case "PREF_REMOVE": return { ...state, prefs: state.prefs.filter((p) => p.id !== a.id) };
    case "CLEAR_EDITS": return { ...state, overrides: new Map() };
    case "UNPIN_ALL":   return { ...state, pins: new Set() };
    default: return state;
  }
}

/* ---- sidebar building blocks ---- */
function SideLabel({ children }) {
  return <p className="px-3 pt-3 pb-1 text-2xs font-semibold uppercase tracking-widest text-faint first:pt-2">{children}</p>;
}
function NavItem({ icon, label, badge, active, onClick, desc }) {
  return (
    <button type="button" onClick={onClick} title={desc}
      className={cx(
        "w-full flex items-center gap-2 px-3 h-7 text-xs rounded-[2px] text-left transition-none",
        active
          ? "bg-[var(--sel-bg)] text-ink font-semibold"
          : "text-dim hover:bg-surface-2 hover:text-ink"
      )}>
      <span className="font-mono text-xs w-3.5 text-center shrink-0 opacity-60">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && <Badge tone="warn" className="ml-auto">{badge}</Badge>}
    </button>
  );
}

/* ---- main sidebar ---- */
function Sidebar({ app, dispatch }) {
  const role = app.role;
  const pending    = app.requests.filter((r) => r.status === "pending").length;
  const myPending  = app.requests.filter((r) => r.empIdx === 12 && r.status === "pending").length;
  const hasDiff    = !!app.diff;

  const ADMIN_NAV = [
    { v: "shifts",  icon: "≡", label: "Shift definitions",  desc: "Define shifts, hours and required headcount" },
    { v: "rules",   icon: "§", label: "Scheduling rules",    desc: "Max hours, min rest, consecutive-day limits" },
    { v: "teams",   icon: "◫", label: "Teams & structure",   desc: "Departments, leaders, night-qualified counts" },
    { v: "perms",   icon: "◇", label: "Role permissions",    desc: "What each role can see and do" },
    { v: "weights", icon: "≈", label: "Solver weights",      desc: "Tune soft-constraint penalty trade-offs" },
  ];

  return (
    <aside className="w-48 shrink-0 border-r border-bd bg-surface flex flex-col select-none overflow-hidden">

      {/* workspace header */}
      <div className="h-9 flex items-center gap-2 px-3 border-b border-bd shrink-0">
        <span className="w-[18px] h-[18px] inline-flex items-center justify-center text-[9px] font-bold font-mono rounded-[2px]"
          style={{ background: "var(--ink-solid)", color: "var(--text-inv)" }}>SF</span>
        <span className="text-xs font-semibold">ShiftForge</span>
        <span className="flex-1"></span>
        <span className="font-mono text-2xs px-1 border border-bd rounded-[2px] text-faint">demo</span>
      </div>

      {/* role-specific navigation */}
      <nav className="flex-1 overflow-auto px-1.5 pb-2">

        {role === "leader" && (
          <React.Fragment>
            <SideLabel>Leader workspace</SideLabel>
            <NavItem icon="▦" label="Schedule board"   active={app.leaderView === "board"}  onClick={() => dispatch({ type: "LEADER_VIEW", view: "board" })}  desc="View and edit the team schedule matrix" />
            <NavItem icon="↓" label="Approval inbox"   active={app.leaderView === "inbox"}  onClick={() => dispatch({ type: "LEADER_VIEW", view: "inbox" })}  badge={pending} desc="Review and decide member requests" />
            <NavItem icon="▸" label="Generate schedule" active={app.leaderView === "solver"} onClick={() => dispatch({ type: "LEADER_VIEW", view: "solver" })} desc="Run CP-SAT solver and review the proposed diff" />
            {hasDiff && (
              <div className="mx-1.5 mt-1 px-2 py-1.5 border rounded-[2px] text-2xs leading-snug cursor-pointer"
                style={{ background: "var(--st-prop-bg)", borderColor: "var(--st-prop)", color: "var(--st-prop)" }}
                onClick={() => dispatch({ type: "LEADER_VIEW", view: "board" })}>
                <p className="font-semibold flex items-center gap-1"><Dot tone="prop" blink />Proposal awaiting review</p>
                <p className="text-faint mt-0.5">{app.diff.proposal.changes.length} cells · click to review on board</p>
              </div>
            )}
          </React.Fragment>
        )}

        {role === "member" && (
          <React.Fragment>
            <SideLabel>My workspace</SideLabel>
            <NavItem icon="▦" label="My schedule"  active={app.memberView === "schedule"}  onClick={() => dispatch({ type: "MEMBER_VIEW", view: "schedule" })}  desc="See your upcoming shifts" />
            <NavItem icon="↩" label="Requests"     active={app.memberView === "requests"} onClick={() => dispatch({ type: "MEMBER_VIEW", view: "requests" })} badge={myPending} desc="Submit and track day-off, swap and sick requests" />
            <NavItem icon="◈" label="Preferences"  active={app.memberView === "prefs"}    onClick={() => dispatch({ type: "MEMBER_VIEW", view: "prefs" })}    desc="Set recurring soft-constraint preferences" />
          </React.Fragment>
        )}

        {role === "admin" && (
          <React.Fragment>
            <SideLabel>Configuration</SideLabel>
            {ADMIN_NAV.map((s) => (
              <NavItem key={s.v} icon={s.icon} label={s.label} desc={s.desc}
                active={app.adminSection === s.v}
                onClick={() => dispatch({ type: "ADMIN_SECTION", section: s.v })} />
            ))}
          </React.Fragment>
        )}
      </nav>

      {/* ---- role switcher — bottom, always visible ---- */}
      <div className="border-t border-bd px-2 py-2.5 shrink-0 bg-raised">
        <p className="text-2xs font-semibold uppercase tracking-widest text-faint px-1 pb-1.5">Viewing as</p>
        {[
          { v: "leader", label: "Team Leader", sub: "Manage schedules" },
          { v: "member", label: "Team Member", sub: "View & request" },
          { v: "admin",  label: "Sysadmin",    sub: "Configure rules" },
        ].map((r) => (
          <button key={r.v} type="button" onClick={() => dispatch({ type: "SET_ROLE", role: r.v })}
            className={cx(
              "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[2px] text-left mb-0.5 group",
              role === r.v ? "bg-surface border border-bd" : "hover:bg-surface-2"
            )}>
            <span className="w-2 h-2 rounded-full shrink-0 mt-0.5 border"
              style={role === r.v
                ? { background: "var(--text)", borderColor: "var(--text)" }
                : { borderColor: "var(--border-strong)" }}>
            </span>
            <span className="min-w-0">
              <span className={cx("block text-xs leading-tight", role === r.v ? "font-semibold text-ink" : "text-dim group-hover:text-ink")}>{r.label}</span>
              <span className="block text-2xs text-faint leading-tight">{r.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

/* ---- page header (sits above content, below menubar) ---- */
function PageHeader({ title, subtitle, actions, tone }) {
  return (
    <div className="flex items-center gap-3 px-3 h-10 border-b border-bd bg-raised shrink-0"
      style={tone ? { borderBottomColor: TONES[tone].borderColor, background: TONES[tone].background } : {}}>
      <div className="min-w-0">
        <h1 className="text-xs font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-2xs text-dim leading-tight truncate">{subtitle}</p>}
      </div>
      <div className="flex-1"></div>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}
window.PageHeader = PageHeader;

/* ---- App ---- */
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [app, dispatch] = useReducer(reducer, initialState);
  const [shortcuts, setShortcuts] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = t.theme;
    root.style.setProperty("--row-h", t.rowH + "px");
  }, [t.theme, t.rowH]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || e.metaKey || e.ctrlKey) return;
      if (e.key === "?") { setShortcuts((v) => !v); return; }
      if (e.key === "Escape") { dispatch({ type: "SEED_OFF" }); return; }
      if (app.role !== "leader") return;
      const k = e.key.toLowerCase();
      if (k === "w") dispatch({ type: "ZOOM", zoom: "week" });
      else if (k === "m") dispatch({ type: "ZOOM", zoom: "month" });
      else if (k === "s") dispatch({ type: "SEED_TOGGLE" });
      else if (k === "g") dispatch({ type: "LEADER_VIEW", view: "solver" });
      else if (k === "t") dispatch({ type: "WEEK", set: -1 });
      else if (e.key === "ArrowLeft") dispatch({ type: "WEEK", delta: -1 });
      else if (e.key === "ArrowRight") dispatch({ type: "WEEK", delta: 1 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app.role]);

  const violations = useMemo(() => {
    let n = 0;
    app.overrides.forEach((o) => { if (o.viol && o.viol.length) n++; });
    return n;
  }, [app.overrides]);

  const pending = app.requests.filter((r) => r.status === "pending").length;
  const edits   = app.overrides.size;

  const menus = [
    { label: "File", items: [
      { label: "Publish week of Jun 15…", kbd: "⌘⇧P", disabled: true },
      { label: "Export week as CSV",      kbd: "⌘E",   disabled: true },
    ]},
    { label: "Edit", items: [
      { label: "Clear manual edits (" + edits + ")",     disabled: edits === 0,        onClick: () => dispatch({ type: "CLEAR_EDITS" }) },
      { label: "Unpin all (" + app.pins.size + ")", disabled: app.pins.size === 0, onClick: () => dispatch({ type: "UNPIN_ALL" }) },
    ]},
    { label: "View", items: [
      { label: "Week view",   kbd: "W", onClick: () => dispatch({ type: "ZOOM", zoom: "week" }),  checked: app.zoom === "week"  },
      { label: "4-week view", kbd: "M", onClick: () => dispatch({ type: "ZOOM", zoom: "month" }), checked: app.zoom === "month" },
      "-",
      { label: "Zebra rows", onClick: () => setTweak("zebra", !t.zebra), checked: t.zebra },
      { label: "Dark theme",  onClick: () => setTweak("theme", t.theme === "dark" ? "light" : "dark"), checked: t.theme === "dark" },
    ]},
    { label: "Help", items: [
      { label: "Keyboard shortcuts", kbd: "?", onClick: () => setShortcuts(true) },
      "-",
      { label: "ShiftForge 0.4 — prototype", disabled: true },
    ]},
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* menubar */}
      <MenuBar brand="ShiftForge" menus={menus} right={
        violations > 0
          ? <span className="flex items-center gap-1 font-semibold text-2xs" style={{ color: "var(--st-crit)" }}>⚠ {violations} rule violation{violations > 1 ? "s" : ""}</span>
          : <span className="flex items-center gap-1.5 font-mono text-2xs text-faint"><Dot tone="ok" />solver idle</span>
      } />

      {/* body: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar app={app} dispatch={dispatch} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {app.role === "leader" && <LeaderSurface app={app} dispatch={dispatch} />}
          {app.role === "member" && <MemberSurface app={app} dispatch={dispatch} />}
          {app.role === "admin"  && <AdminSurface  app={app} dispatch={dispatch} />}
        </div>
      </div>

      {/* status bar */}
      <StatusBar
        left={
          <React.Fragment>
            <span className="flex items-center gap-1.5"><Dot tone="ok" />ready</span>
            {violations > 0 && <span className="flex items-center gap-1 font-semibold" style={{ color: "var(--st-crit)" }}>⚠ {violations} violated cell{violations > 1 ? "s" : ""}</span>}
            {edits > 0 && <span>{edits} manual override{edits > 1 ? "s" : ""}</span>}
            <span>{pending} pending request{pending !== 1 ? "s" : ""}</span>
            {app.pins.size > 0 && <span>◢ {app.pins.size} pinned</span>}
          </React.Fragment>
        }
        right={
          <React.Fragment>
            <span>100 staff · 5 shifts · 24h</span>
            <button type="button" className="hover:text-ink" onClick={() => setShortcuts(true)}>? shortcuts</button>
          </React.Fragment>
        }
      />

      {shortcuts && (
        <Modal title="Keyboard shortcuts" onClose={() => setShortcuts(false)} width={360}>
          <table className="w-full text-xs">
            <tbody>
              {[["W / M","Week / 4-week zoom"],["← →","Previous / next week"],["T","Go to current week"],["S","Toggle seed (pin) mode"],["G","Open solver"],["Esc","Exit seed mode / close"],["?","This panel"]].map(([k,d]) => (
                <tr key={k} className="border-b border-[var(--grid-line)] last:border-b-0">
                  <td className="py-1.5 w-24"><KeyHint>{k}</KeyHint></td>
                  <td className="py-1.5 text-dim">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakRadio label="Mode" value={t.theme} options={["light","dark"]} onChange={(v) => setTweak("theme", v)} />
        <TweakSection label="Board" />
        <TweakSlider label="Row height" value={t.rowH} min={18} max={36} step={1} unit="px" onChange={(v) => setTweak("rowH", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
