/**
 * Name search for the person pickers. The roster runs to a thousand-plus, so a
 * plain option list is unusable and typing must find a person whose name the
 * user only half remembers — including without the diacritics ("nguyen" for
 * "Nguyễn") and in any case.
 *
 * Pure and stateless by design: no cached index, no module-level table. A
 * keystroke walks the roster once, which is nothing at this size, and the
 * result can never go stale against the live roster (a person renamed or
 * soft-removed re-ranks correctly on the next call).
 */

/**
 * Case-, accent- and whitespace-insensitive form. NFD splits a letter from its
 * combining marks so they can be dropped (`\p{M}`, the `u`-flag Unicode
 * property); `đ` is a letter in its own right and never decomposes, so it is
 * mapped by hand. Internal whitespace collapses to one space so a query and a
 * name with different spacing still line up.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Rank 0: the whole name starts with the query. 1: every query word starts a name word. 2: the name contains the query. */
type Rank = 0 | 1 | 2

/** `null` when the name doesn't match at all. `qWords` are the query's words, pre-split once per call. */
function rankOf(name: string, query: string, queryWords: string[]): Rank | null {
  if (name.startsWith(query)) return 0
  const nameWords = name.split(' ')
  if (queryWords.every((qw) => nameWords.some((nw) => nw.startsWith(qw)))) return 1
  if (name.includes(query)) return 2
  return null
}

/**
 * Ranked person search. A blank query is not a search: the input order comes
 * back untouched, which is what an untyped picker panel shows.
 *
 * Otherwise only matches are returned, best first: a full-name prefix beats a
 * word prefix beats a mid-name hit. Ties stay in input order — `Array#sort` is
 * stable, and the rank is the only key. Multi-word queries need each word to
 * start some word of the name ("ng an" finds "Nguyễn Văn An").
 */
export function searchPeople<T extends { name: string }>(people: readonly T[], query: string): T[] {
  const normalizedQuery = normalizeForSearch(query)
  if (normalizedQuery === '') return [...people]

  const queryWords = normalizedQuery.split(' ')
  const hits: { person: T; rank: Rank }[] = []

  for (const person of people) {
    const name = normalizeForSearch(person.name)
    if (name === '') continue
    const rank = rankOf(name, normalizedQuery, queryWords)
    if (rank !== null) hits.push({ person, rank })
  }

  return hits.sort((a, b) => a.rank - b.rank).map((hit) => hit.person)
}
