# Spec — Domain Restructure: split `@crewdoku/domain` into 7 layered workspace packages

Status: DRAFT (requirements only — not an implementation plan)
Branch: `ui/match-prototype`
Author: spec stage

---

## 1. Problem / Motivation

Today all pure business logic lives in a single workspace package `packages/domain`
(npm name `@crewdoku/domain`), re-exported through one fat barrel (`src/index.ts`).
The app imports every domain symbol from that one barrel, so module boundaries
(calendar → data model → constraints → solver) exist only as folders, not as
enforced package edges. We want real, one-directional package boundaries so the
layering is structurally enforced and each concern can be reasoned about and
depended on independently. This is a **pure mechanical refactor: zero behavior
change, zero logic change** — only file locations, package boundaries, and import
paths move.

---

## 2. Scope

In scope:

- Replace `packages/domain` (one package) with **seven** pnpm workspace packages
  under a new root directory `domains/`:
  `calendar`, `scheduling`, `constraints`, `solver`, `export`, `seed`, `ports`.
- Each domain folder is its own package: has `package.json` + `tsconfig.json`,
  declares its cross-package deps via `workspace:*`.
- Package names are **plain / unscoped** (`calendar`, `scheduling`, …), NOT `@crewdoku/*`.
- Move the existing source files (and their `__tests__`) into the owning package
  unchanged except for **relative→cross-package import path** rewrites.
- Rewrite every `app/src` import of `@crewdoku/domain` to import each symbol from
  the **specific** owning package (strict per-package imports; no aggregator barrel).
- Update build wiring: `pnpm-workspace.yaml`, root scripts, `turbo.json` (if needed),
  vitest workspace, per-package `package.json`/`tsconfig.json`.
- Migrate the domain guard tests (purity, no-app-import, changeset, ids, smoke) to
  appropriate per-package locations; keep them passing.

Explicitly OUT of scope (non-goals):

- Any UI change, any visual/behavioral change in the app.
- Any change to constraint logic, solver model, scoring, CSV output, or seed data.
- Any undo/redo work (deferred to a later UI rebuild).
- Any spreadsheet feature (already removed).
- Renaming `--sh-*` / `.sf-*` tokens, design system, or i18n.
- Adding a build/dist step for the new packages — they stay **TS-source packages**
  consumed directly (matching today's `main: ./src/index.ts`), unless §7 forces a change.
- Changing the npm scope or publishing config of the app.

---

## 3. The 7 packages

Each package keeps a thin barrel (`src/index.ts`) that re-exports exactly the
symbols listed for it (the app imports the package by name, resolving to its barrel).
The old root barrel `packages/domain/src/index.ts` is deleted.

### 3.1 Source-file ownership

| Package      | New location (root `domains/<name>/`) | Source files moved from `packages/domain/src/` |
|--------------|----------------------------------------|------------------------------------------------|
| `calendar`   | `domains/calendar/src/`                | `calendar/calendar.ts` (+ `calendar/__tests__/calendar.test.ts`) |
| `scheduling` | `domains/scheduling/src/`              | `entities/types.ts`, `entities/factories.ts`, `ids.ts`, `schedule/schedule.ts`, `schedule/dto.ts` (+ their `__tests__`: `entities/__tests__/types.test.ts`, `entities/__tests__/factories.test.ts`, `__tests__/ids.test.ts`, `schedule/__tests__/schedule.test.ts`, `schedule/__tests__/dto.test.ts`) |
| `constraints`| `domains/constraints/src/`             | `constraints/context.ts`, `constraints/hard.ts`, `constraints/soft.ts`, `constraints/registry.ts` (+ `constraints/__tests__/*`) |
| `solver`     | `domains/solver/src/`                  | `solver/model.ts`, `solver/score.ts`, `solver/mapSolution.ts`, `solver/proposal.ts`, `solver/conflict.ts` (+ `solver/__tests__/*`) |
| `export`     | `domains/export/src/`                  | `export/csv.ts` (+ `export/__tests__/csv.test.ts`) |
| `seed`       | `domains/seed/src/`                    | `seed/demo.ts` (+ `seed/__tests__/demo.test.ts`) |
| `ports`      | `domains/ports/src/`                   | `ports/ports.ts` (+ `ports/__tests__/ports.test.ts`) |

Notes:
- The internal sub-folder structure within `scheduling` (`entities/`, `schedule/`,
  `ids.ts`) MAY be flattened or preserved — the implementer's choice — as long as the
  barrel exports the same symbols. Preserving folders minimizes intra-package import churn.
- `VERSION_MARKER` (currently in the root barrel, value `'crewdoku-domain'`, asserted
  by `app/src/__tests__/smoke.test.ts`) must keep its value. See §5 decision D1 for its home.

### 3.2 Cross-package dependency edges (authoritative; derived from imports)

Each edge below is a real `import` discovered in the source. `(types only)` means the
import is type-only but still requires a `dependencies` entry (these packages ship TS
source, so type imports resolve through the package, not a `.d.ts`).

| Package      | depends on (`workspace:*`)                          | external deps | Evidence (importing file → imported file) |
|--------------|-----------------------------------------------------|---------------|-------------------------------------------|
| `calendar`   | — (none)                                            | —             | `calendar.ts` imports only `ISODate`, `Period` **types**. See D2. |
| `scheduling` | — (none)                                            | `nanoid`      | `ids.ts`→`nanoid`; `factories.ts`→`ids`; `schedule.ts`/`dto.ts`/`factories.ts`/`context-consumers` only import within scheduling. |
| `constraints`| `calendar`, `scheduling`                            | —             | `context.ts`→`calendar` (`dow`), `scheduling` (`makeRules`, types); `hard.ts`→`calendar`, `scheduling` (schedule fns + types); `soft.ts`→`calendar`, `scheduling`; `registry.ts`→`scheduling` (`makeSchedule`, types). |
| `solver`     | `calendar`, `scheduling`, `constraints`, `ports`    | —             | `model.ts`→`calendar`, `scheduling`, `constraints` (`SolveContext`); `score.ts`→`scheduling`, `constraints`; `mapSolution.ts`→`scheduling` (`Assignment`), `ports` (`Solution`), local `model`; `proposal.ts`→`calendar`, `scheduling`, `constraints`, local `score`; `conflict.ts`→`calendar`, `scheduling`, `constraints`, local `model`. |
| `export`     | `calendar`, `scheduling`, `constraints`             | —             | `csv.ts`→`calendar` (`dow`, `eachDate`), `scheduling` (`getAssignment`, `Schedule`, types), `constraints` (`SolveContext`). |
| `seed`       | `calendar`, `scheduling`, `ports`                   | —             | `demo.ts`→`calendar` (`eachDate`, `dow`), `scheduling` (factories + types), `ports` (`AppStateDTO`). |
| `ports`      | `scheduling`                                        | —             | `ports.ts`→`scheduling` (`Assignment`, `Coverage`, `Employee`, `Org`, `Rules`, `Shift`, `Team` **types**). |

Final edge list (one line):
`scheduling→(none); calendar→(none); ports→scheduling; constraints→calendar,scheduling; export→calendar,scheduling,constraints; solver→calendar,scheduling,constraints,ports; seed→calendar,scheduling,ports`.

This graph is **acyclic and one-directional**. Topological layers:
1. `calendar`, `scheduling` (leaves)
2. `ports` (← scheduling)
3. `constraints` (← calendar, scheduling)
4. `export`, `solver`, `seed`

> Resolved concern: `constraints` does NOT depend on `ports`, and `ports` does NOT
> depend on `constraints` — they only share `scheduling` types. No cycle. (`mapSolution`
> reaches into `ports` for `Solution`, but that lives in `solver`, which already depends
> on `ports`.)

---

## 4. Authoritative symbol → owning-package map (for app import rewrites)

Every distinct symbol the app imports from `@crewdoku/domain` today, and the package
it must be imported from after the refactor. (Type-only vs value import is preserved
verbatim per call site; the table only fixes the *source package*.)

| Symbol | Kind | New package |
|--------|------|-------------|
| `dow` | fn | `calendar` |
| `isWeekend` | fn | `calendar` |
| `eachDate` | fn | `calendar` |
| `isoWeekKey` | fn | `calendar` |
| `ISODate` | type | `scheduling` |
| `Period` | type | `scheduling` |
| `Assignment` | type | `scheduling` |
| `Coverage` | type | `scheduling` |
| `Employee` | type | `scheduling` |
| `Org` | type | `scheduling` |
| `Team` | type | `scheduling` |
| `Shift` | type | `scheduling` |
| `Rules` | type | `scheduling` |
| `Pref` | type | `scheduling` |
| `ConstraintId` | type | `scheduling` |
| `SoftId` | type | `scheduling` |
| `Schedule` | type | `scheduling` |
| `keyOf` | fn | `scheduling` |
| `makeSchedule` | fn | `scheduling` |
| `setAssignment` (imported as `domainSetAssignment`) | fn | `scheduling` |
| `removeEmployee` (imported as `domainRemoveEmployee`) | fn | `scheduling` |
| `toScheduleDTO` | fn | `scheduling` |
| `fromScheduleDTO` | fn | `scheduling` |
| `makeOrg` | fn | `scheduling` |
| `makeTeam` | fn | `scheduling` |
| `makeShift` | fn | `scheduling` |
| `makeEmployee` | fn | `scheduling` |
| `makeCoverage` | fn | `scheduling` |
| `makeRules` | fn | `scheduling` |
| `SolveContext` | type | `constraints` |
| `buildContext` | fn | `constraints` |
| `runHardChecks` | fn | `constraints` |
| `buildModel` | fn | `solver` |
| `BuildModelOptions` | type | `solver` |
| `ModelMeta` | type | `solver` |
| `mapSolution` | fn | `solver` |
| `buildProposal` | fn | `solver` |
| `Proposal` | type | `solver` |
| `ProposalChange` | type | `solver` |
| `deriveConflictCore` | fn | `solver` |
| `ConflictResult` | type | `solver` |
| `Solution` | type | `ports` |
| `SolverPort` | type | `ports` |
| `StoragePort` | type | `ports` |
| `AppStateDTO` | type | `ports` |
| `exportTeamCSV` | fn | `export` |
| `exportMemberCSV` | fn | `export` |
| `buildDemo` | fn | `seed` |
| `VERSION_MARKER` | const | see D1 (`scheduling`, exported value unchanged) |

App files importing `@crewdoku/domain` today: the authoritative set is **every file
matching `grep -rl "@crewdoku/domain" app/src` (32 files)** — rewrite ALL of them, do
not rely on a partial hand-enumerated list. The symbol→package map above is the complete
and correct source of truth for *which package* each imported symbol resolves to; the grep
is the complete source of truth for *which files* must be touched.
A single import statement that pulls symbols owned by >1 package must be **split**
into one statement per owning package.

---

## 5. Decisions made on the user's behalf

- **D1 — `VERSION_MARKER` lives in `scheduling`.** It is a bare constant with no deps;
  `scheduling` is a leaf the app already imports broadly. Its value MUST remain
  `'crewdoku-domain'` (the app smoke test asserts it). `app/src/__tests__/smoke.test.ts`
  is rewritten to `import { VERSION_MARKER } from 'scheduling'`.
  *Alternative rejected:* a standalone `version`/`meta` package (over-engineering for one const).
- **D2 — `calendar` imports `ISODate`/`Period` types from `scheduling`, OR re-declares
  them locally.** Today `calendar.ts` imports those two types from `entities/types`.
  To keep `calendar` a true zero-dependency leaf (as required by the brief), the
  implementer SHOULD make `calendar` depend on `scheduling` for these two types **as a
  type-only dependency**, OR (preferred to preserve the "calendar 0 deps" goal) move/duplicate
  the two primitive aliases. **Chosen: `calendar` declares its own local `ISODate`/`Period`
  type aliases** (both are structural string/`{startDate,weeks}` aliases — duplicating them
  is zero-risk and keeps `calendar` dependency-free as the brief mandates).
  *Alternative rejected:* `calendar → scheduling` edge (contradicts the stated "calendar:
  zero domain deps" requirement and inverts the intended bottom layer).
  > NOTE TO IMPLEMENTER: D2 is the one place where a *type re-declaration* (not a logic
  > change) is required. It is behavior-neutral (structural types). If review prefers a
  > `calendar→scheduling` type-only edge instead, that is acceptable but changes the
  > "zero deps" AC for calendar — flag before deviating.
- **D3 — packages ship TS source, no build/dist.** Each package's `package.json` keeps
  `"main"/"types"/"exports"` pointed at `./src/index.ts` (mirrors current domain). Each
  `domains/<name>/package.json` **OMITS the `build` script entirely** — Turbo skips
  packages that lack the `build` task when resolving the `^build` dependency chain (this is
  not an error; a missing task is simply not run). Do **NOT** carry over the current
  dist-emitting build, and **drop `outDir`/`rootDir`** from the per-package `tsconfig.json`
  (there is no emit). The retained scripts are exactly `test`: `vitest run` and `lint`:
  `tsc -p tsconfig.json --noEmit` (project mode, honors `tsconfig.base` extends/strict).
  *Alternative rejected:* compiling each package to `dist/` (adds 7 build steps, slows
  dev, unnecessary for an app that bundles via Vite).
- **D4 — each package gets a barrel `src/index.ts`** re-exporting its public symbols, so
  the app imports `from 'solver'` etc. (not deep paths). Intra-package files keep relative
  imports; cross-package files import the package name.
- **D5 — guard tests are relocated, not deleted.** `purity.test.ts` and
  `no-app-import.test.ts` are duplicated/placed so they cover **all 7** packages
  (either one test per package, or a single root-level test walking `domains/*`).
  - The `baseAssign` grep-guard (asserting no `baseAssign` hash baseline survives) rides
    along **inside `purity.test.ts`** — it is relocated together with the purity walk over
    `domains/*`, not as a standalone file.
  - The relocated `no-app-import.test.ts` is **strengthened into a walking guard**: while
    walking every file under `domains/*` it asserts (a) no import of `app`/`app/src` (the
    existing no-app-import invariant), AND (b) no import of `@crewdoku/domain` (the deleted
    barrel must not be re-introduced from inside a domain package). This converts AC-4/AC-5
    from a manual grep into an automated test — a domain file that imports the dead barrel
    fails CI.
  - `changeset-config.test.ts` and the smoke/ids tests move with their owning package;
    the `../../../../.changeset/config.json` relative path resolves identically because
    `domains/<pkg>/src/__tests__/` is the same 4-levels-deep as `packages/domain/src/__tests__/`.

If the implementer hits a genuine cycle or a symbol whose ownership is ambiguous beyond
this table, STOP and surface it — do not invent a new package or a back-edge.

---

## 6. Configuration changes required

- **`pnpm-workspace.yaml`**: replace `packages/*` with `domains/*` (keep `app`). Final:
  ```yaml
  packages:
    - "domains/*"
    - "app"
  ```
  (Or add `domains/*` alongside and remove the now-empty `packages/`.)
- **Per package `domains/<name>/package.json`**: `name` = plain package name; `version`
  `0.0.0`; `type: module`; `main`/`types`/`exports` → `./src/index.ts`; `dependencies`
  per §3.2 (cross-package via `workspace:*`; `scheduling` also `nanoid`); `devDependencies`
  `typescript`, `vitest`; scripts are exactly `test`: `vitest run` and
  `lint`: `tsc -p tsconfig.json --noEmit` (project mode — NOT bare `tsc --noEmit` — so it
  honors `tsconfig.base` extends/strict). The `build` script is **OMITTED entirely** (no
  no-op stub) so Turbo simply skips these packages in the `^build` chain (D3).
- **Per package `domains/<name>/tsconfig.json`**: `extends ../../tsconfig.base.json`
  (relative depth from `domains/<name>/` to root `tsconfig.base.json` is `../../`, same as
  `packages/domain/`). `include: ["src"]`. **Drop `outDir`/`rootDir`** — there is no emit
  (D3); per-package `lint` runs `tsc -p tsconfig.json --noEmit` (type-check only).
- **`app/package.json`**: remove `"@crewdoku/domain": "workspace:*"`; add the domain
  packages it actually uses as `"calendar": "workspace:*"`, `"scheduling": "workspace:*"`,
  `"constraints": "workspace:*"`, `"solver": "workspace:*"`, `"ports": "workspace:*"`,
  `"export": "workspace:*"`, `"seed": "workspace:*"` (the app imports from all 7).
- **`app/tsconfig.json`**: no path-alias changes needed (workspace resolution via
  `node_modules` symlinks + `moduleResolution: Bundler`). Verify no stale `paths` entry exists.
- **`tsconfig.base.json`**: unchanged (shared compiler opts).
- **`turbo.json`**: unchanged in shape (`build`/`test`/`lint` tasks remain). Turbo
  auto-discovers the new workspaces. The `^build` chain stays valid: the domain packages
  omit the `build` script, so Turbo skips them (a missing task is not an error per D3) and
  only `app` actually runs `build`.
- **Vitest**: root `vitest.workspace.ts` — replace `'packages/*'` with `'domains/*'`
  (keep `'app'`). Each domain package needs a `vitest.config.ts` with
  `test: { environment: 'node' }` (mirror current `packages/domain/vitest.config.ts`),
  OR rely on the workspace root config — the implementer must ensure node env applies to
  domain packages and jsdom to app (app already has its own `vitest.config.ts`).
- **Root `package.json` scripts**: update `clean` to **drop the `packages/domain/dist`
  path** — the domain packages emit no `dist` (D3), so there is nothing to clean there; do
  not substitute a `domains/*/dist` path. `dev`/`build`/`test`/`lint` stay (they
  filter `@crewdoku/app` or run turbo).
- **`app/vite.config.ts`**: unchanged (worker ES format, version define). Vite resolves
  the workspace packages from `node_modules`. Confirm no `optimizeDeps`/alias references
  `@crewdoku/domain`.
- **`.changeset/config.json`**: unchanged in shape; the 7 new packages are `"access":
  "restricted"` / private-by-default same as before (none are published).

---

## 7. Risks

- **R1 — Hidden import cycle.** If any constraints/solver file imports a symbol that
  forces a back-edge not in §3.2, the workspace will still link but the layering AC fails.
  Mitigation: the §3.2 edges were derived by reading every file's imports; verify with a
  cycle check (e.g. `madge`/manual) post-move. The `calendar` D2 type re-declaration is the
  only deliberate deviation.
- **R2 — `workspace:*` resolving TS source.** Packages expose `./src/index.ts` (no build).
  Vite (bundler) and Vitest handle raw TS fine, but `tsc --noEmit` for the app must resolve
  cross-package `.ts` via `moduleResolution: Bundler` — verify `pnpm lint` still type-checks
  across the new package boundaries (no `declaration`/project-references needed).
- **R3 — Vitest project/env config.** Splitting one node-env package into seven must keep
  node env for all domain packages and jsdom for the app; a misconfigured workspace glob
  could run domain tests under jsdom or miss a package. Verify all 85 domain + 119 app
  tests still run and pass (204 total today; counts must not drop).
- **R4 — Guard-test relocation gaps.** Moving purity/no-app-import tests could accidentally
  stop covering some packages. Ensure the relocated guards walk every `domains/*` package.

---

## 8. Acceptance Criteria (numbered, testable)

- **AC-1** — `corepack pnpm install` succeeds and links all 7 domain packages plus `app`
  as workspace packages (verify `pnpm -r list` / `node_modules/<pkg>` symlinks exist for
  `calendar`, `scheduling`, `constraints`, `solver`, `export`, `seed`, `ports`).
- **AC-2** — `pnpm lint` (turbo → per-package `tsc -p tsconfig.json --noEmit`, project
  mode, in every package incl. app) passes with **0 type errors**.
- **AC-3** — `pnpm test` passes: **85 domain tests** (now distributed across the 7
  packages) + **119 app tests** = **204 tests, 0 failures** (count must not regress;
  no test deleted, only relocated).
- **AC-4** — No file anywhere under `app/src` imports `@crewdoku/domain`
  (`grep -r "@crewdoku/domain" app/src` returns nothing).
- **AC-5** — No file anywhere imports the deleted barrel; `packages/domain/` no longer
  exists and `@crewdoku/domain` appears in no `package.json`.
- **AC-6** — The cross-package dependency graph is **acyclic and one-directional**,
  matching §3.2 exactly (no domain package imports `app`; no back-edges). Verifiable by a
  guard test walking `domains/*` and/or a `madge --circular` run reporting 0 cycles.
- **AC-7** — Each app import resolves each symbol from its §4 owning package (spot-check:
  `Solution`/`SolverPort` from `ports`, `buildModel` from `solver`, `dow` from `calendar`,
  `keyOf` from `scheduling`, `exportTeamCSV` from `export`, `buildDemo` from `seed`,
  `buildContext` from `constraints`).
- **AC-8** — `VERSION_MARKER === 'crewdoku-domain'` still holds (app smoke test green),
  imported from its new package per D1.
- **AC-9** — The app boots (`pnpm dev`) and the board renders the demo schedule with no
  console import/resolution errors (manual or smoke-level check).
- **AC-10** — Domain purity invariant preserved: no `react`/`react-dom`/`highs`/DOM/
  `Worker`/`indexedDB` reference appears in any `domains/*` source (relocated purity guard
  covers all 7 packages).
- **AC-11** — `turbo build` (`pnpm build`) completes successfully for the whole workspace:
  the **7 domain packages are build-less** (they omit the `build` script, so Turbo skips
  them in the `^build` chain — not an error), and **`app` builds** (domain TS source is
  consumed directly via Vite). "Completes" = exit 0 with the app artifact produced; no
  domain `dist` is expected or required.
- **AC-12** — Behavior parity: CSV export bytes, solver LP, proposal scores, and seed data
  are byte/structurally identical to pre-refactor (covered transitively by AC-3 since the
  existing tests assert these — no test expectations are modified).

---

## 9. Open questions for the user / implementer

- **OQ-1 (D2) — RESOLVED (keep default: local re-declaration).** Reviewer confirmed
  `calendar` re-declares `ISODate`/`Period` as local type aliases, keeping it a true
  zero-dependency leaf. No `calendar → scheduling` type edge. No other ambiguity blocks
  implementation.
