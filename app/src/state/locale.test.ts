import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCALE_STORAGE_KEY, initialLocale } from './locale'

/**
 * `initialLocale()` runs once at module load to seed `localeAtom`, so the
 * precedence chain is exercised by calling it directly between cases:
 * saved choice -> geo cookie (stamped by the edge Worker) -> browser language
 * -> 'en'.
 *
 * This jsdom setup exposes no `localStorage` (Node's experimental global
 * shadows jsdom's and stays unavailable), so a Map-backed stub stands in for
 * the browser store the production guard reads. jsdom's
 * `Navigator.prototype.language` is a configurable accessor, so an own property
 * on the instance shadows it for the duration of a test; removing that property
 * restores the default `en-US`.
 */
function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  })
}

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, 'language', { value: language, configurable: true })
}

function clearCookies() {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

describe('initialLocale precedence', () => {
  beforeEach(() => {
    stubLocalStorage()
    clearCookies()
    Reflect.deleteProperty(navigator, 'language')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefers a saved explicit choice over the geo cookie', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en')
    document.cookie = 'crewdoku-geo=vi'

    expect(initialLocale()).toBe('en')
  })

  it('prefers a saved explicit choice over the browser language', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'vi')

    expect(initialLocale()).toBe('vi')
  })

  it('uses the geo cookie when nothing is saved', () => {
    document.cookie = 'crewdoku-geo=vi'

    expect(initialLocale()).toBe('vi')
  })

  it('falls back to the browser language when no cookie was set', () => {
    setNavigatorLanguage('vi-VN')

    expect(initialLocale()).toBe('vi')
  })

  it('defaults to English when nothing is known', () => {
    expect(initialLocale()).toBe('en')
  })
})
