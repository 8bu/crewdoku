import type { AreaCatalog } from './types'

/** Nav rail + device controls (locale, theme) — the chrome present on every surface. */
export const shell = {
  en: {
    'nav.aria': 'Surfaces',
    'nav.board': 'Board',
    'nav.coverage': 'Coverage',
    'nav.roster': 'Roster',
    'nav.teams': 'Teams',
    'nav.settings': 'Settings',
    'nav.export': 'Export',
    /* Titles the period manager's mobile sheet (its desktop surface is a
       trigger-anchored popover with no header of its own). */
    'period.title': 'Periods',
    'locale.aria': 'UI language',
    'theme.aria': 'Appearance',
    'theme.system': 'System',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
  },
  vi: {
    'nav.aria': 'Các màn hình',
    'nav.board': 'Bảng',
    'nav.coverage': 'Mức đáp ứng nhân sự',
    'nav.roster': 'Nhân sự',
    'nav.teams': 'Phòng/ban',
    'nav.settings': 'Cài đặt',
    'nav.export': 'Xuất dữ liệu',
    'period.title': 'Các kỳ',
    'locale.aria': 'Ngôn ngữ giao diện',
    'theme.aria': 'Giao diện',
    'theme.system': 'Theo hệ thống',
    'theme.light': 'Sáng',
    'theme.dark': 'Tối',
  },
} satisfies AreaCatalog
