# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: **the planner** — a shift lead, ops manager, charge nurse, or store
manager. One person, sole owner of the whole schedule, working alone on their
own machine. There is no second user, ever.

## Product Purpose

Build and manage one company's multi-week team schedule, offline, single-user.
Auto-solves a fair, rule-legal schedule as the default starting point (target:
real HiGHS MILP, WebAssembly, client-side; current build phase runs a stub
solver behind the same solver port), which the planner then hand-tweaks and
exports to CSV.

## Positioning

Makes the optimizer the default and the planner the editor. Real scheduling is
normally a constraint problem solved by hand in spreadsheets — slowly,
unfairly, with rule violations noticed only after the fact. Crewdoku proposes
a legal, fair baseline first; the human applies judgment on top, one Apply/
Discard decision at a time, never per-cell triage.

## Operating Context

Single machine, no server, no accounts/login/roles. Core loop: planner
describes team + coverage needs, presses Generate, reviews Original vs Solved
as one decision, hand-edits cells directly afterward (a "swap" is just editing
two cells — no approval workflow of any kind), exports CSV.

Current build phase: a clickable prototype (`proto/`) — mock roster data, a
stub solver behind the real solver port (`proto/src/engine/`), no persistence
yet. Real HiGHS solver + IndexedDB persistence is deliberately deferred
future work, not a gap in this phase.

## Capabilities and Constraints

- Permanent non-goals (not "later" — structurally out of scope): accounts,
  login, roles, permissions; approval/consent/request/swap *workflows*
  between people; multi-tenant, collaboration, or sharing features; any
  network/server dependency.
- Hard constraints (H1–H6) must never be silently violated; soft constraints
  (S1–S5) are scored, weighted, and shown, never hidden.
- Every hand-edit is accepted even when rule-breaking — flagged, never
  refused.
- Explicitly unresolved as of this phase ("Not yet specified" in the UI-phase
  plan): the complete keyboard map across surfaces; empty/
  loading/error states as a designed set rather than one at a time; help and
  first-run copy; print/hand-off; timing of the real-engine swap.

## Brand Commitments

None locked in as product truth here. `VISION.md` §5.6 states an existing
aesthetic direction — "dense, quiet, fast... Linear-like... neutral chrome,
tokenized shift colors, geometric Unicode (no emoji), IBM Plex" — and the
no-emoji rule is separately restated in `CLAUDE.md`'s design-system section.
Whether that direction stays binding for this redesign, or gets replaced, is
a new-work decision, not recorded here as a constraint.

## Evidence on Hand

None. Internal single-user tool — no testimonials, case studies, press, or
external proof assets apply.

## Product Principles

1. Solve first, edit second — a blank board is a prompt to generate, not a
   failure state.
2. One decision, not a hundred — reviewing a proposal is a single Apply/
   Discard on the whole result.
3. Always legal or always flagged — a hard constraint is never silently
   violated.
4. The domain is the truth — the UI never computes a constraint or scores a
   schedule itself (target architecture; this build phase stubs the solve
   behind `engine/` rather than skipping the boundary).
5. Local and durable — offline-first, survives a refresh or closed laptop
   (target; this build phase has no persistence yet).

## Accessibility & Inclusion

No standard formally required yet. `map.md` flags two open gaps worth
new-work's attention: colour-blind safety for the shift palette, and focus
order across the ~4200-cell board grid.
