/**
 * Export templates (wayfinder ticket 18) — matrix builders for the four
 * schedule export layouts:
 * 1. team-grid: people × dates, one row per person (import/export round-trip shape)
 * 2. board: people × dates grouped under team header rows
 * 3. person-list: one row per person × scheduled day with start/end/hours
 * 4. coverage-pivot: headcount per shift per day
 */

import { UNASSIGNED_TEAM } from '../board/mockBoard'
import { activeRoster } from '../board/roster/rosterOps'
import {
  buildGridRows,
  buildPersonRows,
  type ExportCell,
  type ExportInputs,
} from './exportCsv'

export type ExportTemplateId = 'team-grid' | 'board' | 'person-list' | 'coverage-pivot'

export type ExportTemplate = {
  id: ExportTemplateId
  label: string
  description: string
}

export const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: 'team-grid',
    label: 'Team grid',
    description: 'People × dates, one row per person — the same shape Import an old schedule reads back.',
  },
  {
    id: 'board',
    label: 'Board layout',
    description: 'People × dates grouped under team header rows — reads like the Board.',
  },
  {
    id: 'person-list',
    label: 'Per-person list',
    description: 'One row per scheduled day, with times and hours — one file for everyone.',
  },
  {
    id: 'coverage-pivot',
    label: 'Coverage pivot',
    description: "Headcount per shift per day — the Coverage view's counts.",
  },
]

function buildBoardRows(inputs: ExportInputs): ExportCell[][] {
  const header: ExportCell[] = ['name', ...inputs.dates.map((d) => d.iso)]
  const active = activeRoster(inputs.people)
  const known = new Set(inputs.teams.map((t) => t.id))
  const rows: ExportCell[][] = [header]

  for (const team of inputs.teams) {
    const members = active.filter((p) => p.teamId === team.id)
    if (members.length === 0) continue

    rows.push([team.name, ...inputs.dates.map(() => '')])

    for (const person of members) {
      const dateCells = inputs.dates.map((date) => {
        const assignment = inputs.getAssignment(person.id, date.iso)
        return assignment.code === 'OFF' ? '' : assignment.code
      })
      rows.push([person.name, ...dateCells])
    }
  }

  const unassignedMembers = active.filter((p) => !known.has(p.teamId))
  if (unassignedMembers.length > 0) {
    rows.push([UNASSIGNED_TEAM.name, ...inputs.dates.map(() => '')])

    for (const person of unassignedMembers) {
      const dateCells = inputs.dates.map((date) => {
        const assignment = inputs.getAssignment(person.id, date.iso)
        return assignment.code === 'OFF' ? '' : assignment.code
      })
      rows.push([person.name, ...dateCells])
    }
  }

  return rows
}

function buildCoveragePivotRows(inputs: ExportInputs): ExportCell[][] {
  const header: ExportCell[] = ['shift', ...inputs.dates.map((d) => d.iso)]
  const active = activeRoster(inputs.people)
  const relevantShifts = inputs.shifts.filter((s) => s.code !== 'OFF')

  const rows: ExportCell[][] = [header]

  for (const shift of relevantShifts) {
    const counts = inputs.dates.map((date) => {
      let count = 0
      for (const person of active) {
        if (inputs.getAssignment(person.id, date.iso).code === shift.code) {
          count++
        }
      }
      return count
    })
    rows.push([shift.code, ...counts])
  }

  return rows
}

export function buildTemplateRows(id: ExportTemplateId, inputs: ExportInputs): ExportCell[][] {
  switch (id) {
    case 'team-grid':
      return buildGridRows(inputs)
    case 'board':
      return buildBoardRows(inputs)
    case 'person-list':
      return buildPersonRows(inputs)
    case 'coverage-pivot':
      return buildCoveragePivotRows(inputs)
  }
}
