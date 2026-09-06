import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConflictCoreItem, RelaxationOption, ScheduleMap, SolveOptions, SolveResult } from '../../engine/types'

export type GenerateState =
  | { phase: 'idle' }
  | { phase: 'solving'; elapsedMs: number }
  | { phase: 'infeasible'; conflictCore: ConflictCoreItem[]; relaxations: RelaxationOption[] }

/**
 * Cancellable wrapper around the solver port (ticket 11). `solve()` itself
 * has no abort signal — it's a plain Promise — so "cancel" means dropping
 * the eventual result on the floor: a run id guards every state update, and
 * `cancel()` just bumps it, leaving the board exactly as it was before
 * Generate was pressed.
 */
export function useGenerateFlow(
  runSolve: (options?: SolveOptions) => Promise<SolveResult>,
  onSolved: (schedule: ScheduleMap) => void,
) {
  const [state, setState] = useState<GenerateState>({ phase: 'idle' })
  const runIdRef = useRef(0)
  const startedAtRef = useRef(0)

  useEffect(() => {
    if (state.phase !== 'solving') return
    const id = window.setInterval(() => {
      setState((prev) => (prev.phase === 'solving' ? { phase: 'solving', elapsedMs: Date.now() - startedAtRef.current } : prev))
    }, 200)
    return () => window.clearInterval(id)
  }, [state.phase])

  const generate = useCallback(
    (options?: SolveOptions) => {
      const id = ++runIdRef.current
      startedAtRef.current = Date.now()
      setState({ phase: 'solving', elapsedMs: 0 })
      runSolve(options).then((result) => {
        if (runIdRef.current !== id) return
        if (result.status === 'solved') {
          onSolved(result.schedule)
          setState({ phase: 'idle' })
        } else {
          setState({ phase: 'infeasible', conflictCore: result.conflictCore, relaxations: result.relaxations })
        }
      })
    },
    [runSolve, onSolved],
  )

  const cancel = useCallback(() => {
    runIdRef.current++
    setState({ phase: 'idle' })
  }, [])

  const dismissInfeasible = useCallback(() => setState({ phase: 'idle' }), [])

  return { state, generate, cancel, dismissInfeasible }
}
