# Crewdoku — Project Context for Agents

You are working on **Crewdoku**, an offline-first, single-user web app to build and
manage one company's multi-week team schedule. Product intent: `VISION.md`.
Read this whole file before doing anything. Do not re-ask what's answered here.

It is an **app, not a platform**: no roles, no auth, no approval/consent workflows,
no requests/ripple system. Swaps are direct edits.

---

## Current phase: the app (`@crewdoku/app`) — COMPLETE (2026-09-06)

The prior app was **nuked**; nothing survives outside git history. Two phases have
since completed: the **UI prototype** (`proto/`, a finished clickable prototype,
now **frozen as the reference** — the spec of behavior) and the **engine backend**
(pure workspace packages under `packages/` — domain, solver, persistence, harness —
proven end to end with no UI). This phase built a fresh `app/`
(`@crewdoku/app`) that reproduces `proto/`'s exact UX wired to the real engine
packages. It is a **port-and-rewire, not a rewrite**: proto's components, styles,
and behavior are copied verbatim; only three seams change — domain types
(`@crewdoku/domain`), persistence (`@crewdoku/persistence`), and the solver
(`@crewdoku/solver`). Never wire the real engine into `proto/`.

**Planning notes are local-only.** The wayfinder maps and tickets for each phase
(`.scratch/crewdoku-ui/`, `.scratch/crewdoku-engine/`, `.scratch/crewdoku-app/`) are
gitignored working notes, not part of the repository. If the directory exists in
your checkout, read the three `map.md` files first — each holds its phase's
destination, settled decisions, and closed ticket list, and the UI map's TODO-fog
list is the behavior spec for parked real-app decisions. If it is absent, the
settled outcomes are already reflected in this file, `VISION.md`, and the code;
nothing else depends on it. Skills the work leans on: `/prototype`, `/grilling`,
`/domain-modeling`, `/grillwithform`, `ste` for prose.

Visual reference (read-only, not runnable): `docs/design/prototype/` (Codex Design
handoff bundle) and `docs/design/crewdoku-proto/` (prior HTML/JSX mockup). The
"Historical reference" section at the bottom describes the **old, deleted app** —
design memory only; do not write code against it.

---

## Architecture — pnpm workspace

```
crewdoku/
├── app/                     @crewdoku/app — Vite + React + TS. The real app; ports proto onto the engine.
├── proto/                   @crewdoku/proto — Vite + React + TS. Frozen reference prototype.
├── packages/
│   ├── domain/              @crewdoku/domain — entities, calendar, constraints, ports. Pure, zero deps.
│   ├── solver/              @crewdoku/solver — MILP model + HiGHS worker adapter. Depends on domain.
│   ├── persistence/         @crewdoku/persistence — IndexedDB + workspace file. Depends on domain.
│   └── harness/             @crewdoku/harness — UI-less end-to-end driver (tests only).
├── docs/design/             Visual reference (see above).
├── docs/_archive/           Superseded specs/plans from the pre-nuke app.
├── .scratch/                Local planning notes (gitignored; see above).
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json
```

Engine packages ship **TS source** (`main: ./src/index.ts`) — no dist step; the
dependency direction is one-way (packages never import UI or each other upward).

**Language:** TypeScript everywhere, strict. `pnpm lint` is `tsc --noEmit`.
Tests are Vitest — jsdom in `proto/`, plain node in `packages/`.

### How to run

```bash
corepack enable pnpm && pnpm install
pnpm dev     # app at http://localhost:5173 (or next free port); `pnpm --filter @crewdoku/proto dev` for the frozen reference
pnpm test    # vitest, every package
pnpm lint    # tsc --noEmit, every package
pnpm build   # vite build (app + proto); engine packages are source-only, no build step
```

---

## Design system (settled during the prototype phase)

- **No emoji.** UI icons come from `lucide-react`, imported through the curated
  `app/src/ui/icons.ts` module (the app's single icon convention) — never raw
  geometric Unicode glyphs (`▾ ✕ ✓ ⚠ →`) for affordances or status marks.
  Geometric Unicode stays only as typography: separators (`·`), range arrows
  (`start → end`), en-dashes. (`proto/` predates this and still uses the old
  Unicode marks; that's the frozen reference, not a pattern to copy into `app/`.)
- Everything else — type scale, data font, borders, shift-code colours, cell status
  classes — is settled and lives in `proto/src/styles.css`.

---

## Historical reference — old app (deleted, `docs/_archive/` + git history only)

The previous build was a pnpm + Turborepo monorepo: pure `@crewdoku/domain` (entities,
calendar, schedule, constraints H1–H6/S1–S5, solver model, CSV export, ports) +
presentation `@crewdoku/app` (Zustand store, board, solve panel, HiGHS Web Worker
adapter, IndexedDB adapter, i18n). Stable nanoid identity, single-assignment-list
schedule keyed `${employeeId}|${date}`, multi-week Period, real HiGHS MILP with a
truthful infeasible→conflict-core→relaxation flow. Superseded plan/spec docs:
`docs/_archive/` (moved there ahead of the nuke; the v2-refactor design/plan specs
that used to live at `docs/superpowers/specs/` are among them). Consult this section
only when scoping the real-engine rebuild — it is not live code, and no prototype
ticket should assume any of it exists on disk.
