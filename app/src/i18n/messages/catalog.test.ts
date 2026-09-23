import { describe, expect, it } from 'vitest'
import { LOCALES } from '../../state/locale'
import { MESSAGES } from './index'

/**
 * The completeness guard for "the whole app speaks every supported language":
 * each non-English catalog must cover exactly the English key set, leave no
 * value empty, and preserve every `{token}` placeholder. A missing key would
 * silently render English (the `useT` fallback), and a dropped placeholder would
 * render a half-built sentence, so this test is what keeps the catalogs honest
 * as areas are filled in. Runs per locale so a failure names the language.
 */
const OTHER_LOCALES = LOCALES.filter((l) => l.value !== 'en')

/** `{name}`-style placeholders in a message, sorted so order never matters. */
function tokensOf(value: string): string[] {
  return (value.match(/\{\w+\}/g) ?? []).sort()
}

describe.each(OTHER_LOCALES)('$label ($value) catalog', ({ value }) => {
  const messages = MESSAGES[value]

  it('covers every English key', () => {
    const missing = Object.keys(MESSAGES.en).filter((key) => !(key in messages))
    expect(missing).toEqual([])
  })

  it('has no key English does not', () => {
    const orphan = Object.keys(messages).filter((key) => !(key in MESSAGES.en))
    expect(orphan).toEqual([])
  })

  it('leaves no value empty that English fills', () => {
    const empty = Object.keys(messages).filter(
      (key) => messages[key]?.trim() === '' && MESSAGES.en[key]?.trim() !== '',
    )
    expect(empty).toEqual([])
  })

  it('keeps every English placeholder token', () => {
    const mismatched = Object.keys(MESSAGES.en)
      .filter((key) => key in messages)
      .filter((key) => tokensOf(MESSAGES.en[key] ?? '').join() !== tokensOf(messages[key] ?? '').join())
    expect(mismatched).toEqual([])
  })
})
