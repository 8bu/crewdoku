import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { IdbStorageAdapter } from '../idbStorageAdapter'
import { buildDemo, fromScheduleDTO, makeSchedule } from '@crewdoku/domain'

describe('IdbStorageAdapter round-trip', () => {
  it('save then load deep-equals (Map keys, ISO dates, Rules.enabled/weights intact)', async () => {
    const d = buildDemo()
    const store = new IdbStorageAdapter()
    await store.save(d) // d is already an AppStateDTO (assignments as array)
    const loaded = await store.load()
    expect(loaded).not.toBeNull()
    // Whole DTO survives losslessly.
    expect(loaded).toEqual(d)
    // Rules survive (no {} degradation)
    expect(loaded!.rules.enabled.H1).toBe(d.rules.enabled.H1)
    expect(loaded!.rules.weights.S1).toBe(d.rules.weights.S1)
    // schedule reconstructs identical Map (key set preserved)
    const back = fromScheduleDTO(loaded!.assignments)
    const orig = makeSchedule(d.assignments)
    expect([...back.assignments.keys()].sort()).toEqual(
      [...orig.assignments.keys()].sort(),
    )
  })

  it('null shiftId round-trips as null and the ISODate key survives as the exact ISO string', async () => {
    const d = buildDemo()
    const dayOff = d.assignments.find((a) => a.shiftId === null)
    expect(dayOff).toBeTruthy() // demo MUST include >=1 explicit day off
    const isoKey = `${dayOff!.employeeId}|${dayOff!.date}`

    const store = new IdbStorageAdapter()
    await store.save(d)
    const loaded = await store.load()
    const back = fromScheduleDTO(loaded!.assignments)

    const got = back.assignments.get(isoKey)
    expect(got).toBeDefined() // exact ISODate-composed key survived verbatim
    expect(got!.date).toBe(dayOff!.date) // ISO string is the exact same string
    expect(got!.shiftId).toBeNull() // null, not undefined / not dropped
    expect('shiftId' in got!).toBe(true) // key present, not silently omitted
  })

  it('load returns null when nothing has been saved', async () => {
    // Use a distinct DB name to avoid interference from prior saves.
    const store = new IdbStorageAdapter('crewdoku-empty-db')
    expect(await store.load()).toBeNull()
  })
})
