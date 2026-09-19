import { useT } from '../../i18n/useT'
import { useEffect } from 'react'
import { Select } from '../../ui/Select'
import { BottomSheet } from '../../ui/BottomSheet'
import { useIsNarrow } from '../../ui/useIsNarrow'

const POPOVER_WIDTH = 220

/**
 * Delete confirm as a floating popover, not an inline row (8bu's call: an
 * inline reassign row shifted everything below it on open — a popover
 * overlays instead, nothing else on the page moves). Position comes from the
 * triggering button's own `getBoundingClientRect()`, `position: fixed` so it
 * tracks the viewport regardless of the page's own scroll container.
 *
 * On a phone that anchored 220px popover is the wrong shape — it has to fit
 * next to a button that may sit anywhere on the screen, and it floats over a
 * page the user can still scroll behind it. Below `md` the same confirm body
 * comes up as a bottom sheet instead: full width, thumb-reachable, and it
 * owns its own backdrop and Escape handling. The `rect` anchor is desktop-only.
 */
export function DeleteTeamPopover({
  rect,
  teamName,
  count,
  otherTeams,
  reassignToId,
  onReassignChange,
  onConfirm,
  onCancel,
}: {
  rect: { left: number; bottom: number }
  teamName: string
  count: number
  otherTeams: { id: string; name: string }[]
  reassignToId: string
  onReassignChange: (id: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  const isNarrow = useIsNarrow()
  useEffect(() => {
    // Desktop-only dismissal: the sheet renders its own backdrop (click to
    // close) and its own Escape listener, so listening here would fire
    // `onCancel` on any stray press inside the sheet's own controls.
    if (isNarrow) return
    function closeIfOutside(e: MouseEvent) {
      if ((e.target as HTMLElement | null)?.closest('.cd-teams-delete-popover')) return
      onCancel()
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('mousedown', closeIfOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeIfOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onCancel, isNarrow])

  const prompt =
    count > 0
      ? t('rtc.teams.deletePromptNoQuestion', { team: teamName || t('rtc.common.unnamed') })
      : t('rtc.teams.deletePrompt', { team: teamName || t('rtc.common.unnamed') })

  const body = (
    <>
      {count > 0 && (
        <>
          <p className="text-xs text-base-content/60">
            {count === 1 ? t('rtc.teams.moveCountTo.person', { count }) : t('rtc.teams.moveCountTo.people', { count })}
          </p>
          <Select
            className="w-full"
            value={reassignToId}
            onChange={onReassignChange}
            options={otherTeams.map((team) => ({ value: team.id, label: team.name || t('rtc.common.unnamed') }))}
          />
        </>
      )}
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border-none bg-transparent px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors duration-150 hover:text-error md:min-h-0 md:px-1.5"
        >
          {t('rtc.common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border-none bg-transparent px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-error transition-colors duration-150 hover:bg-error/10 md:min-h-0 md:px-1.5"
        >
          {count > 0 ? t('rtc.teams.moveAndDelete') : t('rtc.teams.confirmDelete')}
        </button>
      </div>
    </>
  )

  if (isNarrow) {
    return (
      <BottomSheet open onClose={onCancel} title={prompt}>
        <div className="flex flex-col gap-2.5">{body}</div>
      </BottomSheet>
    )
  }

  const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)

  return (
    <div
      className="cd-teams-delete-popover fixed z-20 flex w-[220px] flex-col gap-2.5 rounded-lg border border-base-300 bg-base-100 p-4 shadow-lg"
      style={{ left, top: rect.bottom + 6 }}
    >
      <p className="text-sm font-semibold text-base-content">{prompt}</p>
      {body}
    </div>
  )
}
