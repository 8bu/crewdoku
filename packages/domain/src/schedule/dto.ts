import type { Assignment } from '../entities/types'
import { makeSchedule, type Schedule } from './schedule'

export type ScheduleDTO = Assignment[]

/** Serialize the Map-backed schedule to a plain, JSON-safe Assignment[]. */
export function toScheduleDTO(s: Schedule): ScheduleDTO {
  return [...s.assignments.values()]
}

/** Rebuild a Schedule (Map) from a plain Assignment[] DTO. */
export function fromScheduleDTO(arr: ScheduleDTO): Schedule {
  return makeSchedule(arr)
}
