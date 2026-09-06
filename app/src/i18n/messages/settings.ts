import type { AreaCatalog } from './types'

/** Settings route and its shifts/coverage/advanced-rules editors. */
export const settings = {
  en: {
    // Title & meta
    'settings.title': 'Settings',
    'settings.meta.shift': '{count} shift',
    'settings.meta.shifts': '{count} shifts',
    'settings.meta.rulesOn': '{on}/{total} hard rules on',

    // Period section
    'settings.period.title': 'Period',
    'settings.period.desc': "This period's name and date range.",
    'settings.period.label': 'Label',
    'settings.period.start': 'Start',
    'settings.period.end': 'End',

    // Shifts section
    'settings.shifts.title': 'Shifts',
    'settings.shifts.desc':
      'Code, label, and times — fully editable. A code is a real key: renaming or deleting one updates every person, team, and coverage row that names it.',
    'settings.shifts.col.code': 'Code',
    'settings.shifts.col.label': 'Label',
    'settings.shifts.col.start': 'Start',
    'settings.shifts.col.end': 'End',
    'settings.shifts.col.night': 'Night',
    'settings.shifts.col.nightTitle': 'Counts toward the Nights fairness column',
    'settings.shifts.newCode': 'New code',
    'settings.shifts.newCodePlaceholder': 'e.g. SWING',
    'settings.shifts.newLabel': 'Label',
    'settings.shifts.newLabelPlaceholder': 'e.g. Swing',
    'settings.shifts.addShift': '+ Add shift',
    'settings.shifts.codeTaken': '"{code}" is already used.',
    'settings.shifts.colorTitle': '{code} colour',
    'settings.shifts.changeColor': "Change {code}'s colour",
    'settings.shifts.startTime': '{code} start time',
    'settings.shifts.endTime': '{code} end time',
    'settings.shifts.deleteShift': 'Delete {code}',
    'settings.shifts.cantDeleteLast': "Can't delete the last shift",

    // Color popover
    'settings.color.amber': 'Amber',
    'settings.color.orange': 'Orange',
    'settings.color.lime': 'Lime',
    'settings.color.teal': 'Teal',
    'settings.color.sky': 'Sky',
    'settings.color.navy': 'Navy',
    'settings.color.rose': 'Rose',
    'settings.color.slate': 'Slate',

    // Delete shift popover
    'settings.deleteShift.title': 'Delete "{code}"',
    'settings.deleteShift.desc': 'Every reference — eligibility, wants/avoids, coverage — moves to:',
    'settings.deleteShift.cancel': 'Cancel',
    'settings.deleteShift.confirm': 'Move & delete',

    // Coverage section
    'settings.coverage.title': 'Coverage',
    'settings.coverage.desc':
      'Minimum and maximum headcount, per shift, per day of week. A specific date below overrides its weekday row.',
    'settings.coverage.col.shift': 'Shift',
    'settings.coverage.dow.0': 'Sun',
    'settings.coverage.dow.1': 'Mon',
    'settings.coverage.dow.2': 'Tue',
    'settings.coverage.dow.3': 'Wed',
    'settings.coverage.dow.4': 'Thu',
    'settings.coverage.dow.5': 'Fri',
    'settings.coverage.dow.6': 'Sat',
    'settings.coverage.minAria': 'Minimum',
    'settings.coverage.maxAria': 'Maximum',
    'settings.coverage.overridesTitle': 'Date overrides',
    'settings.coverage.noOverrides': 'None — every date follows its weekday row above.',
    'settings.coverage.removeOverride': 'Remove',
    'settings.coverage.addOverrideFor': 'Add override for',
    'settings.coverage.addOverride': '+ Add',

    // Advanced section
    'settings.advanced.title': 'Advanced',
    'settings.advanced.hardRules': 'Hard rules',
    'settings.advanced.alwaysOn': 'always on',
    'settings.advanced.cap': 'Cap:',
    'settings.advanced.hPerWeek': 'h/week',
    'settings.advanced.minimum': 'Minimum:',
    'settings.advanced.hRest': 'h rest',
    'settings.advanced.softGoals': 'Soft goals — priority order',
    'settings.advanced.moveUp': 'Move {name} up',
    'settings.advanced.moveDown': 'Move {name} down',
    'settings.advanced.goalOn': '{name} on',

    // Hard rules
    'settings.rule.H1.label': 'Coverage',
    'settings.rule.H1.desc': 'Each shift stays within its min/max headcount for the day.',
    'settings.rule.H2.label': 'Max hours per week',
    'settings.rule.H2.desc': 'No one works more than the weekly hour cap.',
    'settings.rule.H3.label': 'Rest between shifts',
    'settings.rule.H3.desc': 'A minimum number of hours between one shift ending and the next starting.',
    'settings.rule.H4.label': 'One shift per day',
    'settings.rule.H4.desc': "Every person works at most one shift a day — always true; there's nowhere to put a second.",
    'settings.rule.H5.label': 'Time off & unavailability',
    'settings.rule.H5.desc': 'Approved time off and recurring days off are never scheduled.',

    // Soft goals
    'settings.goal.S1.label': 'Night-shift fairness',
    'settings.goal.S1.desc': 'Spread night shifts evenly across the team.',
    'settings.goal.S2.label': 'Preference match',
    'settings.goal.S2.desc': 'Honour what people want and avoid, where possible.',
    'settings.goal.S3.label': 'Stability',
    'settings.goal.S3.desc': 'Change as little as possible from the current schedule.',
    'settings.goal.S4.label': 'Weekend fairness',
    'settings.goal.S4.desc': 'Spread weekend shifts evenly.',
    'settings.goal.S5.label': 'Sequence smoothness',
    'settings.goal.S5.desc': 'Avoid awkward shift-to-shift transitions.',
  },
  vi: {
    // Title & meta
    'settings.title': 'Cài đặt',
    'settings.meta.shift': '{count} ca làm',
    'settings.meta.shifts': '{count} ca làm',
    'settings.meta.rulesOn': '{on}/{total} quy tắc cứng đang bật',

    // Period section
    'settings.period.title': 'Kỳ làm việc',
    'settings.period.desc': 'Tên và khoảng thời gian của kỳ làm việc này.',
    'settings.period.label': 'Tên kỳ',
    'settings.period.start': 'Bắt đầu',
    'settings.period.end': 'Kết thúc',

    // Shifts section
    'settings.shifts.title': 'Ca làm việc',
    'settings.shifts.desc':
      'Mã ca, tên gọi và thời gian — có thể chỉnh sửa hoàn toàn. Mã ca là khóa chính: đổi tên hoặc xóa sẽ cập nhật mọi nhân sự, nhóm và độ phủ liên quan.',
    'settings.shifts.col.code': 'Mã',
    'settings.shifts.col.label': 'Tên ca',
    'settings.shifts.col.start': 'Bắt đầu',
    'settings.shifts.col.end': 'Kết thúc',
    'settings.shifts.col.night': 'Ca đêm',
    'settings.shifts.col.nightTitle': 'Tính vào cột công bằng ca đêm',
    'settings.shifts.newCode': 'Mã mới',
    'settings.shifts.newCodePlaceholder': 'vd: SWING',
    'settings.shifts.newLabel': 'Tên ca',
    'settings.shifts.newLabelPlaceholder': 'vd: Xoay ca',
    'settings.shifts.addShift': '+ Thêm ca',
    'settings.shifts.codeTaken': 'Mã "{code}" đã được sử dụng.',
    'settings.shifts.colorTitle': 'Màu của {code}',
    'settings.shifts.changeColor': 'Đổi màu ca {code}',
    'settings.shifts.startTime': 'Giờ bắt đầu ca {code}',
    'settings.shifts.endTime': 'Giờ kết thúc ca {code}',
    'settings.shifts.deleteShift': 'Xóa ca {code}',
    'settings.shifts.cantDeleteLast': 'Không thể xóa ca làm việc cuối cùng',

    // Color popover
    'settings.color.amber': 'Hổ phách',
    'settings.color.orange': 'Cam',
    'settings.color.lime': 'Xanh chanh',
    'settings.color.teal': 'Xanh mòng két',
    'settings.color.sky': 'Xanh da trời',
    'settings.color.navy': 'Xanh navy',
    'settings.color.rose': 'Hồng',
    'settings.color.slate': 'Xám đá',

    // Delete shift popover
    'settings.deleteShift.title': 'Xóa ca "{code}"',
    'settings.deleteShift.desc': 'Mọi liên kết — độ hợp lệ, nguyện vọng/tránh, độ phủ — sẽ chuyển sang:',
    'settings.deleteShift.cancel': 'Hủy',
    'settings.deleteShift.confirm': 'Chuyển & xóa',

    // Coverage section
    'settings.coverage.title': 'Độ phủ',
    'settings.coverage.desc':
      'Số lượng nhân sự tối thiểu và tối đa theo từng ca, từng ngày trong tuần. Ngày cụ thể bên dưới sẽ ghi đè lên hàng ngày trong tuần.',
    'settings.coverage.col.shift': 'Ca',
    'settings.coverage.dow.0': 'CN',
    'settings.coverage.dow.1': 'T2',
    'settings.coverage.dow.2': 'T3',
    'settings.coverage.dow.3': 'T4',
    'settings.coverage.dow.4': 'T5',
    'settings.coverage.dow.5': 'T6',
    'settings.coverage.dow.6': 'T7',
    'settings.coverage.minAria': 'Tối thiểu',
    'settings.coverage.maxAria': 'Tối đa',
    'settings.coverage.overridesTitle': 'Ghi đè theo ngày',
    'settings.coverage.noOverrides': 'Không có — mọi ngày đều áp dụng theo hàng thứ trong tuần ở trên.',
    'settings.coverage.removeOverride': 'Xóa',
    'settings.coverage.addOverrideFor': 'Thêm ghi đè cho ngày',
    'settings.coverage.addOverride': '+ Thêm',

    // Advanced section
    'settings.advanced.title': 'Nâng cao',
    'settings.advanced.hardRules': 'Quy tắc cứng',
    'settings.advanced.alwaysOn': 'luôn bật',
    'settings.advanced.cap': 'Giới hạn:',
    'settings.advanced.hPerWeek': 'giờ/tuần',
    'settings.advanced.minimum': 'Tối thiểu:',
    'settings.advanced.hRest': 'giờ nghỉ',
    'settings.advanced.softGoals': 'Mục tiêu mềm — thứ tự ưu tiên',
    'settings.advanced.moveUp': 'Di chuyển {name} lên',
    'settings.advanced.moveDown': 'Di chuyển {name} xuống',
    'settings.advanced.goalOn': 'Bật {name}',

    // Hard rules
    'settings.rule.H1.label': 'Độ phủ',
    'settings.rule.H1.desc': 'Mỗi ca làm nằm trong khoảng số người tối thiểu/tối đa trong ngày.',
    'settings.rule.H2.label': 'Giờ làm tối đa mỗi tuần',
    'settings.rule.H2.desc': 'Không ai làm việc quá số giờ giới hạn mỗi tuần.',
    'settings.rule.H3.label': 'Nghỉ giữa các ca',
    'settings.rule.H3.desc': 'Số giờ nghỉ tối thiểu từ khi kết thúc ca này đến khi bắt đầu ca tiếp theo.',
    'settings.rule.H4.label': 'Một ca mỗi ngày',
    'settings.rule.H4.desc': 'Mỗi người làm tối đa một ca mỗi ngày — luôn áp dụng.',
    'settings.rule.H5.label': 'Nghỉ phép & vắng mặt',
    'settings.rule.H5.desc': 'Nghỉ phép đã duyệt và ngày nghỉ định kỳ không bao giờ được xếp lịch.',

    // Soft goals
    'settings.goal.S1.label': 'Công bằng ca đêm',
    'settings.goal.S1.desc': 'Phân bổ đều các ca đêm trong toàn nhóm.',
    'settings.goal.S2.label': 'Đáp ứng nguyện vọng',
    'settings.goal.S2.desc': 'Tối ưu theo nguyện vọng muốn làm hoặc tránh của từng người khi có thể.',
    'settings.goal.S3.label': 'Tính ổn định',
    'settings.goal.S3.desc': 'Thay đổi ít nhất có thể so với lịch phân công hiện tại.',
    'settings.goal.S4.label': 'Công bằng cuối tuần',
    'settings.goal.S4.desc': 'Phân bổ đều các ca làm việc cuối tuần.',
    'settings.goal.S5.label': 'Chuyển tiếp ca mượt mà',
    'settings.goal.S5.desc': 'Tránh các chuỗi chuyển ca bất hợp lý.',
  },
} satisfies AreaCatalog
