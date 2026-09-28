import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCALE_IDS } from '../i18n/localeIds'
import { RELEASE_NOTES } from './releaseNotes'
import {
  compareVersions,
  hasUnseenReleases,
  readSeenVersion,
  resolveSeenVersion,
  visibleReleases,
  writeSeenVersion,
} from './whatsNew'

/**
 * This jsdom setup exposes no `localStorage` (Node's experimental global shadows
 * jsdom's and stays unavailable), so a Map-backed stub serves the production
 * guard — the same stand-in `state/locale.test.ts` uses.
 */
function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  })
}

beforeEach(stubLocalStorage)
afterEach(() => vi.unstubAllGlobals())

/** Stand-in versions, so the rules are read without pinning shipped notes. */
const sample: readonly { version: string }[] = [{ version: '0.3.0' }, { version: '0.2.0' }]

describe('compareVersions', () => {
  it('orders by number, not by text', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0)
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('treats a missing segment as zero', () => {
    expect(compareVersions('0.2', '0.2.0')).toBe(0)
    expect(compareVersions('0.2', '0.2.1')).toBeLessThan(0)
  })
})

describe('the bundled release notes', () => {
  it('lists unique versions, newest first', () => {
    const versions = RELEASE_NOTES.map((notes) => notes.version)
    expect(versions.filter((version, index) => versions.indexOf(version) !== index)).toEqual([])
    for (const [index, version] of versions.entries()) {
      const previous = versions[index - 1]
      if (previous === undefined) continue
      expect(compareVersions(previous, version)).toBeGreaterThan(0)
    }
  })

  it('holds a folder for the running version', () => {
    expect(RELEASE_NOTES.map((notes) => notes.version)).toContain(__APP_VERSION__)
  })

  it('writes every version in every locale', () => {
    for (const notes of RELEASE_NOTES) {
      expect(Object.keys(notes.markdown).sort()).toEqual([...LOCALE_IDS].sort())
      for (const locale of LOCALE_IDS) {
        expect(notes.markdown[locale]?.trim()).not.toBe('')
      }
    }
  })

  it('keeps each file to a short bullet list with no version heading', () => {
    for (const notes of RELEASE_NOTES) {
      for (const locale of LOCALE_IDS) {
        const lines = (notes.markdown[locale] ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
        const where = `v${notes.version}/${locale}.md`
        expect(lines.length, where).toBeGreaterThanOrEqual(1)
        expect(lines.length, where).toBeLessThanOrEqual(5)
        // The panel renders `v<version>` itself, so a heading here would double it.
        expect(lines.filter((line) => !line.startsWith('- ')), where).toEqual([])
      }
    }
  })
})

describe('visibleReleases', () => {
  it('hides what the running build has not released yet', () => {
    expect(visibleReleases(sample, '0.2.0').map((release) => release.version)).toEqual(['0.2.0'])
    expect(visibleReleases(sample, '0.3.0').map((release) => release.version)).toEqual(['0.3.0', '0.2.0'])
  })

  it('keeps an unreleased build empty', () => {
    expect(visibleReleases(sample, '0.0.0')).toEqual([])
  })
})

describe('the seen version', () => {
  it('starts as the running version on a device that has never looked, with no dot', () => {
    expect(readSeenVersion()).toBeNull()

    const seen = resolveSeenVersion('0.2.0')

    expect(readSeenVersion()).toBe('0.2.0')
    expect(hasUnseenReleases(seen, '0.2.0', sample)).toBe(false)
  })

  it('dots the label while a visible version is newer than the stored one', () => {
    writeSeenVersion('0.2.0')

    expect(hasUnseenReleases(readSeenVersion() ?? '', '0.3.0', sample)).toBe(true)
  })

  it('stays quiet for a version the build cannot show yet', () => {
    expect(hasUnseenReleases('0.2.0', '0.2.0', sample)).toBe(false)
  })

  it('stays quiet after a rollback, when the stored version is ahead', () => {
    expect(hasUnseenReleases('0.9.0', '0.3.0', sample)).toBe(false)
  })

  it('clears once the running version is stored — what opening the panel does', () => {
    writeSeenVersion('0.2.0')
    expect(hasUnseenReleases(readSeenVersion() ?? '', '0.3.0', sample)).toBe(true)

    writeSeenVersion('0.3.0')

    expect(hasUnseenReleases(readSeenVersion() ?? '', '0.3.0', sample)).toBe(false)
  })

  it('survives a store that throws, without inventing a dot', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })

    expect(readSeenVersion()).toBeNull()
    expect(() => writeSeenVersion('0.2.0')).not.toThrow()
    expect(resolveSeenVersion('0.2.0')).toBe('0.2.0')
  })
})
