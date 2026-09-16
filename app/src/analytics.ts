import { useEffect, useSyncExternalStore } from 'react'
import type { PostHog } from 'posthog-js'

/**
 * Product analytics — PostHog.
 *
 * Three rules this module exists to enforce, because nothing else in the app
 * can enforce them:
 *
 * 1. **Structure only, never content.** The schedule is a company's real
 *    people. An event carries counts, enums, and booleans — never a person,
 *    team, workspace, or org name, and never a cell's contents. The typed
 *    `AnalyticsEventMap` below is the whole surface of what can leave the
 *    app, `sanitize` is the runtime backstop behind it, and the SDK is
 *    configured with every DOM-reading feature off: nothing is inferred from
 *    the screen, so a name in a cell cannot ride along on a click.
 * 2. **Silent when unconfigured.** No project token (a self-host, a
 *    `pnpm dev` without one) means the SDK is never even fetched, let alone
 *    loaded. Nothing is sent from a bare clone.
 * 3. **One switch, always honoured.** `ANALYTICS_STORAGE_KEY` is the
 *    visitor's answer, checked before the SDK is fetched and handed to the
 *    SDK's own opt-out once it is loaded, so batched events stop too.
 *
 * `initAnalytics()` runs once from `main.tsx` before the first render;
 * `usePageView()` reports the app's screens; `track()` reports behavior.
 */

/** Device-local analytics choice, next to `crewdoku-locale`/`crewdoku-theme`. */
export const ANALYTICS_STORAGE_KEY = 'crewdoku-analytics'

const OFF = 'off'
const ON = 'on'

/** PostHog project token and ingestion host, from the build environment. */
const projectToken: string | undefined = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN
const apiHost: string = import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com'

/**
 * Events held until the SDK chunk lands. Captures made before init are
 * dropped by the SDK itself, and this app reports its first screen during
 * boot — before any chunk can arrive — so the queue is what stops the start
 * of every session from going missing. Bounded: if the chunk never lands
 * (offline, blocked, refused by a CSP) the queue must not grow without end.
 */
const MAX_PENDING = 50

type Payload = { event: string; props: Record<string, ParamValue> }

/**
 * Longest string an event may carry. Every legitimate string here is an
 * identifier — a route, a template id, a locale, a format — so anything past
 * this length is free text (someone's name) and gets dropped rather than sent.
 */
const MAX_STRING_LENGTH = 64

export type ExportFormat = 'csv' | 'tsv' | 'json' | 'xlsx' | 'pdf'
export type ExportTemplate = 'team-grid' | 'board' | 'person-list' | 'coverage-pivot'
export type ImportSource = 'paste' | 'csv' | 'xlsx'
export type SolveOutcome = 'solved' | 'infeasible' | 'cancelled' | 'error'

/**
 * Every event the app may send, with the exact parameters allowed on it.
 * Adding a key here is the review gate: if it is not in this map, it is not
 * tracked, and adding one is a deliberate act rather than a side effect of
 * some other change.
 */
export type AnalyticsEventMap = {
  /**
   * One per screen: the six routes, plus the pre-shell and in-board screens
   * that have no URL of their own (`welcome`, `workspace-new`, `onboarding`,
   * `schedule-import`). Reported to PostHog as `$pageview`, so the standard
   * paths report reads these virtual screens without a custom event.
   */
  page_view: { page_path: string }
  /** A brand-new organization was created from the picker. */
  org_created: Record<string, never>
  /** A workspace was created inside an existing org, from a starting template. */
  workspace_created: { template: string }
  /** A starting template was picked inside the wizard. */
  onboarding_template_selected: { template: string }
  /** The wizard finished and its roster landed. */
  onboarding_completed: { people: number; teams: number; shifts: number }
  /** A roster arrived on the Roster screen, pasted or from a file. */
  roster_imported: { source: ImportSource; rows: number }
  /** An existing schedule was imported into a period (that panel is CSV only). */
  schedule_imported: { assignments: number }
  /** The generate-shifts wizard rewrote the shift catalog and coverage. */
  shifts_generated: { shifts: number }
  /** "Generate" was pressed — the model input is built by this point. */
  solve_started: { people: number; period_days: number }
  /** A solve reached a terminal state, including cancelled and infeasible. */
  solve_finished: { outcome: SolveOutcome; duration_ms: number }
  /** The proposal was written to the board. */
  proposal_applied: { changed: number }
  /** The proposal was thrown away. */
  proposal_discarded: { changed: number }
  /** Cells were committed by hand: a code set (typed, pasted, menu) or cleared. */
  board_cell_edited: { kind: 'set' | 'clear' }
  /** A new period (schedule window) was created. */
  period_created: { duration: string }
  /** A file finished exporting. */
  export_completed: { format: ExportFormat; template: ExportTemplate }
  /** The UI language changed. */
  locale_changed: { locale: string }
  /** The colour scheme changed. */
  theme_changed: { theme: string }
  /** The visitor turned analytics on from Settings. */
  analytics_preference: { enabled: boolean }
}

export type AnalyticsEventName = keyof AnalyticsEventMap
type ParamValue = string | number | boolean

function readPreference(): boolean {
  try {
    return localStorage.getItem(ANALYTICS_STORAGE_KEY) !== OFF
  } catch {
    /* localStorage can throw in locked-down browsers — default on, the switch still works */
    return true
  }
}

let enabled = readPreference()
let client: PostHog | null = null
let loading = false
const pending: Payload[] = []
const listeners = new Set<() => void>()

/** Whether this build has a project token at all. No token, no switch to show. */
export function analyticsConfigured(): boolean {
  return projectToken !== undefined
}

/** The visitor's choice. True on a device that has never answered. */
export function analyticsEnabled(): boolean {
  return enabled
}

/**
 * Drops anything that could be content rather than structure. The event map
 * already restricts what a call site can pass; this catches the case where a
 * value that *is* a name flows into a parameter meant to hold an identifier.
 */
function sanitize(name: AnalyticsEventName, params: Record<string, unknown>): Record<string, ParamValue> {
  const safe: Record<string, ParamValue> = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value
      continue
    }
    if (typeof value === 'string' && value.length <= MAX_STRING_LENGTH) {
      safe[key] = value
      continue
    }
    if (import.meta.env.DEV) {
      console.warn(`[analytics] dropped ${name}.${key}: not a number, boolean, or short identifier`)
    }
  }
  return safe
}

/**
 * Our vocabulary on the wire. Screens become PostHog's own `$pageview` rather
 * than a custom event, so the built-in paths report works without defining
 * anything; a screen that is not a route (`welcome`, `onboarding`) is
 * normalised to a path and no query string is ever sent.
 */
function payloadOf<K extends AnalyticsEventName>(name: K, params: AnalyticsEventMap[K]): Payload {
  if (name === 'page_view') {
    const { page_path: path } = params as AnalyticsEventMap['page_view']
    const pathname = path.startsWith('/') ? path : `/${path}`
    return {
      event: '$pageview',
      props: sanitize(name, { $pathname: pathname, $current_url: `${location.origin}${pathname}` }),
    }
  }
  return { event: name, props: sanitize(name, params as Record<string, unknown>) }
}

function send(payload: Payload): void {
  if (client !== null) {
    client.capture(payload.event, payload.props)
    return
  }
  if (pending.length < MAX_PENDING) pending.push(payload)
}

/**
 * Fetches and configures the SDK. Called once from `main.tsx` before the
 * first render — and again if the visitor switches collection back on.
 */
export function initAnalytics(): void {
  if (projectToken === undefined || !enabled || loading) return
  loading = true
  // Imported rather than bundled: this is the largest dependency the app
  // could have, it is worthless to a self-host that never configured it, and
  // a planner's first paint should not wait on an analytics SDK.
  void import('posthog-js')
    .then(({ default: posthog }) => {
      loading = false
      /* The switch can flip while the chunk is in flight. */
      if (!enabled) return
      posthog.init(projectToken, {
        api_host: apiHost,
        // Nothing is read off the screen. The board is a wall of real
        // people's names, so autocapture, exception capture, dead clicks,
        // heatmaps, and performance metrics are all off; every event here is
        // one this app named itself, with parameters it chose.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        capture_heatmaps: false,
        capture_performance: false,
        // A session recording of this app is a recording of a company's
        // schedule. Surveys have nothing to ask here either.
        disable_session_recording: true,
        disable_surveys: true,
        // No flags to evaluate, no surveys to match, no remote config to
        // fetch: one request fewer, and nothing asked for that is not used.
        advanced_disable_flags: true,
        // Never a person profile: events stay anonymous, so there is no
        // people table to keep and no identity to merge or erase.
        person_profiles: 'never',
        // localStorage rather than the default localStorage+cookie: this app
        // has no cross-site or cross-subdomain identity to carry, so it sets
        // no cookie and owes no banner.
        persistence: 'localStorage',
        property_denylist: ['$ip'],
        debug: import.meta.env.DEV,
      })
      client = posthog
      for (const payload of pending.splice(0)) posthog.capture(payload.event, payload.props)
    })
    .catch(() => {
      // Offline, blocked by an extension, or refused by a CSP. Analytics is
      // never worth breaking the app over — the queued events are dropped.
      loading = false
    })
}

/** Reports one behavior. A no-op with no token, with the switch off, or before init. */
export function track<K extends AnalyticsEventName>(name: K, params: AnalyticsEventMap[K]): void {
  if (!enabled || projectToken === undefined) return
  send(payloadOf(name, params))
}

/**
 * Persists the visitor's choice and applies it immediately — turning it off
 * mid-session stops the page already open, not just the next load. The change
 * itself is only ever reported in the direction the visitor allowed.
 */
export function setAnalyticsEnabled(next: boolean): void {
  enabled = next
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, next ? ON : OFF)
  } catch {
    /* the in-memory choice still governs this session */
  }
  if (next) {
    client?.opt_in_capturing()
    initAnalytics()
    track('analytics_preference', { enabled: true })
  } else {
    // The SDK's own switch as well, so it accepts no further captures. The
    // batch it was already holding — events captured while the switch was on
    // — still flushes: this stops collection, it does not erase the session.
    client?.opt_out_capturing()
    pending.length = 0
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The switch's value for the Settings row, kept in step with the module state. */
export function useAnalyticsEnabled(): boolean {
  return useSyncExternalStore(subscribe, analyticsEnabled)
}

/**
 * Reports a screen. `path` is the screen's own name — a route pathname, or one
 * of the virtual screens the app shows without navigating (`welcome`,
 * `workspace-new`, `onboarding`, `schedule-import`); `null` means "this
 * component is not the screen right now, report nothing". A route whose
 * rendering is gated (the board shows the wizard instead of the grid on a
 * first run) must report the screen it actually rendered, not its URL.
 *
 * Effects replay under StrictMode, so an unchanged path reports once; coming
 * back to that screen later still counts as a new view.
 */
let lastPath: string | null = null

export function usePageView(path: string | null): void {
  useEffect(() => {
    if (path === null || path === lastPath) return
    lastPath = path
    track('page_view', { page_path: path })
  }, [path])
}
