# Crewdoku — Project Context for Claude

You are working on **Crewdoku**, an offline-first, single-user web app to build and
manage one company's multi-week team schedule. It auto-solves with a real HiGHS MILP
(WebAssembly, in a Web Worker, fully client-side) and exports schedules to CSV.
Read this whole file before doing anything. Do not re-ask what's answered here.

It is an **app, not a platform**: no roles, no auth, no approval/consent workflows,
no requests/ripple system. Swaps are direct edits.

---

## Architecture — pnpm + Turborepo monorepo

```
crewdoku/
├── packages/domain/      @crewdoku/domain — PURE TypeScript. No React/DOM/WASM/Worker/IDB.
├── app/                  @crewdoku/app — Vite + React 18 + TS. Presentation + runtime adapters.
├── tokens.css            canonical design tokens (app/tokens.css = verified byte-identical copy)
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json · .changeset/
```

**Dependency rule (enforced by guard tests):** `app` → `@crewdoku/domain`; domain
depends on nothing. One direction only. A component NEVER computes a constraint,
builds a model, or scores a schedule — it calls the domain. If you find yourself
adding business logic to a component, it belongs in `packages/domain`.

**Language:** TypeScript everywhere, strict + `noUncheckedIndexedAccess`.
`pnpm lint` is `tsc --noEmit`. Tests are Vitest (domain: node; app: jsdom + RTL).

### How to run

```bash
corepack enable pnpm && pnpm install
pnpm --filter @crewdoku/app dev    # http://localhost:5173 (or next free port)
pnpm test    # vitest across both packages (turbo)
pnpm lint    # tsc --noEmit both packages
pnpm build   # domain build → app vite build
```

---

## Domain (`packages/domain/src`)

| Dir | Holds |
|---|---|
| `entities/` | `types.ts` (Org, Team, Shift, Employee, Coverage, Period, Assignment, Rules) + `factories.ts` |
| `ids.ts` | `newId()` — stable **nanoid** identity on every entity. NO array-index identity, ever. |
| `calendar/` | UTC ISO-date utils: dow, week, weekend, `eachDate`, `isoWeekKey` (Mon-anchored) |
| `schedule/` | `schedule.ts` single source of truth (`Map` keyed `${employeeId}|${date}`) + `dto.ts` (Map↔Assignment[] lossless JSON) |
| `constraints/` | `context.ts`, `hard.ts` (H1–H6), `soft.ts` (S1–S5 raw scores), `registry.ts` (applies toggles+weights). Each constraint is ONE pure fn used by BOTH the live checker AND the solver model. |
| `solver/` | `model.ts` `buildModel → {lp, meta}`, `score.ts` `scoreTerms`, `mapSolution.ts`, `proposal.ts`, `conflict.ts` `deriveConflictCore` |
| `ports/` | `SolverPort`, `StoragePort` — interfaces only |
| `export/` | `csv.ts` — `exportTeamCSV` (grid) + `exportMemberCSV` (list) |
| `seed/` | `demo.ts` `buildDemo(): AppStateDTO` — feasible demo org (zero hard violations) |

### Key domain rules
- **Identity:** nanoid everywhere. Deleting an employee must never re-point another's
  data (the v1 index bug). Match on stored `employeeId`, never by string-splitting keys.
- **Schedule:** one assignment Map. `shiftId: null` = explicit day off. NO `baseAssign`
  hash baseline (it's deleted; a grep guard test enforces this).
- **Multi-week Period:** H2 caps per ISO-week bucket (partial weeks = full cap, no
  pro-rating); H3 rest spans Sun→Mon; S1/S4 fairness aggregate over the whole period.
- **Night detection:** `Shift.isNight` boolean drives S1 — never a literal `'N'` code.
- **LP names must be LP-safe:** nanoid IDs contain `-` (a CPLEX operator). `model.ts`
  routes IDs through `lpSafe()` + a reversible token map (`meta.shiftTokenToId`);
  `mapSolution` decodes back. Do not emit raw IDs into var/row names.
- **Solver meta is shared:** `buildModel` returns `meta` (id↔dense maps); `mapSolution`
  consumes the SAME meta — never re-derive ordering (prevents mis-attribution).

---

## App (`app/src`)

| Path | Role |
|---|---|
| `adapters/highs/` | `worker.ts` + `highsLoader.ts` + `highsSolverAdapter.ts` — the ONLY home of Web Worker + `highs.wasm`. Implements `SolverPort`. Worker logic factored as a pure `handleSolve` for unit testing. |
| `adapters/storage/` | `idbStorageAdapter.ts` — IndexedDB, single JSON blob, implements `StoragePort`. Plain-JSON DTOs only (no Map/Set degradation). |
| `store/store.ts` | Zustand. Holds domain state + view state. Actions delegate to domain fns. `solve()`/`applyProposal()`/`applyRelaxation()` orchestrate the solve flow. |
| `ui/` | Design-system kit (Btn, Panel, Badge, Modal, …) + `VersionBadge`. |
| `features/board/` | `Board.tsx` — schedule grid, employees × dates, sticky header/col, status classes. |
| `features/solve/` | `SolvePanel.tsx` — collapsible right rail: run solver, proposal diff, breakdown, accept/reject/apply, infeasible→conflict→relaxation. |
| `features/config/` | shifts / coverage / rules (toggles + weights) / teams / employees. |
| `features/onboarding/` | wizard org→teams→shifts→coverage→employees→rules + Load Demo. |
| `features/export/` | `ExportModal.tsx` + `exportActions.ts` — CSV download (Blob+anchor). |
| `i18n/` | Chrome-only i18n (EN/VI) + locale switcher. NEVER wrap user data (names) in `t()`. |

---

## Solver flow

Board → run solver → `store.solve()` builds the model (domain) honoring pins as
fixed → `HighsSolverAdapter.solve` (worker + wasm) → `mapSolution(meta)` →
`buildProposal(current, solved)` diffs the union of cells → user accepts/rejects
per cell → `applyProposal` writes only accepted cells. Infeasible → `deriveConflictCore`
→ conflict core + relaxations; each relaxation re-runs `buildModel`.

`penalty`/`prevPenalty` recomputed via `scoreTerms` (HiGHS drops the LP objective
constant). Proposal shape: `{ id, changes[], fairness, prevFairness, penalty, prevPenalty, breakdown[] }`.

---

## Design system

- **Aesthetic:** dense modern product UI (Linear-like), neutral gray chrome.
- **Type:** IBM Plex Sans (UI), IBM Plex Mono (data/numbers).
- **Borders:** always `rounded-[2px]` — never rounded-md or pill.
- **Shift colors:** `--sh-{code}-{bg|fg|bd}`. Status classes: `.sf-pending` (amber dashed),
  `.sf-proposed` (violet dashed, solver diff), `.sf-viol` (solid red).
- **No emoji** — geometric Unicode only (▸ ▾ ◢ ◆ ⚠ ✓ ✕).
- **Tokens are the source of truth.** `tokens.css` (root) is canonical; `app/tokens.css`
  is a byte-identical copy guarded by a checksum test — do NOT rename `--sh-*`/`.sf-*`.

---

## Constraints

**Hard:** H1 per-team coverage (min≤count≤max per team×shift×date; dateOverride ≻ byDow) ·
H2 max hours/week (per ISO-week bucket) · H3 min rest (across week boundaries, cross-midnight aware) ·
H4 one shift/day · H5 time-off + recurring unavailability · H6 eligibility (only eligible shifts).

**Soft** (weight tunable, each toggleable): S1 night fairness · S2 preferences ·
S3 stability (min change vs current) · S4 weekend fairness · S5 sequence smoothness.

Eligibility is two-level: a Team staffs a shift set; an Employee's `eligibleShiftIds`
defaults to the team's and may narrow. Coverage is per team×shift, byDow + date overrides.

---

## Known decisions (do not revisit unless asked)

- Monorepo: pure `@crewdoku/domain` + presentation `@crewdoku/app`. App is dumb.
- Single-user, view modes (not roles). Offline-first (IndexedDB).
- Real HiGHS MILP; no simulated/fake proposal path.
- Stable nanoid identity; single-assignment-list schedule; multi-week period.
- TypeScript everywhere, strict. `rounded-[2px]`. Dark theme is a tweak, not default.
- i18n is chrome-only — never wrap user-entered data.
- Versioning via Changesets; in-app badge synced to `app/package.json`.

---

## Specs

Design + plan: `docs/superpowers/specs/2026-06-16-crewdoku-v2-refactor-{design,plan}.md`.
The design doc's §12 holds the 24 acceptance criteria.
