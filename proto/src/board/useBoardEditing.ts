import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ClipboardEvent as ReactClipboardEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  assignmentKey,
  OFF_ASSIGNMENT,
  OFF_CODE,
  type Assignment,
  type BoardDate,
  type Person,
  type ShiftCode,
  type ShiftDef,
} from './mockBoard'
import { isEligible } from './eligibility'
import { useBoardOverrides } from '../state/boardOverrides'
import {
  clampCoord,
  moveSelection,
  normalizeRange,
  rangeCells,
  type ArrowDir,
  type Bounds,
  type Coord,
  type SelectionRange,
} from './selection'
import {
  commitEdit,
  emptyHistory,
  redo as redoHistory,
  undo as undoHistory,
  type CellPatch,
  type EditHistory,
  type Overrides,
} from './editHistory'

/**
 * Single-keystroke shorthand — the audience already knows spreadsheet enum
 * entry, not free text. Built from the live catalog's first letters (ticket
 * 15: codes are renameable), first shift claims a letter; a later collision
 * just has no shortcut and stays reachable via `CellMenu`. `o` -> Day off is
 * always available, matching Delete/Backspace's existing OFF shorthand.
 */
function buildCodeKeys(shifts: ShiftDef[]): Record<string, ShiftCode> {
  const keys: Record<string, ShiftCode> = { o: OFF_CODE }
  for (const shift of shifts) {
    const letter = shift.code.charAt(0).toLowerCase()
    if (letter && !(letter in keys)) keys[letter] = shift.code
  }
  return keys
}

const ARROW_DIRS: Record<string, ArrowDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

export type OverlayRect = { left: number; top: number; width: number; height: number }

export type CellMenuState = { row: number; col: number; pinned: boolean; rect: OverlayRect }

function buildAssignment(shifts: ShiftDef[], person: Person, code: ShiftCode): Assignment {
  const def = shifts.find((s) => s.code === code)
  return { code, start: def?.start ?? null, end: def?.end ?? null, pinned: true, ineligible: !isEligible(person, code) }
}

/**
 * Hand-editing for the board (ticket 05). Selection lives here, outside any
 * per-cell React prop (ticket 03's settled call) — cells stay pure, this hook
 * finds them by `data-person-id`/`data-date-iso` via event delegation and
 * `querySelector`, and drives one overlay div rather than 200 cell writes.
 */
export function useBoardEditing(
  boardRef: React.RefObject<HTMLDivElement | null>,
  visiblePeople: Person[],
  dates: BoardDate[],
  baseAssignments: Map<string, Assignment>,
  shifts: ShiftDef[],
  periodId: string,
  /** True while a proposal is up for review (ticket 12) — every mutating path becomes a no-op. */
  locked = false,
) {
  const [overrides, setOverrides] = useBoardOverrides(periodId)
  const historyRef = useRef<EditHistory>(emptyHistory)
  const [selection, setSelection] = useState<SelectionRange | null>(null)
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null)
  const [menu, setMenu] = useState<CellMenuState | null>(null)
  const editorRef = useRef<HTMLInputElement>(null)
  const codeKeys = useMemo(() => buildCodeKeys(shifts), [shifts])
  // Reverse of codeKeys (ticket "click to pick a shift, with kbd hints"):
  // `CellMenu` shows each option's single-letter shortcut so it doubles as
  // the discovery path for the shorthand, not just a fallback for it. A
  // shift whose first letter collided with an earlier one has no entry here
  // and renders with no hint — it was already unreachable by keyboard.
  const keyHintByCode = useMemo(() => {
    const map: Record<string, string> = {}
    for (const [letter, code] of Object.entries(codeKeys)) map[code] = letter
    return map
  }, [codeKeys])
  const validCodes = useMemo(() => new Set([...shifts.map((s) => s.code), OFF_CODE]), [shifts])

  const bounds: Bounds = useMemo(
    () => ({ maxRow: visiblePeople.length - 1, maxCol: dates.length - 1 }),
    [visiblePeople.length, dates.length],
  )

  const rowIndex = useMemo(() => {
    const map = new Map<string, number>()
    visiblePeople.forEach((person, i) => map.set(person.id, i))
    return map
  }, [visiblePeople])

  const colIndex = useMemo(() => {
    const map = new Map<string, number>()
    dates.forEach((date, i) => map.set(date.iso, i))
    return map
  }, [dates])

  // A team fold/unfold reshuffles which row index means which person. Clamp
  // rather than resolve precisely — good enough for a prototype, and never
  // crashes on an out-of-range index.
  useEffect(() => {
    setSelection((prev) =>
      prev ? { anchor: clampCoord(prev.anchor, bounds), focus: clampCoord(prev.focus, bounds) } : prev,
    )
  }, [bounds])

  useEffect(() => {
    editorRef.current?.focus({ preventScroll: true })
  }, [])

  const getAssignment = useCallback(
    (personId: string, dateIso: string): Assignment => {
      const key = assignmentKey(personId, dateIso)
      // OFF fallback, not a non-null assertion: a person added on Roster
      // while this period already holds an applied schedule renders once
      // before BoardGrid's backfill effect fills their keys in.
      return overrides.get(key) ?? baseAssignments.get(key) ?? OFF_ASSIGNMENT
    },
    [overrides, baseAssignments],
  )

  const applyOverrides = useCallback((mutate: (prev: Overrides) => { history: EditHistory; overrides: Overrides }) => {
    setOverrides((prev) => {
      const result = mutate(prev)
      historyRef.current = result.history
      return result.overrides
    })
  }, [])

  const commitCode = useCallback(
    (code: ShiftCode) => {
      if (locked || !selection) return
      const patch: CellPatch = new Map()
      for (const { row, col } of rangeCells(selection)) {
        const person = visiblePeople[row]
        const date = dates[col]
        if (!person || !date) continue
        patch.set(assignmentKey(person.id, date.iso), buildAssignment(shifts, person, code))
      }
      if (patch.size === 0) return
      applyOverrides((prev) => commitEdit(historyRef.current, prev, patch))
    },
    [locked, selection, visiblePeople, dates, shifts, applyOverrides],
  )

  const releasePin = useCallback(() => {
    if (locked || !selection) return
    const patch: CellPatch = new Map()
    for (const { row, col } of rangeCells(selection)) {
      const person = visiblePeople[row]
      const date = dates[col]
      if (!person || !date) continue
      patch.set(assignmentKey(person.id, date.iso), undefined)
    }
    if (patch.size === 0) return
    applyOverrides((prev) => commitEdit(historyRef.current, prev, patch))
  }, [locked, selection, visiblePeople, dates, applyOverrides])

  /**
   * The proposal overlay's Apply (ticket 12) — not gated on `locked` since
   * it's the action that resolves the lock, not a hand-edit made during it.
   * Reuses the same `commitEdit` history exactly like a keyboard fill, so
   * Apply becomes one push on the same undo/redo stack for free.
   */
  const applyPatch = useCallback(
    (patch: CellPatch) => {
      if (patch.size === 0) return
      applyOverrides((prev) => commitEdit(historyRef.current, prev, patch))
    },
    [applyOverrides],
  )

  const performUndo = useCallback(() => {
    applyOverrides((prev) => undoHistory(historyRef.current, prev))
  }, [applyOverrides])

  const performRedo = useCallback(() => {
    applyOverrides((prev) => redoHistory(historyRef.current, prev))
  }, [applyOverrides])

  const copySelection = useCallback(() => {
    if (!selection) return
    const { min, max } = normalizeRange(selection)
    const lines: string[] = []
    for (let row = min.row; row <= max.row; row++) {
      const person = visiblePeople[row]
      if (!person) continue
      const cols: string[] = []
      for (let col = min.col; col <= max.col; col++) {
        const date = dates[col]
        if (!date) continue
        cols.push(getAssignment(person.id, date.iso).code)
      }
      lines.push(cols.join('\t'))
    }
    void navigator.clipboard?.writeText(lines.join('\n')).catch(() => {})
  }, [selection, visiblePeople, dates, getAssignment])

  const handlePaste = useCallback(
    (e: ReactClipboardEvent<HTMLInputElement>) => {
      if (locked || !selection) return
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      if (!text) return
      const rows = text.replace(/\r/g, '').split('\n')
      while (rows.length > 1 && rows.at(-1) === '') rows.pop()

      const origin = normalizeRange(selection).min
      const patch: CellPatch = new Map()
      let lastRow = origin.row
      let lastCol = origin.col

      rows.forEach((line, rOffset) => {
        const row = origin.row + rOffset
        if (row > bounds.maxRow) return
        line.split('\t').forEach((raw, cOffset) => {
          const col = origin.col + cOffset
          if (col > bounds.maxCol) return
          const code = raw.trim().toUpperCase() as ShiftCode
          if (!validCodes.has(code)) return
          const person = visiblePeople[row]
          const date = dates[col]
          if (!person || !date) return
          patch.set(assignmentKey(person.id, date.iso), buildAssignment(shifts, person, code))
          lastRow = Math.max(lastRow, row)
          lastCol = Math.max(lastCol, col)
        })
      })

      if (patch.size === 0) return
      applyOverrides((prev) => commitEdit(historyRef.current, prev, patch))
      setSelection({ anchor: origin, focus: { row: lastRow, col: lastCol } })
    },
    [locked, selection, visiblePeople, dates, bounds, shifts, validCodes, applyOverrides],
  )

  const handleEditorKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      const meta = e.metaKey || e.ctrlKey

      if (e.key === 'Escape' && menu) {
        e.preventDefault()
        setMenu(null)
        return
      }

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) performRedo()
        else performUndo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        performRedo()
        return
      }
      if (meta && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copySelection()
        return
      }

      const dir = ARROW_DIRS[e.key]
      if (dir) {
        e.preventDefault()
        setSelection((prev) => moveSelection(prev ?? { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }, dir, bounds, e.shiftKey))
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        setSelection((prev) =>
          moveSelection(prev ?? { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }, e.shiftKey ? 'left' : 'right', bounds, false),
        )
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        setSelection((prev) =>
          moveSelection(prev ?? { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }, e.shiftKey ? 'up' : 'down', bounds, false),
        )
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        commitCode('OFF')
        return
      }

      if (e.key.length === 1) {
        const lower = e.key.toLowerCase()
        if (lower === 'u') {
          e.preventDefault()
          releasePin()
          return
        }
        const code = codeKeys[lower]
        if (code) {
          e.preventDefault()
          commitCode(code)
        }
      }
    },
    [bounds, commitCode, releasePin, performUndo, performRedo, copySelection, menu, codeKeys],
  )

  const cellFromEvent = useCallback(
    (target: EventTarget | null): Coord | null => {
      const el = target instanceof HTMLElement ? target.closest<HTMLElement>('.cd-cell[data-person-id]') : null
      if (!el) return null
      const personId = el.dataset.personId
      const dateIso = el.dataset.dateIso
      if (!personId || !dateIso) return null
      const row = rowIndex.get(personId)
      const col = colIndex.get(dateIso)
      if (row === undefined || col === undefined) return null
      return { row, col }
    },
    [rowIndex, colIndex],
  )

  const openMenuForCoord = useCallback(
    (coord: Coord, cellEl: HTMLElement) => {
      const board = boardRef.current
      const person = visiblePeople[coord.row]
      const date = dates[coord.col]
      if (!board || !person || !date) return
      const boardBox = board.getBoundingClientRect()
      const cellBox = cellEl.getBoundingClientRect()
      setMenu({
        row: coord.row,
        col: coord.col,
        pinned: getAssignment(person.id, date.iso).pinned,
        rect: {
          left: cellBox.left - boardBox.left,
          top: cellBox.top - boardBox.top,
          width: cellBox.width,
          height: cellBox.height,
        },
      })
    },
    [boardRef, visiblePeople, dates, getAssignment],
  )

  const handleBoardMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const coord = cellFromEvent(e.target)
      if (!coord) return
      e.preventDefault()
      editorRef.current?.focus({ preventScroll: true })

      // Clicking the already-selected single cell again opens the same
      // dropdown as a double-click (ticket "click to pick a shift"): the
      // only way to set a value used to be typing into an invisible input
      // that reads single-letter shortcuts a mouse-only planner has no way
      // to discover. A first click still just selects; this re-click is the
      // discoverable path onto the exact same edit.
      const reselecting =
        !e.shiftKey &&
        selection !== null &&
        selection.anchor.row === coord.row &&
        selection.anchor.col === coord.col &&
        selection.focus.row === coord.row &&
        selection.focus.col === coord.col

      setSelection((prev) => (e.shiftKey && prev ? { anchor: prev.anchor, focus: coord } : { anchor: coord, focus: coord }))

      if (reselecting) {
        const el = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.cd-cell[data-person-id]') : null
        if (el) openMenuForCoord(coord, el)
        return
      }

      const handleMove = (moveEvent: MouseEvent) => {
        const next = cellFromEvent(moveEvent.target)
        if (!next) return
        setSelection((prev) => (prev ? { anchor: prev.anchor, focus: next } : { anchor: next, focus: next }))
      }
      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [cellFromEvent, selection, openMenuForCoord],
  )

  // Mouse-only path (ticket 05 follow-up): a keyboard isn't guaranteed, so
  // every code a planner can type must also be reachable by double-clicking
  // a cell and picking from a dropdown — kept alongside the re-click path
  // above as the faster route when the cell wasn't already selected.
  const handleBoardDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const el = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.cd-cell[data-person-id]') : null
      const coord = cellFromEvent(e.target)
      if (!el || !coord) return
      e.preventDefault()
      setSelection({ anchor: coord, focus: coord })
      openMenuForCoord(coord, el)
    },
    [cellFromEvent, openMenuForCoord],
  )

  const chooseMenuOption = useCallback(
    (code: ShiftCode) => {
      commitCode(code)
      setMenu(null)
      editorRef.current?.focus({ preventScroll: true })
    },
    [commitCode],
  )

  const releasePinFromMenu = useCallback(() => {
    releasePin()
    setMenu(null)
    editorRef.current?.focus({ preventScroll: true })
  }, [releasePin])

  // Jump-to-cell for the problem list (ticket 07): select it and scroll it
  // into view. Returns false when the person isn't in the current visible
  // rows yet — the caller (BoardGrid) un-collapses the team first, then
  // retries once `visiblePeople` has caught up.
  const selectByIds = useCallback(
    (personId: string, dateIso: string): boolean => {
      const row = rowIndex.get(personId)
      const col = colIndex.get(dateIso)
      if (row === undefined || col === undefined) return false
      const coord: Coord = { row, col }
      setSelection({ anchor: coord, focus: coord })
      editorRef.current?.focus({ preventScroll: true })
      const board = boardRef.current
      const person = visiblePeople[row]
      const date = dates[col]
      if (board && person && date) {
        const el = board.querySelector<HTMLElement>(
          `.cd-cell[data-person-id="${person.id}"][data-date-iso="${date.iso}"]`,
        )
        el?.scrollIntoView({ block: 'center', inline: 'center' })
      }
      return true
    },
    [rowIndex, colIndex, visiblePeople, dates, boardRef],
  )

  useEffect(() => {
    if (!menu) return
    const closeIfOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('.cd-cell-menu')) return
      setMenu(null)
    }
    window.addEventListener('mousedown', closeIfOutside)
    return () => window.removeEventListener('mousedown', closeIfOutside)
  }, [menu])

  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board || !selection) {
      setOverlayRect(null)
      return
    }
    const { min, max } = normalizeRange(selection)
    const topLeftPerson = visiblePeople[min.row]
    const bottomRightPerson = visiblePeople[max.row]
    const topLeftDate = dates[min.col]
    const bottomRightDate = dates[max.col]
    if (!topLeftPerson || !bottomRightPerson || !topLeftDate || !bottomRightDate) {
      setOverlayRect(null)
      return
    }
    const startEl = board.querySelector<HTMLElement>(
      `.cd-cell[data-person-id="${topLeftPerson.id}"][data-date-iso="${topLeftDate.iso}"]`,
    )
    const endEl = board.querySelector<HTMLElement>(
      `.cd-cell[data-person-id="${bottomRightPerson.id}"][data-date-iso="${bottomRightDate.iso}"]`,
    )
    if (!startEl || !endEl) {
      setOverlayRect(null)
      return
    }
    const boardBox = board.getBoundingClientRect()
    const startBox = startEl.getBoundingClientRect()
    const endBox = endEl.getBoundingClientRect()
    setOverlayRect({
      left: startBox.left - boardBox.left,
      top: startBox.top - boardBox.top,
      width: endBox.right - startBox.left,
      height: endBox.bottom - startBox.top,
    })
  }, [selection, visiblePeople, dates, boardRef])

  return {
    getAssignment,
    overlayRect,
    editorRef,
    onEditorKeyDown: handleEditorKeyDown,
    onEditorPaste: handlePaste,
    onBoardMouseDown: handleBoardMouseDown,
    onBoardDoubleClick: handleBoardDoubleClick,
    menu,
    keyHintByCode,
    chooseMenuOption,
    releasePinFromMenu,
    selectByIds,
    applyPatch,
  }
}
