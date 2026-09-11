import type { ShiftDef } from '@crewdoku/domain'

function parseHhmmToMinutes(hhmm: string): number {
  const h = Number(hhmm.slice(0, 2))
  const m = Number(hhmm.slice(2))
  return h * 60 + m
}

function formatMinutesToHhmm(minutes: number, isEnd = false, startMinutes = 0): string {
  // If this is an end time that lands exactly on 24:00 (1440 min) from a same-day start
  if (isEnd && minutes > startMinutes && (minutes - startMinutes) % 1440 === 0) {
    return '2400'
  }
  if (isEnd && minutes === 1440 && startMinutes < 1440) {
    return '2400'
  }

  const normalized = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`
}

function makeShiftDef(base: ShiftDef, startMin: number, endMin: number): ShiftDef {
  const startHhmm = formatMinutesToHhmm(startMin, false, startMin)
  const endHhmm = formatMinutesToHhmm(endMin, true, startMin)
  const isNight = Number(endHhmm) <= Number(startHhmm)

  return {
    ...base,
    start: startHhmm,
    end: endHhmm,
    isNight: isNight ? true : undefined,
  }
}

/**
 * Round to nearest `step` (default 5) minutes, clamped to [0, 1440].
 */
export function snapMinutes(min: number, step = 5): number {
  if (step <= 0) return Math.max(0, Math.min(1440, min))
  const snapped = Math.round(min / step) * step
  return Math.max(0, Math.min(1440, snapped))
}

/**
 * Clock-span duration in minutes (handles midnight wrap): end<=start => +1440.
 */
export function durationMinutes(shift: ShiftDef): number {
  const startMin = parseHhmmToMinutes(shift.start)
  const rawEnd = parseHhmmToMinutes(shift.end)
  const endMin = rawEnd <= startMin ? rawEnd + 1440 : rawEnd
  return endMin - startMin
}

/**
 * Set ONE shift's clock duration (by index), keeping its start. Snaps; enforces >=15.
 */
export function setDurationOne(shifts: ShiftDef[], index: number, durationMin: number): ShiftDef[] {
  if (index < 0 || index >= shifts.length) {
    return shifts.map((s) => ({ ...s }))
  }
  const validDuration = Math.min(1440, Math.max(15, snapMinutes(durationMin)))
  return shifts.map((shift, i) => {
    if (i !== index) return { ...shift }
    const startMin = parseHhmmToMinutes(shift.start)
    const endMin = startMin + validDuration
    return makeShiftDef(shift, startMin, endMin)
  })
}

/**
 * Roll the WHOLE schedule by deltaMin around a circular 24h timeline. Every shift moves by
 * the same snapped amount and whatever rolls past 24:00 (or before 00:00) wraps round to the
 * other edge — like turning a loop. Grabbing any shift rotates the entire ring rigidly, so
 * each shift keeps its duration and every gap/overlap between shifts is preserved.
 * makeShiftDef normalises the wrap and flags isNight.
 */
export function moveShift(shifts: ShiftDef[], index: number, deltaMin: number): ShiftDef[] {
  if (index < 0 || index >= shifts.length) {
    return shifts.map((s) => ({ ...s }))
  }
  const snapped = Math.round(deltaMin / 5) * 5
  if (snapped === 0) {
    return shifts.map((s) => ({ ...s }))
  }
  return shifts.map((s) => {
    const start = parseHhmmToMinutes(s.start)
    const dur = durationMinutes(s)
    const newStart = (((start + snapped) % 1440) + 1440) % 1440
    return makeShiftDef(s, newStart, newStart + dur)
  })
}

/**
 * Head (left-edge) resize: set shift[index] start to newStartMin, keeping its end fixed.
 * FREE: may overlap or gap the previous shift. Enforce >=15 min duration. Snaps.
 */
export function resizeHead(shifts: ShiftDef[], index: number, newStartMin: number): ShiftDef[] {
  if (index < 0 || index >= shifts.length) {
    return shifts.map((s) => ({ ...s }))
  }

  const shift = shifts[index]!
  const currentStart = parseHhmmToMinutes(shift.start)
  const rawEnd = parseHhmmToMinutes(shift.end)
  const currentEnd = rawEnd <= currentStart ? rawEnd + 1440 : rawEnd

  let targetStart = snapMinutes(newStartMin)

  if (currentEnd > 1440 && targetStart < rawEnd) {
    targetStart += 1440
  }

  // Enforce duration >= 15 min and <= 1440 min
  if (currentEnd - targetStart < 15) {
    targetStart = currentEnd - 15
  }
  if (currentEnd - targetStart > 1440) {
    targetStart = currentEnd - 1440
  }

  if (targetStart < 0) {
    targetStart = 0
  }

  return shifts.map((s, i) => (i === index ? makeShiftDef(s, targetStart, currentEnd) : { ...s }))
}

/**
 * Tail (right-edge) resize: set shift[index] end to newEndMin, keeping its start fixed.
 * FREE: may overlap or gap the next shift. Enforce >=15 min duration; cap duration at 24h. Snaps.
 */
export function resizeTail(shifts: ShiftDef[], index: number, newEndMin: number): ShiftDef[] {
  if (index < 0 || index >= shifts.length) {
    return shifts.map((s) => ({ ...s }))
  }

  const shift = shifts[index]!
  const startMin = parseHhmmToMinutes(shift.start)
  const targetEndRaw = snapMinutes(newEndMin)

  let endMin = targetEndRaw <= startMin ? targetEndRaw + 1440 : targetEndRaw

  // Enforce duration in [15, 1440]
  if (endMin - startMin < 15) {
    endMin = startMin + 15
  }
  if (endMin - startMin > 1440) {
    endMin = startMin + 1440
  }

  return shifts.map((s, i) => (i === index ? makeShiftDef(s, startMin, endMin) : { ...s }))
}
