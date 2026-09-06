# Spec — Spreadsheet-like Schedule Board UX

Status: Draft (specs stage)
Feature area: `app/src/features/board/`
Author: Claude (spec)
Date: 2026-06-16

---

## 1. Problem & Goals

### Problem
The Board (`app/src/features/board/Board.tsx`) currently behaves like a list of single
cells: a cell renders at a fixed `minWidth: 86px`, the day columns do not fill the
container, and the **only** interaction is single-click → `CellPopover` (assign one
cell). Editing a real multi-week roster one cell at a time is slow. Users expect the
board to feel like a spreadsheet: select ranges, batch-edit, copy/paste, fill, and
right-click — like Linear/Excel/Google Sheets.

### Goals
1. The grid fills its container width (employee column stays fixed; the 7 day columns
   stretch evenly).
2. A full **range selection model** (single, drag-rectangle, shift-extend,
   cmd-toggle, whole-column via header, whole-row via name, Esc to clear) — held as
   **view state**, never in the domain.
3. **Batch operations** over the selection: clear, set-shift (eligibility-respecting),
   pin/unpin — persisted via a single new store action.
4. **Copy / paste** — internal buffer + OS clipboard TSV of shift codes.
5. **Excel-style fill handle** — double-click fills down within the group; drag fills a
   contiguous rectangle.
6. **Right-click context menu** scoped to the selection (or just the cell).
7. **Keyboard navigation** — arrows move the active cell, shift+arrows extend.
8. **Undo / redo** for assignment edits via a schedule-snapshot stack in the store.

### Non-negotiable constraints (from `CLAUDE.md`)
- Domain stays **pure**. Components never compute a constraint, build a model, or
  mutate the schedule directly. Anything touching the schedule goes
  component → store action → domain function.
- App → `@crewdoku/domain` only. One direction.
- Selection math (rectangle computation, eligibility filtering, TSV (de)serialization)
  is presentation logic — it may live in a small **pure helper module** under
  `app/src/features/board/` (it touches no schedule state, only ids/dates/shift codes).
- Tokens are canonical. Use existing tokens only (`--sel`, `--sel-bg`, `--surface-2`,
  `--st-*`). **Do not add or rename `--sh-*` or `.sf-*`.**
- `rounded-[2px]` everywhere. **No emoji** — geometric Unicode only (▸ ▾ ◢ ◆ ⚠ ✓ ✕ ⌫ ⧉).
- i18n is chrome-only — never wrap employee/shift names in `t()`.

---

## 2. Scope / Non-goals

### In scope
Everything in §1 Goals, bounded to the **currently visible ISO-week** (the 7 day columns
rendered for `boardWeekIndex`) and the **currently visible employees** (after
`boardDeptFilter` + group collapse).

### Explicitly OUT (non-goals)
- **No cross-week selection or paste.** Selection and all batch ops are confined to the
  visible week's 7 columns. Switching weeks clears the selection (decision D14).
- **No multi-week selection.** One week at a time.
- **No selection across collapsed groups.** Cells in a collapsed group are not in the
  DOM and are never selected; selection that spanned a group does not "reach into" a
  collapsed one.
- **No column resize / reorder.** Columns are computed (employee + 7 even days).
- **No row drag-reorder.** Employee order is domain/group order.
- **No formula cells, no auto-increment series.** Fill repeats values; it does not
  compute sequences.
- **No clipboard image/HTML.** Only `text/plain` TSV is read/written.
- **No multi-cell undo coalescing UI** (no per-keystroke timeline); undo is a flat
  snapshot stack.
- **No changes to the solver / proposal / conflict / relaxation flow.** Those keep
  working unchanged; selection is purely an editing affordance layered on top.
- **No changes to `CoverageView` (by-time pivot).** This feature is the employee grid
  (`boardPivot === 'emp'`) only.

---

## 3. Affected Components & New Modules (by path)

### Modified
| Path | Change |
|---|---|
| `app/src/features/board/Board.tsx` | Add `table-fixed w-full` + `<colgroup>`; render selection/active/fill-handle visuals; wire pointer + keyboard handlers; coexist with popover (D1). |
| `app/src/features/board/BoardSurface.tsx` | Mount the selection-count chip near `StatusLegend`; own the keyboard/clipboard listener scope (or delegate to Board). |
| `app/src/features/board/CellPopover.tsx` | Unchanged behavior; now opened by an explicit affordance (D1), not bare left-click. |
| `app/src/features/board/__tests__/cellPopover.test.tsx` | Update the 5 tests that open the popover via bare `fireEvent.click(cell)`: they must instead open it via the D1 affordance (Enter on the active cell). Behavioral assertions (eligible shifts + Day off + Clear + Esc-close + `wouldViolate` ⚠) are unchanged. |
| `app/src/features/board/__tests__/board.test.tsx` | Update the "cells are keyboard-operable" test: it currently asserts **every** gridcell has a non-null `tabindex`. Under the roving-tabindex pattern (§4.2) it must instead assert exactly one gridcell has `tabindex=0` (the active cell) and all others `tabindex=-1`. |
| `app/src/store/store.ts` | Add `setAssignments`, `setPins`/batch pin action, undo/redo (`undo`, `redo`, `_undoStack`, `_redoStack`, `canUndo`, `canRedo`), and the private `_pushUndoAndSet(nextSchedule)` helper that all assignment-mutating actions (incl. the existing single-cell `setAssignment`) funnel through (§4.8). |
| `app/tokens.css` / `tokens.css` | **No new tokens.** (Listed only to assert no change; both stay byte-identical.) |

### New (presentation-only)
| Path | Role |
|---|---|
| `app/src/features/board/selectionModel.ts` | **Pure** helpers: `Cell {employeeId,date}`, `rectBetween(anchor, focus, orderedEmployees, orderedDates) → Cell[]`, `cellKey`, eligibility filter `eligibleShiftIdsFor(emp, team: Team \| null)`, TSV `serializeSelection`/`parseTSV`, code↔shiftId maps. No React, no store, no schedule. `eligibleShiftIdsFor` accepts a null `team` (orphan/ungrouped employee) and falls back to `emp.eligibleShiftIds` alone — see §4.3. |
| `app/src/features/board/useBoardSelection.ts` | React hook holding selection **view state** (anchor, focus, active cell, `Set<cellKey>`, scattered set) + the copy buffer (`buffer` 2-D array and `lastCopiedTSV: string \| null`, the exact TSV last written to the OS clipboard — used for paste source disambiguation, §4.4) + gesture reducers. Component-local (D2). Returns state + handlers; calls store actions for writes only. |
| `app/src/features/board/SelectionChip.tsx` | "N cells selected" chip + clear button, `aria-live="polite"`. Rendered in `BoardSurface`. |
| `app/src/features/board/CellContextMenu.tsx` | Right-click menu. Reuses `useDismiss`. Geometric-Unicode glyphs only. |
| `app/src/features/board/FillHandle.tsx` (or inline) | The bottom-right handle on the active cell; dblclick + drag. |

> The split between `useBoardSelection.ts` (stateful, React) and `selectionModel.ts`
> (pure, testable in node-style Vitest) keeps the rectangle/eligibility/TSV math unit-
> testable without a DOM and keeps components thin.

---

## 4. Detailed Behavior

### Cell address model
A cell is addressed by `{ employeeId, date }`; its key is `keyOf(employeeId, date)` =
`${employeeId}|${date}` (reuse the domain `keyOf`). The **ordered employee list** is the
flattened visible employees in group order (skipping collapsed groups). The **ordered
date list** is the visible week's 7 dates. Rectangle math operates on **indices** into
these two ordered lists; it never string-splits keys.

### 4.1 Full container width
- The `<table>` gets `table-fixed w-full` (replacing the natural-width layout).
- A `<colgroup>` declares 8 `<col>`s: the employee col `width: 200px`; the 7 day cols
  each `width: calc((100% - 200px) / 7)` (equal share). `table-fixed` makes the browser
  honor these and ignore content width.
- Sticky behavior is preserved: employee column `sticky left-0`; header rows
  `sticky top-0` / `top: var(--row-h)`. Density tokens (`--row-h`, `--cell-fs`)
  unchanged. Min usable width: the employee col stays 200px; day cols may shrink below
  86px on narrow viewports — acceptable (the container scrolls horizontally only if the
  table's own min-content forces it; with `table-fixed` it will not, cells just compress).

### 4.2 Selection model (view state)
State (in `useBoardSelection`):
- `active: Cell | null` — the focused/active cell (one). Has the fill handle.
- `anchor: Cell | null` — start of the current rectangle.
- `rangeKeys: Set<string>` — the contiguous rectangle from anchor→active.
- `scatterKeys: Set<string>` — additional cmd-toggled cells (union with rangeKeys forms
  the **effective selection**).
- `selectionKeys` (derived) = `rangeKeys ∪ scatterKeys`.
- `buffer: Array<Array<string | null | undefined>> | null` — the internal copy buffer
  (2-D, rows×cols of shiftIds: `undefined` = empty cell, `null` = day off).
- `lastCopiedTSV: string | null` — the exact TSV string last written to the OS clipboard
  on the most recent copy (used by paste to decide internal-buffer vs OS-clipboard source,
  §4.4). Reset to `null` whenever the buffer is cleared.

Gestures:
- **Click a cell** → `active = anchor = cell`; `rangeKeys = {cell}`; `scatterKeys = {}`.
- **Pointer down + drag → up** → `anchor` fixed at down-cell; as pointer enters cells,
  `active = enter-cell`, `rangeKeys = rectBetween(anchor, active)`. (Uses
  `pointermove` + `elementFromPoint`/`data-*` attrs, or `pointerenter` per cell.)
- **Shift+click** → keep `anchor`; `active = clicked`; `rangeKeys = rectBetween(anchor, active)`.
- **Cmd/Ctrl+click** → toggle that cell in `scatterKeys`; `active = clicked`; `anchor = clicked`
  (so a subsequent shift+click starts a new rectangle from here). Range stays as-is.
- **Click a day-column header** → select that whole column for all visible employees:
  `anchor = {firstEmp, date}`, `active = {lastEmp, date}`, `rangeKeys =` that column.
- **Click an employee row header (name)** → select that whole row (7 visible days):
  `anchor = {emp, firstDate}`, `active = {emp, lastDate}`, `rangeKeys =` that row.
  (The collapse caret remains its own button; clicking the name text selects the row.)
- **Esc** → clear all selection (`active/anchor = null`, both sets empty) and close any
  open context menu/popover.

Visuals (tokens only):
- Effective-selection cells: background `var(--sel-bg)` overlay + 1px `var(--sel)`
  inner ring. Implemented as a class toggled on `<td>` using existing tokens (inline
  style or a utility; **no new `.sf-*`**). Must layer **under** `.sf-viol`/`.sf-proposed`
  outlines so violation/proposal rendering still reads (D9).
- Active cell: stronger 2px `var(--sel)` ring (reuse existing `focus:ring-[var(--sel)]`
  pattern) + the fill handle.
- Selection visuals must not replace the shift color fill — they overlay it (e.g.
  `box-shadow inset` ring + a translucent `--sel-bg` via `color-mix`, or a child overlay
  div). Pinned `◢` corner and proposed/viol outlines remain visible.

Accessibility:
- `role="grid"` gains `aria-multiselectable="true"`.
- Selected `<td>`s get `aria-selected="true"`.
- Active cell is the roving `tabIndex=0`; others `tabIndex=-1` (roving tabindex) so the
  grid is one tab stop and arrows move within (replaces the current "every cell
  tabIndex=0"). Keep `aria-label` per cell.

### 4.3 Batch operations
All operate on the **effective selection** (or the active cell if selection is empty).
Writes go through new store actions; persistence happens once per batch.

- **Clear** → for every selected cell, remove the assignment (write
  `removeAssignment` semantics). Implemented by `setAssignments` accepting a delete
  marker, OR a dedicated `clearAssignments(cells)` (decision D6: use `setAssignments`
  with assignments whose `shiftId` is a sentinel is rejected — instead pass real
  Assignment objects for set, and a separate `clearCells(keys)` for delete, since
  domain distinguishes absent vs `null`).
- **Set-shift** → pick a shift; for each selected cell where the shift is **eligible**
  for that employee (`employee.eligibleShiftIds ∩ team.shiftIds` includes shiftId),
  write `{employeeId, date, shiftId}`. Ineligible cells are **silently skipped** (D8).
  Day-off is "set shift = null" applied to all selected (eligibility N/A for day off).
  - **Orphan / ungrouped employees (team = null):** an employee with no team (no group, or
    `teamId` not resolvable) has no team shift-set to intersect with. Eligibility falls
    back to `employee.eligibleShiftIds` **alone** — no team intersection. The pure helper
    `eligibleShiftIdsFor(emp, team | null)` encapsulates this: `team === null` ⇒ return
    `emp.eligibleShiftIds` unchanged; otherwise return `emp.eligibleShiftIds ∩ team.shiftIds`.
    All eligibility callers (batch set, paste, fill, context menu) go through this one
    helper, so orphan handling is consistent (AC-32).
- **Pin / Unpin all** → batch pin action sets/clears `pins` for all selected keys in one
  `set()` (D7: a `setPins(keys, pinned: boolean)` action).

Store action shapes (domain stays pure; actions loop pure domain fns):
```
setAssignments(assignments: Assignment[]): void
  // snapshot → clone schedule → for (a of assignments) domainSetAssignment(next, a) → set → persist once
clearCells(keys: Array<{employeeId, date}>): void
  // snapshot → clone → removeAssignment each → set → persist once
setPins(keys: string[], pinned: boolean): void
  // single set() over a cloned pins Set (pins are NOT snapshotted for undo — D12)
```

### 4.4 Copy / paste
Cell value model for clipboard = **shift code** (`Shift.code`), with:
- empty cell (no assignment) → empty string `""`
- explicit day off (`shiftId === null`) → sentinel **`OFF`** (D5)
- assigned → the shift's `code`

**Copy (Cmd/Ctrl+C):**
- Compute the bounding rectangle of the effective selection (if scattered, use the
  min/max bounding box; cells outside the scatter set within the box serialize as `""`).
- **Scattered-selection copy yields a rectangular buffer with holes:** any cell inside
  the bounding box that is **not** in the effective selection is an intentional "hole" —
  it serializes as `""` in the TSV and is stored as a clear in the buffer, so that paste
  treats it as a clear (delete), not as "leave untouched". This is deliberate and tested
  (AC-30): copying a scattered selection and pasting it elsewhere reproduces the holes as
  cleared cells.
- Build an internal buffer: 2-D array of `{shiftId|null|undefined}` keyed by relative
  (row, col) from the rectangle's top-left, with the buffer's **anchor** = top-left cell.
  Store it in `buffer`.
- Write OS clipboard `text/plain` = TSV: rows separated by `\n`, columns by `\t`,
  each value a code / `""` / `OFF`. (rows = employees top→bottom, cols = dates left→right.)
  Store this exact string in `lastCopiedTSV`.
- Use `navigator.clipboard.writeText`; on failure (permission/insecure context) keep the
  internal buffer and show no error blocking the paste (D13 fallback). If the write
  rejects, `lastCopiedTSV` is still set to the string we attempted to write (the buffer
  remains authoritative — D13).

**Paste (Cmd/Ctrl+V):**
- Target = effective selection (or active cell). **Source precedence (deterministic):**
  call `navigator.clipboard.readText()` and branch:
  1. If it **resolves** AND its value `=== lastCopiedTSV` (and `buffer` exists) → use the
     **internal buffer** (preserves exact shiftIds — the OS clipboard is unchanged since
     our last in-app copy).
  2. Else if it **resolves** (to anything else) → parse that resolved text as TSV (an
     externally-authored or third-party paste). Mapping rules below.
  3. Else (the promise **rejects** or `navigator.clipboard` is unavailable — insecure
     context / permission denied) → fall back to the **internal buffer** if it exists;
     if no buffer exists either, paste is a no-op.
- TSV mapping (cases 2): parse `text/plain` as TSV → 2-D array of codes; map each code→
  shiftId via the shift-code map. `""` → clear (delete). `OFF` → `shiftId:null`.
  **Unknown code → skip that cell** (leave it untouched) (D8).
- **Tiling rule (D11):**
  - **Single-value buffer** (1×1) → fill the **entire** target selection with that value
    ("paste-to-all").
  - **Multi-cell buffer** → tile starting at the target's **active cell** (top-left of
    the target's bounding box if active is outside it), repeating the buffer across the
    target's bounding box, **clipped** to the visible week (no wrap into next week) and
    to the target box. If the target is a single cell, paste the **whole buffer**
    anchored there (clipped to the visible grid).
- Eligibility is enforced on paste set-operations (ineligible target cell for a mapped
  shift → skip that cell, silently). Clears/day-offs are not eligibility-gated.
- One snapshot per paste; one persist.

### 4.5 Fill handle
A small square handle (4–6px, `var(--sel)`) at the **active cell's bottom-right corner**,
shown only when there is exactly one active cell (or always on the active cell of a range
— show on the bottom-right of the selection's bounding box, D10: on the active cell).

- **Double-click the handle** → fill the active cell's value **DOWN its column**,
  bounded to the active cell's **dept/team group** (contiguous rows of the same group,
  from the active cell's row to the **last visible row of that group**). Does not cross
  into other groups; does not fill upward (D4: down-only, like Excel double-click).
  Eligibility enforced per target row; ineligible rows skipped.
- **Drag the handle** → as the pointer moves, preview a fill rectangle from the active
  cell to the pointer cell (down and/or right, contiguous). On release, fill that
  rectangle with the active cell's value, **bounded**:
  - **Vertically**: clamped to the active cell's group (cannot extend past the group's
    last visible row) (D4).
  - **Horizontally**: clamped to the visible week's 7 columns.
  - **Direction**: fill is down/right only. Dragging the handle **above or to the left**
    of the active cell is clamped to the active cell itself — no fill happens in that
    direction (the preview rectangle never extends up or left of the active cell).
  - Eligibility enforced; ineligible cells skipped.
- Fill writes via `setAssignments` (one snapshot, one persist). Filling an empty value
  (active cell empty) clears the target range (via `clearCells`).

### 4.6 Right-click context menu
On `contextmenu` of a cell:
- If the right-clicked cell **is within** the effective selection → menu operates on the
  whole selection.
- Else → select just that cell first (`active=anchor=cell`, `rangeKeys={cell}`,
  `scatterKeys={}`), then operate on it.
- Menu items (geometric-Unicode only, `rounded-[2px]`):
  - **Set shift ▸** — submenu listing the shifts **eligible for the common set** (when
    the selection spans multiple employees, show the union; applying skips cells where
    ineligible). For a single cell, show that employee's eligible shifts.
  - **Day off** — set `shiftId:null` for all selected.
  - **Clear** (`✕`) — delete all selected.
  - **Pin** / **Unpin** (`◢`) — pin or unpin all selected (label reflects majority state).
  - **Copy** (`⧉`) — copy selection.
  - **Paste** — paste into selection. Uses a **plain text label** (no glyph), or a
    neutral non-delete glyph; the delete-like `⌫`/`✕` glyph is **never** used for Paste
    (it misreads as "delete"). `✕`/delete-style glyphs are reserved for **Clear** only.
  - **Fill down (group)** — same as fill-handle dblclick, group-bounded.
  - **Fill row** — fill the active cell's value across its row's 7 visible days.
- Positioned at the cursor; clamped to viewport. Dismiss on Esc / outside-click via
  `useDismiss`. Closes after an action runs.

### 4.7 Keyboard navigation
Scoped to when focus is within the grid (`role="grid"`):
- **Arrow Up/Down/Left/Right** → move `active` by one cell in the ordered grid; clamp at
  edges. Moving across a group boundary moves to the adjacent group's nearest row
  (groups are flattened in the ordered employee list; collapsed groups are skipped).
  Sets `anchor = active`, `rangeKeys = {active}`, clears scatter.
- **Shift+Arrow** → keep `anchor`; move `active`; `rangeKeys = rectBetween(anchor, active)`.
- **Esc** → clear selection (and close menu/popover).
- **Cmd/Ctrl+C / +V** → copy / paste (§4.4).
- **Cmd/Ctrl+Z** undo / **Cmd/Ctrl+Shift+Z** (and `Cmd/Ctrl+Y`) redo (§4.8).
- **Enter** (MANDATORY, the D1 popover affordance): pressing Enter on the active cell
  opens `CellPopover` for that cell (assign / day off / clear, exactly as today). This is
  the **single required** way to open the popover. Double-click on a cell is an OPTIONAL
  secondary path to the same popover and is not required for acceptance.
- Roving tabindex keeps the grid a single tab stop; existing `aria-label` per cell and
  `focus-visible` outline (`--sel`) preserved.

### 4.8 Undo / redo
- Store keeps `_undoStack: ScheduleDTO[]` and `_redoStack: ScheduleDTO[]`, depth-capped
  at **50** (drop oldest beyond cap).
- **Single snapshot funnel — `_pushUndoAndSet(nextSchedule)`:** a private store helper is
  the ONE place that records undo history for assignment edits. It (a) pushes the
  **current** `toScheduleDTO(schedule)` onto `_undoStack`, (b) clears `_redoStack`,
  (c) enforces the depth cap, then (d) `set({ schedule: nextSchedule })` and persists.
  **All five** assignment-mutating actions call it and only it — the existing single-cell
  `setAssignment` (used by `CellPopover`), `setAssignments`, `clearCells`, paste, and
  fill. None of them push undo state on their own; they build `nextSchedule` then hand it
  to `_pushUndoAndSet`. This guarantees uniform, single-snapshot-per-action behavior and
  makes a `CellPopover` single-cell edit undoable exactly like a batch edit (AC-31).
  (`applyProposal`/`applyRelaxation` push via the same mechanism — §"…also push a snapshot"
  below; `loadDemo`/`hydrate` reset the stacks instead.)
- `undo()` → if `_undoStack` non-empty: push current schedule DTO to `_redoStack`, pop
  `_undoStack`, hydrate `schedule` from it, persist.
- `redo()` → symmetric.
- `canUndo()/canRedo()` booleans for toolbar/menu enablement.
- **Pins are NOT part of undo** (D12): undo/redo only restores the schedule Map.
  Rationale: pins are a pre-solve lock, low-risk to leave; including them complicates the
  snapshot and the user can re-toggle trivially.
- `applyProposal` / `applyRelaxation` / `loadDemo` / `hydrate` also push a snapshot so a
  user can undo a proposal apply (D15: yes, accept-proposal is undoable; `loadDemo`/
  `hydrate` **reset** both stacks instead of pushing — a fresh document has no history).
- Snapshots are plain JSON DTOs (lossless via `toScheduleDTO`/`fromScheduleDTO`), so
  persistence is never corrupted; the persisted blob is always the live `schedule`.

---

## 5. Acceptance Criteria

> Phrased for a browser/RTL test. "Visible week" = the 7 columns shown for the current
> `boardWeekIndex`; "group" = a dept/team group of rows.

**Width / layout**
- **AC-1:** With the board mounted in a 1200px-wide container, the `<table>` width equals
  the container content width (`table-fixed w-full`); the employee column is 200px and
  each of the 7 day columns has equal width `(containerWidth − 200) / 7` (±1px rounding).
- **AC-2:** Sticky header rows and the sticky employee column still stick on scroll;
  weekend hatch, pinned `◢`, `.sf-proposed`, `.sf-viol` rendering are unchanged after the
  width refactor.

**Selection gestures**
- **AC-3:** Drag from cell (emp A, Mon) to (emp C, Wed) selects a 3×3 block; the
  selection-count chip reads "9 cells selected".
- **AC-4:** Click (emp A, Mon) then Shift+click (emp B, Tue) selects a 2×2 block (4 cells);
  chip reads "4 cells selected".
- **AC-5:** Cmd/Ctrl+click three non-adjacent cells selects exactly those 3 (scattered);
  chip reads "3 cells selected"; a 4th Cmd-click on one of them removes it → "2 cells
  selected".
- **AC-6:** Clicking a day-column header selects every visible employee's cell for that
  date; chip count equals the number of visible (non-collapsed) employees.
- **AC-7:** Clicking an employee's name (row header) selects that employee's 7 visible-week
  cells; chip reads "7 cells selected". The collapse caret still toggles the group and
  does not select.
- **AC-8:** Pressing Esc clears the selection; the chip disappears (shown only when >1
  selected).
- **AC-9:** A single left-click on a cell selects exactly that one cell and does NOT open
  the assign popover (popover opens via the D1 affordance only).
- **AC-29:** Pressing **Enter** on the active cell opens `CellPopover` for that cell, and
  assigning a shift / Day off / Clear from it works exactly as before (D1's single
  mandatory popover affordance). The existing `cellPopover.test.tsx` tests are updated to
  open the popover via this Enter affordance (instead of a bare cell click) and still
  assert: the dialog lists the employee's eligible shifts, a **Day off** option, a
  **Clear** option, the `wouldViolate` ⚠ marker, and Esc closes the popover.

**Batch ops**
- **AC-10:** With a 3×3 block selected, choosing "Clear" removes assignments for all 9
  cells in one action; a single undo (Cmd+Z) restores all 9.
- **AC-11:** With a multi-employee selection, "Set shift = E" assigns shift E to every
  selected cell where E is eligible and leaves ineligible cells unchanged (no error
  shown).
- **AC-12:** "Pin all" pins every selected cell (◢ corner appears on each); "Unpin all"
  removes them. Pin/unpin is NOT affected by undo/redo.
- **AC-32:** For an **orphan/ungrouped** employee (team = null), eligibility falls back to
  `employee.eligibleShiftIds` alone (no team intersection): `eligibleShiftIdsFor(emp, null)`
  returns `emp.eligibleShiftIds` unchanged, and a batch set-shift to one of those shifts
  succeeds for that employee's selected cells.

**Copy / paste**
- **AC-13:** Copy a 2×3 selection; `navigator.clipboard` text is a TSV of 2 rows × 3
  tab-separated columns; assigned cells show their shift `code`, empty cells `""`,
  day-off cells `OFF`.
- **AC-14:** Copy a single assigned cell, select a 3×3 block, Paste → all 9 eligible cells
  receive that shift (single-value paste-to-all); ineligible cells skipped.
- **AC-15:** Copy a 2×2 block, paste anchored at a cell with a 4×4 target → the 2×2 buffer
  tiles to fill the 4×4 (clipped to the visible week and target box).
- **AC-16:** Paste an externally-authored TSV (`E\tOFF\t\n`) maps `E`→shift E, `OFF`→day
  off, `""`→clear; an unknown code (`ZZ`) leaves its target cell untouched.
- **AC-30:** Copying a **scattered** selection produces a rectangular buffer where each
  unselected hole inside the bounding box serializes as `""`; pasting that buffer
  elsewhere reproduces the holes as **cleared** (deleted) cells (intentional).
- **AC-33:** Paste source precedence is deterministic: if `navigator.clipboard.readText()`
  resolves to a value **equal to** `lastCopiedTSV`, the **internal buffer** is used
  (exact shiftIds preserved); if it resolves to a **different** value, that value is parsed
  as TSV; if the read **rejects** (or clipboard is unavailable), the internal buffer is
  used as the fallback.

**Fill handle**
- **AC-17:** With active cell (emp in group G, Mon) = shift M, double-click the fill
  handle → every subsequent visible row **in group G** for Monday becomes M (eligible
  rows), and rows in other groups are untouched.
- **AC-18:** Drag the fill handle from the active cell down 2 rows and right 2 columns →
  fills a 3×3 rectangle with the active value, clamped to the group vertically and to the
  visible week horizontally.

**Context menu**
- **AC-19:** Right-clicking a cell inside the current selection opens a menu that operates
  on the whole selection; right-clicking a cell outside the selection first selects only
  that cell, then the menu targets it.
- **AC-20:** The context menu shows Set shift ▸, Day off, Clear, Pin/Unpin, Copy, Paste,
  Fill down (group), Fill row; it uses only geometric-Unicode glyphs (no emoji), is
  `rounded-[2px]`, and dismisses on Esc and outside-click.

**Keyboard nav**
- **AC-21:** With an active cell, ArrowRight/Down/Left/Up move the active cell by one and
  clamp at grid edges; the grid is a single tab stop (roving tabindex). The `board.test.tsx`
  keyboard test is updated to assert the roving pattern: **exactly one** gridcell has
  `tabindex=0` (the active cell) and every other gridcell has `tabindex=-1` (replacing the
  old "every gridcell tabindex !== null" assertion).
- **AC-22:** Shift+ArrowRight from the active cell extends the selection to a 1×2 range
  (chip "2 cells selected").

**Undo / redo**
- **AC-23:** After any assignment edit (single, batch, paste, fill, clear), Cmd/Ctrl+Z
  restores the prior schedule and Cmd/Ctrl+Shift+Z (or Cmd+Y) re-applies it. Undo depth is
  capped at 50.
- **AC-24:** Undo/redo never corrupts persistence: after undo, the persisted IndexedDB DTO
  round-trips losslessly (Map↔Assignment[]), and reloading shows the undone state.
- **AC-31:** A single-cell edit made through `CellPopover` (the existing `setAssignment`
  path) is undoable via Cmd/Ctrl+Z — i.e. `setAssignment` funnels through the same
  `_pushUndoAndSet` snapshot helper as the batch actions, so popover edits participate in
  undo/redo identically.

**Accessibility & regression**
- **AC-25:** `role="grid"` has `aria-multiselectable="true"`; selected cells expose
  `aria-selected="true"`; the selection-count chip is `aria-live="polite"`.
- **AC-26:** Running the solver, accepting a proposal, pin gutter, and violation outlines
  all still work after this feature lands (no regression to §"Solver flow"); accepting a
  proposal is itself undoable.
- **AC-27:** No new design tokens are introduced; `tokens.css` and `app/tokens.css` remain
  byte-identical (checksum guard passes); no `--sh-*`/`.sf-*` renamed.
- **AC-28:** Switching the visible week (week nav) or collapsing a group clears/recomputes
  the selection so no stale or off-screen cells remain selected.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Perf with ~100 employees × 7 days** (700 cells) re-rendering on every pointermove during drag. | **Decision (do not re-litigate):** track selection by index math in a ref during the drag and **commit the selection `Set` to state on an rAF-throttled basis** (one commit per animation frame), **NOT per `pointermove`**. We **accept and document** that each rAF commit triggers a full single-week (~700-cell) re-render — that is within budget for a non-virtualized single-week grid, so we do **not** add row-level memoization. (Per-cell `isSelected` is still read from a stable `Set` reference so React's reconciliation is cheap.) Single-week bounds the cost. |
| **Left-click conflict**: existing `onClick → openCell` vs new click→select. | D1: left-click now **selects**; the popover opens via a dedicated affordance (Enter on active cell, or a small caret/double-click). Remove the bare `onClick→setOpenCell`. |
| **Sticky header / col vs pointer hit-testing** for header-click column/row select and drag. | Attach select handlers to the header `<th>`s explicitly; use `data-emp`/`data-date` attributes + `elementFromPoint` (or `pointerenter` per `<td>`) so sticky stacking (`z-10/20/30`) doesn't break hit detection. |
| **Clipboard permissions / insecure context** (`navigator.clipboard` unavailable). | Internal buffer is the source of truth for in-app copy/paste; OS clipboard is best-effort. Wrap reads/writes in try/catch; fall back to the internal buffer silently (D13). |
| **Undo stack memory** (50 full DTOs). | DTOs are compact JSON (assignments array); 50 snapshots of a 2-week roster is small. Cap enforced; `loadDemo`/`hydrate` reset the stacks. |
| **Selection visuals hiding violations/proposals.** | Selection overlay layers UNDER `.sf-viol`/`.sf-proposed` outlines (z-order / outline vs background); only `--sel`/`--sel-bg` used (D9). |
| **Eligibility drift** if computed in two places. | Single pure helper `eligibleShiftIdsFor` in `selectionModel.ts`, reused by batch set, paste, fill, and context menu. |
| **Drag selecting into a collapsed group** (cells not in DOM). | Ordered employee list excludes collapsed-group rows; rect math can't address them. |

---

## 7. Decision Log

- **D1 — Left-click selects; popover via exactly one mandatory affordance: Enter.**
  *Why:* spreadsheet UX needs left-click to mean "select"; two behaviors on one gesture is
  ambiguous. *Alternatives rejected:* (a) keep left-click→popover and require modifier to
  select (unintuitive, breaks drag-select); (b) make the popover affordance "Enter and/or
  double-click, optional" (ambiguous — leaves no guaranteed way to open the popover, and
  breaks the existing `CellPopover` tests with nothing to migrate them to).
  *Resolution:* single-click **selects** (the bare `onClick→setOpenCell` is removed).
  **Exactly one MANDATORY affordance opens `CellPopover`: pressing Enter on the active
  cell.** This is guaranteed-available because roving tabindex + keyboard nav are already
  in scope (§4.2, §4.7). Double-click is an **OPTIONAL secondary** path to the same
  popover. The context menu's "Set shift ▸" covers the common batch case. The existing
  `cellPopover.test.tsx` tests are migrated to open the popover via Enter on the active
  cell (§3).

- **D2 — Selection lives in component-local view state (a hook), not the store.**
  *Why:* selection is ephemeral UI state, recomputed on week-switch/filter; it never
  persists and never touches the domain. Matches existing pattern (open-popover,
  collapse are component-local). *Alternatives rejected:* store view-state (adds churn,
  forces serialization concerns, couples to persistence). Writes still go to the store.

- **D3 — Selection math + TSV + eligibility in a pure `selectionModel.ts` helper.**
  *Why:* keeps it unit-testable and component-thin; it touches only ids/dates/codes, not
  the schedule. *Alternatives rejected:* inlining in the component (untestable, violates
  "no logic in components" spirit); putting it in `@crewdoku/domain` (it's presentation/
  view concern — column order, codes — not a scheduling rule).

- **D4 — Fill is group-bounded vertically, week-bounded horizontally, down-only on
  dblclick.** *Why:* mirrors Excel (double-click fills down to the data boundary; a group
  is our natural boundary); prevents accidentally overwriting unrelated teams.
  *Alternatives rejected:* fill across all groups (dangerous), fill up (not how Excel
  dblclick works).

- **D5 — Day-off sentinel in clipboard = `OFF`.** *Why:* shift codes are short
  alphanumerics (`N/E/M/A/L`); `OFF` is unambiguous, human-readable in pasted TSV, and
  unlikely to collide. Empty string = empty cell (no assignment). *Alternatives rejected:*
  `-`/`X`/`null` (collision/ambiguity), blank for day-off (collides with empty).

- **D6 — Two write actions: `setAssignments` (set) + `clearCells` (delete).**
  *Why:* the domain distinguishes **absent** (empty) from `shiftId:null` (explicit day
  off); a single action can't express "delete" via an Assignment object cleanly.
  *Alternatives rejected:* sentinel shiftId for delete (leaks a fake value into a typed
  field).

- **D7 — Batch pin via `setPins(keys, pinned)`.** *Why:* one `set()` over a cloned `pins`
  Set; avoids N re-renders from looping `togglePin`. *Alternatives rejected:* loop
  `togglePin` (N renders, and toggle semantics make "pin all" unreliable when states
  differ).

- **D8 — Ineligible / unknown cells are silently skipped.** *Why:* batch ops over wide
  selections will routinely hit ineligible cells; a modal/toast per skip is noise. The
  user sees which cells changed. *Alternatives rejected:* hard error (blocks the batch),
  per-cell warning (noisy). (A future "N cells skipped" inline note is allowed but not
  required.)

- **D9 — Selection visuals use only `--sel` / `--sel-bg`, layered under violation/
  proposal outlines.** *Why:* tokens are canonical and `.sf-*` must not be renamed;
  violation/proposal signals outrank selection. *Alternatives rejected:* new selection
  token (forbidden), `.sf-selected` class in `tokens.css` (would change the guarded
  checksum) — use an app-level utility/inline style instead.

- **D10 — Fill handle shown on the active cell.** *Why:* matches Excel (handle on the
  active/last cell). *Alternatives rejected:* handle on the bounding-box corner of a
  scattered selection (ambiguous for non-rectangular selections).

- **D11 — Tiling: 1×1 buffer fills entire target; multi-cell buffer tiles from the
  active cell, clipped to week + target.** *Why:* matches Sheets/Excel paste behavior and
  is predictable. *Alternatives rejected:* always paste 1:1 from top-left (breaks the
  common "fill selection with one value"); wrap into next week (out of scope, confusing).

- **D12 — Pins are NOT undoable.** *Why:* pins are a pre-solve lock, cheap to re-toggle,
  and including them complicates snapshots. *Alternatives rejected:* snapshot pins too
  (more state, marginal benefit). Stated explicitly so tests don't assert pin-undo.

- **D13 — OS clipboard is best-effort; internal buffer is authoritative for in-app
  copy/paste.** *Why:* `navigator.clipboard` may be blocked (permissions/insecure
  context); the app must still copy/paste internally. *Alternatives rejected:* hard-
  require clipboard permission (breaks offline/file:// usage; app is offline-first).

- **D14 — Switching the visible week clears the selection.** *Why:* selection is
  week-scoped (no cross-week ops); carrying keys across weeks would reference off-screen
  cells. *Alternatives rejected:* preserve by employee-only (ambiguous columns).

- **D15 — Accepting a proposal / applying a relaxation pushes an undo snapshot;
  `loadDemo`/`hydrate` reset both stacks.** *Why:* users should be able to undo a bulk
  proposal apply, but a freshly loaded document has no meaningful history. *Alternatives
  rejected:* exclude proposal-apply from undo (surprising — it's a big schedule change).
