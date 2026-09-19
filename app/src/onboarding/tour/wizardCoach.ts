import { useEffect, useRef } from 'react'
import { driver, type Driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useT, type Translate } from '../../i18n/useT'

/** Device-scoped, like the product tour's own flag: whether the wizard's
 *  coach-marks were already shown belongs to the person, not the workspace. */
const COACH_SEEN_KEY = 'crewdoku-wizard-coach-seen'

/** A beat for a step's container to mount and lay out before the coach looks
 *  for it, so the highlight is measured against a settled box. React
 *  StrictMode's development double-invoke (mount, unmount, remount) also lands
 *  inside this window, so the throwaway first pass never drives and a genuine
 *  first run is not burned. */
const PRIME_MS = 200

/** A freshly created workspace mounts the wizard without a reload, and each
 *  step's container mounts a beat after the step changes, so the anchor can be
 *  a frame or two behind the effect; the coach polls at this interval, up to
 *  this many times, before giving up (without burning the seen flag, so a
 *  genuine first run is never silently skipped). */
const POLL_MS = 150
const MAX_TRIES = 20

/** The wizard step the coach follows. Mirrors `Step` in Onboarding.tsx. */
export type WizardStep = 'shape' | 'people' | 'ready'

/** Where each step's coach-mark points and which copy it reads. The people and
 *  generate anchors are the whole step section rather than one control: the
 *  stage overlay swallows clicks outside the highlight, so a control-sized
 *  anchor would lock the manager out of the step they are being shown. */
const ANCHORS: Record<WizardStep, { selector: string; key: string }> = {
  shape: { selector: '[data-tour="wizard-shapes"]', key: 'tour.wizard.shape' },
  people: { selector: '[data-tour="wizard-people"]', key: 'tour.wizard.people' },
  ready: { selector: '[data-tour="wizard-generate"]', key: 'tour.wizard.generate' },
}

/** Have the wizard coach-marks already run (or been dismissed) on this device? */
export function hasSeenWizardCoach(): boolean {
  try {
    return localStorage.getItem(COACH_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markWizardCoachSeen(): void {
  try {
    localStorage.setItem(COACH_SEEN_KEY, '1')
  } catch {
    // A private-mode browser that refuses storage just replays the coach on the
    // next brand-new workspace; there is no state worth losing here.
  }
}

/** The single drive step for `step`, or null while its anchor is not laid out
 *  yet. A resumed wizard or a narrow layout can leave an anchor off screen; a
 *  step without its element would strand the coach, so it is dropped instead. */
function stepFor(step: WizardStep, t: Translate): DriveStep | null {
  const { selector, key } = ANCHORS[step]
  if (!document.querySelector(selector)) return null
  return {
    element: selector,
    popover: { title: t(`${key}.title`), description: t(`${key}.body`) },
  }
}

/**
 * Shows the coach-mark for one wizard step, in the active locale, and returns
 * the instance so the caller can tear it down. Only the close button is shown:
 * the popover narrates the step and hands over to the next step's popover
 * rather than walking a fixed list, so there is no next/prev/done and no
 * progress, and the highlighted container stays fully interactive.
 *
 * Returns null, WITHOUT marking seen, while the anchor is missing, so the
 * caller can retry rather than burn a genuine first run. `onClose` runs only
 * when the user clicks the X; a teardown by the caller's own `.destroy()` does
 * not reach it.
 */
export function startWizardCoach(step: WizardStep, t: Translate, onClose: () => void): Driver | null {
  const driveStep = stepFor(step, t)
  if (!driveStep) return null
  const instance = driver({
    steps: [driveStep],
    showProgress: false,
    allowClose: true,
    popoverClass: 'cd-tour',
    showButtons: ['close'],
    onCloseClick: onClose,
  })
  instance.drive()
  return instance
}

/**
 * Follows the first-run wizard, one coach-mark per step: shape, then people,
 * then generate. Each popover is anchored to its step's own container and is
 * repositioned (old instance destroyed, new one driven) as the wizard advances,
 * so the coach hands over rather than stranding a popover on a screen the user
 * has left. It runs at most once per device, and the seen flag is written only
 * when the user dismisses it or when the wizard goes away with it on screen:
 * every reposition and every premature start leaves the flag alone.
 */
export function useWizardCoach(step: WizardStep): void {
  const t = useT()
  const tRef = useRef(t)
  tRef.current = t

  /** The user clicked the X, so the coach is done for this session. */
  const dismissedRef = useRef(false)
  /** The coach drove at least once, so the run has earned the device flag. */
  const shownRef = useRef(false)
  const instanceRef = useRef<Driver | null>(null)

  useEffect(() => {
    if (hasSeenWizardCoach() || dismissedRef.current) return

    let disposed = false
    let tries = 0
    let timer: number | undefined

    const handleCloseClick = () => {
      dismissedRef.current = true
      markWizardCoachSeen()
      const live = instanceRef.current
      instanceRef.current = null
      live?.destroy()
    }

    const attempt = () => {
      if (disposed) return
      const live = startWizardCoach(step, tRef.current, handleCloseClick)
      if (live) {
        shownRef.current = true
        instanceRef.current = live
        return
      }
      // The anchor is not in the DOM yet; poll instead of giving up, and leave
      // the seen flag alone so a late first screen still gets its coach.
      if (++tries < MAX_TRIES) timer = setTimeout(attempt, POLL_MS)
    }

    timer = setTimeout(attempt, PRIME_MS)

    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      // Advancing a step, or unmounting, takes this step's popover down, but the
      // coach still has steps to walk, so this teardown never marks seen.
      const live = instanceRef.current
      instanceRef.current = null
      live?.destroy()
    }
  }, [step])

  // The wizard itself going away ends the run: the coach has followed the user
  // as far as it can, so it is marked seen here. Guarded by shownRef, so an exit
  // before the poll ever drove (including StrictMode's dev remount) leaves a
  // genuine first run alone.
  useEffect(
    () => () => {
      const live = instanceRef.current
      instanceRef.current = null
      live?.destroy()
      if (shownRef.current) markWizardCoachSeen()
    },
    [],
  )
}
