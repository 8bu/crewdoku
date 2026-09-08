import type { CoverageRow, CoverageTable, ShiftCode, ShiftDef } from '@crewdoku/domain'
import { SHIFT_COLORS, type ShiftColorId } from '../../board/shiftColors'

export type GenerateShiftsParams = {
  windowStart: string // 'HHMM'
  windowEnd: string // 'HHMM'
  shiftCount: number
  breakMinutes: number
  overlapMinutes: number
}

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

const DEFAULT_CODES_BY_COUNT: Record<number, { code: ShiftCode; label: string }[]> = {
  1: [{ code: 'DAY', label: 'Day' }],
  2: [
    { code: 'EARLY', label: 'Early' },
    { code: 'LATE', label: 'Late' },
  ],
  3: [
    { code: 'EARLY', label: 'Early' },
    { code: 'DAY', label: 'Day' },
    { code: 'LATE', label: 'Late' },
  ],
  4: [
    { code: 'EARLY', label: 'Early' },
    { code: 'DAY', label: 'Day' },
    { code: 'LATE', label: 'Late' },
    { code: 'NIGHT', label: 'Night' },
  ],
}

/**
 * Pure generator: tiles an operating window into `shiftCount` shifts with
 * optional overlap and unpaid breaks, plus an all-week coverage table requiring
 * 1–3 people per shift (matching onboarding templates convention).
 */
export function generateShifts(params: GenerateShiftsParams): {
  shifts: ShiftDef[]
  coverage: CoverageTable
} {
  const { windowStart, windowEnd, shiftCount, breakMinutes, overlapMinutes } = params

  const count = Math.max(1, Math.round(shiftCount) || 1)
  const startMin = parseHhmmToMinutes(windowStart)
  const endMin = parseHhmmToMinutes(windowEnd)

  const totalWindowMinutes =
    windowStart === windowEnd
      ? 1440
      : endMin <= startMin
        ? endMin + 1440 - startMin
        : endMin - startMin

  const baseSegment = totalWindowMinutes / count
  const defaultCodes = DEFAULT_CODES_BY_COUNT[count]

  const shifts: ShiftDef[] = []

  for (let i = 0; i < count; i++) {
    const baseStart = startMin + i * baseSegment
    const baseEnd = baseStart + baseSegment
    const shiftStartMin = Math.round(baseStart)
    const shiftEndMin = Math.round(baseEnd + overlapMinutes)

    const startHhmm = formatMinutesToHhmm(shiftStartMin, false, shiftStartMin)
    const endHhmm = formatMinutesToHhmm(shiftEndMin, true, shiftStartMin)

    const codeInfo = defaultCodes?.[i] ?? {
      code: `S${i + 1}`,
      label: `Shift ${i + 1}`,
    }

    const startVal = Number(startHhmm)
    const endVal = Number(endHhmm)
    // A shift crosses midnight if end <= start in 24h clock values (e.g. 2200 to 0600)
    const isNight = endVal <= startVal

    const color: ShiftColorId = SHIFT_COLORS[i % SHIFT_COLORS.length]!.id

    shifts.push({
      code: codeInfo.code,
      label: codeInfo.label,
      start: startHhmm,
      end: endHhmm,
      unpaidBreakMinutes: breakMinutes > 0 ? breakMinutes : undefined,
      isNight: isNight ? true : undefined,
      color,
    })
  }

  // Coverage table: byDow[0..6] requiring { min: 1, max: 3 } for every generated code
  const row: CoverageRow = Object.fromEntries(
    shifts.map((s) => [s.code, { min: 1, max: 3 }]),
  )
  const byDow: Record<number, CoverageRow> = {}
  for (let dow = 0; dow < 7; dow++) {
    byDow[dow] = { ...row }
  }

  return {
    shifts,
    coverage: {
      byDow,
      dateOverrides: {},
    },
  }
}
