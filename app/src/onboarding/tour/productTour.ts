import { atom, useAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { driver, type Config, type DriveStep, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useT, type Translate } from '../../i18n/useT'

/** Device-scoped, like the theme and the locale: whether the tour was already
 *  shown belongs to the person looking at the screen, not to the workspace. */
const TOUR_SEEN_KEY = 'crewdoku-tour-seen'

/** How long the board gets to lay its columns out before the tour measures
 *  and highlights them. The board measures itself after mount, so a tour
 *  driven in the same commit would point at stale rectangles. */
const START_DELAY_MS = 450

/** After the tour changes route, it polls at this interval, up to this many
 *  milliseconds, for the next surface's anchor before highlighting it. A route
 *  swap is a React re-render, so the target lands a few frames later; falling
 *  through after the cap just centres the popover rather than hanging. */
const ANCHOR_POLL_MS = 60
const ANCHOR_MAX_MS = 2500

/** Set from Settings' "Replay product tour" button and from the onboarding
 *  wizard's generate step; `useProductTour` consumes it (resets it to false)
 *  and starts the tour even when it has been seen before. */
export const tourReplayRequestedAtom = atom(false)

/** Has the tour already run (or been dismissed) on this device? */
export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === '1'
  } catch {
    // Locked-down browsers throw on read; the tour then simply runs again.
    return false
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1')
  } catch {
    // Same on write: a failed write only means the tour runs next visit.
  }
}

/**
 * One stop on the full product tour: the route it lives on, the element it
 * spotlights (absent = a centred popover), and its copy key. The tour walks
 * the board's own controls first, then visits every workspace surface in nav
 * order, so a first-run manager sees the whole app, not just the board.
 */
type TourStop = { route: string; anchor?: string; key: string }

function buildStops(): TourStop[] {
  return [
    { route: '/board', key: 'tour.welcome' },
    { route: '/board', anchor: '[data-tour="period"]', key: 'tour.period' },
    { route: '/board', anchor: '[data-tour="board"]', key: 'tour.board' },
    { route: '/board', anchor: '[data-tour="generate"]', key: 'tour.generate' },
    { route: '/board', anchor: '[data-tour="diagnostics"]', key: 'tour.diagnostics' },
    { route: '/coverage', anchor: '[data-tour="surface"]', key: 'tour.coverage' },
    { route: '/roster', anchor: '[data-tour="surface"]', key: 'tour.roster' },
    { route: '/teams', anchor: '[data-tour="surface"]', key: 'tour.teams' },
    { route: '/settings', anchor: '[data-tour="surface"]', key: 'tour.settings' },
    { route: '/export', anchor: '[data-tour="surface"]', key: 'tour.export' },
    { route: '/export', key: 'tour.done' },
  ]
}

function toStep(stop: TourStop, t: Translate): DriveStep {
  return {
    element: stop.anchor,
    popover: { title: t(`${stop.key}.title`), description: t(`${stop.key}.body`) },
  }
}

/** Polls for the anchor after a route change, then runs `then`; falls through
 *  after the cap so a missing anchor centres the popover instead of hanging. */
function afterAnchor(anchor: string | undefined, then: () => void): void {
  if (!anchor) {
    then()
    return
  }
  const deadline = Date.now() + ANCHOR_MAX_MS
  const poll = () => {
    if (document.querySelector(anchor) || Date.now() > deadline) then()
    else setTimeout(poll, ANCHOR_POLL_MS)
  }
  poll()
}

/**
 * Runs the full product tour, in the active locale, navigating from stop to
 * stop. The driver overlay lives on `document.body`, so it survives the board
 * unmounting when the tour moves onto another surface; navigation is the
 * router's own, so no reload and the SPA state is kept. Every exit marks the
 * tour seen and returns the manager to the board; `onDone` lets the host hook
 * re-arm for a later replay.
 */
export function startProductTour(t: Translate, navigate: NavigateFunction, onDone: () => void): void {
  const stops = buildStops()
  let finished = false
  let instance: Driver

  const finish = () => {
    if (finished) return
    finished = true
    markTourSeen()
    onDone()
    if (window.location.pathname !== '/board') navigate('/board')
  }

  const goTo = (index: number) => {
    const stop = stops[index]
    if (!stop) {
      instance.destroy()
      return
    }
    if (stop.route !== window.location.pathname) navigate(stop.route)
    afterAnchor(stop.anchor, () => instance.moveTo(index))
  }

  const config: Config = {
    steps: stops.map((stop) => toStep(stop, t)),
    showProgress: true,
    allowClose: true,
    // A guided walk, not a click-through: the highlighted control stays inert
    // so a stray click on the board or a nav item can't derail the sequence.
    disableActiveInteraction: true,
    popoverClass: 'cd-tour',
    nextBtnText: t('tour.next'),
    prevBtnText: t('tour.prev'),
    doneBtnText: t('tour.done'),
    // Next/Prev are driven by hand so each move can change route and wait for
    // the next surface to mount before the highlight lands.
    onNextClick: () => {
      const i = instance.getActiveIndex() ?? 0
      if (i >= stops.length - 1) instance.destroy()
      else goTo(i + 1)
    },
    onPrevClick: () => {
      const i = instance.getActiveIndex() ?? 0
      if (i > 0) goTo(i - 1)
    },
    onCloseClick: () => instance.destroy(),
    // Both, because driver.js can skip `onDestroyed` on a fast teardown; the
    // guard in `finish` keeps the double harmless.
    onDestroyStarted: () => {
      finish()
      instance.destroy()
    },
    onDestroyed: () => finish(),
  }

  instance = driver(config)
  if (stops[0]!.route !== window.location.pathname) navigate(stops[0]!.route)
  instance.drive(0)
}

/**
 * Auto-runs the tour on the board's first visit on this device, and again
 * whenever a replay is requested (Settings, or the onboarding wizard's
 * generate step). Hosted on the board: `BoardGrid` renders only past the
 * onboarding gates, so the tour never fires over the wizard; once started the
 * body-level overlay carries it across every surface on its own.
 */
export function useProductTour(): void {
  const t = useT()
  const navigate = useNavigate()
  const tRef = useRef(t)
  tRef.current = t
  const navRef = useRef(navigate)
  navRef.current = navigate
  const [replayRequested, setReplayRequested] = useAtom(tourReplayRequestedAtom)
  const startedRef = useRef(false)

  useEffect(() => {
    // Deliberate replay first; otherwise only the first visit on this device.
    if (!replayRequested && hasSeenTour()) return
    const timer = setTimeout(() => {
      if (startedRef.current) return
      startedRef.current = true
      startProductTour(tRef.current, navRef.current, () => {
        startedRef.current = false
      })
      // Consumed only once the tour is up: this flips the effect's own dep, so
      // it must happen after `startedRef` is set for that re-run to no-op.
      if (replayRequested) setReplayRequested(false)
    }, START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [replayRequested, setReplayRequested])
}
