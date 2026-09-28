import type { AreaCatalog } from './types'

/**
 * The version label and the "What's new" panel — the two strings the panel's
 * own chrome needs. The notes themselves are not messages: they live in
 * `app/src/whatsNew/releases/<version>/<locale>.md`, one markdown file per
 * released version and locale, because they are written once per release
 * rather than per screen.
 *
 * `whatsNew.dot` is the dot's accessible name rather than a sentence around it:
 * the label reads as "v0.2.0 · <that>", so each locale can phrase the state in
 * its own word order.
 */
export const whatsNew: AreaCatalog = {
  en: {
    'whatsNew.title': "What's new",
    'whatsNew.dot': 'New version available',
    'whatsNew.empty': 'No released version yet.',
  },
  vi: {
    'whatsNew.title': 'Có gì mới',
    'whatsNew.dot': 'Có bản cập nhật mới',
    'whatsNew.empty': 'Chưa có phiên bản nào được phát hành.',
  },
  es: {
    'whatsNew.title': 'Novedades',
    'whatsNew.dot': 'Hay una versión nueva',
    'whatsNew.empty': 'Todavía no hay ninguna versión publicada.',
  },
  fr: {
    'whatsNew.title': 'Nouveautés',
    'whatsNew.dot': 'Nouvelle version disponible',
    'whatsNew.empty': 'Aucune version publiée pour le moment.',
  },
  ja: {
    'whatsNew.title': '新着情報',
    'whatsNew.dot': '新しいバージョンがあります',
    'whatsNew.empty': 'リリース済みのバージョンはまだありません。',
  },
  de: {
    'whatsNew.title': 'Neuigkeiten',
    'whatsNew.dot': 'Neue Version verfügbar',
    'whatsNew.empty': 'Noch keine veröffentlichte Version.',
  },
  pt: {
    'whatsNew.title': 'Novidades',
    'whatsNew.dot': 'Nova versão disponível',
    'whatsNew.empty': 'Ainda não há versões lançadas.',
  },
}
