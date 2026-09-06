import type { LocaleId } from '../../state/locale'
import type { AreaCatalog } from './types'
import { shell } from './shell'
import { chrome } from './chrome'
import { board } from './board'
import { boardPanels } from './boardPanels'
import { settings } from './settings'
import { onbex } from './onbex'
import { rtc } from './rtc'

/**
 * The app's message catalogs, composed from per-area modules. Keys are
 * namespaced by area (`nav.board`, `board.generate.solving`, …) so the areas
 * can be authored independently and never collide when merged. Each area
 * module carries the same keys in both locales (guarded by `catalog.test.ts`).
 */
const AREAS: AreaCatalog[] = [shell, chrome, board, boardPanels, settings, onbex, rtc]

function compose(locale: LocaleId): Record<string, string> {
  return Object.assign({}, ...AREAS.map((area) => area[locale]))
}

export const MESSAGES: Record<LocaleId, Record<string, string>> = {
  en: compose('en'),
  vi: compose('vi'),
}
