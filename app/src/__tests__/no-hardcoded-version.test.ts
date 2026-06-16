import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function walk(d: string, out: string[] = []): string[] {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(p)) out.push(p)
  }
  return out
}

describe('no hardcoded version', () => {
  it('app/src contains no "v4" string literal (AC-21)', () => {
    const self = __filename
    const off = walk(resolve(__dirname, '..'))
      // exclude this guard file itself — it necessarily contains the "v4" pattern
      .filter((p) => p !== self)
      .filter((p) => /['"]v4['"]/.test(readFileSync(p, 'utf8')))
    expect(off).toEqual([])
  })
})
