# ShiftForge → Crewdoku UI — Design Implementation Map

Source: `docs/design/prototype/project/` (ShiftForge.html + board.jsx, ui.jsx, app.jsx,
generate.jsx, data.js, tokens.css, screenshots/, ../chats/). This is the visual target
for rebuilding `app/src` presentation. Domain (`packages/domain`) is correct + tested.

## Scope decisions (user-confirmed 2026-06-16)
- **Role toggle + Member surface: DROPPED entirely.** No ROLE switcher in sidebar bottom,
  no member/swaps/preferences-as-member surface. Single Admin-style board is the only view.
- **`pending` status: DROPPED.** STATUS legend = pinned / proposed / violation (3 states).
  No amber-dashed swap-request state (we have no swaps/requests).
- Single-user, offline-first, direct-edit. No roles/auth/approval/ripple. (per Crewdoku CLAUDE.md)

## 1. App shell & sidebar (192px)
Layout: `[Sidebar 192px | Content flex-1]` → 24px StatusBar at bottom.
- Brand header (~36px): `SF` logo chip + "Crewdoku" label + version pill (from app/package.json).
- Nav (scrollable flex-1):
  - **SCHEDULE** section label (text-2xs uppercase tracking-widest text-faint): "Board" item.
    Show a violet "Proposal pending" pill on Board when a solver diff exists.
  - **CONFIGURATION** section: 5 items — Shift definitions `≡`, Scheduling rules `§`,
    Teams & structure `◫`, Emp. preferences `◈`, Schedule priorities `≈`.
  - (NO bottom ROLE switcher — dropped.)
- Active nav item: `bg-[var(--sel-bg)] text-ink font-semibold`; inactive `text-dim hover:bg-surface-2`.
- StatusBar (24px, bg-raised border-t): left `saved · N viol · M overrides · ◢ K pinned`
  (conditional); right `100 staff · 5 shifts · offline` + `? shortcuts`.

## 2. Board toolbar (~36px), left→right
"Schedule board" label | divider | `◀ ▶` week nav | "Jun 15 — Jun 21, 2026" range (mono 14px) |
"Today" ghost btn | divider | pivot Seg "By employee | By time" | flex-space |
dept filter dropdown "All departments" | "◢ Seed · 12" pill (pin count when >0) |
Generate btn (`▸ Generate` idle / spinner `Solving…` / `◆ N proposed`) | "↓ Export".
All controls 24px h, rounded-[2px], hover bg-surface-2.

## 3. STATUS legend row (~32px)
`STATUS` label | ◢ pinned | ◆ proposed | ⚠ violation | [shift chips].
(pending swatch removed.) Shift chip = colored square code box (--sh-{code}-bg/fg/bd) +
adjacent mono time span "0100–0600" (colons stripped), 11px mono font-medium.
Indicators: ◢=--st-pin, ◆=--st-prop violet, ⚠=--st-crit red.

## 4. Board grid
2-level sticky header + dept-grouped employee rows × 7 day cols.
- Header row1 (26px): week range right-aligned mono, colSpan per week.
- Header row2 (28px): day abbrev + date number ("Mon"/"15") centered mono.
- Sticky left col (200px): employee name (text-xs) + weekly hours (mono text-2xs;
  red >48, amber >40, faint else).
- Dept group header row (24px, bg-surface-2): "▾ PRODUCTION A   26" toggles collapse
  (▾ expanded / ▸ collapsed), count = members in dept.
- Cell (min ~86px): filled shift = --sh-{code}-bg fill + mono text "0100–0600" (11px,
  stripped colons) centered; day-off empty/faint.
  Pinned = ◢ corner wedge top-left. Status: .sf-proposed violet-dashed, .sf-viol solid-red.
  Weekend = 45° diagonal hatch bg.
- Col borders: week boundary 2px --border-strong; day boundary 1px --border.
- Row alternation: every 2nd row 30% surface-2 mixed.
- Click/hover cell → popover (~248px) "Assign shift" list (shifts + day-off), ⚠ inline on violating.

## 5. By-time pivot (CoverageView)
Rows = shifts, cols = 7 days. Left col (116px) = shift time range chip (--sh-{code} colored).
Cells = employee chip badges (dept-colored dot + last name, ◢ if pinned), flex-wrap gap-1,
multiple per shift×day.

## 6. Generate panel (300px right rail, collapsible)
Header (36px): "Generate" | spinner+"Solving…"/elapsed | Cancel | ✕.
Progress bar 2px violet animates during solve.
Body:
1. Pre-flight table: Horizon (7d Mon–Sun), Staff (100·5 depts), Hard (5 families·N inst),
   Soft (5 terms·weight W), Pinned cells (K), (NO pending swaps row — dropped).
2. Hard constraints: 5 rows `[H1] Shift coverage · 35 inst` (mono right-aligned).
3. Run solver button (primary lg "▸ Run solver").
4. Solver log (112px, mono 10px, live-scroll) during solve.
5. Result: Banner "Optimal · Proposal P-…" + change count; 3-col grid Fairness/Penalty/Changes
   with delta badges; PenaltyBars (S1–S5, prev gridline vs now violet); workload histogram
   (0/24/48/72h bars, crit>48 warn40-48 prop<40).
   Maps to existing proposal shape `{id,changes[],fairness,prevFairness,penalty,prevPenalty,breakdown[]}`.

## 7. Demo roster target (realistic)
Prototype: 100 employees / 5 depts — Production A (26), Production B (24), Quality (16),
Maintenance (14), Logistics (20). Real first/last names. 5 shifts, 24h coverage w/ 1h overlaps:
- N Night 01:00–06:00, E Early 05:00–11:00, M Mid 10:00–16:00, A Swing 15:00–21:00, L Late 20:00–26:00 (crosses midnight).
Coverage req/cap per shift (N 10/12, E 14/16, M 16/18, A 16/18, L 14/16).
Crewdoku demo seed lives in `packages/domain/src/seed/demo.ts` (`buildDemo(): AppStateDTO`),
must stay feasible (zero hard violations) + keep seed tests green. (Enriching seed DATA is
content, not domain logic — flag in spec whether this counts as "touching domain".)

## 8. Tokens (already in tokens.css — DO NOT rename)
Shift colors `--sh-{N|E|M|A|L}-{bg|fg|bd}` (oklch). Status `.sf-proposed`/`.sf-viol`
(`.sf-pending` exists but we won't use it). Anim: sf-spin, sf-scan/sf-scan-glow (violet scan line),
sf-blink. Density: --row-h 28px, --ctl-h 24px, --cell-fs 11px. Fonts: IBM Plex Sans (UI) +
IBM Plex Mono (data). Cool-gray chrome --bg/--surface/--surface-2/--raised/--border(-strong).

## Conflicts flagged (resolved)
Member/admin roles, swap requests, consent/ripple → all DROPPED (single-user). Keep only
board/grid/legend/toolbar/generate-panel/config structure. Shift `isNight` boolean drives night
detection (never literal 'N'). No baseAssign hash baseline (deleted in Crewdoku; grep-guarded).
