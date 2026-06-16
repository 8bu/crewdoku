import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

describe('tokens verbatim', () => {
  it('app/tokens.css is byte-identical to the source tokens.css', () => {
    const src = readFileSync(resolve(__dirname, '../../../tokens.css'))
    const copy = readFileSync(resolve(__dirname, '../../tokens.css'))
    expect(createHash('sha256').update(copy).digest('hex')).toBe(
      createHash('sha256').update(src).digest('hex'),
    )
  })
  it('still defines the --sh-* shift color tokens and .sf-* status classes', () => {
    // NOTE: the real tokens.css exposes shift colors as `--sh-{N|E|M|A|L}-*`
    // custom properties and status encoding as `.sf-pending/.sf-proposed/.sf-viol`
    // CSS classes. There are no `--sf-*` custom properties (the design vars are
    // `--surface`, `--st-*`, etc.). We assert the contract that actually exists.
    const copy = readFileSync(resolve(__dirname, '../../tokens.css'), 'utf8')
    expect(copy).toMatch(/--sh-N-bg/)
    expect(copy).toMatch(/\.sf-viol/)
    expect(copy).toMatch(/\.sf-proposed/)
    expect(copy).toMatch(/\.sf-pending/)
  })
})
