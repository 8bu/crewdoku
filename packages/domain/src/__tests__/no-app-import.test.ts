import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function walk(d: string, out: string[] = []): string[] {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) {
      if (f !== '__tests__') walk(p, out)
    } else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('dependency direction (AC-3)', () => {
  it('domain imports nothing from @crewdoku/app or ../app', () => {
    const off = walk(resolve(__dirname, '..')).filter((p) =>
      /@crewdoku\/app|\.\.\/app/.test(readFileSync(p, 'utf8')),
    )
    expect(off).toEqual([])
  })
})
