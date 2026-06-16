export type ID = string
export type ISODate = string // YYYY-MM-DD
export type Pref = 'prefer' | 'willing' | 'avoid'
export type ConstraintId =
  | 'H1'
  | 'H2'
  | 'H3'
  | 'H4'
  | 'H5'
  | 'H6'
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'S5'
export type SoftId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'

export interface DateRange {
  start: ISODate
  end: ISODate
}
export interface RecurringRule {
  kind: 'noDow'
  dow: number // 0=Mon..6=Sun
}

export interface Org {
  id: ID
  name: string
}
export interface Team {
  id: ID
  name: string
  shiftIds: ID[]
}
export interface Shift {
  id: ID
  code: string
  name: string
  startHour: number
  endHour: number
  isNight: boolean
}
export interface Employee {
  id: ID
  name: string
  teamId: ID
  eligibleShiftIds: ID[]
  contract: { maxHoursPerWeek?: number; maxShiftsPerWeek?: number }
  timeOff: DateRange[]
  recurring: RecurringRule[]
  prefs: { night: Pref; weekend: Pref; preferredShiftId?: ID; notes: string }
}
export interface Coverage {
  teamId: ID
  shiftId: ID
  byDow: { min: number; max: number }[] // length 7, Mon..Sun
  dateOverrides: Record<ISODate, { min: number; max: number }>
}
export interface Period {
  startDate: ISODate
  weeks: number
}
export interface Assignment {
  employeeId: ID
  date: ISODate
  shiftId: ID | null
}
export interface Rules {
  maxHoursPerWeek: number
  minRestHours: number
  maxConsecutiveDays: number
  enabled: Record<ConstraintId, boolean>
  weights: Record<SoftId, number>
}
