export type ViolationTipState = {
  left: number
  top: number
  message: string
  visible: boolean
  /** True for a header-anchored tip (e.g. the holiday dot) — flips the tip
   * below its target instead of above, since the header sits at the very
   * top of the board and "above" would run off-screen. Purely positional;
   * colour is `kind`'s job. */
  below?: boolean
  /** Which rule this tip is reporting, so severity reads correctly: a real
   * rule break is red, a holiday note is amber, and a proposal's "was: X"
   * hint — informational, not a problem — is the same violet already
   * marking changed cells, never red/black. Defaults to 'violation'. */
  kind?: 'violation' | 'proposal' | 'holiday'
  /** Wider measure for a per-person list containing several period-wide messages. */
  wide?: boolean
  /** Align the tip's right edge to the target; used by the pinned-right fairness column. */
  alignEnd?: boolean
}

/**
 * One shared floating pill for every rule-break tooltip on the board (ticket
 * 07 follow-up) — never unmounts, so `BoardGrid` can just move it, and the
 * CSS transition makes it read as flying from cell to cell instead of
 * popping in fresh at each hover.
 */
export function ViolationTip({
  left,
  top,
  message,
  visible,
  below,
  wide,
  alignEnd,
  kind = 'violation',
}: ViolationTipState) {
  return (
    <div
      className="cd-violation-tip pointer-events-none absolute top-0 left-0 z-[7] max-w-[260px] rounded-md px-2 py-1.5 text-2xs leading-normal opacity-0 shadow-[var(--shadow-pane)] transition-[left,top,opacity] duration-[120ms] ease-in-out data-[visible=true]:opacity-100 data-[wide=true]:max-w-[480px] data-[wide=true]:text-xs"
      data-visible={visible}
      data-below={below || undefined}
      data-wide={wide || undefined}
      data-align-end={alignEnd || undefined}
      data-kind={kind}
      style={{ left, top }}
    >
      {message}
    </div>
  )
}
