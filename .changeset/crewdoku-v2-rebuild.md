---
"@crewdoku/domain": minor
"@crewdoku/app": minor
---

Crewdoku v2 rebuild — pnpm/Turborepo monorepo split into a pure `@crewdoku/domain`
core (entities, calendar, single-source schedule, H1–H6/S1–S5 constraints, real
HiGHS MILP model + score/mapSolution/proposal/conflict, CSV export) and a thin
`@crewdoku/app` presentation layer (Zustand store, UI kit, board, solve panel,
config screens, onboarding wizard, CSV export UI) wired to IndexedDB + a HiGHS
Web Worker solver adapter. Chrome-only i18n (EN/VI); a11y baseline preserved.
