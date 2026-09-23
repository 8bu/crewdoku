import { describe, expect, it } from 'vitest'
import { isLocaleId, localeForCountry, readGeoLocale } from './geo'

describe('localeForCountry', () => {
  it('maps Vietnam to Vietnamese', () => {
    expect(localeForCountry('VN')).toBe('vi')
  })

  it('maps the dominant Spanish-speaking countries to Spanish', () => {
    expect(localeForCountry('MX')).toBe('es')
    expect(localeForCountry('ES')).toBe('es')
    expect(localeForCountry('AR')).toBe('es')
  })

  it('maps the dominant German-speaking and Portuguese-speaking countries', () => {
    expect(localeForCountry('AT')).toBe('de')
    expect(localeForCountry('DE')).toBe('de')
    expect(localeForCountry('BR')).toBe('pt')
    expect(localeForCountry('PT')).toBe('pt')
  })

  it('maps Japan and France', () => {
    expect(localeForCountry('JP')).toBe('ja')
    expect(localeForCountry('FR')).toBe('fr')
  })

  it('leaves multilingual countries to the browser language', () => {
    expect(localeForCountry('CH')).toBeNull()
    expect(localeForCountry('BE')).toBeNull()
    expect(localeForCountry('CA')).toBeNull()
  })

  it('upper-cases the country code before lookup', () => {
    expect(localeForCountry('vn')).toBe('vi')
  })

  it('returns null for a region with no dedicated locale', () => {
    expect(localeForCountry('US')).toBeNull()
  })

  it('returns null for absent and empty input', () => {
    expect(localeForCountry(null)).toBeNull()
    expect(localeForCountry(undefined)).toBeNull()
    expect(localeForCountry('')).toBeNull()
  })
})

describe('isLocaleId', () => {
  it('accepts every supported locale', () => {
    for (const locale of ['en', 'vi', 'es', 'fr', 'ja', 'de', 'pt']) {
      expect(isLocaleId(locale)).toBe(true)
    }
  })

  it('rejects unknown, mis-cased and absent values', () => {
    expect(isLocaleId('zz')).toBe(false)
    expect(isLocaleId('EN')).toBe(false)
    expect(isLocaleId('')).toBe(false)
    expect(isLocaleId(null)).toBe(false)
    expect(isLocaleId(undefined)).toBe(false)
  })

  it('rejects inherited object keys', () => {
    expect(isLocaleId('toString')).toBe(false)
    expect(isLocaleId('constructor')).toBe(false)
  })
})

describe('readGeoLocale', () => {
  it('reads the geo cookie', () => {
    expect(readGeoLocale('crewdoku-geo=vi')).toBe('vi')
  })

  it('finds the geo cookie among unrelated pairs', () => {
    expect(readGeoLocale('foo=1; crewdoku-geo=vi; bar=2')).toBe('vi')
  })

  it('tolerates missing spaces and surrounding whitespace', () => {
    expect(readGeoLocale('foo=1;crewdoku-geo=vi')).toBe('vi')
    expect(readGeoLocale(' crewdoku-geo = vi ')).toBe('vi')
  })

  it('rejects a value that is not a supported locale', () => {
    expect(readGeoLocale('crewdoku-geo=zz')).toBeNull()
  })

  it('returns null when the cookie is absent', () => {
    expect(readGeoLocale('foo=1; bar=2')).toBeNull()
  })

  it('returns null for absent and empty headers', () => {
    expect(readGeoLocale(null)).toBeNull()
    expect(readGeoLocale(undefined)).toBeNull()
    expect(readGeoLocale('')).toBeNull()
  })
})
