import { describe, it, expect } from 'vitest'
import { newId } from '../ids'

describe('newId', () => {
  it('returns unique non-empty strings', () => {
    const a = newId()
    const b = newId()
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })
})
