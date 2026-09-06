# Crewdoku — Project Context for Claude

You are working on **Crewdoku**, an offline-first, single-user web app to build and
manage one company's multi-week team schedule. Product intent: `VISION.md`.
Read this whole file before doing anything. Do not re-ask what's answered here.

It is an **app, not a platform**: no roles, no auth, no approval/consent workflows,
no requests/ripple system. Swaps are direct edits.

---

## Current phase: greenfield UI prototype

The prior app (`app/@crewdoku/app` + `packages/domain/@crewdoku/domain`, real HiGHS
MILP solver, IndexedDB) was **nuked**. Nothing survives outside git history. The repo
is rebuilding as a **clickable prototype first** — a stub solver behind the real
solver port — so the engine rewrite can drop in later without touching UI code.

**Start every session by reading the wayfinder map:** `.scratch/crewdoku-ui/map.md`.
It holds the destination, the settled decisions, and the ticket list
(`.scratch/crewdoku-ui/issues/`). This effort carries execution — a ticket ends in
working prototype code, not only a decision. Skills the map's tickets lean on:
`/prototype`, `/grilling`, `/domain-modeling`, `/grillwithform`, `ste` for prose.

Visual reference (read-only, not runnable): `docs/design/prototype/` (Claude Design
handoff bundle — read the chat transcripts first) and `docs/design/crewdoku-proto/`
(prior HTML/JSX mockup). The prototype's own visual language is ticket 02's job —
`proto/src/styles.css` is intentionally a placeholder until then.

Everything below "Architecture" describes the **old, deleted app**. It stays only
as design memory for the real-engine rebuild that follows the prototype — see
`docs/_archive/` and git history. Do not write code against it; `proto/` has no
domain layer, no solver, no IndexedDB yet.

---

## Architecture — pnpm workspace

```
crewdoku/
├── proto/                @crewdoku/proto — Vite + React + TS. The only app code today.
├── docs/design/          Visual reference (see above).
├── docs/_archive/        Superseded specs/plans from the pre-nuke app.
├── .scratch/crewdoku-ui/ Wayfinder map + tickets for this phase.
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json
```

**Language:** TypeScript everywhere, strict. `pnpm lint` is `tsc --noEmit`.
Tests are Vitest (jsdom).

### How to run

```bash
corepack enable pnpm && pnpm install
pnpm dev     # http://localhost:5173 (or next free port)
pnpm test    # vitest
pnpm lint    # tsc --noEmit
pnpm build   # vite build
```

---

## Design system (prototype phase)

- **No emoji** — geometric Unicode only (▸ ▾ ◢ ◆ ⚠ ✓ ✕). This rule predates and
  survives the nuke.
- Everything else — type scale, data font, borders, shift-code colours, cell status
  classes — is ticket 02's decision (`.scratch/crewdoku-ui/issues/02-visual-language.md`).
  Once settled it lands here, not before.

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
