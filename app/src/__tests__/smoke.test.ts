import { describe, it, expect } from 'vitest'
import { VERSION_MARKER } from '@crewdoku/domain'

describe('app can import domain', () => {
  it('imports the domain barrel', () => {
    expect(VERSION_MARKER).toBe('crewdoku-domain')
  })
})
