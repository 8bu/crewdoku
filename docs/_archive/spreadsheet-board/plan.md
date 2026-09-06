# Plan — Spreadsheet-like Schedule Board UX (TDD)

Status: Draft (plan stage)
Spec: `docs/plans/spreadsheet-board/spec.md` (33 ACs, decisions D1–D15)
Architecture rules: `/Users/8bu/Projects/shiftforge/CLAUDE.md`

---

## How to read this plan

Every step is **strict TDD**: write the **failing test first** (file + assertion),
then the **minimal** implementation to green, then a refactor note if any. Steps are
ordered so the app stays green between steps; foundational + lowest-risk work lands
first. Each step lists the ACs it satisfies.

**Test infra facts (verified against the repo):**
- Vitest, jsdom, RTL. Single setup file `app/src/test/setup.ts` (jest-dom + `cleanup`).
  No `globals: true` — import `{ describe, it, expect, vi, beforeEach, afterEach }`
  from `vitest` explicitly.
- Store tests drive the vanilla store directly (`createStore().getState()…`) — no DOM.
  See `app/src/store/__tests__/store.test.ts`. New store-action tests follow this.
- Component tests use `render(<Board store={s} />)`; popover tests wrap in
  `<I18nProvider>` (see `cellPopover.test.tsx`). Interactions use `fireEvent` and
  `act`. There is **no** `@testing-library/user-event` in the suite today — keep using
  `fireEvent` for determinism.
- `keyOf(employeeId, date)` from `@crewdoku/domain` is the canonical cell key; reuse it,
  never string-split.
- Domain schedule is a `Map`; DTO is `Assignment[]` (`toScheduleDTO`/`fromScheduleDTO`,
  lossless). Existing actions clone via `fromScheduleDTO(toScheduleDTO(...))`.

**New test-infra needs (introduced where first used, noted at the step):**
- **rAF mock/flush** (Phase D drag-select commit): `vi.stubGlobal('requestAnimationFrame', cb => { cb(0); return 0 })` (synchronous flush) in the test, or a manual queue you flush. jsdom has no real rAF loop.
- **Pointer events** (Phase D/H): jsdom does not implement `PointerEvent` geometry or `elementFromPoint`. Drive selection via **`pointerdown`/`pointerenter`/`pointerup`** `fireEvent`s dispatched on the target `<td>`s directly (the implementation must key off `pointerenter` per-cell + `data-emp`/`data-date` attrs, NOT `elementFromPoint`, so it is testable). This is a hard design constraint surfaced by the spec's "pointerenter per cell" alternative — choose it.
- **Clipboard mock** (Phase G): `vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn().mockResolvedValue(tsv) } })` or `Object.defineProperty(navigator, 'clipboard', …)`. Cover resolve-equal, resolve-different, reject branches per AC-33.

**Cross-cutting guard:** after every phase run `pnpm --filter @crewdoku/app test` and
`pnpm lint` (tsc --noEmit). The tokens checksum guard (AC-27) must stay green — **no new
tokens, no `.sf-*`/`--sh-*` renames** at any step.

---

## Phase A — store foundations (undo/redo + batch write actions)

Pure store logic, tested by driving the vanilla store directly (no DOM). Lands first
because every later write action funnels through `_pushUndoAndSet`.

**Source touched:** `app/src/store/store.ts`
**Tests added:** `app/src/store/__tests__/storeUndo.test.ts` (new),
extend `app/src/store/__tests__/store.test.ts`

### A1 — `_pushUndoAndSet` funnel + `setAssignment` routed through it; single-edit undo
- **Test (new `storeUndo.test.ts`):** `loadDemo()`; `setAssignment({emp,date,shiftId})`;
  assert cell value changed. Then add `undo()` to the interface and assert: after
  `undo()` the cell reverts to its pre-edit value; `canUndo()` is `false` again at base.
  Also assert `_undoStack.length` grew by exactly 1 after the single `setAssignment`
  (introspect via `s.getState()._undoStack`). **(AC-31, AC-23)**
- **Impl:** add `_undoStack: ScheduleDTO[]`, `_redoStack: ScheduleDTO[]`,
  `canUndo()/canRedo()`, `undo()`, `redo()` to `AppStore` + initial state `[]`/`[]`.
  Add private `_pushUndoAndSet(next: Schedule)`: push `toScheduleDTO(get().schedule)` to
  `_undoStack`, clear `_redoStack`, enforce cap 50 (drop oldest), `set({schedule: next, _undoStack, _redoStack})`, `void get().persist()`. Rewrite `setAssignment` to build
  `next` then call `_pushUndoAndSet(next)` (remove its inline `set`+persist).
- **Refactor note:** `_pushUndoAndSet` is the ONE history-recording site. Keep it private
  (prefix `_`); it is exposed on the store object only because zustand actions live there.

### A2 — `undo()`/`redo()` round-trip + redo cleared on new edit
- **Test:** edit A→B; `undo()` (back to A); `redo()` (forward to B); assert each.
  Then: edit A→B, `undo()`, make a NEW edit A→C, assert `canRedo()===false` (redo stack
  cleared by `_pushUndoAndSet`). **(AC-23)**
- **Impl:** `undo()`: if `_undoStack` non-empty, push current DTO to `_redoStack`, pop
  `_undoStack`, `set({schedule: fromScheduleDTO(popped)})`, persist. `redo()` symmetric.
  (Cap not enforced on redo growth beyond mirroring; undo cap already bounds it.)

### A3 — undo depth cap = 50 (drop oldest)
- **Test:** perform 60 distinct `setAssignment` edits; assert `_undoStack.length === 50`;
  assert the **oldest reachable** state after 50 undos is edit #11's prior state (i.e.
  states 1–10 were dropped) — practically: after 50 `undo()` calls `canUndo()===false`
  and the schedule equals the state right before edit #11. **(AC-23)**
- **Impl:** in `_pushUndoAndSet`, after push, `if (_undoStack.length > 50) _undoStack = _undoStack.slice(-50)`.

### A4 — `setAssignments(assignments[])` batch (one snapshot, one persist)
- **Test:** select 3 cells worth of assignments; `setAssignments([a1,a2,a3])`; assert all
  three written; assert `_undoStack` grew by exactly **1** (one snapshot for the batch);
  one `undo()` reverts all three. **(AC-10, AC-23)**
- **Impl:** add `setAssignments(assignments: Assignment[])`: clone schedule once, loop
  `domainSetAssignment(next, a)`, `_pushUndoAndSet(next)`.

### A5 — `clearCells(keys[])` batch delete (absent vs null distinction)
- **Test:** assign two cells; `clearCells([{employeeId,date},…])`; assert both are now
  **absent** from the Map (`.has(keyOf(...))===false`), NOT `shiftId:null`. One snapshot;
  one undo restores both. **(AC-10, D6)**
- **Impl:** add `clearCells(keys: Array<{employeeId:string; date:ISODate}>)`: clone, loop
  `removeAssignment(next, employeeId, date)`, `_pushUndoAndSet(next)`. Import
  `removeAssignment as domainRemoveAssignment` from domain.

### A6 — `setPins(keys[], pinned)` batch pin (NOT snapshotted)
- **Test:** `setPins([k1,k2], true)` → both in `pins`; `setPins([k1], false)` → only k2
  remains. Assert `_undoStack.length` is **unchanged** by `setPins` (pins not undoable,
  D12) — i.e. a prior `setAssignment` snapshot count is not incremented. **(AC-12, D7, D12)**
- **Impl:** add `setPins(keys: string[], pinned: boolean)`: clone `pins` Set, add/delete
  each key by `pinned`, single `set({pins})`. No undo push. (Persist optional — pins are
  not part of the persisted schedule DTO; match existing `togglePin` which does not
  persist.)

### A7 — proposal-apply / relaxation push a snapshot; loadDemo/hydrate RESET stacks
- **Test (extend `solve.test.ts` or `storeUndo.test.ts`):**
  (a) After `applyProposal([keys])` with a stubbed proposal in state, `canUndo()` is true
  and `undo()` restores the pre-apply schedule. **(AC-26, D15)**
  (b) After `loadDemo()`, both stacks are empty (`canUndo()===false && canRedo()===false`)
  even if edits happened before. (c) `hydrate()`/`hydrateFromDTO()` likewise reset.
- **Impl:** route `applyProposal`'s final write through `_pushUndoAndSet(next)` (instead of
  inline `set({schedule:next})`); keep the `proposal:null, solverPhase:'idle'` set
  alongside (pass extra fields or set them in the same call — implement `_pushUndoAndSet`
  to accept an optional `extra` patch object merged into the `set`). `applyRelaxation`
  re-runs `solve` (no direct write — unaffected). In `loadDemo`, `hydrate`,
  `hydrateFromDTO`: add `_undoStack: [], _redoStack: []` to their `set(...)`.
- **Refactor note:** give `_pushUndoAndSet(next, extra?)` an optional second arg so
  `applyProposal` can clear `proposal`/`solverPhase` in the same atomic `set`.

---

## Phase B — pure selection helper `selectionModel.ts`

Pure module: ids/dates/codes only, no React/store/schedule. Fully unit-tested in jsdom
(works in node too). Lands before any DOM wiring so rectangle/eligibility/TSV math is
proven independently.

**Source added:** `app/src/features/board/selectionModel.ts`
**Tests added:** `app/src/features/board/__tests__/selectionModel.test.ts`

### B1 — `cellKey` / `Cell` type re-exports `keyOf`
- **Test:** `cellKey({employeeId:'e1', date:'2026-06-15'}) === 'e1|2026-06-15'`.
- **Impl:** `export interface Cell { employeeId: string; date: ISODate }`;
  `export const cellKey = (c: Cell) => keyOf(c.employeeId, c.date)`.

### B2 — `rectBetween(anchor, focus, orderedEmployees, orderedDates)` → Cell[]
- **Test:** given `orderedEmployees=['A','B','C']`, `orderedDates=[d0..d6]`,
  `rectBetween({A,d0},{C,d2},…)` returns 9 cells (all emp A–C × d0–d2). Order-independent:
  `rectBetween({C,d2},{A,d0})` returns the same set. A focus row/date **not** in the
  ordered lists is ignored gracefully (clamped / empty). **(AC-3, AC-4, AC-21, AC-22)**
- **Impl:** map anchor/focus to indices in each ordered list; take min/max; emit the
  index rectangle as `Cell[]`. Operates on indices only — never string-splits keys.

### B3 — `columnCells(date, orderedEmployees)` and `rowCells(employeeId, orderedDates)`
- **Test:** `columnCells(d, ['A','B','C'])` → 3 cells (one per emp, that date);
  `rowCells('A', [d0..d6])` → 7 cells. **(AC-6, AC-7)**
- **Impl:** trivial maps.

### B4 — `eligibleShiftIdsFor(emp, team | null)` (orphan fallback)
- **Test:** with `emp.eligibleShiftIds=[s1,s2,s3]`, `team.shiftIds=[s2,s3,s4]` →
  returns `[s2,s3]` (intersection, order from emp). With `team===null` → returns
  `[s1,s2,s3]` unchanged. **(AC-11, AC-32)**
- **Impl:** `team === null ? emp.eligibleShiftIds : emp.eligibleShiftIds.filter(id => team.shiftIds.includes(id))`. This is the SINGLE eligibility authority reused by batch
  set / paste / fill / context menu.

### B5 — TSV `serializeSelection(grid)` (OFF sentinel, "" empty)
- **Test:** given a 2×3 buffer of values (`shiftId | null | undefined`) and a
  `codeOf(shiftId)` map, `serializeSelection` → `"M\tE\t\nOFF\t\tA\n"`-style string:
  assigned → code, `null` → `OFF`, `undefined` → `""`; rows `\n`, cols `\t`. **(AC-13)**
- **Impl:** map each cell value→`code`/`OFF`/`""`, `join('\t')` per row, `join('\n')`.

### B6 — TSV `parseTSV(text)` → 2-D string[][] (raw codes)
- **Test:** `parseTSV("E\tOFF\t\n")` → `[['E','OFF','']]` (trailing empty preserved as
  clear). Multiple rows split on `\n`. **(AC-16)**
- **Impl:** split on `\n` (drop a single trailing newline), split each row on `\t`.

### B7 — code→shiftId mapping with OFF/empty/unknown semantics
- **Test:** `mapCodeCell('E', codeMap)` → `{kind:'set', shiftId}`;
  `'OFF'` → `{kind:'dayoff'}`; `''` → `{kind:'clear'}`; `'ZZ'` (unknown) → `{kind:'skip'}`.
  **(AC-16, D8)**
- **Impl:** small discriminated-union mapper using a `Map<code, shiftId>`.

### B8 — paste tiling rule (1×1 vs multi-cell; clip to target box + week)
- **Test:** `tilePaste(buffer1x1, targetBox)` → fills entire target with that value.
  `tilePaste(buffer2x2, targetBox4x4)` → tiles 2×2 across 4×4 (modulo indexing).
  Clipping: `tilePaste(buffer2x2, target1x1)` → only top-left cell of buffer.
  Returns a list of `{row,col, value}` relative writes. **(AC-14, AC-15, D11)**
- **Impl:** if buffer is 1×1 → every target cell = buffer[0][0]. Else for each target
  offset `(r,c)` within the bounding box, `value = buffer[r % rows][c % cols]`; clip to
  box height/width (caller maps box back to in-week cells, dropping out-of-week).

### B9 — scattered-copy bounding box with holes serialize as ""
- **Test:** scattered selection `{A,d0},{C,d2}` (2 cells, not a full rect). The
  bounding-box buffer is 3×3 where only the two corners carry values and the 7 holes
  serialize as `""` → on parse/paste they are **clears**. Assert the produced buffer
  marks holes as clear (not "skip"). **(AC-30)**
- **Impl:** `boundingBufferFor(selectionKeys, valueAt)`: compute min/max row/col over the
  selection; for each box cell, value if in selection else the explicit **clear** marker.

---

## Phase C — full-width table layout

Lowest-risk visual change; lands before interactions so the grid geometry is stable.

**Source touched:** `app/src/features/board/Board.tsx`
**Tests added/modified:** `app/src/features/board/__tests__/board.test.tsx`

### C1 — `table-fixed w-full` + `<colgroup>` (200px employee, 7 even days)
- **Test (board.test.tsx, new case):** render `<Board>` (demo loaded); query the
  `<table>` (`getByRole('grid')`); assert `className` contains `table-fixed` and
  `w-full`. Assert a `<colgroup>` exists with 8 `<col>`s; the first `<col>` has
  `style.width === '200px'`; each of the other 7 has width
  `calc((100% - 200px) / 7)`. (jsdom does not compute layout, so assert the **declared**
  styles/classes, not pixel widths — AC-1's pixel math is a deep-test concern, see Phase J.)
  **(AC-1)**
- **Impl:** add `table-fixed w-full` to the table className (remove natural-width
  reliance); render a `<colgroup>` with the 8 `<col>`s using inline `width` styles tied to
  `cols.length` (still 7). Keep `border-collapse`.

### C2 — sticky + density + status rendering preserved
- **Test:** assert the employee `<th>` retains `sticky left-0` and the day header retains
  `sticky` + `top: var(--row-h)`; re-run the existing `.sf-viol` test (unchanged) to prove
  violation rendering survives; assert weekend hatch style still applied on a weekend
  empty cell. **(AC-2)**
- **Impl:** keep all sticky classes; the layout change is additive. No new tokens.
- **Refactor note:** the per-cell `minWidth: 86` inline style can stay (harmless under
  `table-fixed`) or be dropped; if dropped, the existing tests referencing 86 don't assert
  it, so it's safe. Prefer dropping to avoid confusion.

---

## Phase D — selection interactions in Board (`useBoardSelection` hook)

The biggest phase. Introduces the hook holding view-state + gesture reducers, wires
pointer/keyboard handlers, the roving tabindex, and the selection chip. **This is where
the existing `board.test.tsx` keyboard test MUST change** (roving tabindex) and where
**bare left-click stops opening the popover** (so the `cellPopover.test.tsx` migration in
Phase E is unblocked — but do Phase E in the same PR/sequence to keep popover tests green).

> IMPORTANT ordering: D1 below removes `onClick→setOpenCell`. That will RED the existing
> `cellPopover.test.tsx` (which opens via bare click). To keep the suite green between
> steps, **land D-selection + E-popover-migration as one contiguous block** (the spec
> explicitly couples them via D1). Sequence the commits D1→D…→E so the final commit of the
> block restores green; if your workflow needs each commit green, migrate
> `cellPopover.test.tsx` to Enter (Phase E, step E1) **immediately after** D1's wiring step
> within the same working session.

**Source added:** `app/src/features/board/useBoardSelection.ts`,
`app/src/features/board/SelectionChip.tsx`
**Source touched:** `app/src/features/board/Board.tsx`,
`app/src/features/board/BoardSurface.tsx`
**Tests added/modified:** `app/src/features/board/__tests__/useBoardSelection.test.tsx`
(new), `board.test.tsx` (keyboard test rewrite), `selectionChip` assertions.

### D1 — left-click selects exactly one cell; no popover on bare click
- **Test (board.test.tsx, new):** render; `fireEvent.click(cellA)`; assert
  `cellA` has `aria-selected="true"` and NO `role="dialog"` appears (popover not opened).
  **(AC-9)**
- **Impl:** create `useBoardSelection(orderedEmployees, orderedDates)` returning
  `{ selectionKeys, active, isSelected(key), onCellPointerDown, onCellPointerEnter,
  onPointerUp, onCellKeyDown, onHeaderColClick, onHeaderRowClick, clear, … }`. In Board,
  call the hook; replace `onClick={() => onCellClick(...)}` with
  `onPointerDown={() => sel.onCellPointerDown(cell)}`. Set `aria-selected` from
  `sel.isSelected(key)`. **Remove** the `onCellClick→setOpenCell` bare-click wiring (keep
  `openCell` state for Enter in Phase E). Add `aria-multiselectable="true"` to the grid
  here (or D-accessibility step). Single click → `active=anchor=cell`,
  `rangeKeys={cell}`, `scatter={}`.

### D2 — drag-rectangle select (pointerdown → pointerenter → pointerup), rAF-committed
- **Test (board.test.tsx, new):** stub rAF to flush synchronously. `pointerdown` on
  (A,Mon); `pointerenter` on (B,Tue); `pointerenter` on (C,Wed); `pointerup`. Assert 9
  cells `aria-selected`; chip reads "9 cells selected". **(AC-3)**
- **Impl:** on `pointerdown` set `anchor=active=cell`, mark dragging (ref). On
  `pointerenter` while dragging, schedule an rAF that commits
  `rangeKeys = new Set(rectBetween(anchor, enterCell, orderedEmployees, orderedDates).map(cellKey))` and `active=enterCell`. On `pointerup` (document-level) clear dragging.
  Track during-drag focus index in a **ref**; commit the `Set` once per frame (spec Risk:
  rAF-throttled, accept full-week re-render). `data-emp`/`data-date` attrs on each `<td>`
  for hit identity (no `elementFromPoint`).
- **Refactor note:** per-cell `isSelected` reads a **stable** `Set` ref so reconciliation
  stays cheap (spec Risk note). Do not allocate a new Set per cell.

### D3 — shift-click extends from anchor
- **Test:** `click (A,Mon)`; `fireEvent.click(cellB_Tue, {shiftKey:true})`; assert 4 cells
  selected (2×2); chip "4 cells selected". **(AC-4)**
- **Impl:** in the cell pointer/click handler, if `shiftKey` and `anchor` exists → keep
  anchor, `active=clicked`, `rangeKeys=rect(anchor,active)`. (Use a `click` handler that
  reads modifier keys, or branch inside pointerdown on `e.shiftKey`.)

### D4 — cmd/ctrl-click toggles scattered cells
- **Test:** cmd-click 3 non-adjacent cells (`fireEvent.click(cell,{metaKey:true})` and
  `{ctrlKey:true}`) → exactly those 3 selected, chip "3 cells selected"; a 4th cmd-click on
  one removes it → "2 cells selected". Assert `active`/`anchor` move to the clicked cell.
  **(AC-5)**
- **Impl:** if `metaKey||ctrlKey` → toggle key in `scatterKeys`; `active=anchor=clicked`;
  leave `rangeKeys` as-is. `selectionKeys = rangeKeys ∪ scatterKeys`.

### D5 — header column-click & row-click selection
- **Test:** click a day-column header `<th>` → every visible employee's cell for that date
  selected; chip count === number of visible employees. Click an employee name (row header)
  → that emp's 7 cells selected, chip "7 cells selected"; clicking the **collapse caret**
  still toggles the group and does NOT select. **(AC-6, AC-7)**
- **Impl:** add `onClick={() => sel.onHeaderColClick(date)}` on each day `<th>` (uses
  `columnCells`). Wrap the employee name text in a clickable span (separate from the
  caret button) → `sel.onHeaderRowClick(emp.id)` (uses `rowCells`). The group caret stays
  its own `<button>` with `stopPropagation` so it never selects.
- **Refactor note:** the name span needs its own click target distinct from the caret; the
  group header caret is on the group `<th>`, while per-employee name is the row `<th>` — so
  row-click lives on the row header, column-click on the day header. No overlap.

### D6 — Esc clears selection (and closes menu/popover)
- **Test:** select a block; `fireEvent.keyDown(grid,{key:'Escape'})`; assert no cell
  `aria-selected`; chip gone. **(AC-8)**
- **Impl:** grid-level `onKeyDown` Escape → `sel.clear()` (active/anchor null, both sets
  empty) + close popover/menu.

### D7 — roving tabindex + arrow navigation (REWRITE existing keyboard test)
- **Test (MODIFY `board.test.tsx` "cells are keyboard-operable"):** replace the old
  assertion (`every gridcell tabindex !== null`) with the **roving** assertion:
  **exactly one** gridcell has `tabindex==='0'` (the active cell) and **all others**
  `tabindex==='-1'`. Then: focus grid, `fireEvent.keyDown(activeCell,{key:'ArrowRight'})`
  → active moves one cell right; `ArrowDown`/`Left`/`Up` move and **clamp** at edges.
  **(AC-21)**
- **Impl:** default `active` = first visible cell (or null until first interaction; pick
  null and have the grid's first cell be tabindex 0 when `active===null` so there is always
  exactly one tab stop). `tabIndex = isActive ? 0 : -1`. Arrow keys move `active` by index
  in ordered lists, clamped; set `anchor=active`, `rangeKeys={active}`, clear scatter.
  Move DOM focus to the new active `<td>` (ref or `document.querySelector` by data attrs).
- **Risk note:** "always exactly one tabindex=0" requires a deterministic default-active
  cell even before any click. Implement: `effectiveActive = active ?? firstVisibleCell`.

### D8 — shift+arrow extends selection
- **Test:** active at (A,Mon); `keyDown(active,{key:'ArrowRight', shiftKey:true})` → 1×2
  range; chip "2 cells selected". **(AC-22)**
- **Impl:** shift+arrow keeps `anchor`, moves `active`, `rangeKeys=rect(anchor,active)`.

### D9 — selection-count chip (aria-live) in BoardSurface
- **Test (new `selectionChip` assertions, can live in board.test.tsx or a dedicated
  file):** the chip renders only when **>1** selected (AC-8 says it disappears on clear;
  AC for single-cell — show when >1), reads "N cells selected", has
  `aria-live="polite"`, and a clear button that clears the selection. **(AC-8, AC-25,
  chip ACs)**
- **Impl:** `SelectionChip.tsx` (props: `count`, `onClear`). Mount in `BoardSurface` near
  `StatusLegend`. Selection count must be reachable from `BoardSurface` — lift the selection
  hook to `BoardSurface` OR expose count via a small context/callback. **Decision:** keep
  the hook in `Board` and have `Board` render the chip itself near the grid top, OR lift the
  hook into `BoardSurface` and pass `sel` down to `Board`. **Choose: lift `useBoardSelection`
  into `BoardSurface`** so the chip and keyboard/clipboard listener scope (Phase G/I) share
  one selection instance; pass `sel` as a prop to `Board`. (See Assumption A2 in the report.)
- **Refactor note:** lifting the hook to `BoardSurface` means `Board` receives ordered
  employees/dates-dependent handlers — but ordered lists are computed in `Board` from
  groups/collapse/week. Resolve by computing `orderedEmployees`/`orderedDates` in a small
  shared helper used by both, OR have `Board` compute them and pass UP via a callback the
  first render. **Simpler:** keep the hook in `Board`, and render `SelectionChip` inside the
  Board container (top bar of the grid scroll area) reading `sel.selectionKeys.size`. This
  avoids the lift entirely. **Adopt this** unless Phase G/I forces the lift; revisit at G.

### D10 — accessibility wiring (grid multiselectable, aria-selected)
- **Test:** assert `role="grid"` has `aria-multiselectable="true"`; selected cells expose
  `aria-selected="true"`; (chip aria-live covered in D9). **(AC-25)**
- **Impl:** add `aria-multiselectable="true"` to the table; `aria-selected` per `<td>`.

### D11 — week-switch / collapse clears selection
- **Test:** select a block; `act(() => s.getState().setBoardWeekIndex(1))`; assert
  selection cleared (no `aria-selected`, chip gone). Collapse a group that contains
  selected cells → selection recomputed so no stale/off-screen keys remain selected.
  **(AC-28, D14)**
- **Impl:** in `useBoardSelection`, `useEffect` keyed on `weekIndex` and the
  ordered-employees identity (changes on collapse/filter) → `clear()` (or prune selection
  to still-visible keys; spec says clears on week-switch (D14), prune on collapse —
  simplest: clear on either; AC-28 allows "clears/recomputes").

---

## Phase E — D1 reconciliation: Enter opens CellPopover

Restores the popover via the single mandatory affordance (Enter) and migrates the 4 existing
popover tests. Land **immediately after D1** (see Phase D ordering note) to keep the suite
green.

**Source touched:** `app/src/features/board/Board.tsx` (Enter handler)
**Tests modified:** `app/src/features/board/__tests__/cellPopover.test.tsx`

### E1 — Enter on active cell opens CellPopover; migrate popover tests
- **Test (MODIFY all 4 cases in `cellPopover.test.tsx`):** replace each
  `fireEvent.click(cell)` that opens the popover with: first select the cell
  (`fireEvent.pointerDown(cell)` or `click`), then `fireEvent.keyDown(cell,{key:'Enter'})`.
  The behavioral assertions (eligible shifts listed, **Day off**, **Clear**, Esc closes,
  `wouldViolate` ⚠ present) are **unchanged**. **(AC-29)**
- **Impl:** in Board's cell `onKeyDown`, on `Enter` set `openCell = active`. Keep the
  existing `<CellPopover>` render gated on `openCell`. (Optional secondary: `onDoubleClick`
  → open popover — not required for acceptance; add only if trivial.)
- **Refactor note:** popover writes still go through `setAssignment` (now undoable via A1).
  No CellPopover code change needed beyond it already using `setAssignment`.

---

## Phase F — batch ops + context menu

Right-click menu component wired to the Phase A batch actions over the Phase D selection,
using the Phase B eligibility helper.

**Source added:** `app/src/features/board/CellContextMenu.tsx`
**Source touched:** `app/src/features/board/Board.tsx`
**Tests added:** `app/src/features/board/__tests__/cellContextMenu.test.tsx`

### F1 — batch Clear over selection (via clearCells)
- **Test:** select 3×3; open context menu (`fireEvent.contextMenu(cellInside)`); click
  "Clear"; assert all 9 cells absent from schedule; one `undo()` restores all 9. **(AC-10)**
- **Impl:** `CellContextMenu` lists items; "Clear" calls
  `store.getState().clearCells([...selection cells])`, then closes.

### F2 — context menu target resolution (inside vs outside selection)
- **Test:** with a selection active, `contextMenu` a cell **inside** → menu acts on whole
  selection (Clear empties all selected). Then `contextMenu` a cell **outside** → that
  cell becomes the sole selection first, and Clear empties only it. **(AC-19)**
- **Impl:** on `contextmenu`: if the cell key ∈ selectionKeys → keep selection; else
  `sel.selectOnly(cell)` then open. Pass the effective target set to the menu.

### F3 — Set-shift submenu (eligible only, ineligible skipped)
- **Test:** multi-employee selection; open menu → "Set shift ▸" submenu lists shifts;
  choose shift E → every selected cell where E is eligible (`eligibleShiftIdsFor`) gets E;
  ineligible cells unchanged; no error/toast. **(AC-11, AC-32)** Include an orphan
  (team=null) employee in the selection and assert a shift from its `eligibleShiftIds`
  applies. **(AC-32)**
- **Impl:** build the union of eligible shifts across selected employees (via
  `eligibleShiftIdsFor(emp, teamOf(emp))`, team resolved from `emp.teamId` or null).
  Clicking a shift builds `Assignment[]` filtered per-cell by eligibility → `setAssignments`.

### F4 — Day off / Pin / Unpin / Copy / Paste / Fill items present + glyphs + dismiss
- **Test:** open menu; assert items present: Set shift ▸, Day off, Clear (`✕`),
  Pin/Unpin (`◢`, label reflects majority), Copy (`⧉`), Paste (plain label, **no** `✕`/`⌫`),
  Fill down (group), Fill row. Assert container `className` includes `rounded-[2px]`, no
  emoji (geometric Unicode only). `fireEvent.keyDown(document,{key:'Escape'})` dismisses;
  outside-click dismisses (reuse `useDismiss`). **(AC-12, AC-20)**
- **Impl:** render the items with geometric glyphs; "Day off" → `setAssignments` of
  `shiftId:null` for all selected; "Pin all"/"Unpin all" → `setPins(keys, true/false)`
  (label by majority pinned state); Copy/Paste/Fill wired in later phases (G/H) — stub the
  handlers now to call the (to-be-added) hook methods, or gate those items until G/H. To
  keep tests green, render the items but wire Copy/Paste/Fill in G/H; assert only presence +
  glyphs + dismiss here.

### F5 — Pin all / Unpin all not affected by undo
- **Test:** pin a selection; `undo()` after a prior assignment edit does NOT unpin; pins
  persist across undo/redo. **(AC-12, D12)**
- **Impl:** already satisfied by A6 (`setPins` not snapshotted) — this test asserts the
  integration.

### F6 — Fill down (group) / Fill row menu actions
- **Test:** "Fill row" → active cell's value across its 7 visible days (eligible). "Fill
  down (group)" → same as fill-handle dblclick (covered in Phase H; here assert the menu
  item triggers the same code path). **(AC-17 partial, AC-20)**
- **Impl:** call the shared fill helpers (defined in Phase H) — sequence F6 after H if you
  prefer; or implement the fill helpers as pure planners in `selectionModel.ts` now and wire
  both menu + handle to them. **Decision:** put fill **planning** (which cells, clamped) in
  `selectionModel.ts` (pure, testable) and have both menu and handle call it → write via
  `setAssignments`/`clearCells`. Add the pure planner test in Phase H (H0 below) and have F6
  depend on it. Reorder: do H0 (pure planner) before F6 if needed.

---

## Phase G — copy / paste

**Source touched:** `app/src/features/board/useBoardSelection.ts` (buffer +
`lastCopiedTSV` + copy/paste methods), `app/src/features/board/Board.tsx` /
`BoardSurface.tsx` (Cmd/Ctrl+C/V key listener)
**Tests added:** `app/src/features/board/__tests__/clipboard.test.tsx`

> Decision revisited from D9: copy/paste + undo keybindings (G/I) live at the surface that
> owns the keyboard listener. To keep ONE selection instance shared by the grid, the chip,
> the menu, and the key listener, **lift `useBoardSelection` to `BoardSurface`** now (the
> D9 "simpler" option is abandoned here). `Board` receives `sel` as a prop;
> `orderedEmployees/orderedDates` are computed by a shared pure helper
> (`orderedVisible(employees, teams, deptFilter, collapsed, weekDates)`) used by both
> `BoardSurface` (to build `sel`) and `Board` (to render). Add that helper + a small test
> when performing the lift. **This is a refactor checkpoint — keep all prior tests green.**

### G0 — lift selection to BoardSurface (refactor, no behavior change)
- **Test:** existing Phase C/D/E/F tests still pass when `Board` is rendered via
  `BoardSurface` wiring; add `orderedVisible` pure test (collapsed groups excluded; dept
  filter applied; week dates used). **(no new AC; enables AC-13..16, AC-30, AC-33)**
- **Impl:** extract `orderedVisible(...)` pure helper (in `selectionModel.ts` or a new
  `boardOrder.ts`). Move `useBoardSelection(...)` call up to `BoardSurface`; pass `sel`
  down. Board tests that render `<Board store={s}/>` directly must now also pass a `sel`
  prop — provide a default (Board creates its own hook if `sel` undefined) to avoid
  breaking direct-Board tests, OR update those tests to render via `BoardSurface`.
  **Decision:** give `Board` an optional `sel?` prop; if absent it builds its own hook
  (keeps direct-Board render tests working). `BoardSurface` always passes one.

### G1 — Copy writes internal buffer + OS clipboard TSV + lastCopiedTSV
- **Test:** mock `navigator.clipboard.writeText` (resolved). Select a 2×3 block;
  `fireEvent.keyDown(grid,{key:'c', metaKey:true})` (and ctrl variant). Assert
  `writeText` called with a TSV of 2 rows × 3 tab-cols; assigned cells show `code`, empty
  `""`, day-off `OFF`. Assert `sel.lastCopiedTSV` equals that string and `sel.buffer` is a
  2×3 array. **(AC-13)**
- **Impl:** copy method builds the bounding buffer (B9) from selection + schedule values,
  serializes (B5), `await navigator.clipboard.writeText(tsv)` in try/catch, set
  `buffer`/`lastCopiedTSV`. On write failure keep buffer + still set `lastCopiedTSV` to the
  attempted string (D13).

### G2 — Paste single-value buffer → fill entire target (eligibility skip)
- **Test:** copy a single assigned cell (1×1 buffer); select a 3×3 block; paste
  (`keyDown V`); assert all 9 **eligible** cells get that shift; ineligible cells unchanged.
  Mock `readText` to resolve to `lastCopiedTSV` so the internal buffer is used. **(AC-14)**
- **Impl:** paste method: `readText()` → branch (B-precedence, see G5). For internal
  buffer, tile (B8) over the target box; per set-cell filter by `eligibleShiftIdsFor`; build
  `Assignment[]` for sets + `keys[]` for clears → `setAssignments` + `clearCells`
  (one snapshot each, or combine into a single snapshot — prefer a single combined write to
  keep undo atomic: extend `setAssignments` to also accept clears, OR call
  `_pushUndoAndSet` once after building both; **Decision:** add an internal combined apply
  by snapshotting once — implement paste to build the full `next` schedule and call a store
  method `applyCellWrites({sets, clears})` that funnels one `_pushUndoAndSet`). Add that
  store method + test in A-phase follow-up if needed; otherwise accept two snapshots and
  document that paste-undo may take two undos (NOT desired). **Adopt `applyCellWrites`** —
  add it in G (small store addition with its own test).

### G2b — store `applyCellWrites({sets, clears})` single-snapshot (supporting action)
- **Test (storeUndo.test.ts):** `applyCellWrites({sets:[a1], clears:[k2]})` → a1 written,
  k2 cleared, `_undoStack` grew by exactly 1; one undo reverts both. **(AC-23)**
- **Impl:** clone once, apply sets via `domainSetAssignment`, clears via
  `domainRemoveAssignment`, `_pushUndoAndSet(next)`. Paste/fill use this.

### G3 — Paste multi-cell buffer tiles to fill larger target (clipped)
- **Test:** copy 2×2; paste anchored at a cell with a 4×4 target → 2×2 tiles to fill 4×4,
  clipped to visible week + target box. **(AC-15)**
- **Impl:** uses B8 tiling + clipping to in-week cells.

### G4 — Paste external TSV (code map, OFF, "", unknown skip)
- **Test:** mock `readText` to resolve `"E\tOFF\t\n"` (≠ lastCopiedTSV). Paste into a
  matching target → `E`→shift E, `OFF`→day off, `""`→clear, unknown `ZZ`→target untouched.
  **(AC-16)**
- **Impl:** parse (B6) + map (B7) the resolved text; apply per `mapCodeCell` kind.

### G5 — paste source precedence (resolve-equal / resolve-diff / reject)
- **Test:** three cases. (a) `readText` resolves `=== lastCopiedTSV` AND buffer exists →
  internal buffer used (assert exact shiftId preserved even if codes collide). (b)
  `readText` resolves to a DIFFERENT string → that string parsed as TSV. (c) `readText`
  **rejects** (or `navigator.clipboard` undefined) → fall back to internal buffer; if no
  buffer either → no-op (schedule unchanged, `_undoStack` not grown). **(AC-33, AC-30
  source path, D13)**
- **Impl:** the branch in the paste method exactly as spec §4.4: `try { text = await
  readText() } catch { text = null }`. If `text === lastCopiedTSV && buffer` → buffer; else
  if `text != null` → parse TSV; else (`text==null`) → buffer ?? no-op.

### G6 — scattered copy holes paste as clears
- **Test:** scattered selection (2 cells in a 3×3 box); copy; paste elsewhere → the 7 holes
  become **cleared** (deleted) cells, the 2 corners carry values. **(AC-30)**
- **Impl:** satisfied by B9 bounding buffer (holes = clear) + paste applying clears.

---

## Phase H — fill handle

**Source added:** `app/src/features/board/FillHandle.tsx` (or inline on the active `<td>`)
**Source touched:** `app/src/features/board/Board.tsx`,
`app/src/features/board/selectionModel.ts` (pure fill planner)
**Tests added:** `app/src/features/board/__tests__/fillHandle.test.tsx`,
extend `selectionModel.test.ts`

### H0 — pure fill planner (group-bounded down; rect clamped down/right)
- **Test (selectionModel.test.ts):** `planFillDown(active, group, orderedDates)` → cells
  from active row to the group's last visible row, same column (down-only). `planFillRect(active, focus, group, orderedDates)` → rectangle clamped: vertical to group's last
  row, horizontal to week; **never** extends up or left of active (drag above/left clamps to
  active). `planFillRow(active, orderedDates)` → active's 7 day cells. Each returns target
  cells (caller filters eligibility + builds writes). **(AC-17, AC-18, F6)**
- **Impl:** index math over ordered employees (bounded to the group's row span) and ordered
  dates; clamp focus indices to `>= active` (down/right only) and to group/week bounds.

### H1 — fill handle renders on the active cell only
- **Test:** select a single cell → a fill handle element (testid/role) appears in that
  `<td>`'s bottom-right; selecting nothing → no handle; multi-range → handle on the active
  cell. **(AC-18 affordance, D10)**
- **Impl:** render a small `var(--sel)` square absolutely positioned bottom-right of the
  active `<td>` when `active` is set.

### H2 — double-click handle → fill down within group (eligible rows)
- **Test:** active (emp in group G, Mon)=shift M; `fireEvent.doubleClick(handle)` →
  every subsequent visible row **in group G** for Monday becomes M (eligible rows);
  rows in other groups untouched; ineligible rows in G skipped. One snapshot; undo reverts.
  **(AC-17)**
- **Impl:** dblclick → `planFillDown` → filter eligible → `applyCellWrites({sets})`
  (or clears if active empty).

### H3 — drag handle → fill rectangle clamped (down/right only, group+week)
- **Test:** stub rAF; `pointerdown` on handle; `pointerenter` 2 rows down + 2 cols right;
  `pointerup` → 3×3 filled with active value, clamped to group vertically + week
  horizontally. Drag up/left clamps to active (no fill). **(AC-18)**
- **Impl:** handle pointer drag mirrors D2 mechanics but feeds `planFillRect`; on release
  `applyCellWrites`. Active-empty → clears the range (`clearCells`/`applyCellWrites` clears).

---

## Phase I — undo/redo keybindings + persistence integration

**Source touched:** `app/src/features/board/BoardSurface.tsx` (key listener),
`app/src/features/board/Board.tsx`
**Tests added:** `app/src/features/board/__tests__/undoKeys.test.tsx`

### I1 — Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z & Cmd/Ctrl+Y redo (wired to store)
- **Test:** make an edit; `fireEvent.keyDown(window,{key:'z',metaKey:true})` → reverts;
  `{key:'z',metaKey:true,shiftKey:true}` → re-applies; `{key:'y',ctrlKey:true}` → redo.
  Ensure the listener ignores Z/Y when focus is in an input/textarea (don't hijack typing).
  **(AC-23)**
- **Impl:** a keydown listener (scoped to the board surface) calling `store.getState().undo()`/`redo()`; guard on `e.target` tag and on `!menu/popover-open` if needed.

### I2 — undo/redo persistence round-trips losslessly
- **Test (storeUndo.test.ts, with a fake StoragePort):** inject a `_storage` stub
  capturing `save(dto)`; make edits, undo, assert the last saved DTO's `assignments`
  round-trip via `fromScheduleDTO(toScheduleDTO(...))` equals the undone schedule; the
  persisted blob equals the live schedule. **(AC-24, AC-31)**
- **Impl:** `undo()`/`redo()` already call `persist()`; assert no corruption (DTOs are plain
  `Assignment[]`). No Map/Set in snapshots — `_undoStack` holds `ScheduleDTO` (arrays).

---

## Phase J — regression & polish

**Tests:** run the FULL suite + lint + token checksum; add targeted regression asserts;
deep-test (chrome-devtools) for the things RTL/jsdom cannot truly exercise.

### J1 — solver / proposal / pin / violation regression
- **Test:** existing `solve.test.ts`, board `.sf-viol`, toolbar pin pill, `applyProposal`
  undoability (A7) all green. Add one integration test: run a (stubbed) proposal apply, then
  `undo()` restores pre-apply schedule (AC-26 + D15). **(AC-26)**
- **Impl:** no code; fix any regressions surfaced.

### J2 — tokens checksum + lint green
- **Test:** the existing tokens checksum guard test passes (no `--sh-*`/`.sf-*` rename, no
  new token). `pnpm lint` (tsc --noEmit) clean across both packages. **(AC-27)**
- **Impl:** none beyond keeping to existing tokens (`--sel`, `--sel-bg`, `--surface-2`,
  `--st-*`).

### J3 — deep-test (chrome-devtools-mcp) for layout pixels + real drag/clipboard/fill
- **Coverage (NOT RTL — jsdom can't compute layout, real pointer geometry, or OS
  clipboard):**
  - **AC-1 pixel widths:** mount the board in a 1200px container in a real browser; assert
    the employee `<col>` is 200px and each day col is `(1200−200)/7` ±1px via
    `getBoundingClientRect`. (jsdom-side test asserts only declared styles — C1.)
  - **AC-2 sticky-on-scroll:** scroll the grid; assert header rows + employee col stay
    pinned and weekend hatch/pinned `◢`/`.sf-proposed`/`.sf-viol` still render.
  - **Real drag-select (AC-3/AC-18):** native pointer drag across cells / the fill handle
    drag — verify the rAF-committed selection rectangle visually and the fill clamp.
  - **Real OS clipboard (AC-13/AC-33):** Cmd+C/Cmd+V against the actual system clipboard
    (resolve-equal / external-paste / denied-permission fallback).
  - **Selection visuals layering (D9):** confirm the `--sel-bg` overlay sits UNDER
    `.sf-viol`/`.sf-proposed` outlines (violation/proposal still legible while selected).

---

## Phase → AC coverage map

| Phase | ACs |
|---|---|
| A | AC-10, AC-12, AC-23, AC-24, AC-26, AC-31 (D6,D7,D12,D15) |
| B | AC-3, AC-4, AC-6, AC-7, AC-11, AC-13–16, AC-30, AC-32 (pure math) |
| C | AC-1, AC-2 |
| D | AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-21, AC-22, AC-25, AC-28 |
| E | AC-29 |
| F | AC-10, AC-11, AC-12, AC-19, AC-20, AC-32 |
| G | AC-13, AC-14, AC-15, AC-16, AC-23, AC-30, AC-33 |
| H | AC-17, AC-18 |
| I | AC-23, AC-24, AC-31 |
| J | AC-1, AC-2, AC-26, AC-27 + deep-test for all hard-to-RTL ACs |

---

## Test files summary

**New:**
- `app/src/store/__tests__/storeUndo.test.ts`
- `app/src/features/board/__tests__/selectionModel.test.ts`
- `app/src/features/board/__tests__/useBoardSelection.test.tsx`
- `app/src/features/board/__tests__/cellContextMenu.test.tsx`
- `app/src/features/board/__tests__/clipboard.test.tsx`
- `app/src/features/board/__tests__/fillHandle.test.tsx`
- `app/src/features/board/__tests__/undoKeys.test.tsx`

**Modified (explicitly called out):**
- `app/src/features/board/__tests__/board.test.tsx` — **rewrite** "cells are
  keyboard-operable" to the roving-tabindex assertion (exactly one `tabindex=0`, rest
  `-1`); add layout (C1/C2), selection (D1–D11), chip cases.
- `app/src/features/board/__tests__/cellPopover.test.tsx` — **migrate** all 4 opens from
  bare `fireEvent.click(cell)` to select-then-`Enter`; behavioral assertions unchanged.
- `app/src/store/__tests__/store.test.ts` / `solve.test.ts` — extend for batch actions +
  proposal-apply undo.

**Source files summary (new):** `selectionModel.ts`, `useBoardSelection.ts`,
`SelectionChip.tsx`, `CellContextMenu.tsx`, `FillHandle.tsx`, (`boardOrder.ts` /
`orderedVisible` helper if not folded into `selectionModel.ts`).
**Source touched:** `store.ts`, `Board.tsx`, `BoardSurface.tsx`, `CellPopover.tsx`
(no logic change — opened via Enter).
```
