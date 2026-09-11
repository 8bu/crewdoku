import { useMemo, useRef } from 'react'
import { shiftSpan, type ShiftDef } from '@crewdoku/domain'
import { swatchBg } from '../../board/shiftColors'
import { moveShift, resizeHead, resizeTail } from './shiftEditing'

function toClock(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
}

type Interval = { start: number; end: number }

/** Splits a shift span (end may exceed 1440 when it crosses midnight) into the
 *  1-2 concrete slices that fall within a single 00:00–24:00 day. */
function clipToDay(span: Interval): Interval[] {
  if (span.end <= 1440) return [{ start: span.start, end: span.end }]
  return [
    { start: span.start, end: 1440 },
    { start: 0, end: span.end - 1440 },
  ]
}

/** Every window where two shifts are simultaneously on the clock, in [0,1440). */
function overlapWindows(intervalsPerShift: Interval[][]): Interval[] {
  const out: Interval[] = []
  for (let i = 0; i < intervalsPerShift.length; i++) {
    for (let j = i + 1; j < intervalsPerShift.length; j++) {
      for (const a of intervalsPerShift[i]!) {
        for (const b of intervalsPerShift[j]!) {
          const start = Math.max(a.start, b.start)
          const end = Math.min(a.end, b.end)
          if (end > start) out.push({ start, end })
        }
      }
    }
  }
  return out
}

function fmtMinutes(min: number): string {
  if (min >= 1440) return '24:00'
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

type DragMode = 'body' | 'head' | 'tail'

interface DragSession {
  mode: DragMode
  shiftIndex: number
  pointerId: number
  startX: number
  barLeft: number
  barWidth: number
  shiftsSnapshot: ShiftDef[]
}

/**
 * Editable 24-hour timeline of shift blocks. Drag a block's body to roll the whole
 * schedule around the clock (rigid rotation, wrapping past midnight); drag a block's
 * left/right edge to resize its start/end freely (overlaps and gaps are valid).
 * Overlapping windows are drawn as a hatched band. Emits the next shift list on every
 * pointer move via `onChange`; it owns no state.
 */
export function ShiftTimelineBar({
  shifts,
  onChange,
  overlapLabel = 'Overlap',
}: {
  shifts: ShiftDef[]
  onChange: (next: ShiftDef[]) => void
  /** Tooltip prefix for a hatched overlap band, e.g. a localized "Overlap". */
  overlapLabel?: string
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)

  const overlaps = useMemo(() => {
    const perShift = shifts
      .map((s) => shiftSpan(shifts, s.code))
      .filter((span): span is Interval => span !== null)
      .map(clipToDay)
    return overlapWindows(perShift)
  }, [shifts])

  function handlePointerDown(e: React.PointerEvent<HTMLElement>, shiftIndex: number, mode: DragMode) {
    if (e.button !== 0) return
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    if (rect.width <= 0) return

    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      mode,
      shiftIndex,
      pointerId: e.pointerId,
      startX: e.clientX,
      barLeft: rect.left,
      barWidth: rect.width,
      shiftsSnapshot: shifts,
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    const { mode, shiftIndex, startX, barLeft, barWidth, shiftsSnapshot } = drag
    if (mode === 'body') {
      const dx = e.clientX - startX
      const deltaMin = Math.round((dx / barWidth) * 1440)
      onChange(moveShift(shiftsSnapshot, shiftIndex, deltaMin))
    } else if (mode === 'head') {
      const absMin = ((e.clientX - barLeft) / barWidth) * 1440
      onChange(resizeHead(shiftsSnapshot, shiftIndex, absMin))
    } else if (mode === 'tail') {
      const absMin = ((e.clientX - barLeft) / barWidth) * 1440
      onChange(resizeTail(shiftsSnapshot, shiftIndex, absMin))
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (drag && drag.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      dragRef.current = null
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div ref={barRef} className="relative h-6 w-full select-none overflow-hidden rounded bg-base-300/60">
        {shifts.map((shift, idx) => {
          const span = shiftSpan(shifts, shift.code)
          if (!span) return null
          // A midnight-crossing shift yields two slices. Head + body (with the
          // code label) live on the first slice, which holds the start; the tail
          // handle lives on the LAST slice, whose right edge is the real end — so
          // a night shift's end past midnight stays draggable. The wrap sliver
          // carries no label it is too narrow to show.
          const slices = clipToDay(span)
          return slices.map((seg, si) => {
            const isFirst = si === 0
            const isLast = si === slices.length - 1
            return (
              <div
                key={`${shift.code}-${si}`}
                className="pointer-events-none absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-base-100/40 text-[10px] font-bold text-white shadow-sm"
                style={{
                  left: `${(seg.start / 1440) * 100}%`,
                  width: `${((seg.end - seg.start) / 1440) * 100}%`,
                  backgroundColor: swatchBg(shift.color),
                }}
                title={`${shift.code}: ${toClock(shift.start)}–${toClock(shift.end)}`}
              >
                {isFirst && (
                  <>
                    {/* Head resize zone (left ~8px) */}
                    <div
                      className="pointer-events-auto absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize touch-none"
                      onPointerDown={(e) => handlePointerDown(e, idx, 'head')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      aria-label={`${shift.code} resize start`}
                    />

                    {/* Body move zone */}
                    <div
                      className="pointer-events-auto absolute inset-0 flex cursor-grab items-center justify-center px-2 touch-none active:cursor-grabbing"
                      onPointerDown={(e) => handlePointerDown(e, idx, 'body')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      aria-label={`${shift.code} move`}
                    >
                      <span className="pointer-events-none truncate px-1 drop-shadow-sm">
                        {shift.code}
                      </span>
                    </div>
                  </>
                )}

                {isLast && (
                  /* Tail resize zone (right ~8px) — sits on the slice holding the end */
                  <div
                    className="pointer-events-auto absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize touch-none"
                    onPointerDown={(e) => handlePointerDown(e, idx, 'tail')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    aria-label={`${shift.code} resize end`}
                  />
                )}
              </div>
            )
          })
        })}
        {overlaps.map((o, idx) => (
          <div
            key={`overlap-${idx}`}
            className="pointer-events-none absolute inset-y-0 border-x border-white/60"
            style={{
              left: `${(o.start / 1440) * 100}%`,
              width: `${((o.end - o.start) / 1440) * 100}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(0,0,0,0.4) 0, rgba(0,0,0,0.4) 2px, rgba(255,255,255,0.25) 2px, rgba(255,255,255,0.25) 5px)',
            }}
            title={`${overlapLabel}: ${fmtMinutes(o.start)}–${fmtMinutes(o.end)}`}
          />
        ))}
      </div>
      <div className="flex justify-between px-0.5 text-[10px] font-mono tabular-nums text-base-content/40">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  )
}
