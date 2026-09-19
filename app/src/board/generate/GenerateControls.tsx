import type { GenerateState } from './useGenerateFlow'
import { formatElapsed } from './format'
import { useT } from '../../i18n/useT'

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
 *
 * On a phone the FAB has one more thing under it than desktop does: the
 * Shell's fixed bottom nav (`--mobile-nav-h`, plus the home-indicator inset).
 * It lifts by both and grows to a 44px+ target; `md:` restores the original
 * `bottom-6` corner exactly.
 */
export function GenerateControls({ hasSchedule, state, onGenerate, onCancel, onImport }: GenerateControlsProps) {
  const t = useT()
  const solving = state.phase === 'solving'
  const showBanner = !hasSchedule || solving
  const elapsedMs = state.phase === 'solving' ? state.elapsedMs : 0
  const lastLog =
    state.phase === 'solving' && state.log.length > 0 ? state.log[state.log.length - 1] : undefined

  return (
    <>
      {showBanner && (
        <div className="flex items-center gap-2.5 border-b border-base-300 bg-base-200 px-3.5 py-1.5 text-xs text-base-content md:py-[7px]">
          {solving ? (
            <>
              <span className="loading loading-spinner loading-xs text-primary" aria-hidden="true" />
              <span>{t('panels.generate.solving', { elapsed: formatElapsed(elapsedMs) })}</span>
              {lastLog !== undefined && (
                <span
                  className="hidden max-w-[22ch] truncate font-[family-name:var(--font-mono)] text-2xs text-[color:var(--text-faint)] sm:inline"
                  title={lastLog}
                >
                  {lastLog}
                </span>
              )}
              <button type="button" className="btn btn-outline btn-xs min-h-11 ml-auto md:min-h-0" onClick={onCancel}>
                {t('panels.generate.cancel')}
              </button>
            </>
          ) : (
            <>
              <span>{t('panels.generate.noSchedule')}</span>
              {onImport && (
                <button type="button" className="btn btn-ghost btn-xs ml-auto min-h-11 rounded-md md:min-h-0" onClick={onImport}>
                  {t('panels.generate.import')}
                </button>
              )}
            </>
          )}
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary fixed right-6 bottom-[calc(var(--mobile-nav-h)_+_env(safe-area-inset-bottom)_+_0.5rem)] z-9 min-h-12 rounded-full px-6 shadow-[var(--shadow-pane)] md:bottom-6 md:min-h-0"
        data-tour="generate"
        onClick={onGenerate}
        disabled={solving}
        aria-label={hasSchedule ? t('panels.generate.regenerateAria') : t('panels.generate.generateAria')}
      >
        {hasSchedule ? t('panels.generate.regenerate') : t('panels.generate.generate')}
      </button>
    </>
  )
}
