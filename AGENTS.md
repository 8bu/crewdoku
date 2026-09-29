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
Tests are Vitest — jsdom in `proto/` and `app/`, plain node in `packages/`.
Browser E2E is Playwright in `app/e2e/` (`*.e2e.ts`): real user flows against a
production build of the app, one fresh browser context per test.

### How to run

```bash
corepack enable pnpm && pnpm install
pnpm dev     # app at http://localhost:5173 (or next free port); `pnpm --filter @crewdoku/proto dev` for the frozen reference
pnpm test    # vitest, every package
pnpm lint    # tsc --noEmit, every package
pnpm build   # vite build (app + proto); engine packages are source-only, no build step
pnpm e2e     # Playwright E2E for the app (first time: `pnpm --filter @crewdoku/app exec playwright install chromium`)
```

---

## Releases & changelog

One product version for the whole repo lives in the root `package.json`.
`release-please` (manifest mode, config at `release-please-config.json`, run by
`.github/workflows/release.yml`) turns the conventional commits on `main` into a
Release PR that bumps that version, prepends root `CHANGELOG.md`, and tags
`v<version>` on merge. Workspace packages stay unversioned (`0.0.0`).

Bump policy: `feat` → minor, `fix`/`perf` → patch, and
`refactor`/`test`/`chore`/`docs`/`style`/`ci`/`build` release nothing and stay
out of the changelog. Pick the commit type by the effect you want on the
version.

Two rules for anything that releases:

- Add the version's user-facing highlights **before** the Release PR merges:
  `app/src/whatsNew/releases/<version>/{en,vi,es,fr,ja,de,pt}.md`, one file per
  locale, 1–5 markdown bullets each and no version heading (the dialog renders
  `v<version>`). The app's "What's new" panel shows them.
  `node app/scripts/check-whats-new.ts` is the check, and the `whats-new` status
  on the Release PR mirrors it — red until every locale file exists on `main`.
- `CHANGELOG.md` and the version fields belong to release-please — never
  hand-edit either; the next Release PR overwrites them.

### Release → deploy → previews

Merging the Release PR also deploys. `release.yml` hands the new tag to
`deploy.yml`, which checks the tag out, re-runs lint/test/build/e2e there, and ends
in `wrangler deploy --tag <tag>`. Production is https://crewdoku.8bu.dev, so it
only moves forward through tagged, tested commits. Rollback is the same workflow
dispatched by hand with an older tag (`gh workflow run deploy.yml -f
tag=v0.1.0`); `wrangler rollback --message ...` from a terminal is the emergency
brake.

`preview.yml` gives every branch except `main` its own isolated Preview at
`<slug>-crewdoku.<subdomain>.workers.dev`, and deletes it when the branch is
deleted. `.github/scripts/preview-name.sh` is the one definition of `<slug>` —
both jobs call it, so never derive a Preview name anywhere else. Previews build
without PostHog: analytics are production-only.

One-time setup the maintainer does by hand (dashboard, nothing in-repo):

- Repo secrets: `CLOUDFLARE_API_TOKEN` — Account → Workers Scripts: `Edit`, plus
  Zone `8bu.dev` → Workers Routes: `Edit` (the custom domain; the older token UI
  spells both permissions "Write") — and `CLOUDFLARE_ACCOUNT_ID`.
- GitHub Environment `production`: secret `VITE_POSTHOG_PROJECT_TOKEN` and
  variable `VITE_POSTHOG_HOST`. The environment is what keeps analytics out of
  CI and previews, so these two values stay there, never at repo level.
- Previews behind Access: Zero Trust enabled on the account, then Workers &
  Pages → `crewdoku` → **Access** → "Protect this Worker behind Access" →
  **Previews only** → choose a policy (for example an email domain) → **Apply
  Access**. Do this before sharing a preview URL. It attaches to the Worker, so
  it already covers Previews that do not exist yet; production stays public.

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

## Analytics

`app/src/analytics.ts` is the app's only product-analytics seam (PostHog,
imported lazily so it never costs an unconfigured build a byte). It stays off
unless the build is given `VITE_POSTHOG_PROJECT_TOKEN`: with no token the SDK is
never fetched, which is what a clone and a self-host get by default. Its
`AnalyticsEventMap` is the complete list of what may leave the app — counts,
enums, and booleans only, never a person, team, organization, workspace, period,
or shift name, and never cell contents. Add the event to that map before you call
`track`, and treat the visitor's switch (`crewdoku-analytics`, surfaced in
Settings → Privacy) as authoritative. The SDK runs with every DOM-reading feature
off; keep it that way, because this UI renders real people's names.

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
