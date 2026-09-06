import { useT } from '../i18n/useT'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assignmentKey,
  DEFAULT_SHIFTS,
  defaultCoverageTable,
  UNASSIGNED_TEAM_ID,
  type Assignment,
  type Person,
} from '@crewdoku/domain'
import {
  emptyAssignments,
  UNASSIGNED_TEAM,
  type BoardData,
} from './mockBoard'
import { useAtom } from 'jotai'
import { coverageDrillAtom } from '../state/coverageDrill'
import { useRosterPeople } from '../state/roster'
import { useRosterTeams } from '../state/teams'
import { useRosterShifts } from '../state/shifts'
import { useBoardSchedule } from '../state/schedule'
import { useCoverageRules } from '../state/coverageRules'
import { useSolveSettings } from '../state/solveSettings'
import { useSettingsDirty } from '../state/settingsDirty'
import { useTakeAutoGenerateOnMount } from '../state/onboarding'
import { buildModelInput, cancelSolve, solve } from '../engine'
import type { ModelInput, RelaxationOption, ScheduleMap } from '../engine/types'
import { useGenerateFlow } from './generate/useGenerateFlow'
import { GenerateControls } from './generate/GenerateControls'
import { InfeasiblePanel } from './generate/InfeasiblePanel'
import { DayCell } from './DayCell'
import { HeaderCell } from './HeaderCell'
import { TeamHeaderRow } from './TeamHeaderRow'
import { SelectionOverlay } from './SelectionOverlay'
import { CellMenu } from './CellMenu'
import { ProblemList } from './ProblemList'
import { ViolationTip, type ViolationTipState } from './ViolationTip'
import { detectViolations, partitionViolationsForBoard, type Violation } from './violations'
import { computeCoverage, eligibleFreePeople } from './coverage'
import { CoveragePanel, type CoveragePanelState } from './CoveragePanel'
import { computeFairness } from './fairness'
import { FairnessHeaderCell } from './FairnessHeaderCell'
import { FairnessCell } from './FairnessCell'
import { PersonPanel } from './PersonPanel'
import { useBoardEditing } from './useBoardEditing'
import type { OverlayRect } from './useBoardEditing'
import type { CellPatch } from './editHistory'
import {
  buildPendingProposal,
  computeFairnessMovement,
  groupChangesByPerson,
  shiftLabel,
  type PendingProposal,
} from './proposal/proposal'
import { ProposalPanel } from './proposal/ProposalPanel'
import { ScheduleImportPanel } from '../onboarding/ScheduleImport'

const HIDDEN_TIP: ViolationTipState = { left: 0, top: 0, message: '', visible: false }

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(iso: string, weekday: number): string {
  const [, m, d] = iso.split('-')
  return `${WEEKDAY_SHORT[weekday]} ${Number(m)}/${Number(d)}`
}

type BoardGridProps = {
  periodId: string
  initial: BoardData
}

/**
 * Scroll-edge shadows are toggled via data-* attributes written straight to
 * the DOM, not React state — this stays a plain listener so a scroll never
 * triggers a board re-render (ticket 03 research).
 *
 * The scroller used to be `main` itself (BoardGrid's only DOM output was
 * `.cd-board`, so `main` scrolled it directly). Ticket 09's docked side panel
 * needed its own fixed-width lane that never scrolls with the grid, so the
 * grid now scrolls inside `.cd-board-scroll`, a sibling of the panel — this
 * hook takes that scroller by ref instead of walking up to `main`.
 */
function useScrollEdges(
  rootRef: React.RefObject<HTMLDivElement | null>,
  scrollerRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const root = rootRef.current
    const scroller = scrollerRef.current
    if (!root || !scroller) return

    const update = () => {
      if (scroller.scrollTop > 0) root.setAttribute('data-scrolled-y', '')
      else root.removeAttribute('data-scrolled-y')
      if (scroller.scrollLeft > 0) root.setAttribute('data-scrolled-x', '')
      else root.removeAttribute('data-scrolled-x')
    }

    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
  }, [rootRef, scrollerRef])
}

export function BoardGrid({ periodId, initial }: BoardGridProps) {
  const t = useT()
  const data = initial
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  useScrollEdges(rootRef, scrollerRef)

  // The proposal overlay (ticket 12): a solve doesn't commit straight to the
  // board any more — it lands here for review. `null` means nothing to
  // review; editing is locked for as long as this is set.
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null)

  // Ticket 17 rework: an existing, still-empty period's board can import a
  // real schedule in place, from the Generate banner's own "Import
  // schedule…" button — no dedicated route, just an overlay over the board
  // it's about to fill.
  const [importOpen, setImportOpen] = useState(false)

  // People are stateful, not a plain read of `data.people` (ticket 09): the
  // person panel edits eligibility/time off/preferences in place, and those
  // edits need to flow back into the same person object every other surface
  // (fairness, violations, hand-editing) already reads. Ticket 16 moved this
  // from a local `useState` to `useRosterPeople`; ticket 25 made that atom
  // workspace-global rather than per-period, so an add/edit/remove on the
  // Roster route (`routes/Roster.tsx`) shows up here too, on every period.
  // Declared before `baseAssignments` below: a person added on the Roster
  // route, before this board ever mounts, must already be in `people` on
  // this component's very first render.
  const [people, setPeople] = useRosterPeople(data.people)
  // Ticket 19: teams are managed for real on their own surface
  // (`routes/Teams.tsx`) — workspace-global the same way `people` is
  // (ticket 25), so a rename, a new team, or a delete-with-reassignment
  // shows up on the board immediately, for every period.
  const [teams, setTeams] = useRosterTeams(data.teams)
  // Ticket 15: the shift catalog, coverage table, and hard/soft rule
  // settings all live the same way — workspace-global (ticket 25), seeded
  // once from a default, editable for real only on `routes/Settings.tsx`.
  const [shifts] = useRosterShifts(DEFAULT_SHIFTS)
  const defaultCoverage = useMemo(() => defaultCoverageTable(DEFAULT_SHIFTS, data.teams.length), [data.teams.length])
  const [coverageTable] = useCoverageRules(defaultCoverage)
  const [solveSettings] = useSolveSettings()
  const [settingsDirty, setSettingsDirty] = useSettingsDirty(periodId)
  const shiftColorByCode = useMemo(
    () => Object.fromEntries(shifts.map((s) => [s.code, s.color])),
    [shifts],
  )

  // The board's real starting point (ticket 11): nobody assigned anything
  // until a solve lands. `hasSchedule` flips once, on the first successful
  // solve; both reset when the period changes. Seeded from `people` (the
  // live roster), not `data.people` (the static mock) — a person the Roster
  // route already added before mount would otherwise have no entry here,
  // and `useBoardEditing`'s `getAssignment` does a non-null assertion on a
  // missing key, crashing on the very first render, before any effect could
  // backfill it (found live-testing ticket 16's add-person flow).
  const [baseAssignments, hasSchedule, setSchedule] = useBoardSchedule(periodId, emptyAssignments(people, data.dates))
  // The schedule stays per period (ticket 15), unlike people/teams/shifts/
  // coverage/settings, which are now workspace-global (ticket 25) — a fresh
  // mount of the same period just reads back what was there, no reset
  // needed (the hook's own seed-if-absent effect covers a true first
  // visit). A period switch remounts this component (`key={period.id}` in
  // Board.tsx), and an in-place date edit is reconciled at the atom level
  // by `updatePeriodAtom` — surviving cells keep their codes, new dates
  // fill OFF — so no mounted-board reset exists anymore: the old
  // wipe-to-empty effect here would have thrown away exactly the schedule
  // that edit preserves.

  const updatePerson = useCallback((personId: string, patch: Partial<Person>) => {
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, ...patch } : p)))
  }, [setPeople])

  // Ticket 16: the Roster surface can add a person after this board's
  // `baseAssignments` was seeded — this fills in just their missing keys
  // (default OFF, unpinned) without touching anyone else's, so a brand new
  // person never trips `useBoardEditing`'s `getAssignment` on a Map miss.
  // Returning `prev` unchanged when nothing's missing means a plain roster
  // edit (rename, re-team, toggle eligibility) never re-triggers this.
  useEffect(() => {
    let changed = false
    const next = new Map(baseAssignments)
    for (const person of people) {
      for (const date of data.dates) {
        const key = assignmentKey(person.id, date.iso)
        if (!next.has(key)) {
          next.set(key, { code: 'OFF', start: null, end: null, pinned: false, ineligible: false })
          changed = true
        }
      }
    }
    if (changed) setSchedule(next, hasSchedule)
  }, [people, data.dates])

  const peopleByTeam = useMemo(() => {
    const map = new Map<string, Person[]>()
    for (const person of people) {
      const list = map.get(person.teamId)
      if (list) list.push(person)
      else map.set(person.teamId, [person])
    }
    return map
  }, [people])

  // Not everyone has a team (8bu: the roster shouldn't assume full staffing)
  // — an "Unassigned" group renders after the real teams, only when someone
  // actually needs it, sharing every code path a real team already has
  // (fold, keyboard nav, the person panel) since it's a real `Team` shape.
  const boardTeams = useMemo(
    () => (peopleByTeam.get(UNASSIGNED_TEAM_ID)?.length ? [...teams, UNASSIGNED_TEAM] : teams),
    [teams, peopleByTeam],
  )

  // Row space for selection/keyboard nav: only people actually on screen,
  // in the same order the grid renders them, so an arrow key never lands on
  // a folded team.
  const visiblePeople = useMemo(() => {
    const list: Person[] = []
    for (const team of boardTeams) {
      if (collapsed.has(team.id)) continue
      list.push(...(peopleByTeam.get(team.id) ?? []))
    }
    return list
  }, [boardTeams, peopleByTeam, collapsed])

  // Generate (ticket 11): `runSolveRef` breaks the circularity between
  // `useGenerateFlow` (needs a callable solve) and `useBoardEditing` (the
  // request needs `editing.getAssignment`) — the wrapper handed to
  // `useGenerateFlow` never changes identity; it just calls whatever's
  // currently in the ref, which is refreshed below once `editing` exists.
  // Editing stays live for the whole solve (8bu's pick, from three
  // prototype variants — see ticket 11): a hand-edit made mid-solve is a
  // pin already held in `overrides`, and `getAssignment` reads overrides
  // ahead of the base schedule, so it survives the solved result landing
  // underneath it with no extra reconciliation code.
  const runSolveRef = useRef<(onLog: (line: string) => void) => ReturnType<typeof solve>>(() =>
    Promise.resolve({ status: 'solved', schedule: new Map() }),
  )
  const runSolveStable = useCallback((onLog: (line: string) => void) => runSolveRef.current(onLog), [])
  // Same ref trick as `runSolveRef` just below: `onSolved` needs `people`,
  // `data.dates`, and `editing.getAssignment` to build the diff, but
  // `editing` doesn't exist yet at the point `useGenerateFlow` is called —
  // the stable callback just forwards to whatever's in the ref, refreshed
  // every render once `editing` does exist.
  const onSolvedRef = useRef<(schedule: ScheduleMap) => void>(() => {})
  const onSolvedStable = useCallback((schedule: ScheduleMap) => onSolvedRef.current(schedule), [])
  const generateFlow = useGenerateFlow(runSolveStable, onSolvedStable, cancelSolve)

  // Ticket 13: a relaxation reshapes the model input before the next solve. A
  // ref, not state, for the same reason as `runSolveRef`/`onSolvedRef` above —
  // `applyRelaxation` composes onto it and re-solves in the same tick, so the
  // next solve must see the reshaped input immediately, not after a render
  // round-trip. A fresh Generate clears it (see `onGenerate`).
  const relaxTransformRef = useRef<((input: ModelInput) => ModelInput) | null>(null)

  const editing = useBoardEditing(
    rootRef,
    visiblePeople,
    data.dates,
    baseAssignments,
    shifts,
    periodId,
    pendingProposal !== null,
  )

  runSolveRef.current = (onLog) => {
    const schedule = new Map<string, Assignment>()
    for (const person of people) {
      for (const date of data.dates) {
        schedule.set(assignmentKey(person.id, date.iso), editing.getAssignment(person.id, date.iso))
      }
    }
    // Removed people (ticket 16) drop out inside `buildModelInput`; their
    // existing entries above still carry through untouched, since the proposal
    // only ever spans the model's active people.
    const base = buildModelInput({
      people,
      teams,
      shifts,
      coverage: coverageTable,
      settings: solveSettings,
      dates: data.dates.map((date) => date.iso),
      current: schedule,
    })
    const input = relaxTransformRef.current ? relaxTransformRef.current(base) : base
    return solve(input, onLog)
  }

  // A relaxation button (ticket 13): "each one rebuilds the model and
  // re-solves" (the ticket's own words) — never applied straight to the
  // board. A feasible result still lands in the normal ticket-12 proposal
  // review via `onSolvedRef` above; there's no separate landing path for a
  // relaxation-triggered solve.
  const applyRelaxation = useCallback(
    (option: RelaxationOption) => {
      const prev = relaxTransformRef.current
      relaxTransformRef.current = (input) => option.apply(prev ? prev(input) : input)
      generateFlow.generate()
    },
    [generateFlow],
  )

  // The proposal overlay's entry point (ticket 12): a solve that comes back
  // identical to what's already on the board (a Regenerate with nothing to
  // change) has nothing to review, so it commits silently instead of
  // opening an overlay with zero rows in it.
  onSolvedRef.current = (schedule) => {
    const proposal = buildPendingProposal(
      people,
      data.dates,
      editing.getAssignment,
      schedule,
      shifts,
      solveSettings.hardRules.maxHoursPerWeek,
    )
    if (proposal.changes.length === 0) {
      setSchedule(baseAssignments, true)
      setSettingsDirty(false)
      return
    }
    setPendingProposal(proposal)
  }

  // While a proposal is pending, the board displays what applying it would
  // produce — cells show the new value, not the old one (the map's call:
  // "show the new value only"). Discarding just drops this preference,
  // which is why Discard needs no state of its own to undo.
  const getDisplayAssignment = useCallback(
    (personId: string, dateIso: string): Assignment => {
      if (pendingProposal) {
        const proposed = pendingProposal.schedule.get(assignmentKey(personId, dateIso))
        if (proposed) return proposed
      }
      return editing.getAssignment(personId, dateIso)
    },
    [pendingProposal, editing.getAssignment],
  )

  const onGenerate = useCallback(() => {
    relaxTransformRef.current = null
    generateFlow.generate()
  }, [generateFlow])

  // A thin top accent on the board while a solve is running — editing isn't
  // locked, but the planner should still see one is in flight.
  useEffect(() => {
    const board = rootRef.current
    if (!board) return
    if (generateFlow.state.phase === 'solving') board.setAttribute('data-generating', '')
    else board.removeAttribute('data-generating')
  }, [generateFlow.state.phase])

  // All people x all dates, not just what's on screen — a break caused by an
  // edit two weeks away must still show up (ticket 07).
  const violations = useMemo(
    () =>
      detectViolations(
        people,
        data.dates,
        getDisplayAssignment,
        shifts,
        solveSettings.hardRules.enabled,
        solveSettings.hardRules.maxHoursPerWeek,
        solveSettings.hardRules.minRestHours,
      ),
    [people, data.dates, getDisplayAssignment, shifts, solveSettings.hardRules],
  )
  // Each violation gets exactly one detail surface (8bu: the row tooltip
  // "should list only errors that doesn't has placed on the board"): a
  // violation whose person/date cell renders on the board is told by that
  // cell's red dot + hover, and only there. The pinned right column carries
  // the remainder — violations with no board cell to live on. Every current
  // rule kind anchors to a cell, so that remainder is empty today; the lane
  // exists so a future period-scoped check (no single guilty cell) has a
  // home without re-plumbing the board.
  const violationPlacement = useMemo(
    () =>
      partitionViolationsForBoard(
        violations,
        new Set(people.map((p) => p.id)),
        new Set(data.dates.map((d) => d.iso)),
      ),
    [violations, people, data.dates],
  )

  // Filled-vs-needed per shift per day, live off the same overrides as
  // violations — an edit that fills a hole updates the bar the same render
  // it updates the cell (ticket 06: "typing into a lit cell updates the bar
  // immediately").
  const coverage = useMemo(
    () => computeCoverage(people, data.dates, shifts, coverageTable, getDisplayAssignment),
    [people, data.dates, shifts, coverageTable, getDisplayAssignment],
  )

  // Same live-off-overrides pattern as coverage/violations above: a hand-edit
  // updates a person's totals the same render it updates the cell (ticket 08).
  // `fairnessBase` never reads the pending proposal — it's the board as it
  // stood before this solve, the "before" half of ticket 12's movement.
  const fairnessBase = useMemo(
    () => computeFairness(people, data.dates, editing.getAssignment, shifts, solveSettings.hardRules.maxHoursPerWeek),
    [people, data.dates, editing.getAssignment, shifts, solveSettings.hardRules.maxHoursPerWeek],
  )
  // What the columns actually show: the proposal's own totals while one is
  // pending (frozen at solve time, matching the board's display), the live
  // totals otherwise.
  const fairness = pendingProposal ? pendingProposal.fairnessAfter : fairnessBase

  // Ticket 12: the diff grouped for the overlay, the per-person hours/nights/
  // weekends movement it implies, and the hover-old-value text for every
  // changed cell. All empty when nothing is pending.
  const proposalGroups = useMemo(
    () => (pendingProposal ? groupChangesByPerson(pendingProposal.changes, people) : []),
    [pendingProposal, people],
  )
  const proposalMovement = useMemo(() => {
    if (!pendingProposal) return new Map()
    const changedIds = new Set(pendingProposal.changes.map((c) => c.personId))
    return computeFairnessMovement(changedIds, fairnessBase, pendingProposal.fairnessAfter)
  }, [pendingProposal, fairnessBase])
  const proposalChangeMessages = useMemo(() => {
    const map = new Map<string, string>()
    if (!pendingProposal) return map
    for (const change of pendingProposal.changes) {
      map.set(assignmentKey(change.personId, change.dateIso), t('board.proposal.was', { shift: shiftLabel(change.from) }))
    }
    return map
  }, [pendingProposal, t])

  const [problemsOpen, setProblemsOpen] = useState(false)
  // DRAFT (board-overhaul): violations, the fairness column, and the coverage
  // bar are all diagnostic layers, not the schedule itself, but a manager
  // scanning a period wants them visible immediately — on by default, one
  // toggle still hides all three together for a bare-schedule view.
  const [showIssues, setShowIssues] = useState(true)
  const pendingRevealRef = useRef<{ personId: string; dateIso: string } | null>(null)

  // The person panel (ticket 09): clicking a name opens a docked drawer for
  // that person. The row stays visible — scrolled into view and highlighted
  // — the decision 8bu made over an independent-of-scroll panel, since the
  // reason to open the panel is usually a specific cell in view.
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const pendingPersonRevealRef = useRef<string | null>(null)

  const openPersonPanel = useCallback(
    (personId: string) => {
      const person = people.find((p) => p.id === personId)
      if (!person) return
      setSelectedPersonId(personId)
      if (collapsed.has(person.teamId)) {
        pendingPersonRevealRef.current = personId
        setCollapsed((prev) => {
          const next = new Set(prev)
          next.delete(person.teamId)
          return next
        })
      }
    },
    [people, collapsed],
  )

  // Scrolls the selected person's row into view once it's actually on screen
  // — a folded team has to unfold first (same two-step as `revealViolation`
  // above), so this waits for `visiblePeople` to catch up.
  useEffect(() => {
    if (!selectedPersonId) return
    if (!visiblePeople.some((p) => p.id === selectedPersonId)) return
    pendingPersonRevealRef.current = null
    const board = rootRef.current
    const nameEl = board?.querySelector<HTMLElement>(`.cd-board__name[data-person-id="${selectedPersonId}"]`)
    nameEl?.scrollIntoView({ block: 'center' })
  }, [selectedPersonId, visiblePeople])

  // Row highlight written straight to the DOM (the same dim/light technique
  // ticket 06's coverage drill-down uses), not a per-cell React prop — a
  // selection change would otherwise re-render all 4200 cells for a
  // cosmetic outline.
  useEffect(() => {
    const board = rootRef.current
    if (!board) return
    board.querySelectorAll('[data-selected-person]').forEach((el) => el.removeAttribute('data-selected-person'))
    if (!selectedPersonId) return
    board
      .querySelectorAll(`[data-person-id="${selectedPersonId}"]`)
      .forEach((el) => el.setAttribute('data-selected-person', ''))
  }, [selectedPersonId, visiblePeople])

  useEffect(() => {
    if (!selectedPersonId) return
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedPersonId(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedPersonId])

  useEffect(() => {
    if (!importOpen) return
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImportOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [importOpen])

  // One shared tooltip node for the whole board (never one per cell — 4200
  // of those would flood the DOM), repositioned on hover via delegation, the
  // same pattern as the selection overlay and the cell menu.
  const [tip, setTip] = useState<ViolationTipState>(HIDDEN_TIP)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const showForTarget = (target: EventTarget | null) => {
      // SVG icons dispatch from their <path>/<circle>, not an HTMLElement.
      // `Element.closest` keeps delegation working no matter which part of
      // the drawn icon the pointer is actually over.
      const targetEl = target instanceof Element ? target : null
      const el = targetEl?.closest<HTMLElement>('.cd-cell[data-person-id]') ?? null
      const key = el ? assignmentKey(el.dataset.personId!, el.dataset.dateIso!) : null
      const parts: string[] = []
      if (el && key && el.dataset.violation !== undefined) parts.push(...(violationPlacement.cellMessages.get(key) ?? []))
      const hasViolationMsg = parts.length > 0
      if (el && key && el.dataset.proposalChanged !== undefined) {
        const changeMsg = proposalChangeMessages.get(key)
        if (changeMsg) parts.push(changeMsg)
      }
      const messages = parts.length > 0 ? parts : undefined

      if (el && messages) {
        const boardBox = root.getBoundingClientRect()
        const cellBox = el.getBoundingClientRect()
        setTip({
          left: cellBox.left - boardBox.left + cellBox.width / 2,
          top: cellBox.top - boardBox.top,
          message: messages.join(' · '),
          visible: true,
          // A real rule break always reads as an error, even alongside a
          // proposal change on the same cell; a proposal's "was: X" note on
          // its own is informational, not a problem (8bu's call).
          kind: hasViolationMsg ? 'violation' : 'proposal',
        })
        return
      }

      const fairEl = targetEl?.closest<HTMLElement>('.cd-fair-cell[data-person-id]') ?? null
      const fairViolations = fairEl ? (violationPlacement.otherByPerson.get(fairEl.dataset.personId!) ?? []) : []
      if (fairEl && fairViolations.length > 0) {
        const boardBox = root.getBoundingClientRect()
        const cellBox = fairEl.getBoundingClientRect()
        const below = cellBox.top - boardBox.top < 200
        setTip({
          left: cellBox.right - boardBox.left - 4,
          top: (below ? cellBox.bottom : cellBox.top) - boardBox.top,
          message: fairViolations.map((violation) => violation.message).join('\n'),
          visible: true,
          below,
          wide: true,
          alignEnd: true,
          kind: 'violation',
        })
        return
      }

      const fairHeaderEl = targetEl?.closest<HTMLElement>('.cd-fair-header') ?? null
      if (fairHeaderEl) {
        const boardBox = root.getBoundingClientRect()
        const cellBox = fairHeaderEl.getBoundingClientRect()
        setTip({
          left: cellBox.left - boardBox.left + cellBox.width / 2,
          top: cellBox.bottom - boardBox.top,
          message: t('board.fairness.tooltip'),
          visible: true,
          below: true,
          kind: 'violation',
        })
        return
      }

      // The holiday dot (ticket 04/02) — native `title` on the header cell
      // turned out unreliable, so this reuses the same shared-tip mechanism,
      // flipped below its target and toned amber via `kind` (see CSS).
      const headerEl = targetEl?.closest<HTMLElement>('.cd-header-cell[data-holiday]') ?? null
      const holidayName = headerEl?.dataset.holidayName
      if (headerEl && holidayName) {
        const boardBox = root.getBoundingClientRect()
        const cellBox = headerEl.getBoundingClientRect()
        setTip({
          left: cellBox.left - boardBox.left + cellBox.width / 2,
          top: cellBox.bottom - boardBox.top,
          message: holidayName,
          visible: true,
          below: true,
          kind: 'holiday',
        })
        return
      }

      setTip((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    }

    const handleOver = (e: MouseEvent) => showForTarget(e.target)
    const handleLeave = () => setTip((prev) => (prev.visible ? { ...prev, visible: false } : prev))

    root.addEventListener('mouseover', handleOver)
    root.addEventListener('mouseleave', handleLeave)
    return () => {
      root.removeEventListener('mouseover', handleOver)
      root.removeEventListener('mouseleave', handleLeave)
    }
  }, [rootRef, violationPlacement, proposalChangeMessages])

  function toggleTeam(teamId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  // A folded team hides its rows from the DOM entirely (ticket 04), so a
  // reveal has to unfold first, then wait a render for `visiblePeople` to
  // include the person before it can select/scroll to the cell.
  const revealViolation = useCallback(
    (violation: Violation) => {
      const person = people.find((p) => p.id === violation.personId)
      if (!person) return
      if (collapsed.has(person.teamId)) {
        pendingRevealRef.current = { personId: violation.personId, dateIso: violation.dateIso }
        setCollapsed((prev) => {
          const next = new Set(prev)
          next.delete(person.teamId)
          return next
        })
        return
      }
      editing.selectByIds(violation.personId, violation.dateIso)
    },
    [people, collapsed, editing],
  )

  useEffect(() => {
    const pending = pendingRevealRef.current
    if (!pending) return
    if (editing.selectByIds(pending.personId, pending.dateIso)) {
      pendingRevealRef.current = null
    }
  }, [visiblePeople, editing])

  // Ticket 12: every variant's "click a change, jump to its cell" — same
  // unfold-then-select two-step as `revealViolation` above, reusing the same
  // pending-reveal ref since both just want a person/date pair on screen.
  const jumpToProposalCell = useCallback(
    (personId: string, dateIso: string) => {
      const person = people.find((p) => p.id === personId)
      if (!person) return
      if (collapsed.has(person.teamId)) {
        pendingRevealRef.current = { personId, dateIso }
        setCollapsed((prev) => {
          const next = new Set(prev)
          next.delete(person.teamId)
          return next
        })
        return
      }
      editing.selectByIds(personId, dateIso)
    },
    [people, collapsed, editing],
  )

  // Apply reuses the exact same commitEdit/undo history a hand-edit does
  // (ticket 05) — one CellPatch covering every changed cell, pushed as one
  // entry, so Cmd+Z undoes the whole proposal in a single step (the map's
  // "Undo covers everything, including Apply").
  const applyProposal = useCallback(() => {
    if (!pendingProposal) return
    const patch: CellPatch = new Map()
    for (const change of pendingProposal.changes) {
      patch.set(assignmentKey(change.personId, change.dateIso), change.to)
    }
    editing.applyPatch(patch)
    setSchedule(baseAssignments, true)
    setSettingsDirty(false)
    setPendingProposal(null)
  }, [pendingProposal, editing, baseAssignments, setSchedule, setSettingsDirty])

  // Discard needs no state of its own to unwind — the board was never
  // touched, only its display preferred the proposal (see
  // `getDisplayAssignment`), so dropping the preference is the whole thing.
  const discardProposal = useCallback(() => setPendingProposal(null), [])

  // Onboarding (ticket 14): a period whose roster was just imported skips
  // the usual manual-click Generate — the wizard marks this period for one
  // auto-generate-and-apply right before it navigates here. `autoGenerate`
  // latches that in for this mount only (state/onboarding.ts); the two
  // effects below fire the solve, then apply its result the moment it
  // lands, with no proposal-review step in between. A manual Regenerate
  // afterward is unaffected — this only ever runs the one time.
  const autoGenerate = useTakeAutoGenerateOnMount(periodId)
  const autoApplyRef = useRef(autoGenerate)

  useEffect(() => {
    if (autoGenerate && !hasSchedule) onGenerate()
    // Deliberately mount-only: must fire exactly once regardless of how
    // onGenerate/hasSchedule change identity on later renders.
  }, [])

  useEffect(() => {
    if (autoApplyRef.current && pendingProposal) {
      autoApplyRef.current = false
      applyProposal()
    }
  }, [pendingProposal, applyProposal])

  // The auto-triggered solve can also come back infeasible — nothing to
  // apply, and the ref must not linger waiting for some later, unrelated
  // proposal (a manual Regenerate or a relaxation retry) to auto-apply
  // instead. Once the one auto-triggered attempt has an outcome, latch off.
  useEffect(() => {
    if (autoApplyRef.current && generateFlow.state.phase === 'infeasible') autoApplyRef.current = false
  }, [generateFlow.state.phase])

  // Which date's coverage breakdown is open, and — inside it — which short
  // shift is drilled into (dimming the grid and lighting who could fill it).
  const [covDate, setCovDate] = useState<string | null>(null)
  const [covRect, setCovRect] = useState<OverlayRect | null>(null)
  const [covDrillShift, setCovDrillShift] = useState<string | null>(null)

  // Cross-route drill (ticket 21): the Coverage view's "Show on board" sets
  // a one-shot atom; consume it after mount, once the header cells exist —
  // scroll the date into view, open its ticket-06 panel, and drill into the
  // named short shift so its eligible fixers light up immediately. The team
  // unfold mirrors handleShiftClick (which closes over covDate and can't be
  // called before that state lands).
  const [pendingDrill, setPendingDrill] = useAtom(coverageDrillAtom)
  useEffect(() => {
    if (!pendingDrill) return
    setPendingDrill(null)
    const root = rootRef.current
    const headerCell = root?.querySelector<HTMLElement>(`.cd-header-cell[data-date-iso="${pendingDrill.dateIso}"]`)
    if (!root || !headerCell) return
    headerCell.scrollIntoView({ block: 'nearest', inline: 'center' })
    const boardBox = root.getBoundingClientRect()
    const cellBox = headerCell.getBoundingClientRect()
    setCovRect({
      left: cellBox.left - boardBox.left,
      top: cellBox.top - boardBox.top,
      width: cellBox.width,
      height: cellBox.height,
    })
    setCovDate(pendingDrill.dateIso)
    setCovDrillShift(pendingDrill.shift)
    if (pendingDrill.shift) {
      const teamIds = new Set(
        eligibleFreePeople(people, pendingDrill.dateIso, pendingDrill.shift, editing.getAssignment).map((p) => p.teamId),
      )
      if (teamIds.size > 0) {
        setCollapsed((prev) => {
          const next = new Set(prev)
          for (const teamId of teamIds) next.delete(teamId)
          return next
        })
      }
    }
  }, [pendingDrill, setPendingDrill, people, editing.getAssignment])

  const covDay = covDate ? coverage.get(covDate) ?? null : null

  // Recomputed on every override change, same as violations — this is what
  // makes the lit set (and its count in the panel) update as the planner types.
  const freePeople = useMemo(() => {
    if (!covDate || !covDrillShift) return []
    return eligibleFreePeople(people, covDate, covDrillShift, editing.getAssignment)
  }, [covDate, covDrillShift, people, editing.getAssignment])

  const handleBarClick = useCallback((dateIso: string, target: HTMLElement) => {
    const root = rootRef.current
    const headerCell = target.closest<HTMLElement>('.cd-header-cell')
    if (!root || !headerCell) return
    if (covDate === dateIso) {
      setCovDate(null)
      setCovDrillShift(null)
      return
    }
    const boardBox = root.getBoundingClientRect()
    const cellBox = headerCell.getBoundingClientRect()
    setCovRect({
      left: cellBox.left - boardBox.left,
      top: cellBox.top - boardBox.top,
      width: cellBox.width,
      height: cellBox.height,
    })
    setCovDate(dateIso)
    setCovDrillShift(null)
  }, [covDate])

  const handleShiftClick = useCallback(
    (shift: string) => {
      setCovDrillShift((prev) => {
        const next = prev === shift ? null : shift
        if (next && covDate) {
          const teamIds = new Set(
            eligibleFreePeople(people, covDate, next, editing.getAssignment).map((p) => p.teamId),
          )
          if (teamIds.size > 0) {
            setCollapsed((prevCollapsed) => {
              const nextCollapsed = new Set(prevCollapsed)
              for (const teamId of teamIds) nextCollapsed.delete(teamId)
              return nextCollapsed
            })
          }
        }
        return next
      })
    },
    [covDate, people, editing.getAssignment],
  )

  // Dim the grid and light the "could fix it" cells straight in the DOM
  // (ticket 03's benchmarked move for exactly this: dim-all-and-light-a-few
  // measured 4.1ms over 4200 cells) rather than threading a lit flag through
  // every DayCell's props.
  useEffect(() => {
    const board = rootRef.current
    if (!board) return
    board.querySelectorAll('.cd-cell[data-coverage-lit]').forEach((el) => el.removeAttribute('data-coverage-lit'))
    if (!covDrillShift || !covDate) {
      board.removeAttribute('data-coverage-dim')
      return
    }
    board.setAttribute('data-coverage-dim', '')
    for (const person of freePeople) {
      const el = board.querySelector(`.cd-cell[data-person-id="${person.id}"][data-date-iso="${covDate}"]`)
      el?.setAttribute('data-coverage-lit', '')
    }
  }, [covDrillShift, covDate, freePeople])

  useEffect(() => {
    if (!covDate) return
    const closeIfOutside = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      // A click on a board cell is a normal edit, not a dismissal — typing
      // into a lit cell needs the panel to stay open so its count updates
      // live (ticket 06). Only a click truly outside board and panel closes it.
      if (el?.closest('.cd-cov-panel') || el?.closest('.cd-cov-bar') || el?.closest('.cd-cell')) return
      setCovDate(null)
      setCovDrillShift(null)
    }
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setCovDate(null)
      setCovDrillShift(null)
    }
    window.addEventListener('mousedown', closeIfOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeIfOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [covDate])

  const covPanel: CoveragePanelState | null =
    covDate && covRect && covDay
      ? {
          day: covDay,
          label: dayLabel(covDate, data.dates.find((d) => d.iso === covDate)?.weekday ?? 0),
          rect: covRect,
          drillShift: covDrillShift,
          freeCount: freePeople.length,
        }
      : null

  const proposalDateLabel = useCallback(
    (iso: string) => dayLabel(iso, data.dates.find((d) => d.iso === iso)?.weekday ?? 0),
    [data.dates],
  )

  const selectedPerson = selectedPersonId ? people.find((p) => p.id === selectedPersonId) ?? null : null
  const selectedTeam = selectedPerson ? boardTeams.find((t) => t.id === selectedPerson.teamId) : undefined
  const selectedFairness = selectedPerson ? fairness.byPerson.get(selectedPerson.id) : undefined

  return (
    <div className="cd-board-shell relative flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {!pendingProposal && generateFlow.state.phase !== 'infeasible' && (
          <GenerateControls
            hasSchedule={hasSchedule}
            state={generateFlow.state}
            onGenerate={onGenerate}
            onCancel={generateFlow.cancel}
            onImport={() => setImportOpen(true)}
          />
        )}
        {/* Ticket 15, Q5: a Settings edit since the last solve, not a rule break —
            amber, not the violation red, and only shown where Generate's own
            "no schedule yet" banner would otherwise be (the two never overlap).
            Real flow row, not an overlay (see GenerateControls' banner comment
            for why — same fix, same reason). */}
        {settingsDirty && hasSchedule && !pendingProposal && generateFlow.state.phase === 'idle' && (
          <div className="flex items-center gap-2.5 border-b border-warning/40 bg-warning/15 px-3.5 py-[7px] text-xs text-base-content">
            <span aria-hidden="true">⚠</span>
            <span>{t('board.banner.settingsDirty')}</span>
          </div>
        )}
        <div
          ref={scrollerRef}
          className="cd-board-scroll min-h-0 flex-1 overflow-auto border border-[var(--border-strong)]"
        >
        <div
          ref={rootRef}
          className="cd-board relative grid w-max content-start bg-base-100 [font-variant-numeric:tabular-nums] data-[generating]:shadow-[inset_0_2px_0_0_var(--sel)]"
          style={{
            gridTemplateColumns: `var(--name-col-w) repeat(${data.dates.length}, var(--col-w))${showIssues ? ' var(--fair-col-w)' : ''}`,
          }}
          onMouseDown={editing.onBoardMouseDown}
          onDoubleClick={editing.onBoardDoubleClick}
        >
          <input
            ref={editing.editorRef}
            className="cd-board__editor absolute top-0 left-0 h-px w-px border-0 p-0 opacity-0 pointer-events-none caret-transparent"
            aria-label={t('board.editor.aria')}
            onKeyDown={editing.onEditorKeyDown}
            onPaste={editing.onEditorPaste}
            onChange={() => {}}
            value=""
          />
          <SelectionOverlay rect={editing.overlayRect} />
          <ViolationTip {...tip} />
          {editing.menu && (
            <CellMenu
              menu={editing.menu}
              shifts={shifts}
              keyHints={editing.keyHintByCode}
              onChoose={editing.chooseMenuOption}
              onReleasePin={editing.releasePinFromMenu}
            />
          )}
          <ProblemList
            violations={violations}
            open={problemsOpen}
            onToggle={() => setProblemsOpen((v) => !v)}
            onSelect={revealViolation}
            showIssues={showIssues}
            onToggleIssues={() => setShowIssues((v) => !v)}
          />
          {covPanel && <CoveragePanel panel={covPanel} shifts={shifts} onShiftClick={handleShiftClick} />}
          <div className="cd-board__corner cd-text-trim sticky top-0 left-0 z-[4] flex h-[var(--row-h)] items-center border-r border-b border-[var(--border-strong)] bg-base-100 px-[var(--cell-pad-x)] text-2xs text-[color:var(--text-dim)]">
            {t('board.corner.name')}
          </div>
          {data.dates.map((date) => (
            <HeaderCell
              key={date.iso}
              date={date}
              coverage={showIssues ? coverage.get(date.iso)?.status ?? 'ok' : undefined}
              active={covDate === date.iso}
              onBarClick={handleBarClick}
            />
          ))}
          {showIssues && <FairnessHeaderCell />}

          {boardTeams.map((team) => {
            const teamPeople = peopleByTeam.get(team.id) ?? []
            const isCollapsed = collapsed.has(team.id)
            return (
              <Fragment key={team.id}>
                <TeamHeaderRow
                  team={team}
                  count={teamPeople.length}
                  collapsed={isCollapsed}
                  onToggle={() => toggleTeam(team.id)}
                />
                {!isCollapsed &&
                  teamPeople.map((person) => (
                    <Fragment key={person.id}>
                      {/* z-[3], not z-[1] (board-overhaul revamp, 8bu: "table content overlap
                          on the pinned name cells"): `.cd-cell[data-proposal-changed]` and the
                          coverage-dim "lit" cell both set z-index:1 on the DAY CELLS in this
                          same row, which render AFTER this name cell in the DOM. Same z-index,
                          later DOM order wins — so on a first Generate (near every cell is
                          proposal-changed) a scrolled day cell painted over the sticky name
                          column instead of staying behind it. z-[3] clears every per-cell state
                          marker (max z-index:2, the violation dot) so pinned-column content
                          always wins regardless of DOM order. `.cd-fair-cell` gets the same
                          tier in styles.css for the identical reason, just DOM-order-lucky
                          until now (it renders last in a row, not first). */}
                      <div
                        className="cd-board__name group sticky left-0 z-[3] flex h-[var(--row-h)] cursor-pointer items-center overflow-hidden border-r border-[var(--border-strong)] border-b border-b-[var(--border)] bg-base-100 px-[var(--cell-pad-x)] text-xs whitespace-nowrap hover:bg-base-200"
                        data-person-id={person.id}
                        data-removed={person.removed || undefined}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          person.removed
                            ? t('board.name.ariaRemoved', { name: person.name })
                            : t('board.name.aria', { name: person.name })
                        }
                        onClick={() => openPersonPanel(person.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openPersonPanel(person.id)
                          }
                        }}
                      >
                        <span className="cd-board__name-text min-w-0 overflow-hidden text-ellipsis group-data-[removed]:text-[color:var(--text-faint)] group-data-[removed]:line-through">
                          {person.name}
                        </span>
                        {person.removed && (
                          <span className="cd-board__name-flag ml-1.5 border border-[var(--viol)] px-1 text-2xs font-medium whitespace-nowrap text-[color:var(--viol)]">
                            {t('board.name.removedBadge')}
                          </span>
                        )}
                      </div>
                      {data.dates.map((date) => {
                        const assignment = getDisplayAssignment(person.id, date.iso)
                        return (
                          <DayCell
                            key={date.iso}
                            personId={person.id}
                            date={date}
                            assignment={assignment}
                            shiftColor={shiftColorByCode[assignment.code]}
                            violated={showIssues && violationPlacement.cellMessages.has(assignmentKey(person.id, date.iso))}
                            proposed={proposalChangeMessages.has(assignmentKey(person.id, date.iso))}
                          />
                        )
                      })}
                      {showIssues && (
                        <FairnessCell personId={person.id} violations={violationPlacement.otherByPerson.get(person.id) ?? []} />
                      )}
                    </Fragment>
                  ))}
              </Fragment>
            )
          })}
        </div>
        </div>
      </div>

      {selectedPerson && selectedTeam && selectedFairness && (
        <PersonPanel
          person={selectedPerson}
          team={selectedTeam}
          shifts={shifts}
          fairness={selectedFairness}
          hoursCap={fairness.hoursCap}
          isMaxHours={selectedFairness.hours === fairness.maxHours && fairness.maxHours > 0}
          hasHoursViolation={violations.some((v) => v.personId === selectedPerson.id && v.kind === 'hours')}
          dates={data.dates}
          onClose={() => setSelectedPersonId(null)}
          onUpdate={(patch) => updatePerson(selectedPerson.id, patch)}
        />
      )}

      {pendingProposal && (
        <ProposalPanel
          changes={pendingProposal.changes}
          groups={proposalGroups}
          fairnessBefore={fairnessBase}
          fairnessAfter={pendingProposal.fairnessAfter}
          movement={proposalMovement}
          dateLabel={proposalDateLabel}
          onApply={applyProposal}
          onDiscard={discardProposal}
          onJumpTo={jumpToProposalCell}
        />
      )}

      {generateFlow.state.phase === 'infeasible' && (
        <InfeasiblePanel
          conflictCore={generateFlow.state.conflictCore}
          relaxations={generateFlow.state.relaxations}
          onRelax={applyRelaxation}
          onDismiss={generateFlow.dismissInfeasible}
        />
      )}

      {/* Ticket 17 rework: the empty-board banner's "Import schedule…" button
          opens this in place of a route — same overlay conventions as
          `NewPeriodPopover` (outside-click and Escape both close), just
          centered instead of anchored to a trigger rect. */}
      {importOpen && (
        <div
          className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-base-content/20 pt-16 pb-16"
          onMouseDown={() => setImportOpen(false)}
        >
          <div
            className="w-[720px] max-w-[92vw] rounded-lg border border-base-300 bg-base-100 p-6 shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight text-base-content">{t('board.import.title')}</h2>
              <p className="mt-1 text-sm text-base-content/60">
                {t('board.import.description')}
              </p>
            </div>
            <ScheduleImportPanel
              dates={data.dates.map((d) => d.iso)}
              people={people}
              teams={teams}
              shifts={shifts}
              onApply={(next) => {
                setPeople(() => next.people)
                setTeams(() => next.teams)
                setSchedule(next.assignments, true)
                setImportOpen(false)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
