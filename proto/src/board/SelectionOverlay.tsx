import type { OverlayRect } from './useBoardEditing'

type SelectionOverlayProps = {
  rect: OverlayRect | null
}

/**
 * One absolutely-positioned div for the whole selection range (research
 * ticket 03: never write a class to every selected cell). Sits behind the
 * sticky header/name column in paint order (no z-index of its own), so it
 * disappears under frozen panes correctly with no extra clipping logic.
 */
export function SelectionOverlay({ rect }: SelectionOverlayProps) {
  if (!rect) return null
  return (
    <div
      className="cd-board__selection pointer-events-none absolute z-[1] box-border border-2 border-[var(--sel)] bg-[color-mix(in_oklch,var(--sel-bg)_55%,transparent)]"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    />
  )
}
