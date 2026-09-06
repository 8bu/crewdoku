/* Crewdoku — demo data + deterministic solver simulation. Exposes window.SF */
window.SF = (function () {
  "use strict";

  // deterministic hash -> [0,1)
  const hash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const mod = (n, m) => ((n % m) + m) % m;

  /* ---- Shifts: 24h coverage, 1h overlaps. end may exceed 24 (crosses midnight) ---- */
  /* byDow: per-day coverage requirements [Mon, Tue, Wed, Thu, Fri, Sat, Sun] */
  const SHIFTS = [
    { code: "N", name: "Night", start: 1,  end: 6,  req: 10, cap: 12,
      byDow: [{min:10,max:12},{min:10,max:12},{min:10,max:12},{min:10,max:12},{min:10,max:12},{min:7,max:10},{min:7,max:10}] },
    { code: "E", name: "Early", start: 5,  end: 11, req: 14, cap: 16,
      byDow: [{min:14,max:16},{min:14,max:16},{min:14,max:16},{min:14,max:16},{min:14,max:16},{min:10,max:14},{min:10,max:14}] },
    { code: "M", name: "Mid",   start: 10, end: 16, req: 16, cap: 18,
      byDow: [{min:16,max:18},{min:16,max:18},{min:16,max:18},{min:16,max:18},{min:16,max:18},{min:12,max:16},{min:12,max:16}] },
    { code: "A", name: "Swing", start: 15, end: 21, req: 16, cap: 18,
      byDow: [{min:16,max:18},{min:16,max:18},{min:16,max:18},{min:16,max:18},{min:16,max:18},{min:12,max:16},{min:12,max:16}] },
    { code: "L", name: "Late",  start: 20, end: 26, req: 14, cap: 16,
      byDow: [{min:14,max:16},{min:14,max:16},{min:14,max:16},{min:14,max:16},{min:14,max:16},{min:10,max:14},{min:10,max:14}] },
  ];
  /* isNight: computed on the fly — true for shifts that start before 08:00 or at/after 20:00 */
  const isNight = (s) => s.start < 8 || s.start >= 20;
  const SHIFT_IDX = Object.fromEntries(SHIFTS.map((s, i) => [s.code, i]));
  const shift = (code) => SHIFTS[SHIFT_IDX[code]];
  const hh = (h) => String(mod(h, 24)).padStart(2, "0") + ":00";
  const shiftTime = (code) => { const s = shift(code); return hh(s.start) + "\u2013" + hh(s.end); };
  const shiftHours = (code) => shift(code).end - shift(code).start;

  const DEPTS = [
    { id: "prodA", name: "Production A", from: 0,  to: 25 },
    { id: "prodB", name: "Production B", from: 26, to: 49 },
    { id: "qa",    name: "Quality",      from: 50, to: 65 },
    { id: "maint", name: "Maintenance",  from: 66, to: 79 },
    { id: "log",   name: "Logistics",    from: 80, to: 99 },
  ];

  const FIRST = ["Ada","Bram","Carla","Dmitri","Elif","Femke","Gustav","Hana","Imre","Jonas","Katya","Lars","Mara","Nico","Oksana","Pavel","Quinn","Rosa","Stefan","Tilda","Umut","Vera","Wim","Xenia","Yusuf","Zofia","Anders","Beatriz","Casper","Dalia","Emil","Freya","Goran","Helga","Ivo","Jana","Karim","Lena","Marek","Nadia","Otto","Petra","Ravi","Saskia","Tomas","Ulla","Viktor","Wanda","Yannick","Zara"];
  const LAST = ["Albers","Bakker","Cervenka","Dijkstra","Eriksen","Fischer","Grimm","Hale","Iqbal","Jansen","Kovacs","Lindqvist","Meyer","Novak","Okafor","Petrov","Quist","Ruiz","Sorensen","Tanaka","Ueda","Visser","Wagner","Xu","Ymir","Zeman","Andersen","Berg","Claes","Duarte","Engel","Falk","Gruber","Horvat","Ilves","Janik","Kraus","Lorenz","Mercer","Nakamura","Olsen","Pasternak","Reyes","Smit","Toth","Urban","Vogel","Weiss","Yilmaz","Zorn"];

  // home-shift distribution tuned to coverage: N14 E20 M22 A22 L22 of 100
  const HOME_CUM = [14, 34, 56, 78, 100];
  const homeFor = (i) => { const p = (i * 37 + 11) % 100; return HOME_CUM.findIndex((c) => p < c); };

  const EMPLOYEES = [];
  for (let i = 0; i < 100; i++) {
    const dept = DEPTS.find((d) => i >= d.from && i <= d.to);
    EMPLOYEES.push({
      i,
      id: "E" + String(100 + i),
      name: FIRST[i % 50] + " " + LAST[(i * 7 + Math.floor(i / 50) * 13) % 50],
      dept: dept.id,
      deptName: dept.name,
      home: homeFor(i),
      /* H6 eligibility — defaults to all shifts; narrow per employee in Configuration → Teams */
      eligibleShiftIds: SHIFTS.map(s => s.code),
    });
  }
  const initials = (name) => name.split(" ").map((w) => w[0]).join("");

  /* ---- Calendar: absDay 0 = Mon Jun 15 2026. Generated horizon: -14..13 ---- */
  const BASE = new Date(2026, 5, 15);
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dateOf = (absDay) => new Date(2026, 5, 15 + absDay);
  const dayLabel = (absDay) => { const d = dateOf(absDay); return DOW[mod(absDay, 7)] + " " + d.getDate(); };
  const dayLong = (absDay) => { const d = dateOf(absDay); return DOW[mod(absDay, 7)] + " " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
  const isWeekend = (absDay) => mod(absDay, 7) >= 5;
  const HORIZON = [-14, 13];
  const inHorizon = (absDay) => absDay >= HORIZON[0] && absDay <= HORIZON[1];

  /* ---- Base (published) schedule: deterministic ---- */
  function baseAssign(i, absDay) {
    if (!inHorizon(absDay)) return undefined; // not generated
    if (!EMPLOYEES[i]) return null;           // guard: employee might not exist
    const wk = Math.floor(absDay / 7), dow = mod(absDay, 7);
    const off1 = mod(i * 2 + wk * 3, 7);
    let off2 = mod(i * 5 + wk * 3 + 3, 7);
    if (off2 === off1) off2 = mod(off1 + 2, 7);
    if (dow === off1 || dow === off2) return null; // day off
    const r = hash(i * 131 + absDay * 37 + 7);
    let idx = EMPLOYEES[i].home;
    if (r >= 0.8 && r < 0.9) idx = (idx + 1) % 5;
    else if (r >= 0.9) idx = (idx + 4) % 5;
    return SHIFTS[idx].code;
  }

  /* ---- Seeded pins for week 0 (keys "empIdx|absDay") ---- */
  const PINS = [];
  [[4,2],[17,5],[33,0],[58,3],[76,1],[91,4],[22,3],[47,6],[64,0],[88,2],[9,4],[71,1]].forEach(([i, d]) => {
    let dd = d, guard = 0;
    while (baseAssign(i, dd) == null && guard++ < 7) dd = mod(dd + 1, 7);
    if (baseAssign(i, dd) != null) PINS.push(i + "|" + dd);
  });

  /* Crewdoku is single-user — no member requests, swaps, or approval workflows.
     REQUESTS data intentionally removed. */

  /* ---- Constraints ---- */
  const HARD = [
    { id: "H1", name: "Shift coverage",       desc: "Every shift meets required headcount, every day", instances: 35 },
    { id: "H2", name: "Max 48h per week",     desc: "No one is scheduled above the weekly hour cap", instances: 100 },
    { id: "H3", name: "Min 11h rest",         desc: "Rest between consecutive shifts \u2265 11h", instances: 600 },
    { id: "H4", name: "One shift per day",    desc: "A person holds at most one shift per day", instances: 700 },
    { id: "H5", name: "Absences respected",   desc: "Approved time off is never scheduled over", instances: 9 },
    { id: "H6", name: "Shift eligibility",    desc: "Employees only assigned to their eligible shift types", instances: 100 },
  ];
  const SOFT = [
    { id: "S1", name: "Fair night shifts",         weight: 8, blurb: "Make sure no one gets stuck with all the night shifts — everyone takes their fair turn." },
    { id: "S2", name: "Respect people's wishes",  weight: 6, blurb: "Try to schedule people on the shifts they prefer whenever possible." },
    { id: "S3", name: "Keep things stable",        weight: 4, blurb: "Avoid changing the schedule too much — people like knowing what to expect." },
    { id: "S4", name: "Share the weekends",        weight: 5, blurb: "Make sure weekend shifts are spread around evenly — no one works every weekend." },
    { id: "S5", name: "Smooth shift changes",      weight: 3, blurb: "Avoid switching between very early and very late shifts in the same week — it's tiring." },
  ];

  /* ---- Violation checks (real, used for manual-override feedback) ---- */
  const RULES = { maxWeek: 48, minRest: 11 };
  function checkViolations(i, absDay, newCode, getShift) {
    const out = [];
    if (newCode) {
      /* H6: eligibility */
      const emp = EMPLOYEES[i];
      if (emp && emp.eligibleShiftIds && !emp.eligibleShiftIds.includes(newCode)) {
        out.push({ rule: "H6 · ELIGIBILITY", text: "Not eligible for " + shift(newCode).name + " shift." });
      }
      const prev = getShift(i, absDay - 1);
      if (prev) {
        const rest = absDay * 24 + shift(newCode).start - ((absDay - 1) * 24 + shift(prev).end);
        if (rest < RULES.minRest) out.push({ rule: "H3 \u00b7 MIN_REST_11H", text: "Only " + rest + "h rest after " + shift(prev).name + " (ends " + hh(shift(prev).end) + " " + (shift(prev).end > 24 ? dayLabel(absDay) : dayLabel(absDay - 1)) + ")." });
      }
      const next = getShift(i, absDay + 1);
      if (next) {
        const rest = (absDay + 1) * 24 + shift(next).start - (absDay * 24 + shift(newCode).end);
        if (rest < RULES.minRest) out.push({ rule: "H3 \u00b7 MIN_REST_11H", text: "Only " + rest + "h rest before " + shift(next).name + " on " + dayLabel(absDay + 1) + " (starts " + hh(shift(next).start) + ")." });
      }
      // weekly hours
      const wk = Math.floor(absDay / 7);
      let hours = shiftHours(newCode);
      for (let d = wk * 7; d < wk * 7 + 7; d++) {
        if (d === absDay) continue;
        const c = getShift(i, d);
        if (c) hours += shiftHours(c);
      }
      if (hours > RULES.maxWeek) out.push({ rule: "H2 \u00b7 MAX_48H_WEEK", text: "Week total would be " + hours + "h (cap " + RULES.maxWeek + "h)." });
    }
    return out;
  }

  /* ---- Solver proposal (diff) ---- */
  const CHANGE_NOTES = [
    "Improves Night-shift fairness (S1).",
    "Fills a coverage shortfall (H1).",
    "Resolves a rest-window conflict (H3).",
    "Honours a member preference (S2).",
  ];
  function makeProposal(pinsSet) {
    const n = EMPLOYEES.length;
    const changes = [];
    for (let i = 0; i < n && changes.length < 26; i++) {
      for (let d = 0; d < 7 && changes.length < 26; d++) {
        if (hash(i * 517 + d * 91 + 5) >= 0.05) continue;
        if (pinsSet && pinsSet.has(i + "|" + d)) continue;
        const from = baseAssign(i, d);
        const r2 = hash(i * 7 + d * 13 + 99);
        let to;
        if (from == null) to = SHIFTS[Math.floor(r2 * 5)].code;
        else if (r2 < 0.22) to = null;
        else to = SHIFTS[(SHIFT_IDX[from] + 1 + Math.floor(r2 * 3)) % 5].code;
        if (to === from) continue;
        changes.push({ key: i + "|" + d, empIdx: i, absDay: d, from: from ?? null, to, note: CHANGE_NOTES[Math.floor(r2 * 4)] });
      }
    }
    return {
      id: "P-128",
      changes,
      fairness: 87, prevFairness: 82,
      penalty: 142, prevPenalty: 189,
      breakdown: [
        { id: "S1", name: "Night-shift fairness",    now: 46, prev: 78 },
        { id: "S2", name: "Preference satisfaction", now: 38, prev: 52 },
        { id: "S3", name: "Minimal changes",         now: 34, prev: 0  },
        { id: "S4", name: "Weekend rotation",        now: 16, prev: 41 },
        { id: "S5", name: "Sequence consistency",    now: 8,  prev: 18 },
      ],
    };
  }

  /* ---- Infeasible scenario ---- */
  const INFEASIBLE = {
    summary: "The solver proved no schedule can satisfy all hard constraints for the week of Jun 15. The conflict involves 3 constraints \u2014 relaxing any one of them makes the problem solvable.",
    core: [
      { cid: "H1", text: "Night coverage requires 10 people on Thu Jun 18." },
      { cid: "H5", text: "3 approved absences on Jun 18 fall on Night-qualified staff." },
      { cid: "H3", text: "Min 11h rest blocks the remaining Late\u2192Night rotations." },
    ],
    relaxations: [
      { id: "rx1", text: "Lower Night required headcount to 8 for Thu Jun 18 only", detail: "One-off exception; logged in the audit trail." },
      { id: "rx2", text: "Allow 9h rest for 2 volunteers (D. Hale, M. Iqbal) this week", detail: "Requires member consent; flagged on the board." },
      { id: "rx3", text: "Unpin 2 seeded cells on Jun 17\u201318", detail: "Solver regains freedom to rotate Night coverage." },
    ],
  };

  const SOLVER_LOG = [
    { t: 150,  s: "config: 5 shifts \u00b7 100 staff \u00b7 horizon 7d" },
    { t: 450,  s: "building model \u2014 4,816 vars, 13,209 clauses" },
    { t: 900,  s: "presolve: fixed 12 pinned, removed 1,104 vars" },
    { t: 1400, s: "search: 3,402 branches \u00b7 obj 412" },
    { t: 2000, s: "search: 12,118 branches \u00b7 obj 188" },
    { t: 2600, s: "search: 19,773 branches \u00b7 obj 142" },
    { t: 2950, s: "optimality gap 0.0% \u2014 done" },
  ];

  /* ---- Workload (for result chart + name-column hours) ---- */
  function weekHours(i, weekOffset, getShift) {
    let h = 0;
    for (let d = weekOffset * 7; d < weekOffset * 7 + 7; d++) {
      const c = getShift ? getShift(i, d) : baseAssign(i, d);
      if (c) h += shiftHours(c);
    }
    return h;
  }
  function workloadHistogram(weekOffset, getShift) {
    const n = EMPLOYEES.length;
    const buckets = [{ label: "<24h", count: 0, hrs: 0 }, { label: "24h", count: 0, hrs: 24 }, { label: "30h", count: 0, hrs: 30 }, { label: "36h", count: 0, hrs: 36 }, { label: "48h+", count: 0, hrs: 49 }];
    for (let i = 0; i < n; i++) {
      const h = weekHours(i, weekOffset, getShift);
      if      (h < 24) buckets[0].count++;
      else if (h < 30) buckets[1].count++;
      else if (h < 36) buckets[2].count++;
      else if (h <= 48) buckets[3].count++;
      else             buckets[4].count++;
    }
    return buckets;
  }

  const rebuildShiftIdx = () => {
    Object.keys(SHIFT_IDX).forEach(k => delete SHIFT_IDX[k]);
    SHIFTS.forEach((s, i) => { SHIFT_IDX[s.code] = i; });
  };

  /* coverageForDay: returns {min, max} for a given shift code and day-of-week (0=Mon) */
  const coverageForDay = (code, dow) => {
    const s = SHIFTS.find(x => x.code === code);
    if (!s) return { min: 0, max: 0 };
    return s.byDow ? s.byDow[dow] : { min: s.req, max: s.cap };
  };

  return {
    SHIFTS, SHIFT_IDX, shift, shiftTime, shiftHours, hh, isNight, coverageForDay,
    DEPTS, EMPLOYEES, initials,
    DOW, dateOf, dayLabel, dayLong, isWeekend, inHorizon, HORIZON,
    baseAssign, PINS, HARD, SOFT, RULES,
    checkViolations, makeProposal, INFEASIBLE, SOLVER_LOG,
    weekHours, workloadHistogram, mod, rebuildShiftIdx,
  };
})();
