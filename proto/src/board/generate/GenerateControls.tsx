import type { GenerateState } from './useGenerateFlow'
import { formatElapsed } from './format'

export type GenerateControlsProps = {
  hasSchedule: boolean
  state: GenerateState
  onGenerate: () => void
  onCancel: () => void
  /** Ticket 17 rework: an existing, still-empty period's board can import a
   * real schedule instead of generating one — surfaced right next to this
   * same banner rather than a whole separate empty-state, since it only
   * ever applies while that banner is already showing. Optional so every
   * other `GenerateControls` caller (there is only the one, but the type
   * shouldn't assume it) isn't forced to wire an import flow it has no use
   * for. */
  onImport?: () => void
}

/**
 * Generate (ticket 11). Editing stays live for the whole solve — a hand-edit
 * mid-solve is a pin already held in `overrides`, and `getAssignment` reads
 * overrides ahead of the base schedule, so it survives the solved result
 * landing underneath it with no extra reconciliation code. Generate lives in
 * a persistent bottom-right FAB; a top banner doubles as a second way in
 * while the board is empty (8bu's pick, from three prototype variants —
 * see ticket 11).
 *
 * The `infeasible` phase never actually reaches this component — `BoardGrid`
 * unmounts it in favor of `InfeasiblePanel` (ticket 13), the same way it
 * already unmounts this component while a proposal is pending. `solving`
 * is the only non-idle phase this component ever has to render.
 *
 * The banner is a real flex row, not a `position: absolute` overlay (board-
 * overhaul revamp, 8bu: "a warning msg overlay on top of the board" — an
 * absolutely-positioned top-0 banner inside `.cd-board-shell` sits at the
 * exact same pixel row as the board's own sticky date-header underneath it,
 * covering it rather than displacing it). It now pushes `.cd-board-scroll`
 * down by its own height instead.
 */
export function GenerateControls({ hasSchedule, state, onGenerate, onCancel, onImport }: GenerateControlsProps) {
  const solving = state.phase === 'solving'
  const showBanner = !hasSchedule || solving

  return (
    <>
      {showBanner && (
        <div className="flex items-center gap-2.5 border-b border-base-300 bg-base-200 px-3.5 py-[7px] text-xs text-base-content">
          {solving ? (
            <>
              <span className="loading loading-spinner loading-xs text-primary" aria-hidden="true" />
              <span>Generating schedule… {formatElapsed(state.elapsedMs)} — the board stays editable while this runs.</span>
              <button type="button" className="btn btn-outline btn-xs ml-auto" onClick={onCancel}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <span>This period has no schedule yet — Generate to fill it in.</span>
              {onImport && (
                <button type="button" className="btn btn-ghost btn-xs ml-auto rounded-md" onClick={onImport}>
                  Import schedule…
                </button>
              )}
            </>
          )}
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary fixed right-6 bottom-6 z-9 rounded-full px-6 shadow-[var(--shadow-pane)]"
        onClick={onGenerate}
        disabled={solving}
        aria-label={hasSchedule ? 'Regenerate schedule' : 'Generate schedule'}
      >
        {hasSchedule ? 'Regenerate' : 'Generate'}
      </button>
    </>
  )
}
