import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) {
      if (f !== '__tests__') walk(p, out)
    } else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) {
      out.push(p)
    }
  }
  return out
}

const FORBIDDEN =
  /\b(from\s+['"]react|react-dom|highs)|(\bdocument\b|\bwindow\b|\bWorker\b|indexedDB|navigator)/

describe('domain purity', () => {
  it('no react/dom/wasm/worker/indexeddb refs in domain src', () => {
    const root = resolve(__dirname, '..')
    const offenders = walk(root).filter((p) => FORBIDDEN.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
  it('no baseAssign hash baseline exists', () => {
    const root = resolve(__dirname, '..')
    const offenders = walk(root).filter((p) => /baseAssign/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
})
