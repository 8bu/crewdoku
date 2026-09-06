---
name: Crewdoku
description: A dense multi-week shift board, restyled as a modern operating console.
colors:
  base-white: "oklch(100% 0 0)"
  zinc-page: "oklch(97.5% 0.0015 286)"
  zinc-border: "oklch(91% 0.004 286)"
  zinc-ink: "oklch(20% 0.01 285)"
  indigo-primary: "oklch(56% 0.2 276)"
  indigo-primary-content: "oklch(98% 0.005 276)"
  slate-secondary: "oklch(46% 0.015 285)"
  selection-blue: "oklch(62% 0.16 245)"
  proposal-violet: "oklch(0.55 0.19 305)"
  proposal-violet-outline: "oklch(0.8 0.1 305)"
  marker-green: "oklch(64% 0.15 152)"
  caution-amber: "oklch(76% 0.15 70)"
  marker-red: "oklch(62% 0.21 25)"
  holiday-gold: "oklch(0.72 0.14 85)"
  dawn-wash: "oklch(0.96 0.03 80)"
  midday-wash: "oklch(0.96 0.03 165)"
  dusk-wash: "oklch(0.96 0.03 40)"
  night-wash: "oklch(0.95 0.028 235)"
  weekend-tint: "oklch(0.965 0.004 286)"
typography:
  ui-2xs:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  ui-xs:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  ui-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  ui-md:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  ui-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 400
  cell-code:
    fontFamily: "ui-monospace, SF Mono, Cascadia Code, Roboto Mono, monospace"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "normal"
  cell-time:
    fontFamily: "ui-monospace, SF Mono, Cascadia Code, Roboto Mono, monospace"
    fontSize: "9px"
    fontWeight: 400
    letterSpacing: "normal"
rounded:
  md: "0.5rem"
  lg: "0.75rem"
spacing:
  cell-pad-y: "3px"
  cell-pad-x: "4px"
  row-h: "40px"
  col-w: "64px"
  name-col-w: "176px"
  fair-col-w: "60px"
  panel-w: "360px"
components:
  button-primary:
    backgroundColor: "{colors.indigo-primary}"
    textColor: "{colors.indigo-primary-content}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  board-cell:
    rounded: "0"
    padding: "3px 4px"
    height: "{spacing.row-h}"
  floating-panel:
    rounded: "{rounded.lg}"
    shadow: "layered soft shadow, see Elevation & Depth"
---

# Design System: Crewdoku

## Overview

**Creative North Star: "Console"**

UI revamp (2026-08-27), direction inspired by shadcn/ui, beautifui.dev,
beui.dev, rareui.com, and transitions.dev: a neutral zinc surface, one indigo
interactive accent, soft shadows on floating surfaces only, larger
rounded-md/rounded-lg corners, and Inter type. This replaces "The
Nursing-Station Whiteboard" (the dry-erase-board direction) — same working
mechanics underneath (CSS-Grid board, sticky panes, muted per-shift color
washes, dim-and-light coverage drill-down), a different, more contemporary
material world on top. Board grid geometry (row/column pixel sizes, sticky
pane structure, per-cell layout) is unchanged; only color, radius, shadow,
type, and motion move.

Density is still the whole point: up to 100 people times 42 days, one
continuous grid, every cell always showing its shift code over its time. The
grid itself stays flat and square-cornered — a dense data table, not a card
— while everything that floats over it (menus, popovers, docked panels) or
frames it (nav rail, route pages, form cards) picks up the new rounded,
softly-shadowed console language.

**Key Characteristics:**
- Neutral zinc ground (white board surface, near-white page), one indigo
  accent spent on primary actions, selection, and active nav/tab state
- Soft shadows on floating/docked surfaces only — the board grid itself stays
  flat, unrounded, and unshadowed at rest (a dense table, not a card)
- Rounded-md (0.5rem) controls, rounded-lg (0.75rem) cards/panels/popovers
- Inter throughout for UI text; a system monospace stack for shift codes,
  times, and every tabular number
- Subtle 150ms color/background transitions on interactive elements
  (buttons, chips, nav items, list rows) — motion reads as a state change,
  never a snap

## Colors

### Primary
- **Indigo** (oklch(56% 0.2 276)): the one interactive/brand accent — primary
  buttons (Generate, Apply, Add), the selection range outline, active nav
  item, and the "most-loaded person" underline in the fairness column.

### Secondary
- **Slate** (oklch(46% 0.015 285)): secondary chrome accents, never a second
  brand color.

### Neutral
- **Base White** (oklch(100% 0 0)): `base-100` — the board surface, cards,
  and panel backgrounds.
- **Zinc Page** (oklch(97.5% 0.0015 286)): `base-200` — the app shell/page
  background the nav rail and content float on.
- **Zinc Border** (oklch(91% 0.004 286)): `base-300` — hairline borders,
  dividers, the board's own grid-line rules.
- **Zinc Ink** (oklch(20% 0.01 285)): `base-content` — body text, the pin
  dot, the board's own ink color.

### Named Rules
**The Functional Color Rule.** No color appears unless it means something
specific (a shift family, ok/over/violation, pending review, a holiday, the
selected range, the primary action). Chrome — nav rail, resting-state
buttons, panel borders — stays neutral.

## Typography

**UI Font:** Inter (with ui-sans-serif, system-ui fallback), loaded via
Google Fonts in `index.html`.
**Data Font:** system monospace (SF Mono / Cascadia Code / Roboto Mono
fallback chain) — no web font load needed, every platform ships a clean
mono.

### Hierarchy
- **Body** (400, 13px): default UI text — labels, names, panel copy.
- **Cell code** (700, 10px, mono): the shift code inside a board cell — the
  single most-repeated piece of type in the app (~4200 instances).
- **Cell time** (400, 9px, mono, faint): the shift's start–end time, hidden
  until hover — detail, not pattern.
- **Fairness numbers** (13px, mono, tabular): hours/nights/weekends totals
  pinned right of the grid.

### Named Rules
**The Two-Line Cell Rule.** Every board cell always shows code over time,
never one or the other — density is achieved by making both lines small, not
by dropping one.

## Layout

One CSS Grid, every cell mounted (no windowing/virtualization), header row
and name column frozen via `position: sticky`, fairness columns pinned right
the same way — unchanged by this revamp. Fixed pixel geometry (`--row-h:
40px`, `--col-w: 64px`, `--name-col-w: 176px`) on a deliberate desktop-only
surface. A docked side panel (person details, proposal review, infeasible
reasoning) shrinks the board's own scroll area rather than overlaying it, so
sticky panes stay correct.

Route pages (Roster, Teams, Settings) now open with a page-header block
(title + one-line description) above their content, and wrap their tables
and forms in rounded-lg card containers on the page's zinc-page background —
the console-app pattern these reference sites share, replacing the old
edge-to-edge flush layout.

## Elevation & Depth

The board grid stays flat at rest — no card lift, no ambient shadow — the
same engineering reason as before (a card shadow at ~4200 mounted cells adds
nothing and costs paint). Depth now shows up in two places: a directional
edge-shadow on the board's own sticky panes (unchanged mechanism), and a
genuine layered soft shadow (`--shadow-pane`) on anything that floats over
the board or the page — cell menu, coverage breakdown, proposal ledger,
infeasible panel, person panel, delete popovers, the add-member search
dropdown.

### Shadow Vocabulary
- **Edge shadow** (`0 6px 6px -4px var(--shadow-edge)` or the `4px 0`
  horizontal equivalent): marks a sticky pane's scrolled edge.
- **Pane shadow** (`0 10px 30px -10px oklch(0.15 0.02 285 / 0.18), 0 2px 8px
  -2px oklch(0.15 0.02 285 / 0.1)`): floating/docked panels and popovers.

### Named Rules
**The Flat-Board Rule.** The board grid itself never lifts, glows, or gains
depth at rest. Only something genuinely floating over it or the page earns a
shadow.

## Shapes

Rounded-md (0.5rem) for buttons, inputs, chips, and small controls;
rounded-lg (0.75rem) for cards, docked/floating panels, and popovers. The
board grid itself stays unrounded — cells, the sticky header, and the name
column keep hard edges, consistent with a dense spreadsheet rather than a
card; 1px hairline borders in Zinc Border do the work a heavier stroke would
elsewhere.

## Components

Buttons, inputs, selects, and tables lean on daisyUI's own defaults, themed
entirely through the "console" theme's tokens in `styles.css` — no bespoke
per-component CSS for standard controls. The board cell remains the one
genuinely signature, hand-styled component.

### Buttons
- **Shape:** rounded-md.
- **Primary:** Indigo background, near-white text (Generate, Apply, Add, and
  other primary actions).
- **Hover / Focus:** daisyUI's default state layer plus a 150ms color
  transition on hand-styled buttons/chips.

### Board Cell (signature component)
- **Shape:** two-line, always — code over time, unrounded, 40px tall, 64px
  wide.
- **Background:** a muted wash of the shift's own hue (Dawn/Midday/Dusk/Night
  — one of four time-of-day families, keyed to catalog position so a rename
  keeps its color) — slightly livelier chroma than the prior whiteboard
  direction, still never full-saturation across all ~4200 cells at once.
- **Marks:** a small ink dot (top-right) means pinned; a small red dot
  (top-left) means a rule break; a thin violet outline means "changed by the
  pending proposal." Marks stack independently.
- **State transition:** background and outline changes ease over 150ms.

### Fairness Cell
- **Style:** tabular mono numbers plus a rounded-full mini progress pill
  (was a square bar) showing hours against the cap; the period's
  most-loaded person gets an amber tint, eased in over 150ms.

### Coverage Bar
- **Style:** a 4px strip along the header cell's bottom edge — green (ok),
  red (short), amber (over) — height and color both ease on state change.

### Panels (Cell Menu, Coverage Breakdown, Proposal Ledger, Infeasible,
Person Panel, Delete popovers)
- **Corner Style:** rounded-lg (docked full-height panels stay unrounded on
  the edge flush against the viewport/board, since a dock has no free corner
  to round).
- **Background:** Base White.
- **Shadow Strategy:** pane shadow only (see Elevation & Depth).
- **Border:** 1px Zinc Border.

### Status Cluster (Problems + diagnostic-layer toggle)
- **Style:** one rounded-lg, shadowed, joined row — the problem count sits
  left of a vertical divider, the "Coverage & fairness" toggle sits right of
  it, same height, no gap between them.
- **Position:** pinned inside the Shell toolbar's own 48px band (`top-2`),
  never overlapping the board's own sticky header underneath it.
- **State:** off state is neutral; on state tints Selection Blue
  (background + text), never a solid fill.

### Status Banners (Generate empty-state, solving, settings-dirty)
- **Style:** a full-width flex row in real document flow at the top of the
  board column — border-bottom, tinted background, never a floating overlay.
- **Named Rule — The Real Flow Rule.** A persistent top banner is a real
  flex row that pushes the grid down, never `position: absolute`/`fixed`
  floating over it — unchanged from the prior direction, since this is a
  layout-correctness rule, not a stylistic one.

## Do's and Don'ts

### Do:
- **Do** spend color only on function — a shift family, ok/over/violation,
  pending-review, or holiday — plus the one indigo accent for primary
  actions and selection.
- **Do** keep the board grid flat and unrounded at rest; add radius and
  shadow only to something genuinely floating over it or framing a page.
- **Do** ease state-changing color/outline/background transitions (150ms)
  rather than let them snap.
- **Do** give every mark on the board (pin dot, violation dot, holiday dot)
  a hover or focus label — nothing stays anonymous.
- **Do** use rounded-md for controls and rounded-lg for cards/panels,
  consistently — don't mix radius scales within one surface.
- **Do** put a persistent top banner in real flow so it pushes the grid
  down. Only a transient, click-triggered popover gets to float over the
  board.

### Don't:
- **Don't** round or shadow the board grid itself — it stays a dense, flat
  table.
- **Don't** introduce a second brand accent alongside Indigo; the system has
  one interactive color, not a palette of them.
- **Don't** paint a shift's cell at full saturation across the whole grid —
  the muted wash is the point at ~4200 mounted cells.
- **Don't** float a second fixed-position status chip next to an existing
  one — join the Status Cluster instead of stacking separate boxes.
- **Don't** use `position: absolute`/`fixed` for a persistent banner at the
  top of the board — it will sit exactly where the sticky date-header sits
  and cover it. Real flow only — see The Real Flow Rule.
