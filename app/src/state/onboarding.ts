import { atom, useAtom } from 'jotai'
import { useEffect, useRef } from 'react'

/**
 * Periods whose next Board mount should auto-run Generate once and silently
 * apply the result (ticket 14) instead of waiting for a manual click. Set
 * right before the onboarding wizard navigates to `/board`; consumed by
 * `useTakeAutoGenerate` on that mount so it only ever fires the one time —
 * a later manual Regenerate is never affected, and the bootstrap demo
 * period (which never runs onboarding) never sees this atom touched at all.
 */
export const autoGenerateOnMountAtom = atom<ReadonlySet<string>>(new Set<string>())

export function useMarkAutoGenerateOnMount() {
  const [, setPending] = useAtom(autoGenerateOnMountAtom)
  return (periodId: string) => setPending((prev) => new Set(prev).add(periodId))
}

/**
 * Latches to `true` for the lifetime of this component instance the moment
 * it first sees its `periodId` pending — a plain read of the atom would flip
 * back to `false` the same render the effect below clears the entry, which
 * is too late for the mount-time "should I auto-generate" check in
 * `BoardGrid`. The ref is what actually answers that check; the effect only
 * cleans the shared atom up afterward so a future unrelated mount of the
 * same period never re-triggers.
 */
export function useTakeAutoGenerateOnMount(periodId: string): boolean {
  const [pending, setPending] = useAtom(autoGenerateOnMountAtom)
  const takenRef = useRef(false)
  if (!takenRef.current && pending.has(periodId)) takenRef.current = true

  useEffect(() => {
    if (!takenRef.current || !pending.has(periodId)) return
    setPending((prev) => {
      if (!prev.has(periodId)) return prev
      const next = new Set(prev)
      next.delete(periodId)
      return next
    })
  }, [periodId, pending, setPending])

  return takenRef.current
}

/**
 * Periods that have finished (or skipped) their per-period schedule import.
 * Gates ONLY the per-period import screen (`period.setup === 'import'`).
 * Gating on a persistent, explicitly-set flag means the import screen owns
 * its own exit, not a side effect of importing data.
 */
export const onboardedPeriodsAtom = atom<ReadonlySet<string>>(new Set<string>())

export function useMarkOnboarded() {
  const [, setOnboarded] = useAtom(onboardedPeriodsAtom)
  return (periodId: string) => setOnboarded((prev) => new Set(prev).add(periodId))
}

export function useIsOnboarded(periodId: string): boolean {
  const [onboarded] = useAtom(onboardedPeriodsAtom)
  return onboarded.has(periodId)
}

/**
 * Workspace-level onboarding flag. Gating `Board.tsx` on `people.length === 0 && !wsOnboarded`
 * shows the initial Onboarding wizard when the workspace is completely empty.
 * Marking it done allows navigating to an empty board even if the manager skips roster import.
 */
export const workspaceOnboardedAtom = atom(false)

export function useIsWorkspaceOnboarded(): boolean {
  const [onboarded] = useAtom(workspaceOnboardedAtom)
  return onboarded
}

export function useMarkWorkspaceOnboarded(): () => void {
  const [, setOnboarded] = useAtom(workspaceOnboardedAtom)
  return () => setOnboarded(true)
}
