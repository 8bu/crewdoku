import { describe, expect, it } from 'vitest'
import { MESSAGES } from './index'

/**
 * The completeness guard for "the whole app speaks both languages": every
 * English key must have a Vietnamese translation and vice-versa. A missing key
 * would silently render English (the useT fallback), so this test is what keeps
 * the VI catalog honest as areas are filled in.
 */
describe('i18n catalogs', () => {
  it('Vietnamese covers every English key', () => {
    const missing = Object.keys(MESSAGES.en).filter((key) => !(key in MESSAGES.vi))
    expect(missing).toEqual([])
  })

  it('English covers every Vietnamese key', () => {
    const orphan = Object.keys(MESSAGES.vi).filter((key) => !(key in MESSAGES.en))
    expect(orphan).toEqual([])
  })
})
