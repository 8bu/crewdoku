import type { LocaleId } from '../../state/locale'

/** One UI area's message catalog: the same keys in every supported locale. */
export type AreaCatalog = Record<LocaleId, Record<string, string>>
