# Crewdoku v2 — Monorepo & Domain Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the broken Crewdoku Vite app as a pnpm + Turborepo monorepo with a pure-TypeScript `@crewdoku/domain` package (entities, calendar, schedule, constraints, solver model, export, ports) and a presentation-only `app` package (React + Vite + TS, adapters, store, UI), porting the real HiGHS MILP and live violation checker while deleting the fake `makeProposal` path and array-index identity.

**Architecture:** Hexagonal. `app` → `domain`, one direction only. Domain is pure (no React/DOM/WASM/Worker/IndexedDB). Solver model is pure and lives in domain; the WASM+Worker runtime is an `app` adapter behind `SolverPort`. Schedule is a single `Map`-backed assignment list keyed by `${employeeId}|${date}` with stable nanoid IDs. Constraints are pure functions shared by both the live checker and the model builder. Old `src/` stays runnable until cutover.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript, Vitest, Changesets, nanoid, Zustand, Vite, React 18, Lingui, highs (WASM), Tailwind + `tokens.css`.

---

## Conventions for every task

- **TDD strictly:** write the failing test, run it, watch it fail for the *right* reason, implement minimal code, run it green, commit.
- **Test runner:** `pnpm --filter @crewdoku/domain test` for domain; `pnpm --filter @crewdoku/app test` for app. From repo root, `pnpm -w test` runs all via turbo.
- **Domain files are `.ts`; app files are `.tsx`/`.ts`.** Domain test files live in `packages/domain/src/**/__tests__/*.test.ts`.
- **Commits:** conventional commits, one per task (or per red→green cycle). End commit messages with the Co-Authored-By trailer per repo policy.
- **No edits to old `src/`** except the final cutover task. Old app must keep booting throughout.
- **IDs:** every entity gets a `nanoid()` id. Tests that need determinism inject ids explicitly (factories accept an optional `id`).

---

## File Structure

```
crewdoku/
├── pnpm-workspace.yaml                 # packages: ["packages/*", "app"]
├── turbo.json                          # build/test/lint pipelines, dependsOn ^build
├── package.json                        # root, private, workspace scripts
├── tsconfig.base.json                  # shared compiler options
├── .changeset/config.json              # changesets config
├── vitest.workspace.ts                 # (optional) aggregate vitest projects
├── .github/workflows/ci.yml            # install → build → test → lint
├── packages/domain/
│   ├── package.json                    # @crewdoku/domain, type:module, exports ./src/index.ts
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── ids.ts                      # newId() wrapper over nanoid
│       ├── entities/
│       │   ├── types.ts                # Org/Team/Shift/Employee/Coverage/Period/Assignment/Rules/ID
│       │   ├── factories.ts            # makeOrg/makeTeam/makeShift/makeEmployee/... (assign ids)
│       │   └── __tests__/
│       ├── calendar/
│       │   ├── calendar.ts             # isoDate utils: dow, isoWeekKey, isWeekend, eachDate, addDays
│       │   └── __tests__/
│       ├── schedule/
│       │   ├── schedule.ts             # Schedule (Map), queries + mutations, removeEmployee
│       │   ├── dto.ts                  # toScheduleDTO / fromScheduleDTO (Map<->Assignment[])
│       │   └── __tests__/
│       ├── constraints/
│       │   ├── context.ts              # SolveContext: entities indexed for checks
│       │   ├── hard.ts                 # H1..H6 pure check fns
│       │   ├── soft.ts                 # S1..S5 pure score fns
│       │   ├── registry.ts             # enabled[]/weights[] gating, runAll
│       │   └── __tests__/
│       ├── solver/
│       │   ├── model.ts                # buildModel(ctx,period,opts) -> {lp, meta}
│       │   ├── score.ts                # scoreTerms(assignments,ctx) -> breakdown
│       │   ├── mapSolution.ts          # mapSolution(solution, meta) -> Assignment[]
│       │   ├── conflict.ts             # deriveConflictCore(ctx,period) -> {core, relaxations}
│       │   ├── proposal.ts             # buildProposal(solvedAssignments, ctx) -> Proposal
│       │   └── __tests__/
│       ├── export/
│       │   ├── csv.ts                  # exportTeamCSV / exportMemberCSV
│       │   └── __tests__/
│       ├── ports/
│       │   └── ports.ts                # SolverPort, StoragePort interfaces + DTO types
│       ├── seed/
│       │   ├── demo.ts                 # buildDemo() -> feasible org+schedule (nanoid)
│       │   └── __tests__/
│       └── index.ts                    # public barrel
└── app/
    ├── package.json                    # @crewdoku/app, version = badge source
    ├── tsconfig.json
    ├── vite.config.ts                  # define __APP_VERSION__, worker, wasm
    ├── vitest.config.ts                # jsdom env
    ├── index.html
    ├── tokens.css                      # byte-identical copy of repo-root tokens.css
    └── src/
        ├── vite-env.d.ts               # declare const __APP_VERSION__: string
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── adapters/
        │   ├── highs/
        │   │   ├── highsSolverAdapter.ts   # implements SolverPort; owns Worker
        │   │   ├── worker.ts               # solve message handler (ported)
        │   │   ├── highsLoader.ts          # memoized WASM singleton (ported)
        │   │   └── __tests__/
        │   └── storage/
        │       ├── idbStorageAdapter.ts    # implements StoragePort over IndexedDB
        │       └── __tests__/
        ├── store/
        │   └── store.ts                # Zustand: domain state + view state
        ├── ui/                         # design-system kit (Btn, Panel, Badge, Modal…)
        ├── features/
        │   ├── board/
        │   ├── config/
        │   ├── solve/
        │   ├── onboarding/
        │   └── export/
        └── i18n/
```

---

## Phase P0 — Scaffold (pnpm + turbo + vitest + changesets, CI green)

### Task 0.1: Root workspace files

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `turbo.json`, `tsconfig.base.json`, `.gitignore` (append), `vitest.workspace.ts`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "app"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "crewdoku",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "changeset": "changeset",
    "version-packages": "changeset version"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@changesets/cli": "^2.27.0"
  }
}
```

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {}
  }
}
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 5: Append to `.gitignore`**

```
node_modules/
dist/
.turbo/
app/src/locales/*/messages.mjs
```

- [ ] **Step 6: Commit** — `chore: scaffold pnpm workspace + turbo + base tsconfig`

> **AC satisfied:** AC-1 (partial — pipeline + dependency order).

### Task 0.2: Empty domain package builds and tests green

**Files:**
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/vitest.config.ts`, `packages/domain/src/index.ts`, `packages/domain/src/__tests__/smoke.test.ts`

- [ ] **Step 1: Write the failing test** `packages/domain/src/__tests__/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { VERSION_MARKER } from '../index'

describe('domain smoke', () => {
  it('exports a marker', () => {
    expect(VERSION_MARKER).toBe('crewdoku-domain')
  })
})
```

- [ ] **Step 2: Create `packages/domain/package.json`**

```json
{
  "name": "@crewdoku/domain",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "nanoid": "^5.0.0" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

- [ ] **Step 3: Create `packages/domain/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/domain/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 5: Create `packages/domain/src/index.ts`**

```ts
export const VERSION_MARKER = 'crewdoku-domain'
```

- [ ] **Step 6: Run test** — `pnpm install && pnpm --filter @crewdoku/domain test`. Expected: PASS.

- [ ] **Step 7: Commit** — `chore: empty @crewdoku/domain package, green smoke test`

> **AC satisfied:** AC-1 (partial).

### Task 0.3: Empty app package builds and tests green

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/vitest.config.ts`, `app/index.html`, `app/src/vite-env.d.ts`, `app/src/main.tsx`, `app/src/__tests__/smoke.test.ts`
- Copy: repo-root `tokens.css` → `app/tokens.css` (byte-identical, done in P6 token task; here just placeholder import omitted)

- [ ] **Step 1: Write the failing test** `app/src/__tests__/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { VERSION_MARKER } from '@crewdoku/domain'

describe('app can import domain', () => {
  it('imports the domain barrel', () => {
    expect(VERSION_MARKER).toBe('crewdoku-domain')
  })
})
```

- [ ] **Step 2: Create `app/package.json`** (version here is the badge source)

```json
{
  "name": "@crewdoku/app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@crewdoku/domain": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 3: Create `app/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vite/client"] },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Create `app/vitest.config.ts`** and `app/vite.config.ts`

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], test: { environment: 'jsdom' } })
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' } // `with` (import attributes); `assert` is removed in current Node/TS
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
})
```

- [ ] **Step 5: Create `app/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
declare const __APP_VERSION__: string
```

- [ ] **Step 6: Create `app/index.html` + `app/src/main.tsx`** (minimal mount; full App in P6)

```tsx
// main.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
createRoot(document.getElementById('root')!).render(<div>Crewdoku v{__APP_VERSION__}</div>)
```

- [ ] **Step 7: Run test** — `pnpm --filter @crewdoku/app test`. Expected: PASS.

- [ ] **Step 8: Run `pnpm -w build`** — Expected: turbo builds `@crewdoku/domain` before `@crewdoku/app` (exit 0).

- [ ] **Step 9: Commit** — `chore: empty @crewdoku/app importing domain, green`

> **AC satisfied:** AC-1 (full: install/build/test exit 0, dependency order), AC-3 (partial: app→domain wired).

### Task 0.4: Changesets wired

**Files:**
- Create: `.changeset/config.json`, `.changeset/README.md`
- Test: `packages/domain/src/__tests__/changeset-config.test.ts` (config presence assertion)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('changesets configured', () => {
  it('config.json exists and is valid JSON', () => {
    const p = resolve(__dirname, '../../../../.changeset/config.json')
    expect(existsSync(p)).toBe(true)
    expect(() => JSON.parse(readFileSync(p, 'utf8'))).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL (file missing).

- [ ] **Step 3: Create `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Manual verify `pnpm changeset version` mechanics** — add a temp changeset under `.changeset/temp.md` marking `@crewdoku/app` patch, run `pnpm version-packages`, confirm `app/package.json` version bumped and `app/CHANGELOG.md` written, then revert the version bump + delete generated changelog (keep config). Document the observed result in the commit body.

- [ ] **Step 6: Commit** — `chore: wire @changesets/cli for the monorepo`

> **AC satisfied:** AC-22.

### Task 0.5: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow** (install → build → test → lint)

```yaml
name: CI
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -w build
      - run: pnpm -w test
      - run: pnpm -w lint
```

- [ ] **Step 2: Run locally** — `pnpm install && pnpm -w build && pnpm -w test && pnpm -w lint`. Expected: all exit 0.

- [ ] **Step 3: Commit** — `ci: add install/build/test/lint workflow`

> **AC satisfied:** AC-1 (CI green).

---

## Phase P1 — Domain foundation (entities + ids + calendar + schedule)

### Task 1.1: Entity types

**Files:**
- Create: `packages/domain/src/entities/types.ts`
- Test: `packages/domain/src/entities/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test** (type-level + structural assertion)

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { Shift, Employee, Coverage, Assignment, Rules, ID } from '../types'

describe('entity shapes', () => {
  it('Shift carries isNight and hours, not a literal code dependency', () => {
    expectTypeOf<Shift>().toHaveProperty('isNight').toEqualTypeOf<boolean>()
    expectTypeOf<Shift>().toHaveProperty('startHour').toEqualTypeOf<number>()
  })
  it('Assignment.shiftId is nullable (explicit day off)', () => {
    expectTypeOf<Assignment['shiftId']>().toEqualTypeOf<ID | null>()
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL (module missing).

- [ ] **Step 3: Create `types.ts`** — exact shapes from spec §5:

```ts
export type ID = string
export type ISODate = string // YYYY-MM-DD
export type Pref = 'prefer' | 'willing' | 'avoid'
export type ConstraintId = 'H1'|'H2'|'H3'|'H4'|'H5'|'H6'|'S1'|'S2'|'S3'|'S4'|'S5'
export type SoftId = 'S1'|'S2'|'S3'|'S4'|'S5'

export interface DateRange { start: ISODate; end: ISODate }
export interface RecurringRule { kind: 'noDow'; dow: number } // 0=Mon..6=Sun

export interface Org { id: ID; name: string }
export interface Team { id: ID; name: string; shiftIds: ID[] }
export interface Shift { id: ID; code: string; name: string; startHour: number; endHour: number; isNight: boolean }
export interface Employee {
  id: ID; name: string; teamId: ID
  eligibleShiftIds: ID[]
  contract: { maxHoursPerWeek?: number; maxShiftsPerWeek?: number }
  timeOff: DateRange[]
  recurring: RecurringRule[]
  prefs: { night: Pref; weekend: Pref; preferredShiftId?: ID; notes: string }
}
export interface Coverage {
  teamId: ID; shiftId: ID
  byDow: { min: number; max: number }[] // length 7, Mon..Sun
  dateOverrides: Record<ISODate, { min: number; max: number }>
}
export interface Period { startDate: ISODate; weeks: number }
export interface Assignment { employeeId: ID; date: ISODate; shiftId: ID | null }
export interface Rules {
  maxHoursPerWeek: number; minRestHours: number; maxConsecutiveDays: number
  enabled: Record<ConstraintId, boolean>
  weights: Record<SoftId, number>
}
```

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): entity types (nanoid IDs, ISO dates, isNight)`

> **AC satisfied:** AC-4 (types carry id, no index identity), AC-12 (Shift.isNight present).

### Task 1.2: ID generator

**Files:**
- Create: `packages/domain/src/ids.ts`
- Test: `packages/domain/src/__tests__/ids.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { newId } from '../ids'

describe('newId', () => {
  it('returns unique non-empty strings', () => {
    const a = newId(); const b = newId()
    expect(a).toBeTruthy(); expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Create `ids.ts`**

```ts
import { nanoid } from 'nanoid'
export const newId = (): string => nanoid()
```

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): newId wrapper over nanoid`

> **AC satisfied:** AC-4 (partial).

### Task 1.3: Entity factories

**Files:**
- Create: `packages/domain/src/entities/factories.ts`
- Test: `packages/domain/src/entities/__tests__/factories.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { makeShift, makeTeam, makeEmployee } from '../factories'

describe('factories', () => {
  it('assign nanoid ids and sensible defaults', () => {
    const s = makeShift({ code: 'NGT', name: 'Night', startHour: 1, endHour: 6, isNight: true })
    expect(s.id).toBeTruthy()
    const t = makeTeam({ name: 'QA', shiftIds: [s.id] })
    expect(t.id).toBeTruthy()
    const e = makeEmployee({ name: 'Ada', teamId: t.id, eligibleShiftIds: t.shiftIds })
    expect(e.id).toBeTruthy()
    expect(e.eligibleShiftIds).toEqual([s.id]) // defaults to team's set passed in
    expect(e.contract).toEqual({})
    expect(e.timeOff).toEqual([]); expect(e.recurring).toEqual([])
    expect(e.prefs.night).toBe('willing')
  })
  it('accepts an explicit id for deterministic tests', () => {
    expect(makeShift({ id: 'fixed', code: 'E', name: 'Early', startHour: 5, endHour: 11, isNight: false }).id).toBe('fixed')
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `factories.ts`** — each factory `{ id = newId(), ...rest }`, employee defaults `contract:{}`, `timeOff:[]`, `recurring:[]`, `prefs:{night:'willing',weekend:'willing',notes:''}`, `eligibleShiftIds` defaults to provided value (caller passes team's set). Include `makeOrg`, `makeTeam`, `makeShift`, `makeEmployee`, `makeCoverage` (byDow length-7 default `{min:0,max:0}`, `dateOverrides:{}`), `makeRules` (enabled all true H1..S5, weights S1=8 S2=6 S3=4 S4=5 S5=3, maxHoursPerWeek 48, minRestHours 11, maxConsecutiveDays 6).

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): entity factories with nanoid ids + defaults`

> **AC satisfied:** AC-4, AC-10 (eligibility defaults to team's set), AC-11 (default enabled/weights).

### Task 1.4: Calendar utilities

**Files:**
- Create: `packages/domain/src/calendar/calendar.ts`
- Test: `packages/domain/src/calendar/__tests__/calendar.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { dow, isWeekend, addDays, eachDate, isoWeekKey } from '../calendar'

describe('calendar', () => {
  it('dow is 0=Mon..6=Sun', () => {
    expect(dow('2026-06-15')).toBe(0) // Mon
    expect(dow('2026-06-21')).toBe(6) // Sun
  })
  it('isWeekend true Sat/Sun', () => {
    expect(isWeekend('2026-06-20')).toBe(true)  // Sat
    expect(isWeekend('2026-06-18')).toBe(false) // Thu
  })
  it('addDays crosses month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
  })
  it('eachDate iterates inclusive start over weeks*7 days', () => {
    const dates = eachDate({ startDate: '2026-06-15', weeks: 2 })
    expect(dates.length).toBe(14)
    expect(dates[0]).toBe('2026-06-15')
    expect(dates[13]).toBe('2026-06-28')
  })
  it('isoWeekKey buckets Mon-anchored; Sun shares the Mon bucket', () => {
    expect(isoWeekKey('2026-06-15')).toBe(isoWeekKey('2026-06-21')) // Mon..Sun same week
    expect(isoWeekKey('2026-06-22')).not.toBe(isoWeekKey('2026-06-21')) // next Mon differs
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `calendar.ts`** — parse `YYYY-MM-DD` to UTC date to avoid TZ drift; `dow` = `(getUTCDay()+6)%7`; `addDays` re-formats UTC; `eachDate(period)` returns `weeks*7` ISO strings from `startDate`; `isoWeekKey(date)` = ISO date of that date's Monday (`addDays(date, -dow(date))`). No `absDay`, no hardcoded 2026 baseline.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): ISO calendar utils (dow, week bucket, period iteration)`

> **AC satisfied:** AC-7 (week bucketing primitive), AC-8 (cross-boundary consecutive dates primitive).

### Task 1.5: Schedule (single source of truth) + queries/mutations

**Files:**
- Create: `packages/domain/src/schedule/schedule.ts`
- Test: `packages/domain/src/schedule/__tests__/schedule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { keyOf, makeSchedule, getAssignment, setAssignment, removeEmployee } from '../schedule'

describe('schedule single source of truth', () => {
  it('keyOf composes employeeId|date', () => {
    expect(keyOf('emp1', '2026-06-15')).toBe('emp1|2026-06-15')
  })
  it('set/get round-trip; null = explicit day off is stored', () => {
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'emp1', date: '2026-06-15', shiftId: 'sh1' })
    setAssignment(s, { employeeId: 'emp1', date: '2026-06-16', shiftId: null })
    expect(getAssignment(s, 'emp1', '2026-06-15')?.shiftId).toBe('sh1')
    expect(getAssignment(s, 'emp1', '2026-06-16')?.shiftId).toBeNull()
  })
  it('removeEmployee deletes only that employee, leaving others intact', () => {
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'a', date: '2026-06-15', shiftId: 'x' })
    setAssignment(s, { employeeId: 'b', date: '2026-06-15', shiftId: 'y' })
    removeEmployee(s, 'a')
    expect(getAssignment(s, 'a', '2026-06-15')).toBeUndefined()
    expect(getAssignment(s, 'b', '2026-06-15')?.shiftId).toBe('y')
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `schedule.ts`** — `Schedule = { assignments: Map<string, Assignment> }`; `keyOf(empId,date)`; `makeSchedule(initial?: Assignment[])`; `getAssignment`; `setAssignment` (overwrites by key); `removeAssignment`; `removeEmployee(s, empId)` iterates keys and deletes those whose `Assignment.employeeId === empId` (uses the stored field, NOT key string-split, so it is id-safe); `assignmentsFor(empId)`. No array indices anywhere.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): Schedule Map store + id-safe removeEmployee`

> **AC satisfied:** AC-5 (safe delete), AC-6 (single Map source of truth, scratch employee resolves empty).

### Task 1.6: Schedule DTO (Map ↔ Assignment[]) — lossless

**Files:**
- Create: `packages/domain/src/schedule/dto.ts`
- Test: `packages/domain/src/schedule/__tests__/dto.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { makeSchedule, setAssignment } from '../schedule'
import { toScheduleDTO, fromScheduleDTO } from '../dto'

describe('schedule DTO round-trip', () => {
  it('Map -> JSON-safe array -> Map is deep-equal incl null shiftId', () => {
    const s = makeSchedule()
    setAssignment(s, { employeeId: 'a', date: '2026-06-15', shiftId: 'x' })
    setAssignment(s, { employeeId: 'a', date: '2026-06-16', shiftId: null })
    const dto = toScheduleDTO(s)
    expect(Array.isArray(dto)).toBe(true)
    const json = JSON.parse(JSON.stringify(dto)) // survives serialization, no {} degradation
    const back = fromScheduleDTO(json)
    expect([...back.assignments.keys()].sort()).toEqual([...s.assignments.keys()].sort())
    expect(back.assignments.get('a|2026-06-16')?.shiftId).toBeNull()
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `dto.ts`** — `toScheduleDTO(s): Assignment[]` = `[...s.assignments.values()]`; `fromScheduleDTO(arr): Schedule` = `makeSchedule(arr)`. Plain arrays only; no Map in the wire shape.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): lossless Schedule<->DTO serialization`

> **AC satisfied:** AC-23 (partial — schedule Map serialization; full round-trip incl Rules in P5).

---

## Phase P2 — Constraints (H1–H6 + S1–S5 as pure fns, shared by checker AND model)

### Task 2.1: SolveContext (indexed entity bundle)

**Files:**
- Create: `packages/domain/src/constraints/context.ts`
- Test: `packages/domain/src/constraints/__tests__/context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { makeShift, makeTeam, makeEmployee } from '../../entities/factories'
import { buildContext } from '../context'

describe('SolveContext', () => {
  it('indexes shifts by id and exposes shiftHours', () => {
    const n = makeShift({ code: 'N', name: 'Night', startHour: 1, endHour: 6, isNight: true })
    const ctx = buildContext({ shifts: [n], teams: [], employees: [], coverages: [], rules: undefined })
    expect(ctx.shiftById.get(n.id)).toBe(n)
    expect(ctx.shiftHours(n.id)).toBe(5)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `context.ts`** — `buildContext({org?,teams,shifts,employees,coverages,rules})` returns `{ org, teams, shifts, employees, coverages, rules, shiftById:Map, teamById:Map, employeeById:Map, coverageByTeamShift:Map<`${teamId}|${shiftId}`,Coverage>, shiftHours(id):number = endHour-startHour, effectiveCoverage(teamId,shiftId,date):{min,max} = dateOverrides[date] ?? byDow[dow(date)] ?? {min:0,max:0} }`. Default `rules` via `makeRules()` if undefined.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): SolveContext indexing + effective coverage resolver`

> **AC satisfied:** AC-9 (dateOverride precedes byDow), AC-12 (shiftHours/isNight from Shift).

### Task 2.2: Hard constraint checkers H1–H6 (live-checker semantics)

> **HIGH RISK** — multi-week H2 bucketing + H3 across week boundaries. This is a rewrite of the legacy single-week `model.js` logic (`d<6`, single `h2` row). Port the *semantics* of `checkViolations` (sf.js:121–160) but key off ISO dates and `isNight`/eligibility, not array index/literal 'N'.

**Files:**
- Create: `packages/domain/src/constraints/hard.ts`
- Test: `packages/domain/src/constraints/__tests__/hard.test.ts`

- [ ] **Step 1: Write the failing tests** (one `it` per constraint)

```ts
import { describe, it, expect } from 'vitest'
import { makeShift, makeTeam, makeEmployee, makeCoverage, makeRules } from '../../entities/factories'
import { buildContext } from '../context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'
import { checkH1, checkH2, checkH3, checkH4, checkH5, checkH6 } from '../hard'

function fixture() {
  const early = makeShift({ id:'E', code:'E', name:'Early', startHour:5, endHour:13, isNight:false })   // 8h
  const late  = makeShift({ id:'L', code:'L', name:'Late',  startHour:20, endHour:30, isNight:false })   // ends 06:00 next day
  const night = makeShift({ id:'N', code:'N', name:'Night', startHour:1, endHour:6, isNight:true })
  const team  = makeTeam({ id:'T', name:'T', shiftIds:['E','L','N'] })
  const emp   = makeEmployee({ id:'e1', name:'A', teamId:'T', eligibleShiftIds:['E','L'] }) // NOT eligible for N
  const cov   = makeCoverage({ teamId:'T', shiftId:'E', byDow: Array.from({length:7},()=>({min:1,max:2})) })
  const rules = makeRules() // maxHoursPerWeek 48, minRestHours 11
  return { ctx: buildContext({ teams:[team], shifts:[early,late,night], employees:[emp], coverages:[cov], rules }), emp }
}

describe('hard constraints', () => {
  it('H1: counts only this team employees; min<=count<=max per (team,shift,date)', () => {
    const { ctx } = fixture(); const s = makeSchedule()
    // no one on Early -> below min(1)
    const v = checkH1(ctx, s, { startDate:'2026-06-15', weeks:1 })
    expect(v.some(x => x.shiftId==='E' && x.date==='2026-06-15' && x.kind==='under')).toBe(true)
  })
  it('H2: per ISO-week bucket; full cap on partial weeks (no pro-rating)', () => {
    const { ctx } = fixture(); const s = makeSchedule()
    // Late = 10h; 5 Late shifts Mon..Fri = 50h > 48 in one week bucket
    for (const d of ['2026-06-15','2026-06-16','2026-06-17','2026-06-18','2026-06-19'])
      setAssignment(s,{ employeeId:'e1', date:d, shiftId:'L' })
    const v = checkH2(ctx, s, { startDate:'2026-06-15', weeks:1 })
    expect(v.some(x => x.employeeId==='e1' && x.weekKey==='2026-06-15')).toBe(true)
  })
  it('H2: non-Monday start + weeks=2 => 3 ISO-week buckets (partial-lead, full, partial-trail), each at FULL cap (AC-7)', () => {
    const { ctx } = fixture(); const s = makeSchedule()
    // start Wed 2026-06-17, weeks=2 -> dates 2026-06-17 .. 2026-06-30 (14 days).
    // ISO-week (Mon-anchored) buckets:
    //   partial-lead  2026-06-15 (Wed 17 .. Sun 21)
    //   full          2026-06-22 (Mon 22 .. Sun 28)
    //   partial-trail 2026-06-29 (Mon 29 .. Tue 30)
    const period = { startDate:'2026-06-17', weeks:2 }
    // Put a Late (10h) shift on every period date so each bucket has hours; assert cap math.
    for (const d of ['2026-06-17','2026-06-18','2026-06-19','2026-06-20','2026-06-21', // lead: 5 Late = 50h > 48
                     '2026-06-22','2026-06-23','2026-06-24','2026-06-25','2026-06-26', // full: 5 Late = 50h > 48
                     '2026-06-29','2026-06-30'])                                        // trail: 2 Late = 20h <= 48
      setAssignment(s,{ employeeId:'e1', date:d, shiftId:'L' })
    const v = checkH2(ctx, s, period)
    const buckets = [...new Set(v.filter(x => x.employeeId==='e1').map(x => x.weekKey))].sort()
    // Lead and full buckets exceed the FULL cap (48, NOT pro-rated to 5/7*48); trail (20h) does not violate.
    expect(buckets).toEqual(['2026-06-15','2026-06-22'])
    expect(v.every(x => x.cap === 48)).toBe(true) // full cap applied to the partial lead bucket too
  })
  it('H3: flags a Sun->Mon pair under minRestHours across the week boundary', () => {
    const { ctx } = fixture(); const s = makeSchedule()
    setAssignment(s,{ employeeId:'e1', date:'2026-06-21', shiftId:'L' }) // Sun Late ends 06:00 Mon
    setAssignment(s,{ employeeId:'e1', date:'2026-06-22', shiftId:'E' }) // Mon Early starts 05:00 -> negative rest
    const v = checkH3(ctx, s, { startDate:'2026-06-15', weeks:2 })
    expect(v.some(x => x.employeeId==='e1' && x.fromDate==='2026-06-21' && x.toDate==='2026-06-22')).toBe(true)
  })
  it('H4: one shift per day (two assignments same day) — enforced via Map key, structurally impossible; checker reports none', () => {
    const { ctx } = fixture(); const s = makeSchedule()
    setAssignment(s,{ employeeId:'e1', date:'2026-06-15', shiftId:'E' })
    expect(checkH4(ctx, s, { startDate:'2026-06-15', weeks:1 })).toEqual([])
  })
  it('H5: time-off date assigned a shift is a violation', () => {
    const { ctx, emp } = fixture(); emp.timeOff.push({ start:'2026-06-16', end:'2026-06-16' })
    const ctx2 = buildContext({ ...ctx, employees:[emp] } as any)
    const s = makeSchedule(); setAssignment(s,{ employeeId:'e1', date:'2026-06-16', shiftId:'E' })
    expect(checkH5(ctx2, s, { startDate:'2026-06-15', weeks:1 }).length).toBeGreaterThan(0)
  })
  it('H6: assigning an ineligible shift is a violation', () => {
    const { ctx } = fixture(); const s = makeSchedule()
    setAssignment(s,{ employeeId:'e1', date:'2026-06-15', shiftId:'N' }) // e1 not eligible for N
    expect(checkH6(ctx, s, { startDate:'2026-06-15', weeks:1 }).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests** — Expected: FAIL.

- [ ] **Step 3: Implement `hard.ts`** — each `checkHn(ctx, schedule, period) => Violation[]`:
  - **H1:** for each coverage `(teamId,shiftId)` × each period date, count assignments where `employeeById.get(a.employeeId).teamId === coverage.teamId && a.shiftId === coverage.shiftId`; compare to `effectiveCoverage`. Emit `{rule:'H1', kind:'under'|'over', teamId, shiftId, date, count, min, max}`.
  - **H2:** group period dates by `isoWeekKey`; for each employee × week bucket, sum `shiftHours(shiftId)` over assignments in that bucket; cap = `employee.contract.maxHoursPerWeek ?? rules.maxHoursPerWeek`. Full cap on partial weeks. Emit `{rule:'H2', employeeId, weekKey, hours, cap}`. Rest math ported from sf.js (hours = endHour-startHour, cross-midnight handled because endHour may exceed 24).
  - **H3:** for each employee, sort assigned dates ascending across the *whole period*; for each consecutive calendar-date pair (Sun→Mon included), `rest = toDateStart - fromDateEnd` where `fromDateEnd = fromDayIndex*24 + fromShift.endHour`, `toStart = toDayIndex*24 + toShift.startHour` (day index from `addDays`/diff). If `rest < rules.minRestHours` emit `{rule:'H3', employeeId, fromDate, toDate, rest}`. This is the sf.js formula generalized to N days.
  - **H4:** Map keying makes 2 shifts/day impossible; checker returns `[]` (kept for parity + model still emits the ≤1 row).
  - **H5:** for each assignment with non-null shift, if date ∈ any `employee.timeOff` range OR `dow(date)` matches a `recurring{kind:'noDow'}`, emit `{rule:'H5', employeeId, date}`.
  - **H6:** for each assignment with non-null shift, if `shiftId ∉ employee.eligibleShiftIds`, emit `{rule:'H6', employeeId, date, shiftId}`.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): pure hard-constraint checkers H1-H6 (multi-week, id-based)`

> **AC satisfied:** AC-7 (H2 per ISO-week bucket, full cap on partial), AC-8 (H3 Sun→Mon checker side), AC-9 (H1 per-team count), AC-10 (H6 eligibility), AC-12 (isNight not literal 'N').

### Task 2.3: Soft constraint scorers S1–S5

**Files:**
- Create: `packages/domain/src/constraints/soft.ts`
- Test: `packages/domain/src/constraints/__tests__/soft.test.ts`

- [ ] **Step 1: Write the failing tests** (port semantics from `scoreTerms` model.js:359–445, generalized to ISO dates + period-wide aggregation)

```ts
import { describe, it, expect } from 'vitest'
import { scoreS1, scoreS2, scoreS3, scoreS4 } from '../soft'
import { makeShift, makeTeam, makeEmployee, makeRules } from '../../entities/factories'
import { buildContext } from '../context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

describe('soft scorers', () => {
  it('S1 night fairness = min-max spread of per-employee night counts over the period, keyed by isNight', () => {
    const night = makeShift({ id:'N', code:'NIGHTLY', name:'Night', startHour:1, endHour:6, isNight:true }) // non-"N" code
    const team = makeTeam({ id:'T', name:'T', shiftIds:['N'] })
    const e1 = makeEmployee({ id:'e1', name:'A', teamId:'T', eligibleShiftIds:['N'] })
    const e2 = makeEmployee({ id:'e2', name:'B', teamId:'T', eligibleShiftIds:['N'] })
    const ctx = buildContext({ teams:[team], shifts:[night], employees:[e1,e2], coverages:[], rules: makeRules() })
    const s = makeSchedule()
    setAssignment(s,{ employeeId:'e1', date:'2026-06-15', shiftId:'N' })
    setAssignment(s,{ employeeId:'e1', date:'2026-06-16', shiftId:'N' }) // e1=2 nights, e2=0
    expect(scoreS1(ctx, s, { startDate:'2026-06-15', weeks:1 })).toBe(2) // spread 2-0
  })
  it('S3 stability counts cells changed vs a baseline schedule', () => {
    const day = makeShift({ id:'D', code:'D', name:'Day', startHour:9, endHour:17, isNight:false })
    const team = makeTeam({ id:'T', name:'T', shiftIds:['D'] })
    const e1 = makeEmployee({ id:'e1', name:'A', teamId:'T', eligibleShiftIds:['D'] })
    const ctx = buildContext({ teams:[team], shifts:[day], employees:[e1], coverages:[], rules: makeRules() })
    const base = makeSchedule(); setAssignment(base,{ employeeId:'e1', date:'2026-06-15', shiftId:'D' })
    const next = makeSchedule(); setAssignment(next,{ employeeId:'e1', date:'2026-06-15', shiftId:null })
    expect(scoreS3(ctx, next, { startDate:'2026-06-15', weeks:1 }, base)).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests** — Expected: FAIL.

- [ ] **Step 3: Implement `soft.ts`** — return **unweighted raw counts** (weights applied in registry/score):
  - **S1:** per-employee count of assignments where `shiftById.get(shiftId).isNight`, over all period dates; return `max - min` spread. Gate on existence of any `isNight` shift (else 0).
  - **S2:** count preference violations: for each employee, `prefs.preferredShiftId` not worked when willing/preferred semantics, `night`/`weekend` `avoid` worked, etc. Port the avoid/prefer logic from model.js but keyed by `prefs`.
  - **S3:** count cells differing from `baseline` schedule over the period (null vs shift, shift vs different shift).
  - **S4:** per-employee weekend-shift count (dates with `isWeekend`), return `max - min` spread.
  - **S5:** count incompatible consecutive-day pairs (curated; same incompatibility set as H3 but as a soft penalty). Omittable.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): pure soft scorers S1-S5 (period-wide, isNight-keyed)`

> **AC satisfied:** AC-12 (S1 works for non-"N" night code).

### Task 2.4: Constraint registry (toggle + weights, runAll)

**Files:**
- Create: `packages/domain/src/constraints/registry.ts`
- Test: `packages/domain/src/constraints/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { runHardChecks, scoreSoft } from '../registry'
import { makeShift, makeTeam, makeEmployee, makeRules } from '../../entities/factories'
import { buildContext } from '../context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

describe('registry gating', () => {
  it('disabled[H6]=false removes H6 violations', () => {
    const n = makeShift({ id:'N', code:'N', name:'Night', startHour:1, endHour:6, isNight:true })
    const team = makeTeam({ id:'T', name:'T', shiftIds:['N'] })
    const e1 = makeEmployee({ id:'e1', name:'A', teamId:'T', eligibleShiftIds:[] }) // eligible for nothing
    const rules = makeRules(); 
    const ctx = buildContext({ teams:[team], shifts:[n], employees:[e1], coverages:[], rules })
    const s = makeSchedule(); setAssignment(s,{ employeeId:'e1', date:'2026-06-15', shiftId:'N' })
    const period = { startDate:'2026-06-15', weeks:1 }
    expect(runHardChecks(ctx, s, period).some(v => v.rule==='H6')).toBe(true)
    rules.enabled.H6 = false
    expect(runHardChecks(ctx, s, period).some(v => v.rule==='H6')).toBe(false)
  })
  it('scoreSoft applies weights and drops disabled terms', () => {
    // build a 2-night-spread fixture, weight S1=8 -> 16; disable -> 0
    // (fixture omitted for brevity in plan; mirror soft.test S1 fixture)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `registry.ts`** — `runHardChecks(ctx,s,period)` calls each `checkHn` only if `ctx.rules.enabled[Hn]`, concatenates. `scoreSoft(ctx,s,period,baseline)` returns `{ S1, S2, S3, S4, S5, total }` where each `Sx = enabled[Sx] ? weights[Sx]*rawScorer(...) : 0`, `total = sum`. (Complete the S1 weight fixture in Step 1 before implementing.)

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): constraint registry (enable toggles + weighted soft total)`

> **AC satisfied:** AC-11 (toggles remove from checker; weights change term), AC-13 (weighted breakdown shape groundwork).

---

## Phase P3 — Solver (pure model + score + mapSolution + conflict + SolverPort)

> **HIGH RISK across this phase** — (a) the **shared index map** in `meta` consumed verbatim by `mapSolution` is the structural fix for the mis-attribution bug; (b) the model is a **multi-week rewrite** of legacy `model.js`, not a port. Port the LP-emission *style* and `scoreTerms`/diff *logic* from `model.js`/`client.js`, but generalize index→id and single-week→period.

### Task 3.1: SolverPort + StoragePort interfaces + Solution/DTO types

**Files:**
- Create: `packages/domain/src/ports/ports.ts`
- Test: `packages/domain/src/ports/__tests__/ports.test.ts`

- [ ] **Step 1: Write the failing test** (interface conformance via a fake)

```ts
import { describe, it, expect } from 'vitest'
import type { SolverPort, StoragePort, Solution } from '../ports'

const fakeSolver: SolverPort = {
  async solve(lp) { return { status: 'optimal', columns: {}, objective: 0 } as Solution }
}
describe('ports', () => {
  it('SolverPort.solve resolves a Solution', async () => {
    const r = await fakeSolver.solve('Minimize\n obj: 0\nSubject To\nEnd')
    expect(r.status).toBe('optimal')
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `ports.ts`**

```ts
import type { Assignment, Rules, Shift, Team, Employee, Coverage, Org } from '../entities/types'

export interface Solution { status: string; objective: number; columns: Record<string, { Primal?: number; primal?: number }> }
export type SolveResult = Solution // status carries 'optimal'|'infeasible'|...
export interface SolverPort { solve(lp: string, options?: Record<string, unknown>): Promise<Solution> }

export interface AppStateDTO {
  org: Org | null; teams: Team[]; shifts: Shift[]; employees: Employee[]
  coverages: Coverage[]; rules: Rules; assignments: Assignment[]; period: { startDate: string; weeks: number }
}
export interface StoragePort { save(state: AppStateDTO): Promise<void>; load(): Promise<AppStateDTO | null> }
```

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): SolverPort + StoragePort interfaces + DTOs`

> **AC satisfied:** AC-15 (port boundary defined), AC-23 (DTO shape for round-trip).
>
> **Note (AC-17):** `Solution.status` is a free string carrying HiGHS' `'Optimal'`/`'Infeasible'`/etc. The adapter test in Task 5.3 must include an `'Infeasible'` status-mapping case so the infeasible UI path is exercised end to end (store reads `status` and branches to the conflict-core flow).

### Task 3.2: buildModel → { lp, meta } with shared index map

**Files:**
- Create: `packages/domain/src/solver/model.ts`
- Test: `packages/domain/src/solver/__tests__/model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildModel } from '../model'
import { makeShift, makeTeam, makeEmployee, makeCoverage, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'

function ctxFixture() {
  const e = makeShift({ id:'E', code:'E', name:'Early', startHour:5, endHour:13, isNight:false })
  const team = makeTeam({ id:'T', name:'T', shiftIds:['E'] })
  const emp = makeEmployee({ id:'emp1', name:'A', teamId:'T', eligibleShiftIds:['E'] })
  const cov = makeCoverage({ teamId:'T', shiftId:'E', byDow: Array.from({length:7},()=>({min:1,max:1})) })
  return buildContext({ teams:[team], shifts:[e], employees:[emp], coverages:[cov], rules: makeRules() })
}

// 2-team fixture: teams T and U each staff their own copy of shift E; one emp per team.
// Used to assert H1 coverage rows are scoped to a team's own employees (AC-9).
function twoTeamFixture() {
  const e = makeShift({ id:'E', code:'E', name:'Early', startHour:5, endHour:13, isNight:false })
  const teamT = makeTeam({ id:'T', name:'T', shiftIds:['E'] })
  const teamU = makeTeam({ id:'U', name:'U', shiftIds:['E'] })
  const empT = makeEmployee({ id:'empT', name:'T-person', teamId:'T', eligibleShiftIds:['E'] })
  const empU = makeEmployee({ id:'empU', name:'U-person', teamId:'U', eligibleShiftIds:['E'] })
  const covT = makeCoverage({ teamId:'T', shiftId:'E', byDow: Array.from({length:7},()=>({min:1,max:1})) })
  const covU = makeCoverage({ teamId:'U', shiftId:'E', byDow: Array.from({length:7},()=>({min:1,max:1})) })
  return buildContext({ teams:[teamT,teamU], shifts:[e], employees:[empT,empU], coverages:[covT,covU], rules: makeRules() })
}

// Cross-midnight Late shift fixture for H3 across a week boundary (AC-8).
function h3BoundaryFixture() {
  const l = makeShift({ id:'L', code:'L', name:'Late', startHour:20, endHour:30, isNight:false }) // ends 06:00 next day
  const ee = makeShift({ id:'E', code:'E', name:'Early', startHour:5, endHour:13, isNight:false })
  const team = makeTeam({ id:'T', name:'T', shiftIds:['L','E'] })
  const emp = makeEmployee({ id:'emp1', name:'A', teamId:'T', eligibleShiftIds:['L','E'] })
  return buildContext({ teams:[team], shifts:[l,ee], employees:[emp], coverages:[], rules: makeRules() })
}

describe('buildModel', () => {
  it('returns lp string + meta with bidirectional id<->dense maps', () => {
    const { lp, meta } = buildModel(ctxFixture(), { startDate:'2026-06-15', weeks:1 })
    expect(lp).toContain('Minimize')
    expect(lp).toContain('Subject To')
    expect(meta.empIndex.get('emp1')).toBe(0)
    expect(meta.empById.get(0)).toBe('emp1')
    expect(meta.dateIndex.get('2026-06-15')).toBe(0)
    expect(meta.varNames.length).toBeGreaterThan(0)
  })
  it('emits H2 one cap row per (employee, ISO-week bucket) for weeks>=2', () => {
    const { lp } = buildModel(ctxFixture(), { startDate:'2026-06-15', weeks:2 })
    const h2rows = (lp.match(/h2_/g) || []).length
    expect(h2rows).toBe(2) // 1 employee x 2 week buckets
  })
  it('H1 coverage row for team T references only team-T x-vars, excludes team-U vars (AC-9)', () => {
    const { lp, meta } = buildModel(twoTeamFixture(), { startDate:'2026-06-15', weeks:1 })
    // dense int for each employee from the shared meta — vars are x_{empI}_{dateI}_{shiftId}
    const tI = meta.empIndex.get('empT'); const uI = meta.empIndex.get('empU')
    const dI = meta.dateIndex.get('2026-06-15')
    // Isolate the H1 row that constrains team T's coverage of E on that date.
    // Rows are labeled h1_{teamId}_{shiftId}_{dateI}; capture its constraint line.
    const rowRe = new RegExp(`h1_T_E_${dI}:[^\\n]*`)
    const row = (lp.match(rowRe) || [])[0]
    expect(row).toBeTruthy()
    expect(row).toContain(`x_${tI}_${dI}_E`)        // team-T employee var present
    expect(row).not.toContain(`x_${uI}_${dI}_E`)    // team-U employee var excluded
  })
  it('H3 row references both the boundary-Sunday var and the following-Monday var (AC-8)', () => {
    // weeks=2 starting Mon 2026-06-15 -> Sun 2026-06-21 (dateI 6) and Mon 2026-06-22 (dateI 7) span the ISO-week boundary.
    const { lp, meta } = buildModel(h3BoundaryFixture(), { startDate:'2026-06-15', weeks:2 })
    const sunI = meta.dateIndex.get('2026-06-21'); const monI = meta.dateIndex.get('2026-06-22')
    // H3 emits pairwise rows x_from + x_to <= 1 for incompatible (Late ends 06:00) -> (Early starts 05:00) across the boundary.
    const fromVar = `x_${meta.empIndex.get('emp1')}_${sunI}_L`
    const toVar   = `x_${meta.empIndex.get('emp1')}_${monI}_E`
    const h3rows = lp.split('\n').filter(r => /h3_/.test(r) && r.includes(fromVar) && r.includes(toVar))
    expect(h3rows.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `model.ts`** — `buildModel(ctx, period, opts?) -> { lp, meta }`:
  - Build dense maps: `empIndex: Map<ID,number>`, `empById: Map<number,ID>`, `dateIndex: Map<ISODate,number>`, `dateById`, from `ctx.employees` order and `eachDate(period)`. Var names `x_{empI}_{dateI}_{shiftId}` only for shifts in that employee's `eligibleShiftIds` (this *is* H6 baked into the variable set).
  - **H4:** ≤1 row per (emp, date). **H1:** per coverage × date, `min ≤ Σ team's emps' x ≤ max`, summing **only that coverage team's own employees' x-vars** (look up `employeeById.get(empId).teamId === coverage.teamId`) — never other teams' vars. Label rows `h1_{teamId}_{shiftId}_{dateI}`. **H2:** per (emp, ISO-week bucket), `Σ hours·x ≤ cap`; label `h2_{empI}_{weekBucketIdx}`. **H3:** per emp, for each consecutive calendar pair (incl Sun→Mon, spanning the ISO-week boundary) and each incompatible shift pair, `x_from + x_to ≤ 1`; label `h3_{empI}_{fromDateI}_{toDateI}_{fromShift}_{toShift}`. **H5:** time-off/recurring dates fixed to 0 (or omit those vars). Pins from `opts.pins` fixed to 1.
  - **Row labels are part of the meta/LP contract** the tests assert against: `h1_{teamId}_{shiftId}_{dateI}`, `h2_{empI}_{weekBucketIdx}`, `h3_{empI}_{fromDateI}_{toDateI}_{fromShift}_{toShift}`, var names `x_{empI}_{dateI}_{shiftId}`. Keep them stable.
  - Objective: S1/S4 min-max aux vars + S2/S3/S5 terms, gated by `ctx.rules.enabled` and scaled by `ctx.rules.weights`. Reuse the LP-assembly style from legacy `model.js` (`Minimize/Subject To/Bounds/Binary/End`).
  - `meta = { varNames, auxVars, empIndex, empById, dateIndex, dateById, shiftIds, objConst, varCount, rowCount, period }`.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): pure buildModel with shared id<->dense meta (multi-week)`

> **AC satisfied:** AC-7 (H2 per-bucket in model), AC-8 (H3 cross-boundary infeasible side), AC-9 (H1 per-team in model), AC-10 (H6 baked into var set), AC-11 (enabled/weights drive model), AC-14 (meta produced), AC-15 (pure, node-runnable).

### Task 3.3: scoreTerms parity

**Files:**
- Create: `packages/domain/src/solver/score.ts`
- Test: `packages/domain/src/solver/__tests__/score.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { scoreTerms } from '../score'
import { makeShift, makeTeam, makeEmployee, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

describe('scoreTerms', () => {
  it('returns weighted breakdown {S1,S2,S3,S4,S5,total} independent of any LP constant', () => {
    // 2-night spread: e1 works 2 nights, e2 works 0 -> S1 raw spread = 2; weight S1=8 -> 16.
    const night = makeShift({ id:'N', code:'NIGHTLY', name:'Night', startHour:1, endHour:6, isNight:true })
    const team = makeTeam({ id:'T', name:'T', shiftIds:['N'] })
    const e1 = makeEmployee({ id:'e1', name:'A', teamId:'T', eligibleShiftIds:['N'] })
    const e2 = makeEmployee({ id:'e2', name:'B', teamId:'T', eligibleShiftIds:['N'] })
    const ctx = buildContext({ teams:[team], shifts:[night], employees:[e1,e2], coverages:[], rules: makeRules() })
    const s = makeSchedule()
    setAssignment(s,{ employeeId:'e1', date:'2026-06-15', shiftId:'N' })
    setAssignment(s,{ employeeId:'e1', date:'2026-06-16', shiftId:'N' })
    const period = { startDate:'2026-06-15', weeks:1 }
    const b = scoreTerms(ctx, s, period)
    expect(b.S1).toBe(16) // 8 (weight) * 2 (raw spread)
    expect(b.total).toBe(b.S1 + b.S2 + b.S3 + b.S4 + b.S5)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `score.ts`** — `scoreTerms(ctx, schedule, period, baseline?) => { S1,S2,S3,S4,S5,total }` delegating to `scoreSoft` from the registry (Task 2.4). This is the single recompute path for `penalty`/`prevPenalty` (HiGHS drops the objective constant).

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): scoreTerms parity (weighted breakdown, LP-constant-free)`

> **AC satisfied:** AC-13 (penalty recompute via scoreTerms).

### Task 3.4: mapSolution consumes the SAME meta

**Files:**
- Create: `packages/domain/src/solver/mapSolution.ts`
- Test: `packages/domain/src/solver/__tests__/mapSolution.test.ts`

- [ ] **Step 1: Write the failing test** (the round-trip attribution guarantee)

```ts
import { describe, it, expect } from 'vitest'
import { buildModel } from '../model'
import { mapSolution } from '../mapSolution'
import { makeShift, makeTeam, makeEmployee, makeCoverage, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'

// Local fixture: 1 emp 'emp1', 1 date, 1 shift 'E' (mirrors model.test ctxFixture).
function ctxFixture() {
  const e = makeShift({ id:'E', code:'E', name:'Early', startHour:5, endHour:13, isNight:false })
  const team = makeTeam({ id:'T', name:'T', shiftIds:['E'] })
  const emp = makeEmployee({ id:'emp1', name:'A', teamId:'T', eligibleShiftIds:['E'] })
  const cov = makeCoverage({ teamId:'T', shiftId:'E', byDow: Array.from({length:7},()=>({min:1,max:1})) })
  return buildContext({ teams:[team], shifts:[e], employees:[emp], coverages:[cov], rules: makeRules() })
}

describe('mapSolution', () => {
  it('attributes a known HiGHS column set to the correct employeeId + date via shared meta', () => {
    const { meta } = buildModel(ctxFixture(), { startDate:'2026-06-15', weeks:1 })
    const colName = meta.varNames.find((v: string) => v.endsWith('_E'))!
    const solution = { status:'optimal', objective:0, columns: { [colName]: { Primal: 1 } } }
    const assignments = mapSolution(solution, meta)
    expect(assignments).toContainEqual({ employeeId:'emp1', date:'2026-06-15', shiftId:'E' })
  })
  it('OMITS unfilled (emp,date) cells: an all-empty solve over N cells yields ZERO assignments, not N day-off rows', () => {
    // weeks=2 -> emp1 x 14 dates = 14 candidate cells. With no column set above 0.5, mapSolution emits NOTHING.
    const { meta } = buildModel(ctxFixture(), { startDate:'2026-06-15', weeks:2 })
    const empty = { status:'optimal', objective:0, columns: {} as Record<string, { Primal: number }> }
    const assignments = mapSolution(empty, meta)
    expect(assignments.length).toBe(0) // does NOT synthesize 14 {shiftId:null} day-off rows
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `mapSolution.ts`** — `mapSolution(solution, meta): Assignment[]` decodes `x_{e}_{d}_{shiftId}` columns where `Primal>0.5`, looks up `meta.empById.get(e)` and `meta.dateById.get(d)` — **never re-derives ordering**. **It OMITS unfilled (emp,date) cells**: it emits an Assignment only for the columns the solver actually set, and never synthesizes an explicit `{shiftId:null}` day-off for empty cells. This matches legacy `decodeColumns` (client.js:20) and avoids flooding the proposal with a spurious day-off change for every empty cell. The "explicit day off vs not-yet-scheduled" distinction is resolved downstream in `buildProposal` by diffing against the current schedule (a cell that was a shift in current and is absent here becomes a `from:'X' -> to:null` change; a cell that was already empty produces no change).

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): mapSolution consumes shared meta (kills mis-attribution)`

> **AC satisfied:** AC-14 (mapSolution uses the SAME meta, correct attribution).

### Task 3.5: buildProposal (diff vs current + breakdown)

**Files:**
- Create: `packages/domain/src/solver/proposal.ts`
- Test: `packages/domain/src/solver/__tests__/proposal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildProposal } from '../proposal'
import { makeShift, makeTeam, makeEmployee, makeCoverage, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

// Inline fixture (NOT shown elsewhere): 1 emp 'emp1', 1 shift 'E', 1-week period.
// Current schedule has emp1 unscheduled on 2026-06-15; solver fills it with 'E'.
function fx() {
  const e = makeShift({ id:'E', code:'E', name:'Early', startHour:5, endHour:13, isNight:false })
  const team = makeTeam({ id:'T', name:'T', shiftIds:['E'] })
  const emp = makeEmployee({ id:'emp1', name:'A', teamId:'T', eligibleShiftIds:['E'] })
  const cov = makeCoverage({ teamId:'T', shiftId:'E', byDow: Array.from({length:7},()=>({min:1,max:1})) })
  const ctx = buildContext({ teams:[team], shifts:[e], employees:[emp], coverages:[cov], rules: makeRules() })
  const current = makeSchedule() // emp1 has no assignment on 2026-06-15 (not scheduled)
  // solvedAssignments is what mapSolution returns: only the cells the solver set (omit semantics).
  const solved = [{ employeeId:'emp1', date:'2026-06-15', shiftId:'E' as string | null }]
  return { ctx, current, solved, period: { startDate:'2026-06-15', weeks:1 } }
}

describe('buildProposal', () => {
  it('produces proposal {id,changes[],fairness,prevFairness,penalty,prevPenalty,breakdown[]}', () => {
    const { ctx, current, solved, period } = fx()
    const p = buildProposal(ctx, current, solved, period)
    // contract field names present
    expect(p).toHaveProperty('id'); expect(typeof p.id).toBe('string')
    expect(p).toHaveProperty('fairness'); expect(p).toHaveProperty('prevFairness')
    expect(p).toHaveProperty('penalty'); expect(p).toHaveProperty('prevPenalty')
    // exactly one change: unscheduled (treated as null) -> 'E'
    expect(p.changes).toEqual([
      expect.objectContaining({ employeeId:'emp1', date:'2026-06-15', from:null, to:'E' }),
    ])
    // breakdown is one row per soft constraint S1..S5
    expect(p.breakdown.map(b => b.id)).toEqual(['S1','S2','S3','S4','S5'])
  })
  it('a solve that changes nothing (solved == current) yields an empty changes[]', () => {
    const { ctx, period } = fx()
    const cur = makeSchedule(); setAssignment(cur,{ employeeId:'emp1', date:'2026-06-15', shiftId:'E' })
    const solved = [{ employeeId:'emp1', date:'2026-06-15', shiftId:'E' as string | null }]
    const p = buildProposal(ctx, cur, solved, period)
    expect(p.changes).toEqual([])
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `proposal.ts`** — `buildProposal(ctx, currentSchedule, solvedAssignments, period): Proposal`. Build a "next" schedule by applying `solvedAssignments` onto the period cells; **because `mapSolution` omits unfilled cells, the diff is taken over the union of current period cells and solved cells**: for each (employeeId,date) compute `from = getAssignment(current)?.shiftId ?? null`, `to = solved cell's shiftId ?? null` (a cell absent from `solvedAssignments` keeps `from` and is therefore not a change). Emit a change only where `from !== to`, as `{employeeId,date,from,to,note}`. `penalty = scoreTerms(ctx,next,period).total`, `prevPenalty = scoreTerms(ctx,current,period).total`. `fairness`/`prevFairness` = monotonic 0–100 from spread (port `fairnessScore` client.js:40, isNight-gated). `breakdown` = `[{id,name,now,prev}]` for S1..S5 in order. `id = 'P-' + <counter/timestamp>`. Preserve the exact contract field names.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): buildProposal diff + preserved proposal contract`

> **AC satisfied:** AC-13 (proposal shape preserved), AC-16 (diff vs current Schedule).

### Task 3.6: deriveConflictCore (truthful infeasible only)

> **NOTE:** Delete the demo-injected infeasibility (`buildInfeasibleReqOverride`, fabricated "Night requires N" core, hardcoded `'N'`) — out of scope. Port the *real* diagnostic (`realInfeasibleDiagnostic`, client.js:295) generalized to ISO dates + per-team coverage.

**Files:**
- Create: `packages/domain/src/solver/conflict.ts`
- Test: `packages/domain/src/solver/__tests__/conflict.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { deriveConflictCore } from '../conflict'
import { makeShift, makeTeam, makeEmployee, makeCoverage, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'
import { makeSchedule } from '../../schedule/schedule'

// Inline fixture (NOT shown elsewhere): team T needs min 3 on a shift on every date,
// but only 1 eligible employee exists -> genuinely infeasible (coverage exceeds eligible headcount).
function infeasibleFx() {
  const e = makeShift({ id:'E', code:'E', name:'Early', startHour:5, endHour:13, isNight:false })
  const team = makeTeam({ id:'T', name:'T', shiftIds:['E'] })
  const emp = makeEmployee({ id:'emp1', name:'A', teamId:'T', eligibleShiftIds:['E'] }) // only 1 eligible
  const cov = makeCoverage({ teamId:'T', shiftId:'E', byDow: Array.from({length:7},()=>({min:3,max:3})) }) // needs 3
  const ctx = buildContext({ teams:[team], shifts:[e], employees:[emp], coverages:[cov], rules: makeRules() })
  return { ctx, schedule: makeSchedule(), period: { startDate:'2026-06-15', weeks:1 } }
}

describe('deriveConflictCore', () => {
  it('returns a truthful core + >=1 applicable relaxation for a real infeasible input', () => {
    const { ctx, schedule, period } = infeasibleFx()
    const { core, relaxations } = deriveConflictCore(ctx, schedule, period)
    expect(core.length).toBeGreaterThan(0)
    // core is derived from the actual coverage/staff gap, not a fabricated "Night requires N" message
    expect(core.some(c => c.cid === 'H1')).toBe(true)
    expect(relaxations.length).toBeGreaterThanOrEqual(1)
    // at least one relaxation lowers team T's coverage min for the infeasible (shift,date)
    const lower = relaxations.find(r => /coverage|min/i.test(r.text))
    expect(lower).toBeTruthy()
    expect(typeof lower!.apply).toBe('function')
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `conflict.ts`** — `deriveConflictCore(ctx, schedule, period): { core: {cid,text}[]; relaxations: {id,text,detail,apply}[] }`. Inspect actual coverage budget vs available eligible staff per (team,shift,date) (a `min` exceeding the count of employees on that team eligible for that shift is a truthful H1 core), and forced cells (time-off/pins) creating H3 conflicts. Relaxations: lower a team's coverage min for a date (returns a coverage patch), drop an H3 pair, unpin cells. Each relaxation's `apply` is a pure function returning patched inputs (e.g. a coverage with reduced `min`) so re-solving is feasible. No fabricated Night core; no literal `'N'`.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): truthful deriveConflictCore + applicable relaxations`

> **AC satisfied:** AC-17 (truthful core + ≥1 relaxation that makes re-solve feasible).

### Task 3.7: Domain solver barrel + purity grep test

**Files:**
- Modify: `packages/domain/src/index.ts` (export solver, constraints, schedule, calendar, entities, ports, seed-later)
- Test: `packages/domain/src/__tests__/purity.test.ts`

- [ ] **Step 1: Write the failing test** (the import-boundary / purity guard)

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { if (f !== '__tests__') walk(p, out) }
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p)
  }
  return out
}
const FORBIDDEN = /\b(from\s+['"]react|react-dom|highs)|(\bdocument\b|\bwindow\b|\bWorker\b|indexedDB|navigator)/
describe('domain purity', () => {
  it('no react/dom/wasm/worker/indexeddb refs in domain src', () => {
    const root = resolve(__dirname, '..')
    const offenders = walk(root).filter(p => FORBIDDEN.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
  it('no baseAssign hash baseline exists', () => {
    const root = resolve(__dirname, '..')
    const offenders = walk(root).filter(p => /baseAssign/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run test** — Expected: PASS if domain is clean (this guards future regressions). If it fails, fix the offending domain file.

- [ ] **Step 3: Update `index.ts`** to re-export public domain surface.

- [ ] **Step 4: Run `pnpm --filter @crewdoku/domain test`** — Expected: all green.

- [ ] **Step 5: Commit** — `test(domain): purity + no-baseAssign grep guards; public barrel`

> **AC satisfied:** AC-2 (domain purity grep test), AC-6 (no baseAssign grep).

---

## Phase P4 — Export (CSV team + member)

### Task 4.1: CSV team grid + member list

**Files:**
- Create: `packages/domain/src/export/csv.ts`
- Test: `packages/domain/src/export/__tests__/csv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { exportTeamCSV, exportMemberCSV } from '../csv'
import { makeShift, makeTeam, makeEmployee, makeRules } from '../../entities/factories'
import { buildContext } from '../../constraints/context'
import { makeSchedule, setAssignment } from '../../schedule/schedule'

function fx() {
  const e = makeShift({ id:'E', code:'E', name:'Early', startHour:5, endHour:13, isNight:false })
  const team = makeTeam({ id:'T', name:'T', shiftIds:['E'] })
  const a = makeEmployee({ id:'a', name:'Ada, Lovelace', teamId:'T', eligibleShiftIds:['E'] }) // comma -> quoting
  const ctx = buildContext({ teams:[team], shifts:[e], employees:[a], coverages:[], rules: makeRules() })
  const s = makeSchedule()
  setAssignment(s,{ employeeId:'a', date:'2026-06-15', shiftId:'E' })
  setAssignment(s,{ employeeId:'a', date:'2026-06-16', shiftId:null })
  return { ctx, s }
}

describe('CSV export', () => {
  it('team grid: rows=employees, cols=dates, shift code per cell, quoted fields', () => {
    const { ctx, s } = fx()
    const csv = exportTeamCSV(ctx, s, { startDate:'2026-06-15', weeks:1 })
    const lines = csv.split('\n')
    expect(lines[0]).toContain('"2026-06-15"')
    expect(lines[1]).toContain('"Ada, Lovelace"') // comma forces quoting
    expect(lines[1]).toContain('"E"')
  })
  it('member list: one row per scheduled date [date,dow,shiftCode,start,end,hours]', () => {
    const { ctx, s } = fx()
    const csv = exportMemberCSV(ctx, s, 'a', { startDate:'2026-06-15', weeks:1 })
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('"date","dow","shiftCode","start","end","hours"')
    expect(lines[1]).toBe('"2026-06-15","Mon","E","05:00","13:00","8"')
    // day off (null) is NOT a scheduled date -> excluded
    expect(lines.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `csv.ts`** — UTF-8 string output; every field wrapped in double quotes with internal `"` doubled. Team: header row `["", ...dates]`, one row per employee `[name, ...shiftCode|"" per date]`. Member: header `date,dow,shiftCode,start,end,hours`, one row per assignment with non-null shift; `start`/`end` formatted `HH:00` (mod 24), `hours = endHour-startHour`. `dow` short name from calendar.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): CSV team grid + member list export (quoted, UTF-8)`

> **AC satisfied:** AC-18 (team grid), AC-19 (member list).

---

## Phase P5 — App adapters (HighsSolverAdapter, IdbStorageAdapter) + seed

### Task 5.1: Demo seed (feasible org + schedule, nanoid)

**Files:**
- Create: `packages/domain/src/seed/demo.ts`
- Test: `packages/domain/src/seed/__tests__/demo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildDemo } from '../demo'
import { buildContext } from '../../constraints/context'
import { runHardChecks } from '../../constraints/registry'

describe('demo seed', () => {
  it('constructs entities with nanoid ids and a real assignment schedule', () => {
    const d = buildDemo()
    expect(d.employees.length).toBeGreaterThan(0)
    expect(d.employees[0].id).toBeTruthy()
    expect(d.assignments.length).toBeGreaterThan(0)
  })
  it('seeded schedule has no hard-constraint violations (feasible baseline)', () => {
    const d = buildDemo()
    const ctx = buildContext(d)
    const { makeSchedule } = require('../../schedule/schedule')
    const s = makeSchedule(d.assignments)
    expect(runHardChecks(ctx, s, d.period)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `demo.ts`** — `buildDemo(): AppStateDTO` returns a value conforming to the `AppStateDTO` shape from Task 3.1 (`{ org, teams, shifts, employees, coverages, rules, assignments, period }` — `assignments` as a plain `Assignment[]`, NOT a `Schedule` Map), so Task 5.2's `store.save(d)` compiles against it directly. Construct a small but realistic org (e.g. 2–3 teams, 4–5 shifts incl one `isNight`, ~12–20 employees, byDow coverage that the seeded assignments satisfy, a multi-week `Period{weeks:2}`). Use factories (nanoid ids). Build assignments deterministically so `runHardChecks` returns empty. **Include at least one explicit day off (`shiftId: null`) in the seeded assignments** so the storage null-round-trip test (Task 5.2) is satisfiable. Lives in domain `seed/` (outside core entities), per spec §4. Keep it small enough to solve fast.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(domain): Load-Demo seed (feasible, multi-week, nanoid)`

> **AC satisfied:** AC-6 (single schedule source), AC-24 (Load-Demo solvable parity gate input).

### Task 5.2: IdbStorageAdapter round-trip (StoragePort)

> **HIGH RISK** — lossless Map/date serialization. The historical bug was Map/Set degrading to `{}`. The adapter exchanges only `AppStateDTO` plain JSON; the domain owns Map↔array conversion.

**Files:**
- Create: `app/src/adapters/storage/idbStorageAdapter.ts`
- Test: `app/src/adapters/storage/__tests__/idbStorageAdapter.test.ts`

- [ ] **Step 1: Add `fake-indexeddb` devDep to `app/package.json`** and import it in the test for a real IDB shim under jsdom.

- [ ] **Step 2: Write the failing test**

```ts
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { IdbStorageAdapter } from '../idbStorageAdapter'
import { buildDemo } from '@crewdoku/domain'
import { toScheduleDTO, fromScheduleDTO, makeSchedule } from '@crewdoku/domain'

describe('IdbStorageAdapter round-trip', () => {
  it('save then load deep-equals (Map keys, ISO dates, Rules.enabled/weights intact)', async () => {
    const d = buildDemo()
    const store = new IdbStorageAdapter()
    await store.save(d) // d is already an AppStateDTO (assignments as array)
    const loaded = await store.load()
    expect(loaded).not.toBeNull()
    // Rules survive (no {} degradation)
    expect(loaded!.rules.enabled.H1).toBe(d.rules.enabled.H1)
    expect(loaded!.rules.weights.S1).toBe(d.rules.weights.S1)
    // schedule reconstructs identical Map (key set preserved)
    const back = fromScheduleDTO(loaded!.assignments)
    const orig = makeSchedule(d.assignments)
    expect([...back.assignments.keys()].sort()).toEqual([...orig.assignments.keys()].sort())
  })
  it('null shiftId round-trips as null (not undefined/missing) and the ISODate key survives as the exact ISO string', async () => {
    // buildDemo() seeds at least one explicit day off (shiftId:null); grab its exact key.
    const d = buildDemo()
    const dayOff = d.assignments.find(a => a.shiftId === null)
    expect(dayOff).toBeTruthy() // demo MUST include >=1 explicit day off (see Task 5.1)
    const isoKey = `${dayOff!.employeeId}|${dayOff!.date}`

    const store = new IdbStorageAdapter()
    await store.save(d)
    const loaded = await store.load()
    const back = fromScheduleDTO(loaded!.assignments)

    const got = back.assignments.get(isoKey)
    expect(got).toBeDefined()                    // exact ISODate-composed key survived verbatim
    expect(got!.date).toBe(dayOff!.date)         // ISO string is the exact same string
    expect(got!.shiftId).toBeNull()              // null, not undefined / not dropped
    expect('shiftId' in got!).toBe(true)         // key present, not silently omitted by JSON
  })
})
```

- [ ] **Step 3: Run test** — Expected: FAIL.

- [ ] **Step 4: Implement `idbStorageAdapter.ts`** — `implements StoragePort`. `save(state)` `JSON.stringify`s `AppStateDTO` into a single IDB key-value record (one object store `crewdoku`, key `'state'`). `load()` parses it back. Adapter holds NO domain schema knowledge — it stores/loads plain JSON. Use a tiny promisified `indexedDB.open` wrapper (no extra dep beyond `fake-indexeddb` for tests).

- [ ] **Step 5: Run test** — Expected: PASS.

- [ ] **Step 6: Commit** — `feat(app): IdbStorageAdapter lossless round-trip over StoragePort`

> **AC satisfied:** AC-23 (full persistence round-trip, no Map/Set→{} degradation).

### Task 5.3: HighsSolverAdapter (worker + wasm) implements SolverPort

**Files:**
- Create: `app/src/adapters/highs/highsLoader.ts`, `app/src/adapters/highs/worker.ts`, `app/src/adapters/highs/highsSolverAdapter.ts`
- Test: `app/src/adapters/highs/__tests__/worker.test.ts`, `app/src/adapters/highs/__tests__/adapter.test.ts`
- Add deps to `app/package.json`: `"highs": "^1.0.0"` (match version currently in old repo).

- [ ] **Step 1: Write the failing test for the pure worker handler** (port `handleMessage` from worker.js, no real Worker)

```ts
import { describe, it, expect, vi } from 'vitest'
import { handleSolve } from '../worker'

describe('worker handleSolve (pure core)', () => {
  it('posts a result with status/objective/columns from injected highs', async () => {
    const posts: any[] = []
    const highs = { solve: vi.fn(() => ({ Status: 'Optimal', ObjectiveValue: 0, Columns: { x_0_0_E: { Primal: 1 } } })) }
    await handleSolve({ type: 'solve', lp: 'Minimize\n obj: 0\nSubject To\nEnd' }, { highs, post: (m) => posts.push(m) })
    const result = posts.find(p => p.type === 'result')
    expect(result.status).toBe('Optimal')
    expect(result.columns.x_0_0_E.Primal).toBe(1)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `worker.ts`** — port `handleMessage` (worker.js:16–33) as `handleSolve(msg,{highs,post})`, plus the real-worker wiring block (`self.onmessage`) guarded by `typeof self`. Implement `highsLoader.ts` verbatim port (highs-loader.js) — memoized `getHighs()` with `highs/runtime?url`.

- [ ] **Step 4: Implement `highsSolverAdapter.ts`** — `class HighsSolverAdapter implements SolverPort`. Owns the `Worker(new URL('./worker.ts', import.meta.url),{type:'module'})`, generation counter + cancel (port `SolverClient` client.js:375–412), `async solve(lp, options)` resolves `{ status: sol.Status, objective: sol.ObjectiveValue, columns: sol.Columns }`. Optional `onLog` callback.

- [ ] **Step 5: Write a thin adapter unit test** that injects a fake worker (or stubs `solve`) and asserts the `Solution` shape mapping. Include **two cases**: (a) an `'Optimal'` solve mapping to `{status:'Optimal', objective, columns}`; (b) an **`'Infeasible'`** solve mapping to `{status:'Infeasible', ...}` so the infeasible UI path (AC-17) is exercised end to end. (No real WASM in unit tests; WASM exercised manually in P7 smoke.)

- [ ] **Step 6: Run tests** — Expected: PASS.

- [ ] **Step 7: Commit** — `feat(app): HighsSolverAdapter (worker+wasm) implements SolverPort`

> **AC satisfied:** AC-15 (adapter is the only home of Worker+wasm; domain stays pure).

---

## Phase P6 — UI rebuild feature-by-feature on the typed domain

> Tokens, store, design-system kit, then board → config → solve panel → onboarding → export → version badge → i18n/a11y. Each feature renders against the typed domain and is smoke-tested with `@testing-library/react` under jsdom. Add `@testing-library/react`, `@testing-library/jest-dom`, `@lingui/*`, `tailwindcss`, `postcss`, `autoprefixer` to `app` devDeps in the first task that needs them.

### Task 6.1: Tokens carried over verbatim + checksum guard

**Files:**
- Create: `app/tokens.css` (copy of repo-root `tokens.css`), `app/src/index.css`
- Test: `app/src/__tests__/tokens.test.ts`

- [ ] **Step 1: Write the failing test** (byte-identical guard against the source)

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

describe('tokens verbatim', () => {
  it('app/tokens.css is byte-identical to the source tokens.css', () => {
    const src = readFileSync(resolve(__dirname, '../../../tokens.css'))
    const copy = readFileSync(resolve(__dirname, '../../tokens.css'))
    expect(createHash('sha256').update(copy).digest('hex'))
      .toBe(createHash('sha256').update(src).digest('hex'))
  })
  it('still defines core --sf-* and --sh-* custom properties', () => {
    const copy = readFileSync(resolve(__dirname, '../../tokens.css'), 'utf8')
    expect(copy).toMatch(/--sf-/); expect(copy).toMatch(/--sh-/)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL (no `app/tokens.css` yet).

- [ ] **Step 3: Copy `tokens.css` byte-for-byte** into `app/tokens.css` (use `cp`, no edits). Create `app/src/index.css` with Tailwind directives + `@import '../tokens.css'`.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(app): carry tokens.css verbatim + checksum guard`

> **AC satisfied:** AC-20 (tokens byte-identical, no renames).

### Task 6.2: Zustand store over domain

**Files:**
- Create: `app/src/store/store.ts`
- Test: `app/src/store/__tests__/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { createStore } from '../store'

describe('app store', () => {
  it('removeEmployee dispatches to domain and keeps others intact', () => {
    const s = createStore()
    s.getState().loadDemo()
    const before = s.getState().employees.length
    const victim = s.getState().employees[1].id
    s.getState().removeEmployee(victim)
    expect(s.getState().employees.length).toBe(before - 1)
    expect(s.getState().employees.find(e => e.id === victim)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `store.ts`** — Zustand store holding `{ org, teams, shifts, employees, coverages, rules, schedule, period }` (domain state) + view state (`view`, `selectedEmployeeId`, `pins`, `proposal`, `solverPhase`). Actions delegate to domain fns (`removeEmployee` → `schedule.removeEmployee` + filter employees array, `setAssignment`, `loadDemo` → `buildDemo`, `solve` wired in 6.4). Exposes `createStore()` for tests and a singleton hook for the app.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(app): Zustand store delegating to domain`

> **AC satisfied:** AC-5 (safe delete through the app layer).

### Task 6.3: Design-system UI kit + board feature

**Files:**
- Create: `app/src/ui/*` (Btn, Panel, Badge, Modal, etc.), `app/src/features/board/Board.tsx`
- Test: `app/src/features/board/__tests__/board.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Board } from '../Board'
import { createStore } from '../../../store/store'

describe('Board', () => {
  it('renders employee rows x date columns from domain schedule', () => {
    const s = createStore(); s.getState().loadDemo()
    render(<Board store={s} />)
    expect(screen.getByRole('grid')).toBeTruthy()
    // a known demo employee name appears as a row header
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement UI kit + `Board.tsx`** — kit components use `rounded-[2px]`, IBM Plex, token classes (consuming `tokens.css` vars). Board: rows = employees, columns = period dates (2-level header week›day), cells show shift code from `getAssignment`. Status classes `.sf-pending/.sf-proposed/.sf-viol` carried over. Keyboard-operable cells, `role="grid"`. No virtualization.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(app): UI kit + schedule board on typed domain`

> **AC satisfied:** AC-20 (kit consumes token contract). Supports AC-16/AC-18/AC-19 UI later.

### Task 6.4: Solve panel — buildModel → SolverPort → mapSolution → proposal → apply

**Files:**
- Create: `app/src/features/solve/SolvePanel.tsx`
- Modify: `app/src/store/store.ts` (add `solve()` + `applyProposal(acceptedKeys)`)
- Test: `app/src/features/solve/__tests__/solve.test.tsx`, `app/src/store/__tests__/solve.test.ts`

- [ ] **Step 1: Write the failing store test** (with a fake SolverPort — no WASM)

```ts
import { describe, it, expect } from 'vitest'
import { createStore } from '../store'
import { buildModel, mapSolution } from '@crewdoku/domain'

describe('store.solve via injected SolverPort', () => {
  it('builds model, solves, maps solution, produces a proposal; apply writes only accepted cells', async () => {
    const s = createStore(); s.getState().loadDemo()
    // Pick a known currently-empty (emp,date) cell so the fake solver can produce a REAL change.
    const emp = s.getState().employees[0]
    const targetDate = s.getState().period.startDate
    const targetShift = emp.eligibleShiftIds[0]
    const cellKey = `${emp.id}|${targetDate}`
    const before = s.getState().schedule.assignments.get(cellKey)?.shiftId ?? null
    const fakeSolver = {
      async solve(_lp: string) {
        // Echo at least ONE changed column, decoded against the shared meta stashed by solve():
        // set x_{empI}_{dateI}_{shiftId} = 1 for the target cell so mapSolution yields a real assignment.
        const meta = s.getState()._lastMeta!
        const empI = meta.empIndex.get(emp.id)
        const dateI = meta.dateIndex.get(targetDate)
        const cols: Record<string, { Primal: number }> = { [`x_${empI}_${dateI}_${targetShift}`]: { Primal: 1 } }
        return { status: 'optimal', objective: 0, columns: cols }
      }
    }
    s.getState().setSolver(fakeSolver)
    await s.getState().solve()
    expect(s.getState().proposal).not.toBeNull()
    const proposal = s.getState().proposal!
    // there is a real change for the target cell (not a vacuous empty proposal)
    const change = proposal.changes.find(c => `${c.employeeId}|${c.date}` === cellKey)
    expect(change).toBeTruthy()
    expect(change!.to).toBe(targetShift)
    expect(change!.from).toBe(before)
    s.getState().applyProposal([cellKey])
    // ONLY the accepted cell changed, and it changed to the solved shift
    expect(s.getState().schedule.assignments.get(cellKey)?.shiftId).toBe(targetShift)
    expect(s.getState().proposal).toBeNull()
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement store `solve()`** — calls `buildModel(ctx, period, {pins})` (stash `meta` on `_lastMeta`), `await solver.solve(lp)`, `mapSolution(solution, meta)`, `buildProposal(...)`, set `proposal`. `applyProposal(acceptedKeys)` writes only accepted changes via `setAssignment`, clears proposal. `setSolver(port)` injects the adapter (default = `HighsSolverAdapter`). Implement `SolvePanel.tsx` (collapsible 300px right panel, run button, log, results, per-cell accept/reject). `makeProposal` fake path does not exist.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(app): solve flow buildModel->SolverPort->mapSolution->proposal->apply`

> **AC satisfied:** AC-16 (proposal diff + per-cell accept/reject + apply; makeProposal absent).

### Task 6.5: Config feature (shifts, rules, teams, coverage, prefs, weights)

**Files:**
- Create: `app/src/features/config/*`
- Test: `app/src/features/config/__tests__/config.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RulesConfig } from '../RulesConfig'
import { createStore } from '../../../store/store'

describe('RulesConfig', () => {
  it('toggling a constraint updates rules.enabled in the store', () => {
    const s = createStore(); s.getState().loadDemo()
    render(<RulesConfig store={s} />)
    const h6 = screen.getByLabelText(/H6/i) as HTMLInputElement
    fireEvent.click(h6)
    expect(s.getState().rules.enabled.H6).toBe(false)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement config sections** — Shift definitions (incl `isNight` checkbox), Scheduling rules (hard limits editable + H1..S5 toggles + S1..S5 weight sliders), Teams & structure, Coverage editor (per team×shift byDow + date overrides), Employee preferences. Each writes to the store → domain `rules`/entities. Labeled inputs for a11y.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(app): config surfaces (shifts/rules/teams/coverage/prefs/weights)`

> **AC satisfied:** AC-11 (toggles + weights editable from UI), AC-12 (isNight editable per shift).

### Task 6.6: Onboarding wizard + Load Demo

**Files:**
- Create: `app/src/features/onboarding/*`
- Test: `app/src/features/onboarding/__tests__/onboarding.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Onboarding } from '../Onboarding'
import { createStore } from '../../../store/store'

describe('Onboarding', () => {
  it('Load Demo seeds a usable org', () => {
    const s = createStore()
    render(<Onboarding store={s} />)
    fireEvent.click(screen.getByRole('button', { name: /load demo/i }))
    expect(s.getState().employees.length).toBeGreaterThan(0)
    expect(s.getState().shifts.some(sh => sh.isNight)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement wizard** — ordered steps org → teams → shifts(isNight) → coverage(per team×shift byDow) → employees(team, eligibility, contract) → rules. Each step writes valid entities to the store. **Load Demo** button calls `loadDemo()`.

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(app): onboarding wizard + Load Demo`

> **AC satisfied:** AC-24 (onboarding produces usable state; Load Demo path).

### Task 6.7: Export UI (team + member CSV download)

**Files:**
- Create: `app/src/features/export/ExportModal.tsx`
- Test: `app/src/features/export/__tests__/export.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { buildTeamCsvForDownload, buildMemberCsvForDownload } from '../exportActions'
import { createStore } from '../../../store/store'

describe('export actions', () => {
  it('team CSV uses domain exportTeamCSV; member CSV uses exportMemberCSV', () => {
    const s = createStore(); s.getState().loadDemo()
    const team = buildTeamCsvForDownload(s.getState())
    expect(team).toContain('"')
    const memberId = s.getState().employees[0].id
    const member = buildMemberCsvForDownload(s.getState(), memberId)
    expect(member.split('\n')[0]).toContain('shiftCode')
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `exportActions.ts` + `ExportModal.tsx`** — thin wrappers calling domain `exportTeamCSV`/`exportMemberCSV`, plus a Blob download trigger in the modal (DOM only in the component, not in the tested action fns).

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(app): CSV export UI (team + member)`

> **AC satisfied:** AC-18, AC-19 (wired into UI).

### Task 6.8: Version badge synced to package.json (no hardcoded v4)

**Files:**
- Create: `app/src/ui/VersionBadge.tsx`
- Test: `app/src/ui/__tests__/versionBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.stubGlobal('__APP_VERSION__', '0.1.0')
import { VersionBadge } from '../VersionBadge'

describe('VersionBadge', () => {
  it('renders v + injected version, never a hardcoded v4', () => {
    render(<VersionBadge />)
    expect(screen.getByText('v0.1.0')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Implement `VersionBadge.tsx`** — `return <span>{'v' + __APP_VERSION__}</span>`. No literal version anywhere.

- [ ] **Step 4: Write a grep guard test** `app/src/__tests__/no-hardcoded-version.test.ts` asserting no `"v4"` string literal in `app/src`.

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
function walk(d: string, out: string[] = []) { for (const f of readdirSync(d)) { const p = join(d,f); if (statSync(p).isDirectory()) walk(p,out); else if (/\.(ts|tsx)$/.test(p)) out.push(p) } return out }
describe('no hardcoded version', () => {
  it('app/src contains no "v4" literal', () => {
    const off = walk(resolve(__dirname,'..')).filter(p => /['"]v4['"]/.test(readFileSync(p,'utf8')))
    expect(off).toEqual([])
  })
})
```

- [ ] **Step 5: Run tests** — Expected: PASS.

- [ ] **Step 6: Commit** — `feat(app): version badge synced to package.json; grep guard`

> **AC satisfied:** AC-21 (badge = "v"+version, no hardcoded v4).

### Task 6.9: App shell + i18n/a11y baseline + dependency-direction guard

**Files:**
- Create: `app/src/App.tsx`, `app/src/i18n/*`, `app/.eslintrc` (or boundary test)
- Test: `app/src/__tests__/app-shell.test.tsx`, `packages/domain/src/__tests__/no-app-import.test.ts`

- [ ] **Step 1: Write the failing dependency-direction test** (domain must not import app)

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
function walk(d: string, out: string[] = []) { for (const f of readdirSync(d)) { const p = join(d,f); if (statSync(p).isDirectory()) { if (f!=='__tests__') walk(p,out) } else if (p.endsWith('.ts')) out.push(p) } return out }
describe('dependency direction', () => {
  it('domain imports nothing from @crewdoku/app or ../app', () => {
    const off = walk(resolve(__dirname,'..')).filter(p => /@crewdoku\/app|\.\.\/app/.test(readFileSync(p,'utf8')))
    expect(off).toEqual([])
  })
})
```

- [ ] **Step 2: Run test** — Expected: PASS (guards regressions).

- [ ] **Step 3: Implement `App.tsx`** — sidebar 192px + content + status bar, locale switcher (EN/VI Lingui, chrome-only — never wraps employee/team/shift names), aria-live solver region, landmarks, dialog focus trap. Wire all features.

- [ ] **Step 4: Write an app-shell render smoke test** asserting landmarks + version badge render.

- [ ] **Step 5: Run tests** — Expected: PASS.

- [ ] **Step 6: Commit** — `feat(app): App shell + i18n/a11y baseline + dependency guard`

> **AC satisfied:** AC-3 (dependency direction enforced by test), AC-2 (reinforced).

---

## Phase P7 — Cutover (delete old src/)

### Task 7.1: Manual parity smoke (WASM) — CHECKPOINT (human)

> **PAUSE FOR HUMAN CHECKPOINT.** This is the only step requiring real WASM and a browser; it is the gate guarding AC-24. Do not delete `src/` until the operator confirms.

**Files:** none (manual)

- [ ] **Step 1: Run the new app** — `pnpm --filter @crewdoku/app dev`, open it.
- [ ] **Step 2: Load Demo → Solve** — confirm scan/run, a real proposal appears, apply works, board updates.
- [ ] **Step 3: Force an infeasible input** (raise a team coverage min above eligible staff) → Solve → confirm a truthful conflict core + ≥1 relaxation; apply a relaxation; re-solve → feasible.
- [ ] **Step 4: Export team + a member CSV** — open the files, confirm grid/list shapes.
- [ ] **Step 5: Operator confirms parity.** Record confirmation in the commit/PR.

> **AC satisfied:** AC-24 (Load-Demo solves before cutover), AC-17 (end-to-end infeasible flow verified live).

### Task 7.2: Full green gate + delete old src/

**Files:**
- Delete: `src/`, root `index.html` (old), old `package.json`/`vite.config.js`/`tailwind.config.js`/`postcss.config.js`/`tsconfig.json` if superseded by the monorepo. Keep repo-root `tokens.css` ONLY if the checksum test still references it; otherwise move the source-of-truth note. (Decision: keep root `tokens.css` as the canonical source the checksum test diffs against — do NOT delete it.)
- Test: existing full suite.

- [ ] **Step 1: Run the full gate** — `pnpm install && pnpm -w build && pnpm -w test && pnpm -w lint`. Expected: AC-1..AC-23 tests all green.

- [ ] **Step 2: Confirm old app still booted in 7.1** (guard satisfied through cutover) — only now proceed.

- [ ] **Step 3: Delete legacy `src/`** and superseded root config files (NOT root `tokens.css`).

- [ ] **Step 4: Re-run the full gate** — Expected: still green; the tokens checksum test still finds root `tokens.css`.

- [ ] **Step 5: Add a changeset** — `pnpm changeset` (minor for `@crewdoku/app`, "v2 monorepo refactor"), commit.

- [ ] **Step 6: Commit** — `chore!: cut over to v2 monorepo; remove legacy src/`

> **AC satisfied:** AC-24 (src/ deleted only after AC-1..23 green and Load-Demo solves).

---

## Self-Review

- **Spec coverage:** every §12 AC maps to ≥1 step (table below). §5a multi-week rules → Tasks 2.2/3.2. §5b storage contract → Tasks 1.6/5.2. §7 hexagonal solver → P3 + 5.3. §8 tokens/version/changelog → 6.1/6.8/0.4. §9 migration order → phase order. §10 onboarding → 6.6 + 5.1.
- **Placeholder scan:** Tasks 3.3 (scoreTerms), 3.4 (mapSolution), 3.5 (buildProposal) and 3.6 (deriveConflictCore) now carry fully-wired, executable failing tests — real imports (factories, `buildContext`, `makeSchedule`), concrete inline fixtures (3.5 and 3.6 author their fixtures in-task), and live assertions — so no Step-1 test passes vacuously (honors the plan's TDD rule). The only remaining "mirror X" note is Task 2.4 Step 1's S1-weight fixture, explicitly required to be completed before implementing in Step 3. All implementation steps show concrete logic. No "add error handling" hand-waves.
- **Type consistency:** `buildModel(ctx, period, opts) → {lp, meta}`; `meta` carries `empIndex/empById/dateIndex/dateById`; `mapSolution(solution, meta)` consumes the same names. `scoreTerms`/`scoreSoft` return `{S1..S5,total}` consistently. `StoragePort.save/load` exchange `AppStateDTO` everywhere. `SolverPort.solve(lp) → Solution{status,objective,columns}` is used identically by adapter and store.

---

## Acceptance-Criteria → Step coverage table

| AC | Covered by |
|----|-----------|
| AC-1  Monorepo build/test exit 0, dep order | 0.1, 0.2, 0.3, 0.5 |
| AC-2  Domain purity (no react/dom/wasm) | 3.7 (grep test), 6.9 |
| AC-3  Dependency direction app→domain | 0.3, 6.9 (boundary test) |
| AC-4  Stable nanoid IDs, no index identity | 1.1, 1.2, 1.3 |
| AC-5  Safe middle-employee delete | 1.5, 6.2 |
| AC-6  Single schedule source, no baseAssign | 1.5, 3.7 (grep), 5.1 |
| AC-7  Multi-week H2 per ISO-week bucket | 1.4, 2.2, 3.2 |
| AC-8  H3 across Sun→Mon boundary | 1.4, 2.2 (checker), 3.2 (model) |
| AC-9  H1 per-team count, dateOverride precedence | 2.1, 2.2, 3.2 |
| AC-10 Two-level eligibility, H6 | 1.3, 2.2, 3.2 |
| AC-11 Constraints toggleable + weights | 1.3, 2.4, 3.2, 6.5 |
| AC-12 Night fairness via isNight not 'N' | 1.1, 2.1, 2.2, 2.3, 6.5 |
| AC-13 scoreTerms parity + proposal shape | 2.4, 3.3, 3.5 |
| AC-14 Solver round-trip via shared meta | 3.2, 3.4 |
| AC-15 Solver split: domain pure, adapter owns WASM | 3.1, 3.2, 5.3 |
| AC-16 Proposal diff + per-cell apply, no makeProposal | 3.5, 6.4 |
| AC-17 Truthful infeasible + relaxation re-solve | 3.6, 7.1 |
| AC-18 CSV team grid | 4.1, 6.7 |
| AC-19 CSV member list | 4.1, 6.7 |
| AC-20 Tokens byte-identical | 6.1, 6.3 |
| AC-21 Version badge synced, no v4 | 6.8 |
| AC-22 Changesets wired | 0.4 |
| AC-23 Persistence round-trip lossless | 1.6, 3.1, 5.2 |
| AC-24 Old app guard; src/ deleted last | 5.1, 6.6, 7.1, 7.2 |

All 24 ACs are covered. No AC is left without a step.
