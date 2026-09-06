# Crewdoku

Offline-first, single-user app to build and manage one company's multi-week team
schedule. It is an **app, not a platform**: no roles, no auth, no approval workflows.
Full product intent: [`VISION.md`](VISION.md).

## Current phase: greenfield UI prototype

The previous app (`app/` + `packages/domain/`) was nuked. Nothing survives outside
git history. The repo is rebuilding as a **clickable prototype first**, on a stub
solver behind the real solver port, so the engine rewrite can drop in later without
touching UI code. The plan, decisions, and open tickets live in the wayfinder map:
[`.scratch/crewdoku-ui/map.md`](.scratch/crewdoku-ui/map.md).

```
crewdoku/
├── proto/              @crewdoku/proto — Vite + React + TS, the only app code today.
│                       Throwaway by name; graduates (or gets rebuilt from) once the
│                       prototype settles.
├── docs/design/        Visual reference — the ShiftForge/Crewdoku HTML mockup handoff
│                       and prior design-prototype exports. Not runnable, read-only intent.
├── docs/_archive/      Superseded specs/plans from the pre-nuke app. History only.
├── VISION.md           Product north star (the *what* and *why*) — still current.
├── CLAUDE.md           Working rules for this phase — still current.
└── .scratch/crewdoku-ui/  The wayfinder map: destination, decisions, tickets.
```

## Quick start

```bash
corepack enable pnpm        # provisions the pinned pnpm
pnpm install
pnpm dev                    # http://localhost:5173 (or next free port)
```

## Workspace scripts (run from root)

```bash
pnpm dev          # run the prototype (vite dev server)
pnpm build        # turbo: proto vite build
pnpm preview      # preview the production build
pnpm test         # turbo: vitest across the workspace
pnpm test:watch   # vitest watch across the workspace
pnpm lint         # turbo: tsc --noEmit
pnpm typecheck    # alias of lint
pnpm clean        # remove build caches + dist
```

## After the prototype

The real engine (HiGHS MILP solver, domain model, IndexedDB persistence) is a
separate effort, out of scope for this phase. `docs/_archive/` and git history
keep the prior implementation's design for when that rebuild starts.
