/**
 * The /calendar page's schedule surface: every period joined on one real
 * FullCalendar (month / week), each day cell showing one line per shift code
 * plus the people on leave — so a manager reads a day the way the board reads a
 * cell, and can move a person between days without leaving the dates.
 *
 * Shifts are not FC events. `dayCellContent` draws the day number, and this
 * component portals one `CalDay` per cell into the cell's own frame, so the
 * stacks are ordinary React rendered from the page's live state — they follow
 * every edit, filter and locale change without FullCalendar knowing they exist.
 * FullCalendar keeps the grid, the navigation and the two gestures that belong
 * to a day: click or drag-select blank space to book leave. A chip takes the
 * pointer back (the overlay is transparent to it, and a capture-phase listener
 * stops the press before FullCalendar sees it), so pressing one is a drag-pick
 * rather than a date click.
 *
 * Every edit — swap, shift change, leave — goes through `useCalendarEditing`,
 * which writes the same atoms the board does and keeps this page's own undo
 * stack. Rule breaks are not blocked, just flagged on the chip, as on the board.
 */
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import type { DateSelectArg, DatesSetArg, DayCellContentArg, DayCellMountArg, LocaleInput } from '@fullcalendar/core'
import * as ContextMenu from '@radix-ui/react-context-menu'
import deLocale from '@fullcalendar/core/locales/de'
import esLocale from '@fullcalendar/core/locales/es'
import frLocale from '@fullcalendar/core/locales/fr'
import jaLocale from '@fullcalendar/core/locales/ja'
import ptLocale from '@fullcalendar/core/locales/pt'
import viLocale from '@fullcalendar/core/locales/vi'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAtomValue } from 'jotai'
import { OFF_CODE, activePeople, type ShiftCode } from '@crewdoku/domain'
import type { LocaleId } from '../../i18n/localeIds'
import { localeAtom } from '../../state/locale'
import { addDaysISO, selectedPeriodAtom } from '../../state/shell'
import { filterPeople, useScheduleFilters } from '../../state/scheduleFilters'
import { buildDayStacks, type DayChip, type DayStack } from '../../calendar/calendarModel'
import { useCalendarEditing } from '../../calendar/useCalendarEditing'
import { useCalendarSource } from '../../calendar/useCalendarSource'
import { useT } from '../../i18n/useT'
import { useIsNarrow } from '../../ui/useIsNarrow'
import { swatchBg } from '../../board/shiftColors'
import {
  CalendarMinus,
  CalendarPlus,
  CalendarRange,
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Filter,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X,
} from '../../ui/icons'
import { LeaveDialog, dateLabel, type LeaveDialogRequest } from './LeaveDialog'
import { rangeLength, replacePersonLeave, toLeaveRanges, type LeaveRange } from './leaveRanges'
import './calendar.css'

/** The two layouts offered, in switcher order — shifts are all-day, so no time grid. */
const CALENDAR_VIEWS = [
  { type: 'dayGridMonth', labelKey: 'cal.month' },
  { type: 'dayGridWeek', labelKey: 'cal.week' },
] as const

/** The one-row layout: the whole of each day's stack, no "+N" cap. */
const WEEK_VIEW = 'dayGridWeek'

/** Chips a month cell shows per line before the day folds the rest into "+N". */
const MONTH_CHIP_CAP = 3

/**
 * Our locale, as FullCalendar's own data: the object carries the week start, the
 * built-in labels ("+N more", weekday names) and the `code` FullCalendar feeds
 * to `Intl` for every date it prints. English is FullCalendar's built-in
 * default, so it maps to nothing.
 */
const FC_LOCALES: Record<LocaleId, LocaleInput | undefined> = {
  en: undefined,
  vi: viLocale,
  es: esLocale,
  fr: frLocale,
  ja: jaLocale,
  de: deLocale,
  pt: ptLocale,
}

/**
 * Team identity on the day stacks: a fixed six-colour palette assigned by
 * teams-array order and cycled past the sixth (`calendarModel` does the
 * cycling; `calendar.css` owns the colours). Unassigned and unresolvable teams
 * share the neutral class, matching Roster's own "unknown team buckets into
 * Unassigned" rule.
 */
const TEAM_DOT_CLASSES = ['cal-ev-0', 'cal-ev-1', 'cal-ev-2', 'cal-ev-3', 'cal-ev-4', 'cal-ev-5']
const UNASSIGNED_DOT_CLASS = 'cal-ev-none'

/** Milliseconds a finger must rest on a chip before it becomes a drag. */
const TOUCH_HOLD_MS = 280

/**
 * Movement, in pixels, that turns a press on a chip into a drag. A mouse drags
 * on movement; a finger must also hold still first, so a swipe scrolls the grid
 * instead of picking a chip up.
 */
const DRAG_MIN_DISTANCE = 4
const TOUCH_CANCEL_DISTANCE = 8

/** Milliseconds the finger must rest before a touch drag starts selecting days. */
const TOUCH_LONG_PRESS_MS = 250

/**
 * Movement, in pixels, that turns a press on the grid into a range drag. Without
 * it a plain click would report both a click *and* a one-day selection.
 */
const SELECT_MIN_DISTANCE = 5

/** Below this width the "+N" panel would be narrower than its own heading. */
const POPOVER_MIN_WIDTH = 220

/** How close to the scroller's top or bottom edge, in pixels, a drag starts scrolling it. */
const AUTO_SCROLL_EDGE = 48
/** The fastest that edge scroll goes, in pixels per frame (reached at the edge itself). */
const AUTO_SCROLL_MAX_STEP = 14

/**
 * Hides every chip that falls below the bottom of its cell's lines, and every
 * line left with no chip in sight, and returns how many chips it hid — the
 * part of a day the cap never saw, because it depends on how tall the cell is
 * right now. Hiding is `visibility`, not layout, so marking never moves what
 * the next measurement reads.
 */
function markClipped(lines: HTMLElement): number {
  const bottom = lines.getBoundingClientRect().bottom + 0.5
  let clipped = 0
  for (const line of lines.children) {
    const chips = line.querySelectorAll('[data-chip]')
    let shown = 0
    for (const chip of chips) {
      const rect = chip.getBoundingClientRect()
      const out = rect.height > 0 && rect.bottom > bottom
      chip.toggleAttribute('data-clipped', out)
      if (out) clipped += 1
      else shown += 1
    }
    line.toggleAttribute('data-clipped', chips.length > 0 && shown === 0)
  }
  return clipped
}

/** A context-menu row: `Select`'s own option shape, so the menu reads as the same surface. */
const menuItem =
  'flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-base-content outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-base-200'

/** The menu's panel: `Select`'s panel, sized for labels instead of a trigger. */
const menuPanel = 'z-50 min-w-[13rem] rounded-box border border-base-300 bg-base-100 p-1 shadow-lg'

const menuSeparator = 'my-1 h-px bg-base-300'

/** A row's leading icon: dimmed by opacity, so a destructive row tints it too. */
const menuIcon = 'h-3.5 w-3.5 shrink-0 opacity-70'

/**
 * The wall date a day cell shows. FullCalendar hands content callbacks the
 * marker already converted into the browser's own zone, so its *local*
 * components — not its UTC instant — are the cell's date.
 */
function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The visible week a date's day cell belongs to: the first and last dated cell
 * of its own row. That is the locale's week start in month view, and the whole
 * visible week in week view (which is a single row). Read from the grid rather
 * than from the element under the pointer, because a day menu can also be
 * opened from the "+N" panel, where there is no row to walk.
 */
function weekOfCell(grid: HTMLElement | null, date: string): LeaveRange {
  const cell = grid?.querySelector(`td.fc-daygrid-day[data-date="${date}"]`) ?? null
  const row = cell?.closest('tr') ?? null
  const cells = row === null ? [] : Array.from(row.querySelectorAll('td.fc-daygrid-day[data-date]'))
  return {
    start: cells.at(0)?.getAttribute('data-date') ?? date,
    end: cells.at(-1)?.getAttribute('data-date') ?? date,
  }
}

/** What a right-click landed on: a shift chip, a leave chip, or a day's blank space. */
type MenuTarget =
  | { kind: 'shift'; personId: string; iso: string; code: ShiftCode }
  | { kind: 'leave'; personId: string; iso: string }
  | { kind: 'day'; iso: string }

/**
 * The day cell an element sits in: our own stack when the pointer is over one
 * of its chips, or FullCalendar's `td` when it is over the cell's blank space —
 * which is where the pointer always lands otherwise, since the stack itself is
 * transparent to it. Both drop targets and menus resolve through here.
 */
function dayElementOf(element: Element): Element | null {
  return element.closest('[data-cal-day]') ?? element.closest('td.fc-daygrid-day[data-date]')
}

/** That cell's ISO date, whichever of the two elements named it. */
function isoOfDay(day: Element): string | null {
  return day.getAttribute('data-cal-day') ?? day.getAttribute('data-date')
}

/**
 * One context-menu row. Radix owns the interaction — highlight, keyboard
 * navigation, close-on-select — so this is only the app's row shape plus the
 * icon and tone.
 */
function MenuRow({
  icon: Icon,
  label,
  disabled = false,
  destructive = false,
  onSelect,
}: {
  icon: typeof Plus
  label: string
  disabled?: boolean
  destructive?: boolean
  onSelect: () => void
}) {
  return (
    <ContextMenu.Item disabled={disabled} onSelect={onSelect} className={`${menuItem} ${destructive ? 'text-error' : ''}`}>
      <Icon className={menuIcon} />
      {label}
    </ContextMenu.Item>
  )
}

/**
 * One person on one day: their name behind a team-coloured dot, wearing the
 * board's flag dot when a rule says the day is wrong. Nothing here is
 * interactive — every gesture on a chip (drag, right-click, long-press) is
 * resolved by the page from the chip's own data attributes, so a chip stays a
 * plain, cheap node in a grid full of them.
 */
function CalChip({ chip, iso, code }: { chip: DayChip; iso: string; code: ShiftCode | null }) {
  const t = useT()
  const name = chip.name.trim() === '' ? t('rtc.roster.namePlaceholder') : chip.name
  const flagged = chip.flags.length > 0
  return (
    <span
      data-chip={code === null ? 'leave' : 'shift'}
      data-person-id={chip.personId}
      data-iso={iso}
      data-name={name}
      {...(code === null ? {} : { 'data-code': code })}
      className={`cal-chip ${code === null ? 'cal-chip-leave' : ''} ${flagged ? 'cal-chip-flagged' : ''}`}
      title={flagged ? chip.flags.map((flag) => flag.message).join(' · ') : name}
    >
      <span
        aria-hidden
        className={`cal-dot ${
          chip.teamColor === null ? UNASSIGNED_DOT_CLASS : (TEAM_DOT_CLASSES[chip.teamColor] ?? UNASSIGNED_DOT_CLASS)
        }`}
      />
      <span className="cal-chip-name">{name}</span>
    </span>
  )
}

/**
 * One day's whole stack: a line per shift code (its own colour, then its
 * people), a `Leave · …` line, and one "+N" that opens the rest. The lines
 * arrive from `buildDayStacks` in the order they are drawn: shift catalog
 * order, then leave.
 *
 * "+N" counts two kinds of hidden chip: those past the month cap, and those
 * the cell is too short to show, measured after layout and again whenever the
 * cell resizes. How the lines lay out at each cell width (label column,
 * tinted names, or per-shift counts) is CSS, in calendar.css.
 */
function CalDay({ iso, stack, cap }: { iso: string; stack: DayStack | undefined; cap: number }) {
  const t = useT()
  const linesRef = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState(0)
  const groups = stack?.groups ?? []
  const leave = stack?.leave ?? []
  const leaveShown = leave.length > cap ? leave.slice(0, cap) : leave
  const shownGroups = groups.map((group) => ({
    group,
    chips: group.chips.length > cap ? group.chips.slice(0, cap) : group.chips,
  }))
  const hidden =
    groups.reduce((total, group) => total + Math.max(0, group.chips.length - cap), 0) +
    Math.max(0, leave.length - leaveShown.length) +
    clipped

  useLayoutEffect(() => {
    const lines = linesRef.current
    if (lines === null) return
    const measure = () => setClipped(markClipped(lines))
    measure()
    // The "+N" button showing up shrinks the lines, which fires this again —
    // and a shorter box only ever hides more, so the count settles.
    const observer = new ResizeObserver(measure)
    observer.observe(lines)
    return () => observer.disconnect()
  }, [stack, cap])

  return (
    <div className="cal-day" data-cal-day={iso} data-editable={stack?.editable === true ? 'true' : 'false'}>
      {/* The lines clip; "+N" sits outside them so a full cell can never hide it. */}
      <div ref={linesRef} className="cal-lines">
        {shownGroups.map(({ group, chips }) => (
          <div key={group.code} className="cal-line" data-cal-line={group.code} data-shift-color={group.color}>
            <span className="cal-code" title={group.label}>
              {group.code}
            </span>
            <span className="cal-chips">
              {chips.map((chip) => (
                <CalChip key={chip.personId} chip={chip} iso={iso} code={group.code} />
              ))}
            </span>
          </div>
        ))}
        {leaveShown.length > 0 && (
          <div className="cal-line cal-line-leave">
            <span className="cal-code">{t('cal.leave')}</span>
            <span className="cal-chips">
              {leaveShown.map((chip) => (
                <CalChip key={chip.personId} chip={chip} iso={iso} code={null} />
              ))}
            </span>
          </div>
        )}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          data-cal-more={iso}
          className="cal-more"
          aria-label={t('cal.more', { count: hidden, date: dateLabel(iso) })}
        >
          +{hidden}
        </button>
      )}
    </div>
  )
}

/**
 * A day in the compact (phone / tablet) grid, after Apple Calendar's month
 * view: the date, circled when it is the selected day, over one dot per shift
 * that has anyone on it plus a grey dot for leave. The names live in the
 * selected day's list under the grid, so the cell only has to say "something
 * is on" at a glance.
 */
function CalMini({ iso, stack, selected }: { iso: string; stack: DayStack | undefined; selected: boolean }) {
  const groups = stack?.groups ?? []
  const onLeave = (stack?.leave.length ?? 0) > 0
  return (
    <div className="cal-mini" data-selected={selected || undefined}>
      <span className="cal-mini-num">{Number(iso.slice(8))}</span>
      <span className="cal-mini-dots" aria-hidden>
        {groups.map((group) => (
          <span key={group.code} className="cal-mini-dot" data-shift-color={group.color} />
        ))}
        {onLeave && <span className="cal-mini-dot cal-mini-dot-leave" />}
      </span>
    </div>
  )
}

/** A day cell's frame, collected off FullCalendar so the stack can be portalled into it. */
type CalCell = { iso: string; el: HTMLElement }

/** A chip being dragged: its own day and code, plus whatever it is currently over. */
type DragState = {
  personId: string
  name: string
  fromIso: string
  fromCode: ShiftCode
  startX: number
  startY: number
  /** Where the pointer last was, for the edge auto-scroll to re-aim the drop at. */
  lastX: number
  lastY: number
  touch: boolean
  armed: boolean
  /** Whether the "+N" panel it came from is hidden for the drag (closed when it ends). */
  fromPanel: boolean
  /** The pending long-press, as a DOM timer id (window.setTimeout returns one). */
  holdTimer: number | null
  drop: { iso: string; code: ShiftCode | null } | null
}

/** The open "+N" panel: its day, and that day's cell in the wrapper's own (scrolled) coordinates. */
type PopoverState = { iso: string; cell: { left: number; top: number; width: number; height: number } }

/** Keeps the panel this far inside the grid's edges. */
const POPOVER_MARGIN = 4

/**
 * Where the "+N" panel goes, after Google Calendar's own: centred over its
 * cell and a little wider, so it reads as that day opened up in place. It
 * starts at the cell's top and grows down; when that would run past the grid
 * it grows up from the cell's bottom instead, so the cell is always under it.
 */
function placePopover(
  cell: PopoverState['cell'],
  panel: { width: number; height: number },
  bounds: { top: number; width: number; height: number },
): { left: number; top: number } {
  const maxLeft = bounds.width - panel.width - POPOVER_MARGIN
  const left = Math.max(POPOVER_MARGIN, Math.min(cell.left + (cell.width - panel.width) / 2, maxLeft))
  const bottom = bounds.top + bounds.height - POPOVER_MARGIN
  const down = cell.top - POPOVER_MARGIN
  const top = down + panel.height <= bottom ? down : cell.top + cell.height + POPOVER_MARGIN - panel.height
  return { left, top: Math.max(bounds.top + POPOVER_MARGIN, top) }
}

/**
 * The calendar itself, self-contained: it reads the workspace, the shared
 * filters, its own edits and its menus, and reports nothing upward — the page
 * around it is only the title, the view switch and the filter bar.
 */
export function ScheduleCalendar() {
  const t = useT()
  const locale = useAtomValue(localeAtom)
  const initialPeriod = useAtomValue(selectedPeriodAtom)
  const isNarrow = useIsNarrow()
  const source = useCalendarSource()
  const editing = useCalendarEditing(source)
  const [filters, setFilters] = useScheduleFilters()

  const calendarRef = useRef<FullCalendar>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const cellsRef = useRef(new Map<string, HTMLElement>())
  const syncScheduledRef = useRef(false)
  const dragRef = useRef<DragState | null>(null)

  const [viewType, setViewType] = useState<string>('dayGridMonth')
  const [title, setTitle] = useState('')
  const [range, setRange] = useState<{ start: string; end: string } | null>(null)
  const [cells, setCells] = useState<readonly CalCell[]>([])
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [dialog, setDialog] = useState<LeaveDialogRequest | null>(null)
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null)
  /** The day the compact layout lists under its grid. */
  const [selectedIso, setSelectedIso] = useState(() => localIsoDate(new Date()))

  const isos = useMemo(() => {
    if (range === null) return []
    const days: string[] = []
    for (let iso = range.start; iso < range.end; iso = addDaysISO(iso, 1)) days.push(iso)
    return days
  }, [range])

  const stacks = useMemo(() => buildDayStacks(source, isos, filters), [source, isos, filters])
  /** Week shows a day's whole stack; month folds everything past the cap into "+N". */
  const cap = viewType === WEEK_VIEW ? Number.POSITIVE_INFINITY : MONTH_CHIP_CAP
  const active = useMemo(() => activePeople(source.people), [source.people])
  /** The people the filters keep — the same slice the day stacks show. */
  const visible = useMemo(() => filterPeople(active, filters), [active, filters])
  /** Booking preselects the person when the filtered roster holds exactly one. */
  const solePersonId = visible.length === 1 ? (visible.at(0)?.id ?? '') : ''

  // The drag handlers and the portalled cells read state from outside React's
  // render (a pointer listener, a microtask), so the live values they need are
  // mirrored into a ref instead of being captured when the listener was made.
  const live = useRef({ stacks, editing, source })
  useEffect(() => {
    live.current = { stacks, editing, source }
  })

  /** One leave edit, undoable: `from` comes off, `to` goes on, and the stack remembers one entry. */
  const applyLeave = useCallback(
    (personId: string, from: LeaveRange | null, to: LeaveRange | null) => {
      const next = replacePersonLeave(source.people, personId, from, to).find((person) => person.id === personId)
      if (next) editing.setTimeOff(personId, next.timeOff ?? [])
    },
    [source.people, editing],
  )

  function openBookDialog(from: string, to: string) {
    setDialog({ mode: 'book', personId: solePersonId, from, to, original: null })
  }

  // The drag has done its job once the dialog opens; leaving the highlight on
  // would read as a booking that already happened.
  function handleSelect(select: DateSelectArg) {
    select.view.calendar.unselect()
    openBookDialog(select.startStr, addDaysISO(select.endStr, -1))
  }

  // A press that never became a drag — a click on blank space in a day — books
  // exactly that day. FullCalendar fires this for daygrid cells only, and never
  // for a chip: those presses are stopped before they reach it. In the compact
  // layout a tap selects the day instead, the way a phone calendar does; a day
  // from a neighbouring month also turns the page to it.
  function handleDateClick(click: DateClickArg) {
    if (!isNarrow) {
      openBookDialog(click.dateStr, click.dateStr)
      return
    }
    setSelectedIso(click.dateStr)
    const { currentStart, currentEnd } = click.view
    if (click.dateStr < localIsoDate(currentStart) || click.dateStr >= localIsoDate(currentEnd)) {
      click.view.calendar.gotoDate(click.dateStr)
    }
  }

  function handleDatesSet(dates: DatesSetArg) {
    setViewType(dates.view.type)
    setTitle(dates.view.title)
    // Navigating away from a day the panel was anchored to would leave it
    // floating over whatever date is now under it.
    setPopover(null)
    const start = localIsoDate(dates.start)
    const end = localIsoDate(dates.end)
    // FullCalendar's `end` is exclusive and already spans the leading and
    // trailing days a month grid draws — exactly the cells that need a stack.
    setRange((prev) => (prev !== null && prev.start === start && prev.end === end ? prev : { start, end }))
    // The selected day follows the page: kept while it is still in the month
    // (or week) on screen, otherwise today if that is, else the first day.
    const currentStart = localIsoDate(dates.view.currentStart)
    const currentEnd = localIsoDate(dates.view.currentEnd)
    const inView = (iso: string) => iso >= currentStart && iso < currentEnd
    setSelectedIso((prev) => {
      if (inView(prev)) return prev
      const today = localIsoDate(new Date())
      return inView(today) ? today : currentStart
    })
  }

  /** Keeps the portalled cells in step with FullCalendar's own, pruning the ones a view change threw away. */
  const syncCells = useCallback(() => {
    const next: CalCell[] = []
    for (const [iso, el] of cellsRef.current) {
      if (el.isConnected) next.push({ iso, el })
      else cellsRef.current.delete(iso)
    }
    setCells((prev) => (prev.length === next.length && prev.every((cell, i) => cell.el === next[i]?.el) ? prev : next))
  }, [])

  function handleDayCellDidMount(mount: DayCellMountArg) {
    // The stack portals into the `td` itself, not FC's inner frame: the frame
    // only fills the cell where `min-height: 100%` resolves inside a table cell
    // (not in WebKit), and the stack must cover the whole day everywhere.
    cellsRef.current.set(localIsoDate(mount.date), mount.el)
    // Mounted from inside FullCalendar's own render: coalesce the write onto a
    // microtask rather than update React mid-render.
    if (syncScheduledRef.current) return
    syncScheduledRef.current = true
    queueMicrotask(() => {
      syncScheduledRef.current = false
      syncCells()
    })
  }

  /** Opens the day's full stack over its own cell; `placePopover` sets the final spot once the panel has a size. */
  const openPopover = useCallback((iso: string) => {
    const wrapper = wrapperRef.current
    const cell = wrapper?.querySelector<HTMLElement>(`td.fc-daygrid-day[data-date="${iso}"]`)
    if (!wrapper || !cell) return
    const wrapperRect = wrapper.getBoundingClientRect()
    const cellRect = cell.getBoundingClientRect()
    setPopover({
      iso,
      cell: {
        left: cellRect.left - wrapperRect.left + wrapper.scrollLeft,
        top: cellRect.top - wrapperRect.top + wrapper.scrollTop,
        width: cellRect.width,
        height: cellRect.height,
      },
    })
  }, [])

  // Placed before paint, from the panel's real size: it is hidden until then,
  // so it never flashes at a spot it is about to leave. Capped to the grid's
  // visible height first — the page clips anything past it, and a clipped
  // panel would hide names its own scroll could never bring back.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    const panel = popoverRef.current
    if (popover === null || wrapper === null || panel === null) return
    panel.style.maxHeight = `min(420px, ${wrapper.clientHeight - 2 * POPOVER_MARGIN}px)`
    const { left, top } = placePopover(
      popover.cell,
      { width: panel.offsetWidth, height: panel.offsetHeight },
      { top: wrapper.scrollTop, width: wrapper.clientWidth, height: wrapper.clientHeight },
    )
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
    panel.style.visibility = 'visible'
  }, [popover])

  /**
   * Every chip gesture, in one pair of native listeners on the wrapper. The
   * wrapper is an ancestor of FullCalendar's own interaction layer, so a
   * capture-phase `stopPropagation` is what keeps a press on a chip from also
   * being that day's date click or the start of a selection drag.
   */
  useEffect(() => {
    const wrapperEl = wrapperRef.current
    if (wrapperEl === null) return
    // Re-bound as non-null: the nested handlers below close over it, and TS
    // drops the narrowing inside function declarations.
    const wrapper: HTMLDivElement = wrapperEl

    /** The pending edge auto-scroll frame, while a drag rests near the scroller's top or bottom. */
    let autoScrollFrame: number | null = null

    function clearHold() {
      const drag = dragRef.current
      if (drag?.holdTimer == null) return
      clearTimeout(drag.holdTimer)
      drag.holdTimer = null
    }

    function endDrag() {
      clearHold()
      if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame)
      autoScrollFrame = null
      if (ghostRef.current) ghostRef.current.style.display = 'none'
      if (indicatorRef.current) indicatorRef.current.style.display = 'none'
      if (dragRef.current?.fromPanel === true) setPopover(null)
      dragRef.current = null
    }

    function armDrag() {
      const drag = dragRef.current
      if (drag === null || drag.armed) return
      drag.armed = true
      // A chip is off the grid the moment it is picked up: the full-day panel
      // (and any open menu) would otherwise sit between pointer and cells. An
      // open panel means the chip came from it (its backdrop covers the grid).
      // The panel is only hidden until the drag ends, not unmounted: the chip
      // under the finger lives in it, and a touch whose target leaves the page
      // stops reaching the listener that keeps it from scrolling the page.
      const panel = popoverRef.current
      if (panel !== null) {
        drag.fromPanel = true
        panel.style.visibility = 'hidden'
        if (backdropRef.current) backdropRef.current.style.display = 'none'
      }
      setMenuTarget(null)
      const ghost = ghostRef.current
      if (ghost) {
        ghost.textContent = drag.name
        ghost.style.display = 'flex'
      }
    }

    /**
     * Scrolls the compact layout's grid-and-list scroller while a drag rests
     * near its top or bottom edge, faster the closer it gets — so a name picked
     * up far down the day's list can still be carried up to a day in the grid
     * that has scrolled out of sight. A scroller with nowhere to go (the
     * desktop grid always fits) makes this a no-op.
     */
    function stepAutoScroll() {
      autoScrollFrame = null
      const drag = dragRef.current
      if (drag === null || !drag.armed || wrapper.scrollHeight <= wrapper.clientHeight) return
      const rect = wrapper.getBoundingClientRect()
      const into = drag.lastY < rect.top + AUTO_SCROLL_EDGE
        ? drag.lastY - (rect.top + AUTO_SCROLL_EDGE)
        : drag.lastY > rect.bottom - AUTO_SCROLL_EDGE
          ? drag.lastY - (rect.bottom - AUTO_SCROLL_EDGE)
          : 0
      if (into === 0) return
      const step = Math.max(-AUTO_SCROLL_MAX_STEP, Math.min(AUTO_SCROLL_MAX_STEP, (into / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_STEP))
      const before = wrapper.scrollTop
      wrapper.scrollTop += step
      if (wrapper.scrollTop === before) return
      markDrop(drag.lastX, drag.lastY)
      autoScrollFrame = requestAnimationFrame(stepAutoScroll)
    }

    /** What the pointer is over: a shift line of a day, or the day's blank space. */
    function dropTargetAt(x: number, y: number) {
      for (const element of document.elementsFromPoint(x, y)) {
        if (!(element instanceof HTMLElement) || element.closest('[data-cal-popover]') !== null) continue
        const day = dayElementOf(element)
        if (day === null) continue
        const iso = isoOfDay(day)
        if (iso === null) continue
        const line = element.closest('[data-cal-line]')
        return { iso, code: (line?.getAttribute('data-cal-line') ?? null) as ShiftCode | null, day, line }
      }
      return null
    }

    function markDrop(x: number, y: number) {
      const drag = dragRef.current
      const indicator = indicatorRef.current
      if (drag === null || indicator === null) return
      const target = dropTargetAt(x, y)
      if (target === null) {
        drag.drop = null
        indicator.style.display = 'none'
        return
      }
      const editable = live.current.stacks.get(target.iso)?.editable === true
      // Another day swaps the person's two days whole; another line of the same
      // day changes that day's shift. Anything else is a drop that changes
      // nothing, and reads as the indicator's refused state.
      const lineChange = editable && target.iso === drag.fromIso && target.code !== null && target.code !== drag.fromCode
      const swap = editable && target.iso !== drag.fromIso
      drag.drop = swap ? { iso: target.iso, code: null } : lineChange ? { iso: target.iso, code: target.code } : null
      // Only a same-day change is marked on its line; every other drop moves
      // the whole day, and a day with no schedule has no lines to mark.
      const marked = drag.drop !== null && !swap && target.line !== null ? target.line : target.day
      const rect = marked.getBoundingClientRect()
      const wrapperRect = wrapper.getBoundingClientRect()
      indicator.style.display = 'block'
      indicator.dataset.state = drag.drop === null ? 'refused' : 'ok'
      // The compact wrapper scrolls, and the indicator scrolls with its content.
      indicator.style.left = `${rect.left - wrapperRect.left + wrapper.scrollLeft}px`
      indicator.style.top = `${rect.top - wrapperRect.top + wrapper.scrollTop}px`
      indicator.style.width = `${rect.width}px`
      indicator.style.height = `${rect.height}px`
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const chip = target.closest('[data-chip]')
      if (chip === null) {
        // The "+N" chip: ours to open, never FullCalendar's to book.
        if (target.closest('[data-cal-more]') !== null) event.stopPropagation()
        return
      }
      // No chip press is ever a day click — this page owns every one of them.
      event.stopPropagation()
      if (chip.getAttribute('data-chip') !== 'shift' || event.button !== 0) return
      const iso = chip.getAttribute('data-iso')
      const code = chip.getAttribute('data-code')
      const personId = chip.getAttribute('data-person-id')
      if (iso === null || code === null || personId === null) return
      const drag: DragState = {
        personId,
        name: chip.getAttribute('data-name') ?? '',
        fromIso: iso,
        fromCode: code as ShiftCode,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        touch: event.pointerType !== 'mouse',
        armed: false,
        fromPanel: false,
        holdTimer: null,
        drop: null,
      }
      dragRef.current = drag
      if (drag.touch) drag.holdTimer = window.setTimeout(armDrag, TOUCH_HOLD_MS)
    }

    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current
      if (drag === null) return
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (!drag.armed) {
        // A finger that moves before the hold elapses is scrolling the grid,
        // not picking the chip up.
        if (drag.touch) {
          if (distance > TOUCH_CANCEL_DISTANCE) endDrag()
          return
        }
        if (distance < DRAG_MIN_DISTANCE) return
        armDrag()
      }
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate3d(${event.clientX + 12}px, ${event.clientY + 12}px, 0)`
      }
      markDrop(event.clientX, event.clientY)
      if (autoScrollFrame === null) autoScrollFrame = requestAnimationFrame(stepAutoScroll)
    }

    /**
     * Names can be swiped to scroll the list they sit in (`touch-action:
     * pan-y`), so once a held finger has picked one up, its moves have to stop
     * scrolling and start dragging. Non-passive for exactly that; a finger that
     * moves before the hold elapses never arms, so scrolling stays untouched.
     */
    function handleTouchMove(event: TouchEvent) {
      if (dragRef.current?.armed === true && event.cancelable) event.preventDefault()
    }

    function handlePointerUp() {
      const drag = dragRef.current
      if (drag === null) return
      clearHold()
      if (!drag.armed) {
        dragRef.current = null
        return
      }
      const drop = drag.drop
      endDrag()
      if (drop === null || live.current.stacks.get(drop.iso)?.editable !== true) return
      if (drop.iso !== drag.fromIso) live.current.editing.swapDays(drag.personId, drag.fromIso, drop.iso)
      else if (drop.code !== null) live.current.editing.changeShift(drag.personId, drop.iso, drop.code)
    }

    /**
     * The right-click target, read off the DOM rather than a parallel model: a
     * chip carries its own person, day and code, and anything else inside the
     * grid is that day's blank space. Null means "not ours" — the toolbar, the
     * padding around the grid — which leaves the menu shut.
     *
     * Resolved here, on the wrapper's own listener, rather than through React's
     * `onContextMenu`: the day stacks are portals into FullCalendar's cells, so
     * their events travel up the *React* tree (the page) and never through the
     * grid's own container — a React handler there would never see a chip.
     */
    function resolveMenuTarget(x: number, y: number): MenuTarget | null {
      for (const element of document.elementsFromPoint(x, y)) {
        if (!(element instanceof HTMLElement)) continue
        const chip = element.closest('[data-chip]')
        if (chip !== null) {
          const personId = chip.getAttribute('data-person-id')
          const iso = chip.getAttribute('data-iso')
          if (personId === null || iso === null) continue
          const code = chip.getAttribute('data-code')
          return code === null
            ? { kind: 'leave', personId, iso }
            : { kind: 'shift', personId, iso, code: code as ShiftCode }
        }
        const day = dayElementOf(element)
        if (day !== null) {
          const iso = isoOfDay(day)
          return iso === null ? null : { kind: 'day', iso }
        }
        if (element === wrapper) break
      }
      return null
    }

    /**
     * Radix's trigger also listens for this event, and skips opening when it
     * arrives already prevented — which is how a right-click on the toolbar, or
     * on the padding around the grid, closes the menu instead of opening it.
     */
    function handleContextMenu(event: MouseEvent) {
      const target = resolveMenuTarget(event.clientX, event.clientY)
      if (target === null) {
        event.preventDefault()
        return
      }
      setMenuTarget(target)
    }

    /**
     * Presses this page owns. FullCalendar's interaction tracks `mousedown`
     * and `touchstart` (not just the pointer events), so a chip and everything
     * that opens the day's panel have to have their press stopped here —
     * otherwise a chip would book a leave day, and "+N" would open the day's
     * dialog behind its own panel. Preventing the mouse default also stops the
     * browser starting a text selection, which would cancel our pointer
     * mid-drag; the touch press is left alone so the grid still scrolls.
     */
    function ownsPress(event: Event): boolean {
      const target = event.target
      if (!(target instanceof Element)) return false
      if (target.closest('[data-chip]') === null && target.closest('[data-cal-more]') === null) return false
      event.stopPropagation()
      return true
    }

    function handleMouseDown(event: MouseEvent) {
      if (ownsPress(event)) event.preventDefault()
    }

    function handleClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      // A chip first: nothing under a chip is ever this page's to open.
      if (target.closest('[data-chip]') !== null) {
        event.stopPropagation()
        return
      }
      const more = target.closest('[data-cal-more]')
      if (more === null) return
      event.stopPropagation()
      event.preventDefault()
      openPopover(more.getAttribute('data-cal-more') ?? '')
    }

    wrapper.addEventListener('pointerdown', handlePointerDown, true)
    wrapper.addEventListener('mousedown', handleMouseDown, true)
    wrapper.addEventListener('touchstart', ownsPress, { capture: true, passive: true })
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false })
    wrapper.addEventListener('contextmenu', handleContextMenu, true)
    wrapper.addEventListener('click', handleClick, true)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      endDrag()
      wrapper.removeEventListener('pointerdown', handlePointerDown, true)
      wrapper.removeEventListener('mousedown', handleMouseDown, true)
      wrapper.removeEventListener('touchstart', ownsPress, true)
      wrapper.removeEventListener('touchmove', handleTouchMove)
      wrapper.removeEventListener('contextmenu', handleContextMenu, true)
      wrapper.removeEventListener('click', handleClick, true)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [openPopover])

  // The full-day panel is a peek, not a mode: Escape closes it the way it
  // closes every other overlay in the app. (The leave dialog's own Escape
  // handler runs first when it is the one on top.)
  useEffect(() => {
    if (popover === null) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPopover(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [popover])

  // ⌘Z / ⇧⌘Z, plus Ctrl+Y for the Windows habit. The stack belongs to this page
  // alone — the board keeps its own — so the binding exists only while it is
  // mounted, and never steals the keystroke from a field or an open dialog.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return
      const target = event.target
      const inField =
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') !== null
      // Only a modal blocks the shortcut outright; the day panel is a peek, and
      // undo must keep working while it is open.
      if (inField || document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) editing.redo()
        else editing.undo()
      } else if (key === 'y' && event.ctrlKey) {
        event.preventDefault()
        editing.redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editing.undo, editing.redo])

  // The target *is* the menu's open state, so an open Radix asks for from its
  // own long-press (a pen, say) can never show an empty panel. Radix's trigger
  // also listens for the contextmenu event and skips opening when it arrives
  // already prevented — which is how a right-click on the toolbar, or on the
  // padding around the grid, closes the menu instead of opening it. The target
  // itself is resolved in the wrapper's own listener, because the day stacks are
  // portals and their events never reach the grid's React container.
  function handleMenuOpenChange(open: boolean) {
    if (!open) setMenuTarget(null)
  }

  function submitDialog(personId: string, range: LeaveRange) {
    if (dialog === null) return
    applyLeave(personId, dialog.mode === 'edit' ? dialog.original : null, range)
    setDialog(null)
  }

  function removeDialogLeave() {
    if (dialog === null || dialog.original === null) return
    applyLeave(dialog.personId, dialog.original, null)
    setDialog(null)
  }

  /** The whole of one person's run of leave, which is what a leave chip's menu acts on. */
  function leaveRangeOf(personId: string, iso: string): LeaveRange | null {
    const person = source.people.find((p) => p.id === personId)
    if (person === undefined) return null
    return toLeaveRanges(person.timeOff ?? []).find((range) => range.start <= iso && iso <= range.end) ?? null
  }

  /** The menu for a shift chip: the catalog plus Off, the current one checked. */
  function shiftMenu(target: Extract<MenuTarget, { kind: 'shift' }>) {
    return (
      <>
        <ContextMenu.Label className="cal-menu-label">{t('board.menu.title')}</ContextMenu.Label>
        {source.shifts.map((shift) => (
          <ContextMenu.Item
            key={shift.code}
            className={menuItem}
            onSelect={() => editing.changeShift(target.personId, target.iso, shift.code)}
          >
            <span aria-hidden className="cal-menu-swatch" style={{ background: swatchBg(shift.color) }} />
            <span className="font-semibold">{shift.code}</span>
            <span className="ml-auto font-[family-name:var(--font-mono)] text-2xs text-[color:var(--text-faint)]">
              {shift.start}–{shift.end}
            </span>
            {target.code === shift.code && <Check className="h-3.5 w-3.5 text-primary" />}
          </ContextMenu.Item>
        ))}
        <ContextMenu.Item className={menuItem} onSelect={() => editing.changeShift(target.personId, target.iso, OFF_CODE)}>
          <span aria-hidden className="cal-menu-swatch" />
          <span className="font-semibold">{t('board.menu.dayOff')}</span>
        </ContextMenu.Item>
      </>
    )
  }

  /** The menu for a leave chip: the roster's own leave actions, all undoable here. */
  function leaveMenu(target: Extract<MenuTarget, { kind: 'leave' }>) {
    const person = source.people.find((p) => p.id === target.personId)
    const range = leaveRangeOf(target.personId, target.iso)
    const single = range !== null && rangeLength(range) === 1
    const named = person !== undefined && person.name.trim() !== ''
    return (
      <>
        {range !== null && (
          <MenuRow
            icon={Pencil}
            label={t('cal.menu.edit')}
            onSelect={() =>
              setDialog({ mode: 'edit', personId: target.personId, from: range.start, to: range.end, original: range })
            }
          />
        )}
        {range !== null && !single && (
          <MenuRow
            icon={CalendarX}
            label={t('cal.menu.removeDay', { date: dateLabel(target.iso) })}
            onSelect={() => applyLeave(target.personId, { start: target.iso, end: target.iso }, null)}
          />
        )}
        {range !== null && (
          <MenuRow
            icon={CalendarPlus}
            label={t('cal.menu.extend')}
            onSelect={() => applyLeave(target.personId, range, { start: range.start, end: addDaysISO(range.end, 1) })}
          />
        )}
        {range !== null && (
          <MenuRow
            icon={CalendarMinus}
            label={t('cal.menu.shorten')}
            disabled={single}
            onSelect={() => applyLeave(target.personId, range, { start: range.start, end: addDaysISO(range.end, -1) })}
          />
        )}
        <MenuRow
          icon={Filter}
          label={t('cal.menu.showOnly', { name: person?.name ?? '' })}
          disabled={!named}
          onSelect={() => setFilters({ query: person?.name ?? '' })}
        />
        {range !== null && (
          <>
            <ContextMenu.Separator className={menuSeparator} />
            <MenuRow
              icon={Trash2}
              label={t('cal.remove')}
              destructive
              onSelect={() => applyLeave(target.personId, range, null)}
            />
          </>
        )}
      </>
    )
  }

  /** The menu for a blank day: book it or its week, then clear everyone on it. */
  function dayMenu(target: Extract<MenuTarget, { kind: 'day' }>) {
    const onLeave = visible.filter((person) => person.timeOff?.includes(target.iso))
    const week = weekOfCell(wrapperRef.current, target.iso)
    return (
      <>
        <MenuRow
          icon={Plus}
          label={t('cal.menu.bookDay', { date: dateLabel(target.iso) })}
          onSelect={() => openBookDialog(target.iso, target.iso)}
        />
        <MenuRow
          icon={CalendarRange}
          label={t('cal.menu.bookWeek')}
          onSelect={() => openBookDialog(week.start, week.end)}
        />
        <ContextMenu.Separator className={menuSeparator} />
        <MenuRow
          icon={Eraser}
          label={t('cal.menu.clearDay', { date: dateLabel(target.iso), count: onLeave.length })}
          destructive
          disabled={onLeave.length === 0}
          // One action, one undo entry: everyone's day off comes off in a single batch.
          onSelect={() =>
            editing.setTimeOffMany(
              onLeave.map((person) => ({
                personId: person.id,
                nextTimeOff: (person.timeOff ?? []).filter((day) => day !== target.iso),
              })),
            )
          }
        />
      </>
    )
  }

  if (active.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="m-0 text-sm text-[color:var(--text-dim)]">{t('rtc.roster.emptyDescription')}</p>
      </div>
    )
  }

  const selectedStack = stacks.get(selectedIso)
  const selectedEmpty = selectedStack === undefined || (selectedStack.groups.length === 0 && selectedStack.leave.length === 0)

  return (
    <div className="cal-calendar flex h-full min-h-0 flex-col" data-layout={isNarrow ? 'compact' : 'grid'}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pb-2 pt-3 md:px-4">
        <div className="join">
          <button
            type="button"
            aria-label={t('cal.prev')}
            onClick={() => calendarRef.current?.getApi().prev()}
            className="btn btn-xs btn-ghost join-item min-h-11 md:min-h-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => calendarRef.current?.getApi().today()}
            className="btn btn-xs btn-ghost join-item min-h-11 md:min-h-0"
          >
            {t('cal.today')}
          </button>
          <button
            type="button"
            aria-label={t('cal.next')}
            onClick={() => calendarRef.current?.getApi().next()}
            className="btn btn-xs btn-ghost join-item min-h-11 md:min-h-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="min-h-5 text-sm font-semibold tracking-tight">{title}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('cal.viewAria')} className="join">
            {CALENDAR_VIEWS.map(({ type, labelKey }) => (
              <button
                key={type}
                type="button"
                aria-pressed={viewType === type}
                // Compact keeps the selected day in sight across the switch,
                // the way a phone calendar's week strip opens on that day.
                onClick={() => calendarRef.current?.getApi().changeView(type, isNarrow ? selectedIso : undefined)}
                className={`btn btn-xs join-item min-h-11 md:min-h-0 ${
                  viewType === type ? 'btn-primary' : 'btn-ghost text-base-content/60'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div className="join">
            <button
              type="button"
              aria-label={t('cal.undo')}
              disabled={!editing.canUndo}
              onClick={editing.undo}
              className="btn btn-xs btn-ghost join-item min-h-11 md:min-h-0"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t('cal.redo')}
              disabled={!editing.canRedo}
              onClick={editing.redo}
              className="btn btn-xs btn-ghost join-item min-h-11 md:min-h-0"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
          {/* The compact layout books from the selected day's list instead. */}
          {!isNarrow && (
            <button
              type="button"
              onClick={() => openBookDialog('', '')}
              className="btn btn-primary btn-xs min-h-11 gap-1.5 md:min-h-0"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('cal.bookLeave')}
            </button>
          )}
        </div>
      </div>

      {/* Compact: the grid bleeds to the screen edges and the selected day's
          list fills what is left under it, as in a phone calendar. */}
      <div
        ref={wrapperRef}
        className={isNarrow ? 'relative min-h-0 flex-1 overflow-y-auto' : 'relative min-h-0 flex-1 px-4 pb-3'}
      >
        <ContextMenu.Root open={menuTarget !== null} onOpenChange={handleMenuOpenChange}>
          <ContextMenu.Trigger asChild>
            <div className={isNarrow ? 'flex min-h-full flex-col' : 'h-full'}>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                initialDate={initialPeriod?.start}
                locale={FC_LOCALES[locale]}
                headerToolbar={false}
                height={isNarrow ? 'auto' : '100%'}
                {...(isNarrow ? { dayHeaderFormat: { weekday: 'narrow' } } : {})}
                fixedWeekCount={false}
                selectable
                longPressDelay={TOUCH_LONG_PRESS_MS}
                selectLongPressDelay={TOUCH_LONG_PRESS_MS}
                selectMinDistance={SELECT_MIN_DISTANCE}
                dayCellContent={(cell: DayCellContentArg) => (
                  <span className="cal-day-number">
                    <span
                      className="cal-day-add"
                      aria-hidden
                      title={t('cal.addDayAria', { date: dateLabel(localIsoDate(cell.date)) })}
                    >
                      <Plus className="h-3 w-3" />
                    </span>
                    {cell.dayNumberText}
                  </span>
                )}
                dayCellDidMount={handleDayCellDidMount}
                select={handleSelect}
                dateClick={handleDateClick}
                datesSet={handleDatesSet}
              />

              {/* The stacks themselves: one portal per rendered day cell, so they
                  are ordinary React that follows every atom this page reads. */}
              {cells.map(({ iso, el }) =>
                createPortal(
                  isNarrow ? (
                    <CalMini key={iso} iso={iso} stack={stacks.get(iso)} selected={iso === selectedIso} />
                  ) : (
                    <CalDay key={iso} iso={iso} stack={stacks.get(iso)} cap={cap} />
                  ),
                  el,
                  iso,
                ),
              )}

              {isNarrow && (
                <section className="cal-agenda" aria-label={dateLabel(selectedIso)}>
                  <div className="cal-agenda-head">
                    <h2 className="cal-agenda-title">{dateLabel(selectedIso)}</h2>
                    <button
                      type="button"
                      onClick={() => openBookDialog(selectedIso, selectedIso)}
                      className="btn btn-primary btn-sm min-h-11 gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      {t('cal.bookLeave')}
                    </button>
                  </div>
                  {selectedEmpty ? (
                    <p className="cal-agenda-empty">
                      {t(selectedStack?.editable === true ? 'cal.dayEmpty' : 'cal.dayUnscheduled')}
                    </p>
                  ) : (
                    <CalDay iso={selectedIso} stack={selectedStack} cap={Number.POSITIVE_INFINITY} />
                  )}
                </section>
              )}

              {popover !== null && (
                <>
                  <div ref={backdropRef} className="cal-popover-backdrop" onPointerDown={() => setPopover(null)} />
                  <div
                    ref={popoverRef}
                    key={popover.iso}
                    data-cal-popover
                    role="dialog"
                    aria-label={dateLabel(popover.iso)}
                    className="cal-popover"
                    // A little wider than its cell, so it reads as the day opened up.
                    style={{ visibility: 'hidden', minWidth: Math.max(POPOVER_MIN_WIDTH, popover.cell.width + 16) }}
                  >
                    <div className="cal-popover-head">
                      <span>{dateLabel(popover.iso)}</span>
                      <button
                        type="button"
                        onClick={() => setPopover(null)}
                        aria-label={t('chrome.close')}
                        className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-base-content"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="cal-popover-body">
                      <CalDay
                        iso={popover.iso}
                        stack={stacks.get(popover.iso)}
                        cap={Number.POSITIVE_INFINITY}
                      />
                    </div>
                  </div>
                </>
              )}

              <div ref={ghostRef} className="cal-drag-ghost" aria-hidden />
              <div ref={indicatorRef} className="cal-drop-indicator" aria-hidden />
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className={menuPanel} collisionPadding={8}>
              {menuTarget === null
                ? null
                : menuTarget.kind === 'shift'
                  ? shiftMenu(menuTarget)
                  : menuTarget.kind === 'leave'
                    ? leaveMenu(menuTarget)
                    : dayMenu(menuTarget)}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>

      {dialog !== null && (
        <LeaveDialog
          request={dialog}
          people={source.people}
          teams={source.teams}
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
          onRemove={removeDialogLeave}
        />
      )}
    </div>
  )
}
