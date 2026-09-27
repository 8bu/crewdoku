import type { AreaCatalog } from './types'

/**
 * The shared schedule filter bar and the Board | Calendar switch (`filters.*`,
 * `view.*`). Both pages carry the same controls, so the wording has to read
 * right over the board and over the calendar alike: no "hide rows"/"show
 * cells" verbs, just the noun each filter keeps.
 */
export const scheduleFilters = {
  en: {
    'view.label': 'Switch between board and calendar',
    'view.board': 'Board',
    'view.calendar': 'Calendar',

    'filters.title': 'Filters',
    'filters.button': 'Filters',
    'filters.buttonActive': 'Filters, {count} active',
    'filters.search': 'Search by name…',
    'filters.teams': 'Teams',
    'filters.shifts': 'Shifts',
    'filters.leave': 'Leave',
    'filters.clear': 'Clear filters',
    'filters.empty': 'Nothing to filter yet',
  },
  vi: {
    'view.label': 'Chuyển giữa bảng và lịch',
    'view.board': 'Bảng',
    'view.calendar': 'Lịch',

    'filters.title': 'Bộ lọc',
    'filters.button': 'Bộ lọc',
    'filters.buttonActive': 'Bộ lọc, {count} đang bật',
    'filters.search': 'Tìm theo tên…',
    'filters.teams': 'Phòng/ban',
    'filters.shifts': 'Ca làm việc',
    'filters.leave': 'Nghỉ phép',
    'filters.clear': 'Xoá bộ lọc',
    'filters.empty': 'Chưa có gì để lọc',
  },
  es: {
    'view.label': 'Cambiar entre el tablero y el calendario',
    'view.board': 'Tablero',
    'view.calendar': 'Calendario',

    'filters.title': 'Filtros',
    'filters.button': 'Filtros',
    'filters.buttonActive': 'Filtros, {count} activos',
    'filters.search': 'Buscar por nombre…',
    'filters.teams': 'Equipos',
    'filters.shifts': 'Turnos',
    'filters.leave': 'Ausencias',
    'filters.clear': 'Borrar filtros',
    'filters.empty': 'Todavía no hay nada que filtrar',
  },
  fr: {
    'view.label': 'Basculer entre le planning et le calendrier',
    'view.board': 'Planning',
    'view.calendar': 'Calendrier',

    'filters.title': 'Filtres',
    'filters.button': 'Filtres',
    'filters.buttonActive': 'Filtres, {count} actifs',
    'filters.search': 'Rechercher par nom…',
    'filters.teams': 'Équipes',
    'filters.shifts': 'Services',
    'filters.leave': 'Absences',
    'filters.clear': 'Effacer les filtres',
    'filters.empty': 'Rien à filtrer pour le moment',
  },
  ja: {
    'view.label': 'ボードとカレンダーを切り替える',
    'view.board': 'ボード',
    'view.calendar': 'カレンダー',

    'filters.title': '絞り込み',
    'filters.button': '絞り込み',
    'filters.buttonActive': '絞り込み、{count}件適用中',
    'filters.search': '名前で検索…',
    'filters.teams': 'チーム',
    'filters.shifts': 'シフト',
    'filters.leave': '休暇',
    'filters.clear': '絞り込みを解除',
    'filters.empty': 'まだ絞り込める項目がありません',
  },
  de: {
    'view.label': 'Zwischen Dienstplan und Kalender wechseln',
    'view.board': 'Dienstplan',
    'view.calendar': 'Kalender',

    'filters.title': 'Filter',
    'filters.button': 'Filter',
    'filters.buttonActive': 'Filter, {count} aktiv',
    'filters.search': 'Nach Namen suchen…',
    'filters.teams': 'Teams',
    'filters.shifts': 'Schichten',
    'filters.leave': 'Abwesenheit',
    'filters.clear': 'Filter zurücksetzen',
    'filters.empty': 'Noch nichts zu filtern',
  },
  pt: {
    'view.label': 'Alternar entre o quadro e o calendário',
    'view.board': 'Quadro',
    'view.calendar': 'Calendário',

    'filters.title': 'Filtros',
    'filters.button': 'Filtros',
    'filters.buttonActive': 'Filtros, {count} ativos',
    'filters.search': 'Buscar por nome…',
    'filters.teams': 'Equipes',
    'filters.shifts': 'Turnos',
    'filters.leave': 'Ausências',
    'filters.clear': 'Limpar filtros',
    'filters.empty': 'Nada para filtrar ainda',
  },
} satisfies AreaCatalog
