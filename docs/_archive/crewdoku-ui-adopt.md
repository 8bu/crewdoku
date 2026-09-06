# Crewdoku — adopt new prototype UI + integrate domain logic

Date: 2026-06-17 · Branch: `ui/match-prototype`

## Source of truth
New design prototype delivered as `Crewdoku.html` bundle (extracted to `/tmp/crewdoku-proto/crewdoku/project/`).
Real files loaded by `Crewdoku.html` (root-level, CDN/babel globals — NOT the `src/` or
`design_handoff_shiftforge/` dirs, those are the OLD ShiftForge proto):

| Proto file | Role |
|---|---|
| `app.jsx` | shell: reducer, Sidebar, PageHeader, ExportModal, EmptyBoardState, StatusBar, shortcuts |
| `ui.jsx` | UI kit primitives |
| `board.jsx` | ScheduleBoard + CoverageView + popovers + ctx menu + tooltip |
| `leader.jsx` | LeaderSurface (board + 300px generate rail, lifted solver state) |
| `generate.jsx` | GeneratePanel (preflight, log, result, breakdown, histogram, conflict, relaxation) |
| `onboarding.jsx` | 6-step wizard (Welcome→Org→Shifts→Rules→Team→Summary) + per-step demo |
| `admin.jsx` | Config: shifts / rules / teams / prefs / weights (+ dead PermsConfig) |
| `data.js` | demo data + SIMULATED solver (window.SF) |
| `tokens.css` | design tokens + sf-* classes |

`Crewdoku.html` explicitly omits `member.jsx` → **single-user planner, no roles/swaps/approvals**
(matches locked CLAUDE.md decisions). `tweaks-panel.jsx` = dev-only density tweaker → **drop**.

## Integration principle (locked, do not revisit)
- Adopt the prototype's **visual language + interactions**. Keep the **domain** (`domains/*`,
  nanoid identity, ISO dates, real HiGHS MILP) as the source of truth. App stays dumb TS.
- Prototype's `SF` (index `i` + absDay int keys, `baseAssign`, `makeProposal` simulation) is
  demo scaffolding only — DO NOT port it. Wire UI to the real store/domain.
- TypeScript strict everywhere. `rounded-[2px]`. nanoid identity, never array-index.
- Keep EN/VI i18n (proto carries a `locale` en/vi state; current app has full chrome-i18n).

## Current state (starting point)
The current `app/` is already architecturally aligned (Sidebar + Content + StatusBar + ExportModal;
views board/solve/config/onboarding; real HiGHS adapter; 119 app tests green). This is a
**reconciliation to the refined proto**, not a greenfield rebuild.

## Scope decision — config depth
Proto's `RulesConfig`/admin surfaces constraints the locked domain does NOT model
(H7 min-days-off, P1–P3 policies, F1–F2 fairness tolerances, forbidden-transition matrix,
holiday importer, dept/contract scope-overrides, dept leaders). The real solver only knows
H1–H6 + S1–S5. **Default: adopt the proto's visual style for config screens but bind them to
the real, solvable constraint set; out-of-scope proto extras are NOT built (would be fake UI).**
Revisit only if the user wants a domain extension (separate, large effort).

## Progress
- [x] **Phase 0** — assets copied to `app/public/`; tokens.css already a proto superset (no change).
- [x] **Phase 1** — store `seedMode`+`reset()`; App empty-state gating + EmptyBoardState CTA +
  keyboard shortcuts (S/G/T/←→/Esc); Sidebar logo + proposal-pending card + config
  disabled-until-data + Reset/Load-demo footer; 4 i18n key sets (en/vi). 124 app tests green.
- [~] **Phase 2 (board)** — DONE: seed-mode toggle in toolbar (pressed Btn + kbd S), click-to-pin
  on assigned cells, seed-hint strip in BoardSurface, store seedMode wiring. 125 app tests green.
  REMAINING (polish/enhancement, lower priority): right-click context menus (cell + header:
  expand/collapse all, clear overrides, unpin all, mark day off, switch pivot, export emp CSV),
  floating tooltip layer (replace title attrs), today-column highlight, 2px week-boundary border,
  pinned corner triangle (currently ◢ glyph — proto uses colored border triangle).
- [x] **Phase 3 (generate/solve)** — store accept-state lifted (`acceptedChanges` + toggle/all,
  defaulted on solve); SolvePanel result stat cards (fairness/penalty/changes deltas) + Accept all/
  Reject all; board `DiffBanner` (id, deltas, bulk actions) wired into BoardSurface; scan overlay
  (sf-scan-line/glow) while solving. Real HiGHS flow unchanged. DiffBanner + store accept tests added.
- [x] **Phase 4 (onboarding)** — rebuilt to proto 6-step wizard (Welcome→Org+colored depts→Shifts
  template+table→Rules H2/H3/H4/H6→Team paste→Summary), step dots, per-step + one-click demo,
  validation, commit-at-finish to REAL domain (makeOrg/Team/Shift/Employee/Coverage/Rules via
  setEntities; coverage byDow weekday/weekend bands). Test rewritten for new flow.
- [x] **Phase 5 (config) core** — dropped Config's redundant left rail (sidebar drives sections) +
  added PageHeader. Editors stay bound to real domain. REMAINING (visual polish): match proto's
  richer ShiftsConfig (palette/feasibility banner), WeightsConfig (sliders+presets+blurbs),
  TeamsConfig roster table + EmployeeModal, PreferencesConfig grid.
- [ ] Phase 6 export (print PDF) · 7 finish
- **130 app tests green · `pnpm lint` clean · `pnpm build` ok · dev server serves app+logo (200).**

### Visual-match fixes (2026-06-17, after headless screenshot compare vs rendered proto)
Rendered the real proto headless (Chrome-for-Testing, proto `dataMode:"demo"`) and diffed vs my app:
- **Generate panel was open by default** → covered the board (the "doesn't match" cause). Now the
  board is FULL-WIDTH; panel opens on demand (`panelOpen = view==='solve' || proposal || solving`).
  Toolbar Generate toggles view solve/board; SolvePanel got a ✕ close button; added an always-present
  sr-only aria-live region (panel may be collapsed).
- **Seed demo names** all shared "Smith" (last-name advanced only per full first-name cycle) → fixed
  stride in `domains/seed/demo.ts` so both names vary per employee.
- Week-range header left-aligned (was right); toolbar "Schedule board" normal-case (was uppercase).
Verified: board screenshot now matches proto (full-width, N/E/M/A/L legend chips, varied roster).

### Surface-by-surface visual verification (2026-06-17, headless screenshot diff vs proto)
Rendered both apps headless and compared Generate / onboarding / config:
- **Generate panel**: structural match (opens on demand, preflight + hard-constraint list + Run
  solver; proto-only Optimal/Infeasible demo toggle correctly omitted). OK.
- **Onboarding**: near-perfect match (Welcome + step dots + shifts table + summary). OK.
- **Config / Schedule priorities**: UPGRADED to proto — Quick-set presets (Balanced/Fair for all/
  Keep it steady), friendly names + blurbs, importance badges, Not-used→Must-have sliders, banner.
- **Config / Shift definitions**: UPGRADED — dense rows, colored short-code chip, Hrs column,
  color swatch, Night flag. (Required/Capacity stay in CoverageConfig — that's a separate domain
  entity, intentional.)
- Added DEV-only URL seam in main.tsx (`?view=` / `?sec=`) for headless/e2e screenshots.
- Config rules-hard / teams / employees screens still the plainer editors (functional) — lower pri.

### Checklist pass (2026-06-17, 3rd bundle J5ev… — only app.jsx changed = locale switcher restored)
Global + onboarding fixes to hit the user's explicit checklist:
- **tokens.css**: font sizes bumped to proto (2xs11/xs12/sm13/md14/lg16, were 10/11/12/13/15) +
  number-input spinner-hide CSS. Edited root + `cp` to app/tokens.css (byte-identical guard).
- Onboarding shifts: headers **Min head / Max head**, START+DURATION column widened (150px, no
  overflow), spinners hidden.
- Onboarding team: **↑ Import CSV** button + file reader restored.
- Onboarding summary: **hover-to-edit** ("Edit ←" on card hover).
- Per-step demo label is step-specific (⤓ demo org/shifts/rules/team); step-3 demo added.
- Removed one-click Load demo from wizard + empty board → **empty board = single CTA only**;
  demo via per-step ⤓ or main.tsx boot. Sidebar: **Reset to empty is a nav item** (below divider),
  Load demo removed; LocaleSwitcher stays in footer.
- DEV seam extended: `?view=onboarding&step=N` deep-links a wizard step (headless/e2e).
- 131 app tests green, lint clean, build ok. All checklist items verified via headless screenshots.

### Remaining polish backlog (lower priority)
- Phase 2: right-click context menus, floating tooltip layer (replace title attrs), today-column
  highlight, 2px week-boundary border, pinned corner triangle (vs ◢ glyph).
- Phase 3: panel close button + Generate-toggles-panel (currently panel always open; Generate runs solve).
- Phase 5: richer config editors (above).
- Phase 6: print/PDF export (current export = team CSV + single-person CSV).
- Phase 7: VI translations for onboarding/new strings (currently English fallback via t()),
  update CLAUDE.md (domains/* layout), changeset, browser visual pass vs proto.

### Config-section taxonomy (decided, for Phase 5)
Current `Config.tsx` already maps proto's 5 sections: shifts / rules(hard) / priorities(soft weights) /
teams(+coverage) / employees(prefs). Proto admin uses sidebar-only nav + PageHeader (NO second rail);
current Config renders a redundant left rail → drop it in Phase 5, drive sections from sidebar + add PageHeader.
Config depth = adopt look, REAL constraints only (user-confirmed) — omit holidays/contracts/transitions/P·F rules.

## Phases (task-loop; each keeps tests green + lint/build clean)
0. **Foundations** — copy `assets/logo.svg`+`logo.png`; extend `tokens.css` (`--dept-*`,
   `--weekend-hatch`, `--st-pin`, `--cell-fs`, `.sf-tip`, `.sf-scan-line`, `.sf-scan-glow`,
   `.sf-spinner`, `.sf-blink`; fix proto's dropped `body{` selector when copying); brand=logo.
1. **Shell + Sidebar** — empty-state→onboarding gating (dataMode empty/demo/custom), Board nav
   active on generate, Proposal-pending card, config sections disabled-until-data, Reset-to-empty,
   StatusBar content, keyboard shortcuts (S/G/T/←→/Esc/?).
2. **Board** — seed mode + pins (◢ corner), dept group collapse, left-click assign popover
   (H6 eligibility + live ⚠), proposed→diff popover, right-click context menus (cell + headers),
   tooltip layer, 2-level sticky header polish, hours warn(>40)/crit(>48), diff banner, scan
   overlay, by-time (CoverageView) parity.
3. **Generate/Solve panel** — match proto 300px rail layout; map proto phases
   (idle/queued/solving/done/review/infeasible) onto the REAL solve flow; preflight, solver log,
   result cards, penalty breakdown, workload histogram, review proposal, conflict + relaxations.
   Drop the prototype-only demo optimal/infeasible toggle.
4. **Onboarding wizard** — 6 steps (Welcome→Org+depts(color)→Shifts(templates+table)→Rules
   (H2/H3/H4/H6)→Team(paste/CSV)→Summary); per-step demo fill; commit to real domain entities.
5. **Config screens** — shifts / rules / teams / prefs / weights matched to proto look, bound to
   real domain (see scope decision). Shift palette, feasibility banners, roster table + Employee
   modal (prefs + eligibility), weights sliders + presets + blurbs.
6. **Export modal** — team CSV / single-person CSV / print-PDF parity.
7. **Finish** — i18n strings, update/extend tests, `pnpm lint` + `pnpm build` green, browser verify
   against proto. Update CLAUDE.md (domains/* layout) + changeset.

## Verification per phase
`pnpm test` (vitest) green · `pnpm lint` (tsc) clean · spot-check in browser vs proto.
