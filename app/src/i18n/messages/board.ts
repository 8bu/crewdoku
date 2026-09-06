import type { AreaCatalog } from './types'

/** The board grid and its cell/person/header surfaces. */
export const board = {
  en: {
    // Board grid chrome & banners
    'board.banner.settingsDirty': 'Rules changed since the last Generate — this schedule may be out of date.',
    'board.editor.aria': 'Board cell editor',
    'board.corner.name': 'NAME',
    'board.name.aria': "Open {name}'s details",
    'board.name.ariaRemoved': "Open {name}'s details (removed)",
    'board.name.removedBadge': 'Removed',
    'board.fairness.tooltip': 'Violations with no cell on the board',
    'board.proposal.was': 'was: {shift}',

    // Import modal on empty board
    'board.import.title': 'Import a schedule',
    'board.import.description':
      'Paste or upload a CSV of an actual schedule — people, teams, and the assignments it lists are all created at once.',

    // Date header
    'board.header.week': 'WK {week}',
    'board.header.coverageAria': 'Coverage for {date}: {coverage}',
    'board.header.weekday.sun': 'SUN',
    'board.header.weekday.mon': 'MON',
    'board.header.weekday.tue': 'TUE',
    'board.header.weekday.wed': 'WED',
    'board.header.weekday.thu': 'THU',
    'board.header.weekday.fri': 'FRI',
    'board.header.weekday.sat': 'SAT',

    // Day cell
    'board.cell.pinnedTitle': 'Pinned — press U to release',

    // Cell context menu
    'board.menu.dayOff': 'Day off',
    'board.menu.releasePin': 'Release pin',

    // Problem list / Diagnostics toggle
    'board.problems.none': 'No problems',
    'board.problems.count_one': '{count} problem',
    'board.problems.count_other': '{count} problems',
    'board.problems.coverageAndFairness': 'Coverage & fairness',
    'board.problems.aria': 'Rule breaks',
    'board.problems.empty': 'Nothing broken right now.',

    // Person panel
    'board.person.dialogAria': '{name} details',
    'board.person.removedBadge': 'Removed',
    'board.person.closeAria': 'Close',
    'board.person.sectionPeriod': 'This period',
    'board.person.hours': 'Hours',
    'board.person.mostLoaded': ' · most-loaded',
    'board.person.nights': 'Nights',
    'board.person.weekends': 'Weekends',
    'board.person.sectionEligible': 'Eligible shifts',
    'board.person.eligibleHint': 'Click to toggle. Dimmed = not eligible for that shift.',
    'board.person.sectionPreferences': 'Preferences',
    'board.person.inheritTeam': 'Inherit from team',
    'board.person.teamDefault': 'Team default: {pref}',
    'board.person.wants': 'Wants',
    'board.person.avoids': 'Avoids',
    'board.person.prefWants': 'wants {shifts}',
    'board.person.prefAvoids': 'avoids {shifts}',
    'board.person.prefNone': 'no preference set',
    'board.person.sectionRecurring': 'Recurring unavailability',
    'board.person.recurringHint': 'Every week, regardless of rotation.',
    'board.person.sectionTimeOff': 'Time off',
    'board.person.timeOffNone': 'None booked this period.',
    'board.person.removeTimeOffAria': 'Remove time off on {date}',
    'board.person.addTimeOffAria': 'Add a day off',
    'board.person.addTimeOffButton': 'Add',
    'board.person.weekday.sun': 'Sun',
    'board.person.weekday.mon': 'Mon',
    'board.person.weekday.tue': 'Tue',
    'board.person.weekday.wed': 'Wed',
    'board.person.weekday.thu': 'Thu',
    'board.person.weekday.fri': 'Fri',
    'board.person.weekday.sat': 'Sat',
  },
  vi: {
    // Board grid chrome & banners
    'board.banner.settingsDirty': 'Quy tắc đã thay đổi kể từ lần Tạo gần nhất — lịch này có thể đã cũ.',
    'board.editor.aria': 'Bộ chỉnh sửa ô trên bảng',
    'board.corner.name': 'TÊN',
    'board.name.aria': 'Mở chi tiết của {name}',
    'board.name.ariaRemoved': 'Mở chi tiết của {name} (đã xóa)',
    'board.name.removedBadge': 'Đã xóa',
    'board.fairness.tooltip': 'Vi phạm không gắn với ô nào trên bảng',
    'board.proposal.was': 'trước đây: {shift}',

    // Import modal on empty board
    'board.import.title': 'Nhập lịch',
    'board.import.description':
      'Dán hoặc tải lên tệp CSV lịch thực tế — nhân sự, nhóm và các phân công sẽ được tạo cùng lúc.',

    // Date header
    'board.header.week': 'Tuần {week}',
    'board.header.coverageAria': 'Độ phủ cho {date}: {coverage}',
    'board.header.weekday.sun': 'CN',
    'board.header.weekday.mon': 'T2',
    'board.header.weekday.tue': 'T3',
    'board.header.weekday.wed': 'T4',
    'board.header.weekday.thu': 'T5',
    'board.header.weekday.fri': 'T6',
    'board.header.weekday.sat': 'T7',

    // Day cell
    'board.cell.pinnedTitle': 'Đã ghim — nhấn U để bỏ ghim',

    // Cell context menu
    'board.menu.dayOff': 'Ngày nghỉ',
    'board.menu.releasePin': 'Bỏ ghim',

    // Problem list / Diagnostics toggle
    'board.problems.none': 'Không có vấn đề',
    'board.problems.count_one': '{count} vấn đề',
    'board.problems.count_other': '{count} vấn đề',
    'board.problems.coverageAndFairness': 'Độ phủ & công bằng',
    'board.problems.aria': 'Vi phạm quy tắc',
    'board.problems.empty': 'Hiện không có vi phạm nào.',

    // Person panel
    'board.person.dialogAria': 'Chi tiết {name}',
    'board.person.removedBadge': 'Đã xóa',
    'board.person.closeAria': 'Đóng',
    'board.person.sectionPeriod': 'Kỳ này',
    'board.person.hours': 'Giờ',
    'board.person.mostLoaded': ' · tải cao nhất',
    'board.person.nights': 'Đêm',
    'board.person.weekends': 'Cuối tuần',
    'board.person.sectionEligible': 'Ca có thể làm',
    'board.person.eligibleHint': 'Nhấp để bật/tắt. Mờ = không thể làm ca đó.',
    'board.person.sectionPreferences': 'Nguyện vọng',
    'board.person.inheritTeam': 'Kế thừa từ nhóm',
    'board.person.teamDefault': 'Mặc định của nhóm: {pref}',
    'board.person.wants': 'Muốn',
    'board.person.avoids': 'Tránh',
    'board.person.prefWants': 'muốn {shifts}',
    'board.person.prefAvoids': 'tránh {shifts}',
    'board.person.prefNone': 'chưa đặt nguyện vọng',
    'board.person.sectionRecurring': 'Bận định kỳ',
    'board.person.recurringHint': 'Mỗi tuần, không phụ thuộc vào ca xoay vòng.',
    'board.person.sectionTimeOff': 'Nghỉ phép',
    'board.person.timeOffNone': 'Không có ngày nghỉ nào trong kỳ này.',
    'board.person.removeTimeOffAria': 'Xóa ngày nghỉ vào {date}',
    'board.person.addTimeOffAria': 'Thêm ngày nghỉ',
    'board.person.addTimeOffButton': 'Thêm',
    'board.person.weekday.sun': 'CN',
    'board.person.weekday.mon': 'T2',
    'board.person.weekday.tue': 'T3',
    'board.person.weekday.wed': 'T4',
    'board.person.weekday.thu': 'T5',
    'board.person.weekday.fri': 'T6',
    'board.person.weekday.sat': 'T7',
  },
} satisfies AreaCatalog
