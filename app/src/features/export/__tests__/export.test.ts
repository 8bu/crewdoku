import { describe, it, expect } from 'vitest'
import { buildTeamCsvForDownload, buildMemberCsvForDownload } from '../exportActions'
import { createStore } from '../../../store/store'

describe('export actions', () => {
  it('team CSV uses domain exportTeamCSV (RFC4180 quoted)', () => {
    const s = createStore()
    s.getState().loadDemo()
    const team = buildTeamCsvForDownload(s.getState())
    expect(team).toContain('"')
    // header row begins with an empty leading cell then the period dates
    expect(team.split('\n')[0]!.startsWith('""')).toBe(true)
  })

  it('member CSV uses domain exportMemberCSV (header has shiftCode)', () => {
    const s = createStore()
    s.getState().loadDemo()
    const memberId = s.getState().employees[0]!.id
    const member = buildMemberCsvForDownload(s.getState(), memberId)
    expect(member.split('\n')[0]).toContain('shiftCode')
  })
})
