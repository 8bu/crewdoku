# Crewdoku

Offline-first, single-user app to build and manage one company's multi-week team
schedule. Auto-solves with a real **HiGHS MILP** (WebAssembly, in a Web Worker —
fully client-side). Review the solver's proposal as a cell-by-cell diff, accept/reject,
apply. Export the team schedule or any one member's schedule to CSV.

It is an **app, not a platform**: no roles, no auth, no approval workflows.

## Monorepo layout

```
crewdoku/
├── packages/
│   └── domain/        @crewdoku/domain — pure TypeScript business logic
│                      (entities, calendar, schedule, constraints, solver model,
│                       CSV export, ports). ZERO React/DOM/WASM. ~80 unit tests.
├── app/               @crewdoku/app — Vite + React 18 + TS presentation layer
│                      (store, UI kit, board, solve panel, config, onboarding,
│                       export) + runtime adapters (HiGHS worker+wasm, IndexedDB).
├── tokens.css         canonical design tokens (app/tokens.css is a verified copy)
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json
└── .changeset/        Changesets — versioning + CHANGELOG
```

**Dependency rule:** `app` depends on `@crewdoku/domain`; the domain depends on
nothing. One direction only — a component never computes a constraint or builds a
model, it asks the domain. Enforced by guard tests.

## Quick start

```bash
corepack enable pnpm        # provisions the pinned pnpm
pnpm install
pnpm dev                    # http://localhost:5173 (or next free port)
```

## Workspace scripts (run from root)

```bash
pnpm dev          # run the app (vite dev server)
pnpm build        # turbo: domain build → app vite build
pnpm preview      # preview the production build
pnpm test         # turbo: vitest across domain + app (cached)
pnpm test:watch   # vitest watch across the workspace
pnpm lint         # turbo: tsc --noEmit (strict + noUncheckedIndexedAccess)
pnpm typecheck    # alias of lint
pnpm clean        # remove build caches + dist
pnpm changeset            # record a change intent
pnpm version-packages     # bump versions + write CHANGELOG
```

## The solver

Real Mixed-Integer Linear Program. The **pure model** lives in
`packages/domain/src/solver/` (`buildModel → {lp, meta}`, `scoreTerms`,
`mapSolution`, `deriveConflictCore`) and is fully unit-testable in Node — no WASM.
The **runtime** lives in `app/src/adapters/highs/` behind the domain's `SolverPort`:
a Web Worker loads `highs.wasm` and solves the emitted CPLEX LP.

- **Hard constraints** H1 coverage (per team) · H2 max hours/week · H3 min rest ·
  H4 one shift/day · H5 time-off & recurring unavailability · H6 eligibility.
- **Soft goals** (weighted, tunable, toggleable) S1 night fairness · S2 preferences ·
  S3 stability · S4 weekend fairness · S5 sequence smoothness.
- Horizon is a multi-week **Period**; H2 buckets per ISO week, H3 spans week
  boundaries, fairness aggregates over the whole period.

Infeasible inputs yield a truthful conflict core plus applicable relaxations.

## Design tokens

`tokens.css` holds every colour, spacing, and shift-identity custom property.
`app/tokens.css` is a byte-identical copy guarded by a checksum test; Tailwind
maps onto the same properties. Change a token → it propagates everywhere.

## Versioning & changelog

App version is the single source for the in-app version badge (Vite injects
`__APP_VERSION__` from `app/package.json`). Changesets drives version bumps and
`CHANGELOG.md`, keeping the badge and changelog in lockstep.
