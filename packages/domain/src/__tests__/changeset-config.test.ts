import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('changesets configured', () => {
  it('config.json exists and is valid JSON', () => {
    const p = resolve(__dirname, '../../../../.changeset/config.json')
    expect(existsSync(p)).toBe(true)
    expect(() => JSON.parse(readFileSync(p, 'utf8'))).not.toThrow()
  })
})
