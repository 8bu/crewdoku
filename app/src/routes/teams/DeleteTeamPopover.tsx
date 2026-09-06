import { useT } from '../../i18n/useT'
import { useEffect } from 'react'
import { Select } from '../../ui/Select'

const POPOVER_WIDTH = 220

/**
 * Delete confirm as a floating popover, not an inline row (8bu's call: an
 * inline reassign row shifted everything below it on open — a popover
 * overlays instead, nothing else on the page moves). Position comes from the
 * triggering button's own `getBoundingClientRect()`, `position: fixed` so it
 * tracks the viewport regardless of the page's own scroll container.
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
  useEffect(() => {
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
  }, [onCancel])

  const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)

  return (
    <div
      className="cd-teams-delete-popover fixed z-20 flex w-[220px] flex-col gap-2.5 rounded-lg border border-base-300 bg-base-100 p-4 shadow-lg"
      style={{ left, top: rect.bottom + 6 }}
    >
      <p className="text-sm font-semibold text-base-content">
        {count > 0
          ? t('rtc.teams.deletePromptNoQuestion', { team: teamName || t('rtc.common.unnamed') })
          : t('rtc.teams.deletePrompt', { team: teamName || t('rtc.common.unnamed') })}
      </p>
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
          className="cursor-pointer rounded-md border-none bg-transparent px-1.5 py-1 text-2xs font-semibold uppercase tracking-wide text-base-content/40 transition-colors duration-150 hover:text-error"
        >
          {t('rtc.common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="cursor-pointer rounded-md border-none bg-transparent px-1.5 py-1 text-2xs font-semibold uppercase tracking-wide text-error transition-colors duration-150 hover:bg-error/10"
        >
          {count > 0 ? t('rtc.teams.moveAndDelete') : t('rtc.teams.confirmDelete')}
        </button>
      </div>
    </div>
  )
}
