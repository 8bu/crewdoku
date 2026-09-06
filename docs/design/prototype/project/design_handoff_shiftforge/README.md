# Handoff: ShiftForge — Constraint-Based Team Scheduling App

## Overview

ShiftForge is a desktop-first web application for scheduling teams of 10–1,000 employees using a CP-SAT constraint solver. Users do **not** draw schedules by hand — they define constraints, pin known assignments, trigger the solver, and negotiate with the generated result through a structured diff/approval flow.

The product has three roles (Team Leader, Team Member, Sysadmin) and four core surfaces (Schedule board, Approval inbox, Generation screen, Member self-service + Sysadmin config).

---

## About the Design Files

The files in this bundle are **HTML prototypes** — high-fidelity design references showing intended look, layout, and interactive behavior. They are **not** production code to ship directly. The task is to **recreate these designs in your target codebase** (React, Next.js, etc.) using its established patterns and component libraries, referencing these files for visual and behavioral specification.

The prototypes use React 18 + Babel (in-browser), Tailwind CDN, and IBM Plex Sans/Mono fonts. The design system tokens live in `tokens.css` as CSS custom properties — these are the source of truth for all colors, spacing, and typography.

---

## Fidelity

**High-fidelity.** The prototypes have final colors, typography, spacing, status encoding, and interactions. Recreate them pixel-precisely using your codebase's component system.

---

## Known Outstanding TODOs

One change was requested but not yet implemented before this handoff:

> **Board column headers: remove vertical rotation.** The shift time-range labels in level-3 column headers are currently rotated 90°. The user wants them **horizontal** (not rotated), with cells wide enough to display `"01:00–06:00"` legibly. The board should scroll **both horizontally and vertically**, with the first column (employee names) and the 3-level header rows frozen/sticky. This is the next immediate implementation task.

---

## App Shell

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ MenuBar (32px)                                          │
├───────────────────────┬─────────────────────────────────┤
│ Sidebar (192px fixed) │ Content area (flex-1)           │
│                       │                                 │
│  Workspace header     │  Surface renders here           │
│  Role-aware nav       │                                 │
│  Role switcher        │                                 │
│  (bottom)             │                                 │
├───────────────────────┴─────────────────────────────────┤
│ StatusBar (24px)                                        │
└─────────────────────────────────────────────────────────┘
```

### Sidebar

- Width: 192px, fixed
- Background: `--surface`, right border: `--border`
- **Workspace header** (36px): SF logo mark (18×18, ink-solid bg, white text, mono font), brand name "ShiftForge", "demo" pill badge
- **Nav section label**: 10px uppercase, `--text-faint`, `tracking-widest`
- **NavItem** (26px height): icon (14px mono, 14px wide, 60% opacity) + label (12px) + optional badge. Active: `--sel-bg` background, full-weight text. Hover: `--surface-2` bg.
- **Role switcher** (bottom, `--raised` bg, top border):
  - Label: "Viewing as" — 10px uppercase faint
  - Three radio-style buttons per role: 8px circle indicator (filled when active), 12px label + 10px subtitle below. Active row has `--surface` bg + border. Hover: `--surface-2`.

### MenuBar

- Height: 32px, `--raised` bg, bottom border
- Left: SF mark + brand name + file/edit/view/help dropdown menus
- Right: solver status dot + label

### StatusBar

- Height: 24px, `--raised` bg, top border, `font-mono`, `text-2xs`, `--text-faint`
- Left slot: ready dot, violation count, edit count, pending count, pin count
- Right slot: team summary, shortcuts hint

---

## Surface 1 — Schedule Board (Leader)

### Layout

```
Board toolbar (36px)
[optional] Seed mode hint bar (28px)
[optional] Diff banner (auto-height)
Legend bar (28px)
─────────────────────────────────────────────────────────
Scrollable table (flex-1, overflow both axes)
  3-level sticky thead + sticky first column
```

### Board Toolbar

Flex row, 36px, `--raised` bg, bottom border. Items (left→right):
- "Schedule board" label (12px semibold, faint, right border separator)
- ◀ ▶ navigation buttons
- Date range label (monospace, 12px)
- "Today" ghost button
- Week / 4-week segmented control
- flex spacer
- Department filter select
- Seed mode toggle button (shows active count)

### 3-Level Column Headers (thead, 3 rows, all sticky)

All three rows are `position: sticky`, stacked:

| Row | Content | Height | Sticky top |
|-----|---------|--------|------------|
| 1 | Week range (`Jun 15 – Jun 21`) | 26px | 0 |
| 2 | Day of week + date (`Mon 15`) | 26px | 26px |
| 3 | Shift time range (`01:00–06:00`) | **horizontal text** (see TODO above) | 52px |

- Row 1: `colSpan = days × shifts`, `--raised` bg, left-aligned monospace label
- Row 2: `colSpan = 5 shifts`, center-aligned. Weekend columns: `--weekend-tint`. Today column: `--sel-bg`. Text color: `--sel` for today, `--text-dim` otherwise.
- Row 3: one `<th>` per shift per day. Shift time in format `HH:MM–HH:MM`. Shift color as text/bg (`--sh-{CODE}-fg` / `--sh-{CODE}-bg`). Font: 9px mono.

**Corner cell**: `rowSpan=3`, sticky `left:0 top:0 z-index:30`, "Employee" label.

### Employee Rows (tbody)

**Department group row**: full `colSpan`, 24px, `--surface-2` bg. Sticky left. Collapsible toggle (▸/▾) + dept name + count. Click to collapse/expand.

**Employee data row** (one per employee):
- Alternating rows: odd rows `color-mix(in oklab, --surface-2 30%, --surface)`
- **Name cell** (sticky left, z-index:10): 200px, `--border` right border, `px-2.5`. Employee full name (12px truncated) + weekly hours (`font-mono text-2xs`, red if >48h, amber if >40h, faint otherwise).
- **Shift×day cells**: `width = CELL_W` (32px week / 18px month)
  - Assigned: filled `--sh-{CODE}-bg` background
  - Empty: transparent (shows row bg / weekend tint)
  - Not in horizon: 20% opacity

### Cell Status Overlays

Applied as CSS classes on `<td>`:

| State | Class | Visual |
|-------|-------|--------|
| Pinned | inline span | 6px black corner wedge (top-left, `--st-pin`) |
| Pending request | `.sf-pending` | Amber dashed outline + 45° hatch |
| Proposed change | `.sf-proposed` | Violet dashed outline (1.5px) |
| Rule violated | `.sf-viol` | Red solid outline (2px) |

### Legend Bar

28px, `--raised` bg. "Status" label + status key items + spacer + 5 shift chips (code + time, shift-colored).

### Cell Interactions

- **Click assigned cell** → EmpActionPopover: reassign to any of 5 shifts (with live violation badges ⚠) or set day off + pin toggle
- **Click empty cell** → same popover (no current shift)
- **Click proposed cell (diff mode)** → DiffPopover: accept / reject / undo
- **Hover filled cell** → tooltip: name, day, shift, status flags
- **Seed mode + click** → toggle pin (◢ corner wedge)

### Seed Mode Hint Bar

28px blue bar (`--sel-bg` bg, `--sel` border). "SEED MODE" label + instruction text + "Esc to exit" right.

### Diff Banner

`--st-prop-bg` bg, `--st-prop` border. Shows proposal ID, change count, fairness delta, penalty delta, decided count. Actions: Accept all / Reject all / Apply N accepted / Discard.

---

## Surface 2 — Approval Inbox (Leader)

Two-column layout: 330px list (left, scrollable) + flex detail panel (right).

**Page header** (40px, `--raised` bg): "Approval inbox" title + subtitle with pending count.

### Request List (330px)

Section label "Pending · N". Each request row (click to select):
- Selected: `--sel-bg` bg + 2px left border `--sel`
- Unselected: transparent + transparent left border, hover `--surface-2`
- Content: request ID (mono faint) + type badge + status badge (right)
- Employee name (12px semibold) + detail preview (10px faint, truncated)
- Ripple indicator dot (ok/warn/crit) + one-line description

### Request Detail Panel

- Employee card: avatar (initials, 28×28, `--ink-solid` bg), name, dept, weekly hours
- **Ripple pre-check Panel**: tone-colored border (ok/warn/crit). Shows solver's impact analysis text.
- Action buttons: ✓ Approve / ↩ Counter-propose / ✕ Reject
- Reject flow: dropdown of reason presets → confirm
- Counter-propose: Modal with free-text textarea
- Swap consent: shows "AWAITING" / "✓ ACCEPTED" badge; Approve disabled until colleague accepts

---

## Surface 3 — Generation Screen (Leader)

Two-column layout: 300px pre-flight panel (left) + flex result area (right).

**Run phases** and what to show:

| Phase | UI |
|-------|-----|
| Idle | EmptyState with ▸ glyph + explanation |
| Queued | Spinner + "Queued — position 1" + elapsed + Cancel |
| Solving | Spinner + elapsed timer + monospace live log (`--surface-2` bg, `font-mono text-2xs`, scrolling) |
| Done | Fairness score stat, penalty stat, changed-cell count stat + penalty breakdown bar chart + workload histogram + "Review changes on board →" CTA |
| Infeasible | Crit banner + conflict-core panel + relaxation radio picker + "Re-run with relaxation" button |

**Pre-flight panel** (`Panel` component): table of horizon, staff count, constraint counts, pinned count, open requests. Below: Hard constraint family list. Below: Demo control (optimal/infeasible toggle).

**Stats** (inline panels, flex row): `font-mono text-2xl font-semibold` value + small suffix + `Badge` delta (ok tone for improvement).

---

## Surface 4 — Member Self-Service

**Page header**: employee name + dept/ID subtitle.

**My schedule view**: 14-day vertical list. Each row (30px): date label (mono, 64px, today highlighted `--sel`) + ShiftChip (code + name + time) or "Day off" faint text. Pinned badge + request badge.

**Requests view**: Two-column grid (form left, tracker right).
- Form: type segmented control (Day off / Swap / Sick / Preference) + date picker + conditional fields (colleague selector for swap, note for others). Submit button.
- Tracker: request list rows with status badges + rejection reason display.

**Preferences view**: Warning banner ("not guarantees") + preference list (avoid/prefer + shift + scope) + inline add form at bottom of list.

---

## Surface 5 — Sysadmin Config

**Page header**: section name + "Changes apply to next solver run" subtitle.

Sections (driven by sidebar nav):
- **Shift definitions**: table with inline-editable name + read-only times + numeric req/cap inputs. Live feasibility banner (ok/warn/crit) based on `∑req × 7 vs staff × 5`.
- **Scheduling rules**: Field+NumInput rows for max hours/week (H2), min rest (H3), max consecutive days (H6). Live warning banners when values are extreme.
- **Teams**: table of departments with leader select + night-qualified count.
- **Permissions**: checkbox matrix (roles × capabilities). Sysadmin row locked.
- **Solver weights**: slider rows (0–10) per soft term, preset buttons (Balanced / Fairness-first / Stability-first), contextual trade-off explanation banner.

---

## Design Tokens

All tokens are CSS custom properties. Source file: `tokens.css`.

### Typography

| Token | Value |
|-------|-------|
| `--font-ui` | IBM Plex Sans, system-ui, sans-serif |
| `--font-mono` | IBM Plex Mono, ui-monospace, monospace |
| `--fs-2xs` | 10px |
| `--fs-xs` | 11px |
| `--fs-sm` | 12px (base body) |
| `--fs-md` | 13px |
| `--fs-lg` | 15px |

### Spacing / Density

| Token | Default | Notes |
|-------|---------|-------|
| `--row-h` | 28px | Board row height, user-tweakable 18–36px |
| `--ctl-h` | 24px | Button/input height |

### Chrome (Light)

| Token | Value |
|-------|-------|
| `--bg` | `oklch(0.955 0.004 250)` |
| `--surface` | `oklch(0.985 0.002 250)` |
| `--surface-2` | `oklch(0.94 0.005 250)` |
| `--raised` | `oklch(0.97 0.003 250)` |
| `--border` | `oklch(0.885 0.006 250)` |
| `--border-strong` | `oklch(0.80 0.008 250)` |
| `--grid-line` | `oklch(0.915 0.005 250)` |
| `--text` | `oklch(0.24 0.012 255)` |
| `--text-dim` | `oklch(0.46 0.014 255)` |
| `--text-faint` | `oklch(0.63 0.012 255)` |
| `--text-inv` | `oklch(0.97 0.003 250)` |
| `--ink-solid` | `oklch(0.28 0.015 255)` |
| `--sel` | `oklch(0.52 0.13 250)` |
| `--sel-bg` | `oklch(0.93 0.028 250)` |
| `--weekend-tint` | `oklch(0.93 0.006 250)` |
| `--shadow` | `0 2px 8px oklch(0.2 0.01 255 / 0.14)` |

Dark theme overrides all chrome tokens under `[data-theme="dark"]` — see `tokens.css`.

### Status Colors

| Tone | Foreground token | Background token |
|------|-----------------|-----------------|
| ok | `--st-ok` `oklch(0.54 0.13 152)` | `--st-ok-bg` |
| warn | `--st-warn` `oklch(0.58 0.125 75)` | `--st-warn-bg` |
| crit | `--st-crit` `oklch(0.54 0.185 27)` | `--st-crit-bg` |
| prop | `--st-prop` `oklch(0.50 0.14 295)` | `--st-prop-bg` |

### Shift Colors (×5, pattern `--sh-{CODE}-{bg|fg|bd}`)

| Shift | Code | bg | fg |
|-------|------|----|----|
| Night | N | `oklch(0.33 0.035 265)` dark navy | `oklch(0.92 0.015 265)` light |
| Early | E | `oklch(0.93 0.055 80)` amber | `oklch(0.43 0.10 70)` dark amber |
| Mid | M | `oklch(0.93 0.05 150)` green | `oklch(0.40 0.09 150)` dark green |
| Swing | A | `oklch(0.93 0.045 230)` blue | `oklch(0.42 0.095 240)` dark blue |
| Late | L | `oklch(0.93 0.05 310)` purple | `oklch(0.43 0.10 310)` dark purple |

---

## Component Inventory

All components live in `ui.jsx`, exported to `window`. Key components:

| Component | Type | Notes |
|-----------|------|-------|
| `Badge` | atom | Tones: ok/warn/crit/prop/sel/neutral. `px-1.5 h-[15px] text-2xs border rounded-[2px]` |
| `Dot` | atom | 6×6 status dot, optional blink |
| `ShiftChip` | atom | Code badge + name + optional time |
| `Btn` | control | Variants: default/primary/ghost/danger. Height `--ctl-h`. |
| `Seg` | control | Segmented control (tab-style, no underline) |
| `TextInput` / `NumInput` | control | Height `--ctl-h`, `border-bds bg-surface` |
| `SelectBox` | control | Native select, styled |
| `Check` | control | Ink-filled checkbox |
| `Field` | layout | Label + hint wrapper, row mode available |
| `Panel` | container | Bordered card, optional title bar + actions, tone prop |
| `Banner` | container | Full-width tinted alert bar |
| `EmptyState` | container | Centered glyph + title + body + CTA |
| `PageHeader` | container | 40px title bar with subtitle + action slot |
| `Popover` | overlay | Fixed-position, closes on outside click/Esc |
| `Modal` | overlay | Centered dialog with footer |
| `MenuBar` | chrome | 32px app menubar with dropdown menus |
| `StatusBar` | chrome | 24px bottom bar |
| `TabStrip` | chrome | Desktop-style squared tabs with badge support |
| `Bars` | chart | Horizontal bar chart with ghost "before" bars |
| `Hist` | chart | Vertical histogram |

**All borders use `rounded-[2px]`** — not rounded-md or pill. Corner radius is 2px throughout.

---

## State Management

Single `useReducer` at root `App`. All surfaces receive `(app, dispatch)` props.

### Key State Shape

```typescript
{
  role: "leader" | "member" | "admin",
  leaderView: "board" | "inbox" | "solver",
  memberView: "schedule" | "requests" | "prefs",
  adminSection: "shifts" | "rules" | "teams" | "perms" | "weights",
  zoom: "week" | "month",
  weekOffset: number,          // 0 = week of Jun 15 2026
  seedMode: boolean,
  pins: Set<string>,           // keys: "empIdx|absDay"
  overrides: Map<string, { code: string|null, viol: Violation[] }>,
  diff: null | { proposal: Proposal, decided: Map<string, "accept"|"reject"> },
  requests: Request[],
  prefs: Pref[],
}
```

### Action Types

`SET_ROLE`, `LEADER_VIEW`, `MEMBER_VIEW`, `ADMIN_SECTION`, `ZOOM`, `WEEK`, `SEED_TOGGLE`, `SEED_OFF`, `PIN_TOGGLE`, `SET_CELL`, `MOVE_CELL`, `SET_PROPOSAL`, `DIFF_DECIDE`, `DIFF_ALL`, `DIFF_APPLY`, `DIFF_DISCARD`, `REQUEST_DECIDE`, `ADD_REQUEST`, `PREF_ADD`, `PREF_REMOVE`, `CLEAR_EDITS`, `UNPIN_ALL`

---

## Demo Data Model (data.js → window.SF)

The prototype exposes `window.SF` with:
- `SF.EMPLOYEES` — 100 employees across 5 departments
- `SF.SHIFTS` — 5 shift definitions (Night/Early/Mid/Swing/Late)
- `SF.DEPTS` — 5 departments
- `SF.baseAssign(empIdx, absDay)` — deterministic base schedule
- `SF.checkViolations(i, absDay, shiftCode, getShiftFn)` — real H2/H3 checks
- `SF.makeProposal(pinsSet)` — simulated solver diff
- `SF.REQUESTS` — 8 seeded requests with ripple pre-checks
- `SF.INFEASIBLE` — infeasible scenario with conflict core + relaxations
- `SF.SOLVER_LOG` — scripted live log entries

`absDay = 0` = Mon Jun 15 2026. Negative = past, positive = future.

---

## Assets

- **Fonts**: IBM Plex Sans + IBM Plex Mono from Google Fonts (CDN). Load both with weights 400/500/600/700.
- **Icons**: none — geometric glyphs (▸ ▾ ◢ ◆ ⚠ ✓ ✕ ◀ ▶) via Unicode.
- **Images**: none.

---

## Files in This Package

| File | Purpose |
|------|---------|
| `ShiftForge.html` | Entry point — load order and HTML shell |
| `tokens.css` | All CSS custom properties (light + dark theme) |
| `data.js` | Demo data, solver simulation, violation checks (`window.SF`) |
| `ui.jsx` | Shared component library |
| `board.jsx` | Schedule board surface (the most complex component) |
| `leader.jsx` | Leader surface shell + Approval inbox |
| `member.jsx` | Member self-service surface |
| `admin.jsx` | Sysadmin config surface |
| `generate.jsx` | Generation screen surface |
| `app.jsx` | Root App, Sidebar, PageHeader, reducer, keyboard shortcuts |
| `tweaks-panel.jsx` | Tweaks panel starter (host protocol + controls) |
| `REQUIREMENTS.md` | Full product + tech + design requirements |
| `ShiftForge Spec.html` | Printable IA + component inventory + interaction flows |

---

## Keyboard Shortcuts (implement these)

| Key | Action | Scope |
|-----|--------|-------|
| `W` / `M` | Week / 4-week zoom | Leader board |
| `← →` | Previous / next week | Leader board |
| `T` | Jump to current week | Leader board |
| `S` | Toggle seed mode | Leader board |
| `G` | Open solver | Leader |
| `Esc` | Exit seed mode / close overlay | Global |
| `?` | Keyboard shortcuts modal | Global |
