import { describe, it, expect } from 'vitest'
import { VERSION_MARKER } from '../index'

describe('domain smoke', () => {
  it('exports a marker', () => {
    expect(VERSION_MARKER).toBe('crewdoku-domain')
  })
})
