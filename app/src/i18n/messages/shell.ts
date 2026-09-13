import type { AreaCatalog } from './types'

/** Nav rail + locale switcher — the chrome present on every surface. */
export const shell = {
  en: {
    'nav.aria': 'Surfaces',
    'nav.board': 'Board',
    'nav.coverage': 'Coverage',
    'nav.roster': 'Roster',
    'nav.teams': 'Teams',
    'nav.settings': 'Settings',
    'nav.export': 'Export',
    'locale.aria': 'UI language',
  },
  vi: {
    'nav.aria': 'Các màn hình',
    'nav.board': 'Bảng',
    'nav.coverage': 'Mức đáp ứng nhân sự',
    'nav.roster': 'Nhân sự',
    'nav.teams': 'Phòng/ban',
    'nav.settings': 'Cài đặt',
    'nav.export': 'Xuất dữ liệu',
    'locale.aria': 'Ngôn ngữ giao diện',
  },
} satisfies AreaCatalog
