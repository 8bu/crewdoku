import type { AreaCatalog } from './types'

/** Onboarding wizard, schedule import, and the export wizard. */
export const onbex = {
  en: {
    // Shared buttons
    'onbex.btn.back': 'Back',
    'onbex.btn.continue': 'Continue',
    'onbex.btn.next': 'Next',

    // Onboarding wizard - Steps
    'onbex.step.shape': 'Company shape',
    'onbex.step.people': 'People',
    'onbex.step.ready': 'Generate',

    // Onboarding - Shape step
    'onbex.shape.title': 'How does your company work?',
    'onbex.shape.subtitle': 'One click fills your shifts, coverage targets, and safe default rules. Everything is editable later in Settings.',

    // Workspace templates
    'onbex.template.ward.label': '24/7 ward',
    'onbex.template.ward.tagline': 'Three shifts around the clock, every day. Hospitals, care homes, plants.',
    'onbex.template.ward.hint': 'A 24/7 ward usually needs at least 6 people to cover every shift.',
    'onbex.template.retail.label': 'Retail store',
    'onbex.template.retail.tagline': 'An opening and a closing shift, seven days a week. Shops, cafés, gyms.',
    'onbex.template.retail.hint': 'A store usually needs at least 4 people to cover both shifts all week.',
    'onbex.template.office.label': 'Office week',
    'onbex.template.office.tagline': 'One day shift, Monday to Friday. Weekends are closed.',
    'onbex.template.office.hint': 'An office runs from 2 people up.',
    'onbex.template.custom.label': 'Start custom',
    'onbex.template.custom.tagline': 'One simple day shift, no requirements. Build your own in Settings.',
    'onbex.template.custom.hint': '',

    // Onboarding - People step
    'onbex.people.title': 'Add your people',
    'onbex.people.subtitlePrefix': 'One person per line — a name, or',
    'onbex.people.subtitleSuffix': '. Paste straight from a spreadsheet; every team name becomes a real team.',
    'onbex.people.placeholder': 'Anna Bauer, Front desk\nBen Keller, Front desk\nChloe Martin',
    'onbex.people.empty': 'No people yet.',
    'onbex.people.person': 'person',
    'onbex.people.people': 'people',
    'onbex.people.team': 'team',
    'onbex.people.teams': 'teams',
    'onbex.people.fromCsv': '⧉ From a CSV file',

    // Onboarding - Ready step
    'onbex.ready.title': 'Ready to generate',
    'onbex.ready.subtitle': 'Crewdoku builds the first schedule itself. You review it before anything is final.',
    'onbex.ready.inTeamPrefix': ' in ',
    'onbex.ready.note': 'Change any of this later in Settings, Roster, and Teams.',
    'onbex.ready.generate': 'Generate my first schedule',
    'onbex.ready.skip': 'Go to the board without generating',

    // Schedule Import
    'onbex.import.title': 'Import a schedule',
    'onbex.import.subtitle': 'Fill this board with a schedule you already worked — one from a spreadsheet, or from before Crewdoku — instead of generating one from scratch.',
    'onbex.import.chooseFile': 'Choose a CSV file…',
    'onbex.import.person': 'person',
    'onbex.import.people': 'people',
    'onbex.import.filledCell': 'filled cell',
    'onbex.import.filledCells': 'filled cells',
    'onbex.import.across': 'across',
    'onbex.import.day': 'day',
    'onbex.import.days': 'days',
    'onbex.import.csvFormat': 'CSV format',
    'onbex.import.btn': 'Import schedule',
    'onbex.import.skip': 'Skip — start with an empty board',

    // Export wizard
    'onbex.export.title': 'Export',
    'onbex.export.step.period': '1 Period',
    'onbex.export.step.template': '2 Template',
    'onbex.export.step.preview': '3 Preview',
    'onbex.export.saveWorkspace': 'Save workspace',
    'onbex.export.loadWorkspace': 'Load workspace',
    'onbex.export.confirmLoad': 'Load this workspace file? It replaces everything currently in Crewdoku.',
    'onbex.export.workspaceLoaded': 'Workspace loaded.',

    // Export - Step 1
    'onbex.export.status.applied': 'applied schedule',
    'onbex.export.status.edits': 'hand edits only',
    'onbex.export.status.empty': 'empty',
    'onbex.export.day': 'day',
    'onbex.export.days': 'days',
    'onbex.export.empty.msg': 'Nothing to export yet — generate or import a schedule on the Board first.',
    'onbex.export.empty.btn': 'Go to Board',

    // Export - Step 2 Templates
    'onbex.export.template.team-grid.label': 'Team grid',
    'onbex.export.template.team-grid.description': 'People × dates, one row per person — the same shape Import an old schedule reads back.',
    'onbex.export.template.board.label': 'Board layout',
    'onbex.export.template.board.description': 'People × dates grouped under team header rows — reads like the Board.',
    'onbex.export.template.person-list.label': 'Per-person list',
    'onbex.export.template.person-list.description': 'One row per scheduled day, with times and hours — one file for everyone.',
    'onbex.export.template.coverage-pivot.label': 'Coverage pivot',
    'onbex.export.template.coverage-pivot.description': "Headcount per shift per day — the Coverage view's counts.",

    // Export - Step 3 Formats & Preview
    'onbex.export.format.csv': 'CSV',
    'onbex.export.format.tsv': 'TSV',
    'onbex.export.format.json': 'JSON',
    'onbex.export.format.xlsx': 'XLSX',
    'onbex.export.format.pdf': 'PDF',
    'onbex.export.preview.moreRows': '… {count} more rows',
    'onbex.export.preview.moreRecords': '… {count} more records',
    'onbex.export.preview.remainingRow': '… {count} more row',
    'onbex.export.preview.remainingRows': '… {count} more rows',
    'onbex.export.pdf.note': 'Page 1 preview — landscape A4; wide tables split into slices of ≤16 columns',
    'onbex.export.pdf.clipped': ', showing first {count} of {total} columns',
    'onbex.export.row': 'row',
    'onbex.export.rows': 'rows',
    'onbex.export.col': 'column',
    'onbex.export.cols': 'columns',
    'onbex.export.download': 'Download {format}',
    'onbex.export.refusal.notJson': 'This file is not a Crewdoku workspace file.',
    'onbex.export.refusal.notWorkspace': 'This file does not contain a Crewdoku workspace.',
    'onbex.export.refusal.newerSchema': 'This file was made by a newer version of Crewdoku. Update the app to open it.',
  },
  vi: {
    // Shared buttons
    'onbex.btn.back': 'Quay lại',
    'onbex.btn.continue': 'Tiếp tục',
    'onbex.btn.next': 'Tiếp theo',

    // Onboarding wizard - Steps
    'onbex.step.shape': 'Mô hình công ty',
    'onbex.step.people': 'Nhân sự',
    'onbex.step.ready': 'Tạo lịch',

    // Onboarding - Shape step
    'onbex.shape.title': 'Công ty của bạn hoạt động như thế nào?',
    'onbex.shape.subtitle': 'Một cú nhấp chuột để điền ca làm việc, chỉ tiêu nhân sự và quy tắc mặc định an toàn. Bạn có thể chỉnh sửa mọi thứ sau trong Cài đặt.',

    // Workspace templates
    'onbex.template.ward.label': 'Ca trực 24/7',
    'onbex.template.ward.tagline': 'Ba ca liên tục suốt ngày đêm, mỗi ngày. Bệnh viện, viện dưỡng lão, nhà máy.',
    'onbex.template.ward.hint': 'Một ca trực 24/7 thường cần ít nhất 6 người để phủ kín các ca.',
    'onbex.template.retail.label': 'Cửa hàng bán lẻ',
    'onbex.template.retail.tagline': 'Một ca mở cửa và một ca đóng cửa, 7 ngày một tuần. Cửa hàng, quán cà phê, phòng tập.',
    'onbex.template.retail.hint': 'Một cửa hàng thường cần ít nhất 4 người để phủ cả hai ca suốt cả tuần.',
    'onbex.template.office.label': 'Tuần làm việc văn phòng',
    'onbex.template.office.tagline': 'Một ca ngày, từ thứ Hai đến thứ Sáu. Đóng cửa cuối tuần.',
    'onbex.template.office.hint': 'Văn phòng hoạt động từ 2 người trở lên.',
    'onbex.template.custom.label': 'Tự tùy chỉnh',
    'onbex.template.custom.tagline': 'Một ca ngày đơn giản, không có yêu cầu. Tự xây dựng trong Cài đặt.',
    'onbex.template.custom.hint': '',

    // Onboarding - People step
    'onbex.people.title': 'Thêm nhân sự',
    'onbex.people.subtitlePrefix': 'Mỗi người một dòng — tên, hoặc',
    'onbex.people.subtitleSuffix': '. Dán trực tiếp từ bảng tính; mỗi tên phòng/ban sẽ được tạo thành một phòng/ban trong hệ thống.',
    'onbex.people.placeholder': 'Anna Bauer, Front desk\nBen Keller, Front desk\nChloe Martin',
    'onbex.people.empty': 'Chưa có nhân sự nào.',
    'onbex.people.person': 'nhân sự',
    'onbex.people.people': 'nhân sự',
    'onbex.people.team': 'phòng/ban',
    'onbex.people.teams': 'phòng/ban',
    'onbex.people.fromCsv': '⧉ Từ tệp CSV',

    // Onboarding - Ready step
    'onbex.ready.title': 'Sẵn sàng tạo lịch',
    'onbex.ready.subtitle': 'Crewdoku sẽ tự xây dựng lịch đầu tiên. Bạn xem lại trước khi chốt lịch.',
    'onbex.ready.inTeamPrefix': ' trong ',
    'onbex.ready.note': 'Bạn có thể thay đổi bất kỳ điều gì sau này trong Cài đặt, Nhân sự và Phòng/ban.',
    'onbex.ready.generate': 'Tạo lịch làm việc đầu tiên',
    'onbex.ready.skip': 'Đến bảng mà không cần tạo lịch',

    // Schedule Import
    'onbex.import.title': 'Nhập lịch làm việc',
    'onbex.import.subtitle': 'Điền vào bảng này một lịch làm việc bạn đã có — từ bảng tính hoặc từ trước khi dùng Crewdoku — thay vì tạo mới từ đầu.',
    'onbex.import.chooseFile': 'Chọn tệp CSV…',
    'onbex.import.person': 'nhân sự',
    'onbex.import.people': 'nhân sự',
    'onbex.import.filledCell': 'ô đã điền',
    'onbex.import.filledCells': 'ô đã điền',
    'onbex.import.across': 'trong',
    'onbex.import.day': 'ngày',
    'onbex.import.days': 'ngày',
    'onbex.import.csvFormat': 'Định dạng CSV',
    'onbex.import.btn': 'Nhập lịch làm việc',
    'onbex.import.skip': 'Bỏ qua — bắt đầu với bảng trống',

    // Export wizard
    'onbex.export.title': 'Xuất dữ liệu',
    'onbex.export.step.period': '1 Kỳ',
    'onbex.export.step.template': '2 Mẫu',
    'onbex.export.step.preview': '3 Xem trước',
    'onbex.export.saveWorkspace': 'Lưu Workspace',
    'onbex.export.loadWorkspace': 'Tải Workspace',
    'onbex.export.confirmLoad': 'Tải tệp Workspace này? Thao tác này sẽ thay thế toàn bộ dữ liệu hiện có trong Crewdoku.',
    'onbex.export.workspaceLoaded': 'Đã tải Workspace.',

    // Export - Step 1
    'onbex.export.status.applied': 'lịch đã áp dụng',
    'onbex.export.status.edits': 'chỉ có chỉnh sửa thủ công',
    'onbex.export.status.empty': 'trống',
    'onbex.export.day': 'ngày',
    'onbex.export.days': 'ngày',
    'onbex.export.empty.msg': 'Chưa có dữ liệu để xuất — hãy tạo hoặc nhập lịch trên Bảng trước.',
    'onbex.export.empty.btn': 'Đến Bảng',

    // Export - Step 2 Templates
    'onbex.export.template.team-grid.label': 'Lưới theo phòng/ban',
    'onbex.export.template.team-grid.description': 'Nhân sự × ngày, mỗi người một hàng — cùng định dạng với tính năng Nhập lịch cũ.',
    'onbex.export.template.board.label': 'Bố cục bảng',
    'onbex.export.template.board.description': 'Nhân sự × ngày được gom theo hàng tiêu đề phòng/ban — hiển thị giống như Bảng.',
    'onbex.export.template.person-list.label': 'Danh sách theo từng người',
    'onbex.export.template.person-list.description': 'Mỗi ngày có lịch là một hàng, kèm thời gian và số giờ — một tệp cho tất cả mọi người.',
    'onbex.export.template.coverage-pivot.label': 'Bảng tổng hợp nhân sự',
    'onbex.export.template.coverage-pivot.description': 'Số người theo từng ca mỗi ngày — số liệu từ màn hình Mức đáp ứng nhân sự.',

    // Export - Step 3 Formats & Preview
    'onbex.export.format.csv': 'CSV',
    'onbex.export.format.tsv': 'TSV',
    'onbex.export.format.json': 'JSON',
    'onbex.export.format.xlsx': 'XLSX',
    'onbex.export.format.pdf': 'PDF',
    'onbex.export.preview.moreRows': '… còn {count} hàng nữa',
    'onbex.export.preview.moreRecords': '… còn {count} bản ghi nữa',
    'onbex.export.preview.remainingRow': '… còn {count} hàng nữa',
    'onbex.export.preview.remainingRows': '… còn {count} hàng nữa',
    'onbex.export.pdf.note': 'Xem trước trang 1 — khổ ngang A4; bảng rộng được chia thành các phần ≤16 cột',
    'onbex.export.pdf.clipped': ', hiển thị {count} trên {total} cột đầu tiên',
    'onbex.export.row': 'hàng',
    'onbex.export.rows': 'hàng',
    'onbex.export.col': 'cột',
    'onbex.export.cols': 'cột',
    'onbex.export.download': 'Tải xuống {format}',
    'onbex.export.refusal.notJson': 'Tệp này không phải là tệp Workspace Crewdoku.',
    'onbex.export.refusal.notWorkspace': 'Tệp này không chứa Workspace Crewdoku.',
    'onbex.export.refusal.newerSchema': 'Tệp này được tạo bởi phiên bản Crewdoku mới hơn. Hãy cập nhật ứng dụng để mở.',
  },
} satisfies AreaCatalog
