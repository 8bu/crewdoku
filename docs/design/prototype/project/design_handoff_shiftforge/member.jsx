/* Member surface: personal schedule, requests, preference profile. Demo member = EMPLOYEES[12]. */
const MemberSurface = (() => {
  const { useState } = React;
  const ME = 12;

  const STATUS_TONE = { pending: "warn", approved: "ok", rejected: "crit", countered: "prop" };

  function MemberSurface({ app, dispatch }) {
    const me = SF.EMPLOYEES[ME];
    const myReqs = app.requests.filter((r) => r.empIdx === ME);
    const view = app.memberView || "schedule";

    const getShift = (i, absDay) => {
      const o = app.overrides.get(i + "|" + absDay);
      if (o !== undefined) return o.code;
      const b = SF.baseAssign(i, absDay);
      return b === undefined ? null : b;
    };
    const hours = SF.weekHours(ME, 0, getShift);

    const PAGE_TITLES = {
      schedule: { title: "My schedule", sub: "Jun 12 – Jun 25, 2026 · " + hours + "h this week" },
      requests: { title: "Requests", sub: "Submit and track day-off, swap and sick requests" },
      prefs:    { title: "Preferences", sub: "Recurring soft constraints — best-effort, not guaranteed" },
    };
    const pg = PAGE_TITLES[view];

    return (
      <div className="flex-1 flex flex-col min-h-0" data-screen-label="Member">
        <PageHeader title={pg.title} subtitle={pg.sub} />
        <div className="flex-1 overflow-auto">
          {view === "schedule" && <MySchedule  app={app} getShift={getShift} />}
          {view === "requests" && <MyRequests  app={app} dispatch={dispatch} myReqs={myReqs} />}
          {view === "prefs"    && <MyPrefs     app={app} dispatch={dispatch} />}
        </div>
      </div>
    );
  }

  function MySchedule({ app, getShift }) {
    const days = Array.from({ length: 14 }, (_, k) => k - 3); // Jun 12 .. Jun 25
    return (
      <div className="p-3 max-w-md" data-screen-label="Member / My schedule">
        <div className="border border-bd bg-surface rounded-[2px]">
          {days.map((d) => {
            const code = getShift(ME, d);
            const key = ME + "|" + d;
            const pinned = app.pins.has(key);
            const pending = app.requests.find((r) => r.status === "pending" && r.empIdx === ME && r.absDay === d);
            const today = d === -3;
            return (
              <div key={d} className={cx("flex items-center gap-2.5 px-2.5 border-b border-[var(--grid-line)] last:border-b-0", SF.isWeekend(d) && !code && "bg-[var(--weekend-tint)]")}
                style={{ height: "30px", background: today ? "var(--sel-bg)" : undefined }}>
                <span className={cx("font-mono text-2xs w-16 shrink-0", today ? "font-bold" : "text-dim")} style={today ? { color: "var(--sel)" } : null}>
                  {SF.dayLabel(d)}{today && " ·"}
                </span>
                {code ? <ShiftChip code={code} time /> : <span className="text-xs text-faint">Day off</span>}
                <span className="flex-1"></span>
                {pinned && <span className="font-mono text-2xs text-dim" title="Pinned by your leader — will not move">◢ pinned</span>}
                {pending && <Badge tone="warn" title={pending.detail}>REQ {pending.id}</Badge>}
              </div>
            );
          })}
        </div>
        <p className="text-2xs text-faint mt-2">Showing 2 weeks. Later periods appear once your leader generates them.</p>
      </div>
    );
  }

  function MyRequests({ app, dispatch, myReqs }) {
    const [type, setType] = useState("dayoff");
    const [date, setDate] = useState("2026-06-22");
    const [colleague, setColleague] = useState("16");
    const [note, setNote] = useState("");
    const me = SF.EMPLOYEES[ME];
    const teammates = SF.EMPLOYEES.filter((e) => e.dept === me.dept && e.i !== ME).slice(0, 12);

    const submit = () => {
      const absDay = Math.round((new Date(date + "T12:00") - new Date(2026, 5, 15, 12)) / 864e5);
      const labels = { dayoff: "Day off", swap: "Shift swap", sick: "Unplanned absence", pref: "Preference change" };
      const detail =
        type === "swap" ? SF.dayLong(absDay) + " · swap with " + SF.EMPLOYEES[Number(colleague)].name :
        type === "pref" ? note || "Recurring preference" :
        SF.dayLong(absDay) + (note ? " — " + note : "");
      dispatch({ type: "ADD_REQUEST", req: {
        id: "R-" + (1050 + app.requests.length), empIdx: ME, type, title: labels[type], detail,
        absDay: type === "pref" ? null : absDay, submitted: "Jun 12",
        status: "pending", consent: type === "swap" ? "awaiting" : undefined,
        swapWith: type === "swap" ? Number(colleague) : undefined, ripple: null,
      }});
      setNote("");
    };

    return (
      <div className="p-3 grid gap-3 items-start" style={{ gridTemplateColumns: "minmax(280px,340px) minmax(360px,1fr)" }} data-screen-label="Member / Requests">
        <Panel title="New request">
          <div className="space-y-2.5">
            <Seg value={type} onChange={setType} className="w-full" options={[
              { v: "dayoff", label: "Day off" }, { v: "swap", label: "Swap" }, { v: "sick", label: "Sick" }, { v: "pref", label: "Preference" },
            ]} />
            {type !== "pref" && (
              <Field label={type === "sick" ? "Date (defaults to today)" : "Date"}>
                <TextInput type="date" value={date} onChange={setDate} mono className="w-full" />
              </Field>
            )}
            {type === "swap" && (
              <Field label="Swap with" hint="Your colleague must consent before your leader sees the request.">
                <SelectBox value={colleague} onChange={setColleague} className="w-full"
                  options={teammates.map((e) => ({ v: String(e.i), label: e.name }))} />
              </Field>
            )}
            {type === "pref" && (
              <Field label="Preference" hint="Recurring preferences live in your profile — this sends a one-off note to your leader.">
                <TextInput value={note} onChange={setNote} placeholder="e.g. avoid Night shifts in July" className="w-full" />
              </Field>
            )}
            {type === "sick" && <Banner level="warn">Sick days notify your leader immediately. Coverage backfill is suggested by the solver.</Banner>}
            {(type === "dayoff") && (
              <Field label="Note (optional)">
                <TextInput value={note} onChange={setNote} placeholder="reason, context…" className="w-full" />
              </Field>
            )}
            <Btn variant="primary" onClick={submit} className="w-full justify-center">Submit request</Btn>
          </div>
        </Panel>

        <Panel title={"My requests · " + myReqs.length} pad={false}>
          {myReqs.length === 0 ? (
            <EmptyState glyph="◇" title="No requests yet" body="Day-off, swap, sick-day and preference requests you submit appear here with their status." />
          ) : (
            <div>
              {myReqs.map((r) => (
                <div key={r.id} className="px-2.5 py-2 border-b border-[var(--grid-line)] last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xs text-faint">{r.id}</span>
                    <span className="text-xs font-semibold">{r.title}</span>
                    <span className="flex-1"></span>
                    {r.consent === "awaiting" && <Badge>CONSENT AWAITING</Badge>}
                    <Badge tone={STATUS_TONE[r.status]}>{r.status.toUpperCase()}</Badge>
                  </div>
                  <p className="text-2xs text-dim mt-0.5">{r.detail} · submitted {r.submitted}</p>
                  {r.status === "rejected" && r.reason && (
                    <p className="text-2xs mt-1 px-2 py-1 border rounded-[2px]" style={{ color: "var(--st-crit)", background: "var(--st-crit-bg)", borderColor: "color-mix(in oklab, var(--st-crit) 40%, transparent)" }}>
                      Reason: {r.reason}
                    </p>
                  )}
                  {r.status === "pending" && r.ripple === null && <p className="text-2xs text-faint mt-1">Solver pre-check runs when your leader reviews it.</p>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    );
  }

  function MyPrefs({ app, dispatch }) {
    const [kind, setKind] = useState("avoid");
    const [shift, setShift] = useState("N");
    const [scope, setScope] = useState("Mondays");
    const mine = app.prefs.filter((p) => p.empIdx === ME);
    return (
      <div className="p-3 max-w-xl space-y-3" data-screen-label="Member / Preferences">
        <Banner level="warn" title="Preferences are not guarantees">
          These feed the solver as <b>soft constraints</b> (term S2, weight 6 — set by your sysadmin). The solver optimises
          for them, but coverage and rest rules always win.
        </Banner>
        <Panel title={"Recurring preferences · " + mine.length} pad={false}>
          {mine.length === 0 ? (
            <EmptyState glyph="◇" title="No preferences set" body="Add recurring soft constraints like “no Night shifts on Mondays”." />
          ) : mine.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-2.5 h-8 border-b border-[var(--grid-line)] last:border-b-0 text-xs">
              <span className="font-mono text-2xs px-1 border border-bd rounded-[1px] text-dim">{p.kind === "avoid" ? "AVOID" : "PREFER"}</span>
              <ShiftChip code={p.shift} />
              <span className="text-dim">· {p.scope}</span>
              <span className="flex-1"></span>
              <Badge tone="neutral" title="Soft constraint — best effort">S2 · soft</Badge>
              <Btn variant="ghost" onClick={() => dispatch({ type: "PREF_REMOVE", id: p.id })} title="Remove">✕</Btn>
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-bd bg-raised flex-wrap">
            <SelectBox value={kind} onChange={setKind} options={[{ v: "avoid", label: "Avoid" }, { v: "prefer", label: "Prefer" }]} />
            <SelectBox value={shift} onChange={setShift} options={SF.SHIFTS.map((s) => ({ v: s.code, label: s.name + " " + SF.shiftTime(s.code) }))} />
            <span className="text-2xs text-dim">on</span>
            <SelectBox value={scope} onChange={setScope} options={["Any day", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Weekends"].map((s) => ({ v: s, label: s }))} />
            <Btn onClick={() => dispatch({ type: "PREF_ADD", pref: { id: "p" + Date.now(), empIdx: ME, kind, shift, scope } })}>+ Add</Btn>
          </div>
        </Panel>
        <p className="text-2xs text-faint">Synced to the solver · last generation honoured 11 of 13 active preferences (85%).</p>
      </div>
    );
  }

  return MemberSurface;
})();
window.MemberSurface = MemberSurface;
