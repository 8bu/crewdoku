# ShiftForge — Initial Requirements

Captured 2026-06-12 from product brief + design interview. This is the source of truth for the prototype.

## 1. Product summary
Constraint-based team scheduling for 10–1000 employees. A CP-SAT solver generates schedules from
hard/soft constraints; users **negotiate with a generated artifact**, they do not fill in a spreadsheet.
Desktop-first, responsive down to tablet.

## 2. Business requirements
- **B1** Three roles: Team Leader, Team Member, Sysadmin. One app shell, role determines surfaces.
- **B2** Four core surfaces: Schedule board, Member self-service, Sysadmin config, Generation screen.
- **B3** Leaders never hand-draw schedules: they pin (seed), generate, review a diff, and approve requests.
- **B4** Member requests (day off, swap, sick, preference) flow through an approval inbox with
  solver pre-check ripple warnings ("approving this breaks coverage on Thursday").
- **B5** Manual overrides are allowed but get instant constraint-violation feedback (red cell + tooltip naming the rule).
- **B6** Infeasible solver results are a first-class flow: show the conflict core and suggest relaxations
  ("remove 1 of these 3 to make this solvable").
- **B7** Member preferences are soft constraints — UI must state they are *preferences, not guarantees*.
- **B8** Swap requests require colleague consent before leader review.

## 3. Functional requirements by surface
### Leader — Schedule board
- Matrix: people as rows (grouped by department, collapsible), days as columns, shifts as colored cells.
- Week and month (4-week) zoom. Coverage status per day/shift in the header.
- Seed mode: click to pin/unpin assignments; pinned cells visually distinct; solver respects pins.
- Generate flow: button → solver run state → diff view (changed cells highlighted, per-cell accept/reject, accept all).
- Manual override: drag cell to another person/day or click-to-assign; instant violation feedback.
- Approval inbox: queue with approve / reject (reason) / counter-propose; each request shows ripple pre-check.

### Member
- Personal schedule (own row, mobile-friendly vertical list).
- Request forms: day off, preferred shift, sick day, swap (with consent state).
- Request tracking: pending / approved / rejected **with reason**.
- Preference profile: recurring soft constraints + "preferences not guarantees" note.

### Sysadmin
- Shift definitions: name, start/end, color, required headcount, slot capacity.
- Rules: max hours/week, min rest between shifts, max consecutive days.
- Team/department structure, role permission matrix.
- Soft-constraint weight tuning with plain-language explanations.
- Live validation: warn when config is mathematically infeasible (required person-days > available).

### Generation screen (leader-facing)
- Pre-flight: counts of hard constraints, soft terms, pinned cells, horizon.
- Run states: queued → solving (elapsed time, log) → done | infeasible.
- Done: fairness score, total penalty (per-term breakdown), workload distribution chart, → review diff.
- Infeasible: conflict core (which constraints clash) + pick-one relaxation suggestions + re-run.

## 4. Tech requirements
- **T1** HTML prototype: React 18 + Babel (inline JSX), Tailwind CDN.
- **T2** All design tokens as CSS custom properties in `tokens.css`; Tailwind theme maps onto the vars.
  Global restyling = edit vars only. Light + dark theme via `[data-theme]`.
- **T3** Reusable component kit (`ui.jsx`) — buttons, menus, panels, badges, popovers, tables, charts —
  shared across all surfaces.
- **T4** Solver is simulated deterministically (seeded data, scripted run states); rest-time and
  weekly-hour violation checks are computed for real so override feedback is genuine.
- **T5** Demo scale: 100 employees, 5 departments, 5 shifts covering 24h with 1h overlaps:
  N 01–06 · E 05–11 · M 10–16 · A 15–21 · L 20–02.

## 5. Design requirements
- **D1** Aesthetic: dense modern product UI (Linear-like) with desktop-app conventions —
  menubar, panels, statusbar, keyboard hints. Density 8/10. Compact, data-rich, enterprise.
- **D2** Neutral gray chrome. **Color is reserved for meaning**: shift identity (cell hues) and status.
- **D3** Status encoding, consistent across ALL views:
  - assigned = shift-colored cell · pinned = black corner wedge · pending = amber hatch/dash
  - violated = solid red outline + ⚠ · proposed (diff) = dashed violet · empty = blank
  - ok/approved = green · warning = amber · critical/rejected = red
- **D4** Type: compact sans for UI (IBM Plex Sans), monospace for data/numbers (IBM Plex Mono).
- **D5** Light theme primary; dark theme + density + zebra as Tweaks.
- **D6** Empty and error states for every surface, especially "solver found no solution".
- **D7** Desktop-first ≥1280px, usable at tablet 1024px (board scrolls horizontally).

## 6. Deliverables
1. Clickable prototype (this project: `ShiftForge.html`) — all four surfaces, role switcher. ✅ first
2. IA + component inventory + interaction notes for diff/approval flows — separate printable spec (follow-up).
