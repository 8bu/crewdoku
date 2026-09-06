# Crewdoku — Vision

> An offline-first, single-user web app for one planner to build and manage one
> company's multi-week team schedule. It auto-solves with a real HiGHS MILP
> (WebAssembly, in a Web Worker, fully client-side) and exports to CSV.

This document states **where Crewdoku is headed and why**. It is the product north
star — the *what* and the *why*. `AGENTS.md` holds the *how* (architecture, rules).
When the two disagree, `AGENTS.md` wins on mechanics; this file wins on intent.

---

## 1. The one-sentence product

A planner sits down at their own machine, describes their team and its coverage
needs, presses **Generate**, and gets a fair, rule-legal multi-week schedule they
can tweak by hand and export — with no servers, no accounts, and no one else in the loop.

## 2. Who it is for

One person: **the planner** (a shift lead, ops manager, charge nurse, store manager).
They own the whole schedule. There is no second user, ever.

## 3. What it deliberately is NOT

Crewdoku is an **app, not a platform**. These are permanent non-goals, not "later":

- No accounts, login, roles, or permissions.
- No approval / consent / request / swap *workflows* between people. A "swap" is the
  planner editing two cells.
- No multi-tenant, collaboration, or sharing features.
- No network/server dependency — everything runs and persists locally (IndexedDB).

Every feature must survive the test: *does this still make sense for one person,
offline, owning the entire schedule?* If not, it does not belong here.

## 4. Why it exists

Real scheduling is a constraint problem people solve by hand in spreadsheets —
slowly, unfairly, and with rule violations they only notice after the fact.
Crewdoku makes the **optimizer the default** and the **planner the editor**: the
machine proposes a legal, fair baseline; the human applies judgment on top. The
schedule is always either valid or visibly flagged.

## 5. Principles

1. **Solve first, edit second.** The planner sets up the org and *runs the solver*
   to get a first schedule, then hand-tweaks. A blank board is a prompt to generate,
   not a failure state.
2. **One decision, not a hundred.** Reviewing a proposal is a single yes/no on the
   whole result — preview *Original vs Solved*, then Apply or Discard. No per-cell
   triage.
3. **Always legal or always flagged.** Hard constraints (H1–H6) are never silently
   violated; soft constraints (S1–S5) are scored, weighted, and shown.
4. **The domain is the truth.** All scheduling logic lives in `@crewdoku/domain`
   (pure TS). The UI never computes a constraint or scores a schedule — it asks the
   domain. The solver is real HiGHS MILP, never a fake proposal path.
5. **Local and durable.** Offline-first. A refresh, a flight, a closed laptop — the
   schedule survives in IndexedDB and reloads exactly as left.
6. **Dense, quiet, fast.** Linear-like product UI: neutral chrome, tokenized shift
   colors, `rounded-[2px]`, geometric Unicode (no emoji), IBM Plex.

## 6. The core loop (target experience)

```
Onboard org ─▶ Empty board (guidance: "Schedule is empty — ▸ Generate")
   ─▶ (optional) pin cells in Seed mode
   ─▶ ▸ Run solver  ─▶ proposal arrives
   ─▶ toggle [Original | Solved] to compare the whole board
   ─▶ [Apply] (write all changes)  or  [Discard]
   ─▶ hand-tweak cells  ─▶ export CSV
```

Infeasible branch: solver reports a **conflict core** + suggested **relaxations**;
the planner picks one and re-runs.

## 7. Current direction — the real backend, proven without a UI

The UI prototype phase is **complete**: `proto/` is a finished clickable prototype —
board, wizard, solve flow with a stub solver, settings, coverage, roster, exports —
and is now **frozen as the reference**. It is the spec of what the real product must
feel like and what its engine must serve.

The current phase builds that engine for real, as pure workspace packages under
`packages/` with **no UI at all**:

1. **Domain** — entities, calendar math, and every constraint check the prototype
   promises (H1 coverage band, H2 weekly hours, H3 rest, H5 time off; H4 structural),
   with S1–S5 defined for real scoring.
2. **Solver** — a real HiGHS MILP (WebAssembly, Web Worker, streamed log, cancel)
   behind the solver port the prototype already shaped, including an honest
   infeasible path: true conflict core, relaxations that re-solve for real.
3. **Persistence** — the workspace in IndexedDB, versioned from day one, plus a
   workspace file the planner can export and import.

The proof surface for this phase is a **test harness**, not a browser: load a
workspace → solve → legal proposal (or real conflict core) → persist → reload, at
full scale (100 people × 6 weeks), with the domain's checker as the solver's
independent oracle. The map and tickets live in `.scratch/crewdoku-engine/`.

After the engine: a **fresh `app/`** — a rebuild of the prototype's UI on the real
packages, with its own map. The prototype itself is never wired to the real engine.

## 8. How we know we're done (per change)

A change ships when it is **demonstrated working against its real surface**, not
just unit-green: `pnpm lint` clean, `pnpm test` green, and the target flow verified
end to end — in the browser for UI phases, in the harness for the engine phase.
