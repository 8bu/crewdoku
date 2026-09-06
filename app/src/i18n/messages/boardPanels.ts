import type { AreaCatalog } from './types'

/** Generate controls, infeasible panel, proposal panel, coverage panel. */
export const boardPanels = {
  en: {
    // GenerateControls
    'panels.generate.solving': 'Generating schedule… {elapsed} — the board stays editable while this runs.',
    'panels.generate.cancel': 'Cancel',
    'panels.generate.noSchedule': 'This period has no schedule yet — Generate to fill it in.',
    'panels.generate.import': 'Import schedule…',
    'panels.generate.regenerateAria': 'Regenerate schedule',
    'panels.generate.generateAria': 'Generate schedule',
    'panels.generate.regenerate': 'Regenerate',
    'panels.generate.generate': 'Generate',

    // InfeasiblePanel
    'panels.infeasible.aria': 'Solve came back infeasible',
    'panels.infeasible.title': "Can't solve this yet",
    'panels.infeasible.subtitle': 'Nothing on the board changed.',
    'panels.infeasible.dismiss': 'Dismiss',
    'panels.infeasible.relaxationsPrompt': 'Try one of these, then solve again:',

    // ProposalPanel
    'panels.proposal.aria': 'Proposal changes',
    'panels.proposal.title': 'Proposal ready',
    'panels.proposal.summary_1_1': '{n} change across {m} person',
    'panels.proposal.summary_1_m': '{n} change across {m} people',
    'panels.proposal.summary_n_1': '{n} changes across {m} person',
    'panels.proposal.summary_n_m': '{n} changes across {m} people',
    'panels.proposal.discard': 'Discard',
    'panels.proposal.apply': 'Apply',
    'panels.proposal.identical': "The solve came back identical to what's on the board.",
    'panels.proposal.hoursDelta': '{n}h',
    'panels.proposal.nightsDelta_one': '{n} night',
    'panels.proposal.nightsDelta_other': '{n} nights',
    'panels.proposal.weekendsDelta_one': '{n} weekend',
    'panels.proposal.weekendsDelta_other': '{n} weekends',
    'panels.proposal.periodTotal': 'Period total: {before}h most-loaded now → {after}h if applied.',

    // CoveragePanel
    'panels.coverage.noneEligible': 'No one eligible and free that day.',
    'panels.coverage.eligibleFree_one': '{n} eligible and free — lit on the board.',
    'panels.coverage.eligibleFree_other': '{n} eligible and free — lit on the board.',

    // InfeasiblePanel — conflict core (engine emits kind+params)
    'panels.conflict.starvation.dow': '{shift} on {dow} needs at least {min}, but only {avail} can work it.',
    'panels.conflict.starvation.date': '{shift} on {date} needs at least {min}, but only {avail} can work it.',
    'panels.conflict.dayOvercommit': 'Total shift requirements on {date} ({dow}) need {req}, but only {avail} are available.',
    'panels.conflict.weeklyHours': 'Week {week} demands {demanded} hours of coverage, but {people} at {maxHours} hours per week can only supply {supply} hours.',
    'panels.conflict.restLock': '{shiftA} on {dateA} followed by {shiftB} on {dateB} gives only {gap} hours of rest, but minimum rest is {minRest} hours.',
    'panels.conflict.fallback': 'The rules conflict in a way the analyzer cannot name.',

    // InfeasiblePanel — relaxation buttons
    'panels.relax.starvation.dow': 'Lower {shift} minimum on {dow} to {to}',
    'panels.relax.starvation.date': 'Lower {shift} minimum on {date} to {to}',
    'panels.relax.dayOvercommit': 'Lower {shift} minimum on {date} to {to}',
    'panels.relax.weeklyHours': 'Raise weekly hours cap to {to} hours',
    'panels.relax.restLock': 'Lower minimum rest to {to} hours',
    'panels.relax.fallbackH1': 'Lower all coverage minimums by 1',
    'panels.relax.fallbackH2': 'Raise weekly hours cap to {to} hours',
    'panels.relax.fallbackH3': 'Lower minimum rest to {to} hours',

    // Weekday names for conflict sentences
    'panels.weekday.0': 'Sunday',
    'panels.weekday.1': 'Monday',
    'panels.weekday.2': 'Tuesday',
    'panels.weekday.3': 'Wednesday',
    'panels.weekday.4': 'Thursday',
    'panels.weekday.5': 'Friday',
    'panels.weekday.6': 'Saturday',
    'panels.weekdayPlural.0': 'Sundays',
    'panels.weekdayPlural.1': 'Mondays',
    'panels.weekdayPlural.2': 'Tuesdays',
    'panels.weekdayPlural.3': 'Wednesdays',
    'panels.weekdayPlural.4': 'Thursdays',
    'panels.weekdayPlural.5': 'Fridays',
    'panels.weekdayPlural.6': 'Saturdays',
    'panels.noun.person_one': '{n} person',
    'panels.noun.person_other': '{n} people',
  },
  vi: {
    // GenerateControls
    'panels.generate.solving': 'Đang tạo lịch… {elapsed} — bảng vẫn có thể chỉnh sửa trong lúc chạy.',
    'panels.generate.cancel': 'Hủy',
    'panels.generate.noSchedule': 'Kỳ này chưa có lịch — Tạo lịch để điền vào.',
    'panels.generate.import': 'Nhập lịch…',
    'panels.generate.regenerateAria': 'Tạo lại lịch',
    'panels.generate.generateAria': 'Tạo lịch',
    'panels.generate.regenerate': 'Tạo lại',
    'panels.generate.generate': 'Tạo lịch',

    // InfeasiblePanel
    'panels.infeasible.aria': 'Không tìm được lịch khả thi',
    'panels.infeasible.title': 'Chưa thể tìm ra lịch',
    'panels.infeasible.subtitle': 'Không có gì trên bảng bị thay đổi.',
    'panels.infeasible.dismiss': 'Bỏ qua',
    'panels.infeasible.relaxationsPrompt': 'Thử một trong các phương án sau, rồi giải lại:',

    // ProposalPanel
    'panels.proposal.aria': 'Các thay đổi đề xuất',
    'panels.proposal.title': 'Đề xuất đã sẵn sàng',
    'panels.proposal.summary_1_1': '{n} thay đổi trên {m} người',
    'panels.proposal.summary_1_m': '{n} thay đổi trên {m} người',
    'panels.proposal.summary_n_1': '{n} thay đổi trên {m} người',
    'panels.proposal.summary_n_m': '{n} thay đổi trên {m} người',
    'panels.proposal.discard': 'Loại bỏ',
    'panels.proposal.apply': 'Áp dụng',
    'panels.proposal.identical': 'Kết quả giải giống hệt lịch hiện tại trên bảng.',
    'panels.proposal.hoursDelta': '{n}h',
    'panels.proposal.nightsDelta_one': '{n} đêm',
    'panels.proposal.nightsDelta_other': '{n} đêm',
    'panels.proposal.weekendsDelta_one': '{n} cuối tuần',
    'panels.proposal.weekendsDelta_other': '{n} cuối tuần',
    'panels.proposal.periodTotal': 'Tổng kỳ: {before}h tải cao nhất hiện tại → {after}h nếu áp dụng.',

    // CoveragePanel
    'panels.coverage.noneEligible': 'Không có ai đủ điều kiện và rảnh vào ngày đó.',
    'panels.coverage.eligibleFree_one': '{n} người đủ điều kiện và rảnh — đang sáng trên bảng.',
    'panels.coverage.eligibleFree_other': '{n} người đủ điều kiện và rảnh — đang sáng trên bảng.',

    // InfeasiblePanel — conflict core
    'panels.conflict.starvation.dow': '{shift} vào {dow} cần ít nhất {min}, nhưng chỉ {avail} có thể làm.',
    'panels.conflict.starvation.date': '{shift} vào ngày {date} cần ít nhất {min}, nhưng chỉ {avail} có thể làm.',
    'panels.conflict.dayOvercommit': 'Tổng nhu cầu ca vào ngày {date} ({dow}) cần {req}, nhưng chỉ có {avail}.',
    'panels.conflict.weeklyHours': 'Tuần {week} cần {demanded} giờ phủ ca, nhưng {people} với {maxHours} giờ mỗi tuần chỉ cung cấp được {supply} giờ.',
    'panels.conflict.restLock': '{shiftA} ngày {dateA} rồi {shiftB} ngày {dateB} chỉ cho {gap} giờ nghỉ, nhưng nghỉ tối thiểu là {minRest} giờ.',
    'panels.conflict.fallback': 'Các quy tắc xung đột theo cách trình phân tích không thể nêu tên.',

    // InfeasiblePanel — relaxation buttons
    'panels.relax.starvation.dow': 'Giảm mức {shift} tối thiểu vào {dow} xuống {to}',
    'panels.relax.starvation.date': 'Giảm mức {shift} tối thiểu vào ngày {date} xuống {to}',
    'panels.relax.dayOvercommit': 'Giảm mức {shift} tối thiểu vào ngày {date} xuống {to}',
    'panels.relax.weeklyHours': 'Nâng giới hạn giờ mỗi tuần lên {to} giờ',
    'panels.relax.restLock': 'Giảm nghỉ tối thiểu xuống {to} giờ',
    'panels.relax.fallbackH1': 'Giảm tất cả mức phủ ca tối thiểu đi 1',
    'panels.relax.fallbackH2': 'Nâng giới hạn giờ mỗi tuần lên {to} giờ',
    'panels.relax.fallbackH3': 'Giảm nghỉ tối thiểu xuống {to} giờ',

    // Weekday names
    'panels.weekday.0': 'Chủ Nhật',
    'panels.weekday.1': 'thứ Hai',
    'panels.weekday.2': 'thứ Ba',
    'panels.weekday.3': 'thứ Tư',
    'panels.weekday.4': 'thứ Năm',
    'panels.weekday.5': 'thứ Sáu',
    'panels.weekday.6': 'thứ Bảy',
    'panels.weekdayPlural.0': 'Chủ Nhật',
    'panels.weekdayPlural.1': 'thứ Hai',
    'panels.weekdayPlural.2': 'thứ Ba',
    'panels.weekdayPlural.3': 'thứ Tư',
    'panels.weekdayPlural.4': 'thứ Năm',
    'panels.weekdayPlural.5': 'thứ Sáu',
    'panels.weekdayPlural.6': 'thứ Bảy',
    'panels.noun.person_one': '{n} người',
    'panels.noun.person_other': '{n} người',
  },
} satisfies AreaCatalog
