import type { MouseEvent } from 'react'
import { Trash2 } from './icons'

/**
 * The destructive action at the foot of a detail pane — the Teams half's
 * "delete team" and the Tags half's "delete group"/"delete tag".
 *
 * One control for all three, and a button you can see: the earlier version was
 * set in the same 2xs uppercase grey as the pane's own `<h2>`s, so it read as
 * one more heading until you happened to hover it. The icon and the error tint
 * say "this does something, and it is destructive" at a glance, on touch too,
 * where there is no hover to reveal it.
 *
 * `onClick` is handed the button element itself: `DeleteTeamPopover` positions
 * its confirm from the trigger's own rect.
 */
export function DeleteButton({
  label,
  onClick,
  disabled = false,
  title,
}: {
  label: string
  onClick: (anchor: HTMLButtonElement) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={(event: MouseEvent<HTMLButtonElement>) => onClick(event.currentTarget)}
      disabled={disabled}
      title={title}
      className="btn btn-ghost btn-sm min-h-11 cursor-pointer gap-1.5 self-start text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-base-content/30 md:min-h-0"
    >
      <Trash2 className="h-4 w-4" />
      {label}
    </button>
  )
}
