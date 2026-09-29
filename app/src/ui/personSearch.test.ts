import { describe, expect, it } from 'vitest'
import { searchPeople } from './personSearch'

/** Person-shaped input: `searchPeople` is generic over `{ name: string }`. */
type Named = { id: string; name: string }

const NGUYEN: Named = { id: 'p1', name: 'Nguyễn Văn An' }
const DANG: Named = { id: 'p2', name: 'Đặng Thị Mai' }
const ANNA: Named = { id: 'p3', name: 'Anna Lee' }
const BRIAN: Named = { id: 'p4', name: 'Brian Ko' }
const CARLOS: Named = { id: 'p5', name: 'Carlos Ruiz' }

describe('searchPeople', () => {
  it('finds an accented name from an unaccented query', () => {
    expect(searchPeople([NGUYEN, DANG], 'nguyen').map((p) => p.id)).toEqual(['p1'])
  })

  it('finds a name whose leading letter is đ', () => {
    expect(searchPeople([NGUYEN, DANG], 'dang').map((p) => p.id)).toEqual(['p2'])
  })

  it('is case-insensitive on both sides', () => {
    expect(searchPeople([NGUYEN, DANG], 'NGUYEN').map((p) => p.id)).toEqual(['p1'])
    expect(searchPeople([{ id: 'p6', name: 'MAI LAN' }], 'mai').map((p) => p.id)).toEqual(['p6'])
  })

  it('ranks a full-name prefix above a word prefix above a contained hit', () => {
    expect(searchPeople([CARLOS, BRIAN, NGUYEN, ANNA], 'an').map((p) => p.id)).toEqual(['p3', 'p1', 'p4'])
  })

  it('excludes names that do not match at all', () => {
    expect(searchPeople([NGUYEN, CARLOS], 'an').map((p) => p.id)).toEqual(['p1'])
  })

  it('matches a multi-word query word-by-word', () => {
    expect(searchPeople([NGUYEN, DANG, ANNA], 'ng an').map((p) => p.id)).toEqual(['p1'])
  })

  it('rejects a multi-word query with one non-matching word', () => {
    expect(searchPeople([NGUYEN, DANG, ANNA], 'ng zz')).toEqual([])
  })

  it('keeps input order among equal ranks', () => {
    const roster: Named[] = [
      { id: 'a', name: 'Trần An' },
      { id: 'b', name: 'Nguyễn Văn An' },
      { id: 'c', name: 'Lê An Bình' },
    ]
    expect(searchPeople(roster, 'an').map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns the input order — same elements — for a blank query', () => {
    const roster = [CARLOS, NGUYEN, ANNA]
    const result = searchPeople(roster, '   ')
    expect(result).toEqual(roster)
    expect(result[0]).toBe(CARLOS)
  })

  it('never matches an unnamed person by a real query', () => {
    expect(searchPeople([{ id: 'x', name: '   ' }, NGUYEN], 'an').map((p) => p.id)).toEqual(['p1'])
  })
})
