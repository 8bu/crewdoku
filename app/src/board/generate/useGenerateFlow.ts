import { useCallback, useEffect, useRef, useState } from 'react'
import { CancelledError } from '@crewdoku/solver'
import { track } from '../../analytics'
import type { ConflictCoreItem, RelaxationOption, ScheduleMap, SolveResult } from '../../engine/types'

export type GenerateState =
  | { phase: 'idle' }
  | { phase: 'solving'; elapsedMs: number; log: readonly string[] }
  | { phase: 'infeasible'; conflictCore: ConflictCoreItem[]; relaxations: RelaxationOption[] }

/**
 * Cancellable wrapper around the real solver port (app ticket 03). A run id
 * guards every state update, so a stale or cancelled solve can never write to
 * the board. `cancel()` truly aborts the in-flight HiGHS worker through the
 * port's `cancelSolve` (not proto's drop-the-result-on-the-floor stub) and
 * returns the UI to idle, leaving the board exactly as it was before Generate.
 * Log lines stream in live from the adapter's per-solve `onLog`.
 */
export function useGenerateFlow(
  runSolve: (onLog: (line: string) => void) => Promise<SolveResult>,
  onSolved: (schedule: ScheduleMap) => void,
  cancelSolve: () => void,
) {
  const [state, setState] = useState<GenerateState>({ phase: 'idle' })
  const runIdRef = useRef(0)
  const startedAtRef = useRef(0)

  useEffect(() => {
    if (state.phase !== 'solving') return
    const id = window.setInterval(() => {
      setState((prev) =>
        prev.phase === 'solving' ? { ...prev, elapsedMs: Date.now() - startedAtRef.current } : prev,
      )
    }, 200)
    return () => window.clearInterval(id)
  }, [state.phase])

  const generate = useCallback(() => {
    const id = ++runIdRef.current
    startedAtRef.current = Date.now()
    setState({ phase: 'solving', elapsedMs: 0, log: [] })
    const onLog = (line: string): void => {
      if (runIdRef.current !== id) return
      setState((prev) => (prev.phase === 'solving' ? { ...prev, log: [...prev.log, line].slice(-40) } : prev))
    }
    runSolve(onLog)
      .then((result) => {
        if (runIdRef.current !== id) return
        const durationMs = Date.now() - startedAtRef.current
        if (result.status === 'solved') {
          onSolved(result.schedule)
          setState({ phase: 'idle' })
          track('solve_finished', { outcome: 'solved', duration_ms: durationMs })
        } else {
          setState({ phase: 'infeasible', conflictCore: result.conflictCore, relaxations: result.relaxations })
          track('solve_finished', { outcome: 'infeasible', duration_ms: durationMs })
        }
      })
      .catch((error: unknown) => {
        if (runIdRef.current !== id) return
        setState({ phase: 'idle' })
        // A cancelled solve rejects with CancelledError — cancel() already
        // reset the UI. Anything else is a genuine engine/environment failure.
        if (!(error instanceof CancelledError)) {
          console.error('Solve failed', error)
          track('solve_finished', { outcome: 'error', duration_ms: Date.now() - startedAtRef.current })
        }
      })
  }, [runSolve, onSolved])

  const cancel = useCallback(() => {
    // The Cancel button only renders while solving, so this is the cancelled
    // run's terminal transition; the bump below is what turns its own
    // still-in-flight `.then`/`.catch` away.
    track('solve_finished', { outcome: 'cancelled', duration_ms: Date.now() - startedAtRef.current })
    runIdRef.current++
    cancelSolve()
    setState({ phase: 'idle' })
  }, [cancelSolve])

  const dismissInfeasible = useCallback(() => setState({ phase: 'idle' }), [])

  return { state, generate, cancel, dismissInfeasible }
}
