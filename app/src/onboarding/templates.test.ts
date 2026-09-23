import { describe, expect, it } from 'vitest'
import { WORKSPACE_TEMPLATES } from './templates'

describe('WORKSPACE_TEMPLATES', () => {
  it.each(WORKSPACE_TEMPLATES.map((t) => [t.id, t] as const))('%s: shift codes are unique and non-empty', (_id, tmpl) => {
    expect(tmpl.shifts.length).toBeGreaterThan(0)
    const codes = tmpl.shifts.map((s) => s.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const shift of tmpl.shifts) {
      expect(shift.code).toMatch(/^[A-Z]+$/)
      expect(shift.start).toMatch(/^\d{4}$/)
      expect(shift.end).toMatch(/^\d{4}$/)
    }
  })

  it.each(WORKSPACE_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s: coverage covers all 7 weekdays and only its own shift codes, min <= max',
    (_id, tmpl) => {
      const codes = new Set(tmpl.shifts.map((s) => s.code))
      for (let dow = 0; dow < 7; dow++) {
        const row = tmpl.coverage.byDow[dow]
        expect(row).toBeDefined()
        for (const [code, band] of Object.entries(row!)) {
          expect(codes.has(code)).toBe(true)
          expect(band.min).toBeLessThanOrEqual(band.max)
          expect(band.min).toBeGreaterThanOrEqual(0)
        }
      }
    },
  )

  it('office week is closed on weekends and open Monday to Friday', () => {
    const office = WORKSPACE_TEMPLATES.find((t) => t.id === 'office')!
    expect(office.coverage.byDow[0]!['DAY']).toEqual({ min: 0, max: 0 })
    expect(office.coverage.byDow[6]!['DAY']).toEqual({ min: 0, max: 0 })
    for (let dow = 1; dow <= 5; dow++) expect(office.coverage.byDow[dow]!['DAY']!.min).toBeGreaterThan(0)
  })

  it('custom seeds no requirements — a first generate can never be infeasible on coverage', () => {
    const custom = WORKSPACE_TEMPLATES.find((t) => t.id === 'custom')!
    for (let dow = 0; dow < 7; dow++) {
      for (const band of Object.values(custom.coverage.byDow[dow]!)) expect(band.min).toBe(0)
    }
  })
})
