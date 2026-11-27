/**
 * Helper định dạng dùng chung cho toàn bộ giao diện (chuẩn hiển thị tiếng Việt).
 */

const VN_DATE = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const VN_DATETIME = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(value: Date | string | number | null | undefined, fallback = '—') {
  const d = toDate(value)
  return d ? VN_DATE.format(d) : fallback
}

export function formatDateTime(value: Date | string | number | null | undefined, fallback = '—') {
  const d = toDate(value)
  return d ? VN_DATETIME.format(d) : fallback
}

/** "Hôm nay" · "3 ngày trước" · "2 tuần trước" — kiểu hiển thị tin tuyển dụng của TopCV */
export function formatRelativeTime(value: Date | string | number | null | undefined) {
  const d = toDate(value)
  if (!d) return '—'

  const diffMs = Date.now() - d.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Vừa xong'
  if (minutes < 60) return `${minutes} phút trước`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`

  const days = Math.floor(hours / 24)
  if (days === 0) return 'Hôm nay'
  if (days === 1) return 'Hôm qua'
  if (days < 7) return `${days} ngày trước`
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`
  return `${Math.floor(days / 365)} năm trước`
}

/** Số ngày còn lại tới hạn nộp; âm nghĩa là đã hết hạn */
export function daysUntil(value: Date | string | number | null | undefined): number | null {
  const d = toDate(value)
  if (!d) return null
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}

/*
 * Tiền theo quy ước Việt Nam: dấu chấm ngăn hàng nghìn, dấu phẩy là dấu thập
 * phân. "178.000" là 178 nghìn — không phải 178 như cách đọc của Mỹ mà
 * Number() và ô <input type="number"> đang dùng.
 *
 * Bản sao phía server: backend/src/utils/salary.js. Đổi quy tắc hiển thị ở một
 * bên thì đổi cả bên kia, nếu không chuỗi `job.salary` lưu trong DB sẽ lệch
 * với thẻ tin tính từ salaryMin / salaryMax.
 */
const VI_MONEY = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
const VI_INT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })
const VND_SCALES: [number, string][] = [
  [1e9, 'tỷ'],
  [1e6, 'triệu'],
  [1e3, 'nghìn'],
]

/**
 * 15000000 -> "15" + "triệu", 178000 -> "178" + "nghìn", 15500000 -> "15,5" + "triệu".
 * Số lẻ không gọn trong hai chữ số thập phân thì in đủ: "15.333.333" + "đ".
 */
function splitVnd(amount: number): { num: string; unit: string } {
  const scale = VND_SCALES.find(([factor]) => amount >= factor)
  if (scale) {
    const value = amount / scale[0]
    if (Math.abs(value * 100 - Math.round(value * 100)) < 1e-6) {
      return { num: VI_MONEY.format(value), unit: scale[1] }
    }
  }
  return { num: VI_INT.format(amount), unit: 'đ' }
}

// Ngoại tệ ghi số đủ kèm tên tiền theo lối tin tuyển dụng tiếng Việt:
// "176.000 yên", "1.500 USD" — thay cho "176.000 ¥", "1.500 US$" của Intl.
const FOREIGN_UNIT: Record<string, string> = { JPY: 'yên', USD: 'USD', EUR: 'EUR' }

function splitAmount(amount: number, currency: string): { num: string; unit: string } {
  return currency === 'VND'
    ? splitVnd(amount)
    : { num: VI_INT.format(amount), unit: FOREIGN_UNIT[currency] || currency }
}

const joinAmount = ({ num, unit }: { num: string; unit: string }) => `${num} ${unit}`

/**
 * Hiển thị lương theo lối Việt Nam: "15 - 25 triệu", "Từ 178 nghìn",
 * "176.000 yên", "Thoả thuận". Hai đầu cùng đơn vị thì chỉ ghi đơn vị một lần.
 */
export function formatSalary(
  min?: number | null,
  max?: number | null,
  currency = 'VND',
  fallback = 'Thoả thuận',
): string {
  const hasMin = typeof min === 'number' && min > 0
  const hasMax = typeof max === 'number' && max > 0
  if (!hasMin && !hasMax) return fallback

  const cur = currency || 'VND'
  if (hasMin && hasMax) {
    if (min === max) return joinAmount(splitAmount(min!, cur))
    const a = splitAmount(min!, cur)
    const b = splitAmount(max!, cur)
    return a.unit === b.unit
      ? `${a.num} - ${b.num} ${b.unit}`
      : `${joinAmount(a)} - ${joinAmount(b)}`
  }
  if (hasMin) return `Từ ${joinAmount(splitAmount(min!, cur))}`
  return `Tới ${joinAmount(splitAmount(max!, cur))}`
}

/**
 * Giá trị hiển thị cho ô nhập số tiền: chỉ giữ chữ số rồi chèn dấu chấm ngăn
 * hàng nghìn — "15000000" -> "15.000.000". Ô không nhận phần thập phân nên
 * "178.000" luôn là 178 nghìn.
 */
export function formatMoneyInput(value: string | number | null | undefined): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? VI_INT.format(Math.round(value)) : ''
  }
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 15)
  return digits ? VI_INT.format(Number(digits)) : ''
}

/** Chuỗi của ô nhập số tiền ("15.000.000") -> 15000000; rỗng -> null. */
export function parseMoneyInput(value: string | null | undefined): number | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : null
}

/** 1250 -> "1.250"; dùng cho số liệu thống kê */
export function formatNumber(value: number | null | undefined, fallback = '—') {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return new Intl.NumberFormat('vi-VN').format(value)
}

/** Chữ cái đầu để làm avatar fallback */
export function initials(text?: string | null, max = 2) {
  if (!text) return '?'
  const cleaned = text.split('@')[0].replace(/[^\p{L}\p{N}\s]/gu, ' ').trim()
  if (!cleaned) return '?'
  return cleaned
    .split(/\s+/)
    .slice(0, max)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export const WORK_TYPE_LABEL: Record<string, string> = {
  remote: 'Làm từ xa',
  hybrid: 'Linh hoạt',
  onsite: 'Tại văn phòng',
}

/** Bỏ dấu tiếng Việt, thường hoá, gộp khoảng trắng — để so khớp địa danh. */
function foldVi(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\b(tp\.?|thanh pho|tinh)\s*/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Tin có khớp bộ lọc địa điểm không.
 *
 * So bằng === trước đây làm "Hà Nội" không ra tin "Cầu Giấy, Hà Nội", còn
 * "Làm từ xa" (ô chọn ở trang chủ) là hình thức làm việc chứ không phải địa danh
 * nên không bao giờ khớp. Nay so chuỗi con đã bỏ dấu, và "Làm từ xa" khớp tin remote.
 */
export function matchesLocation(
  job: { location?: string | null; jobType?: string | null },
  filter: string,
): boolean {
  if (!filter) return true
  const f = foldVi(filter)
  if (f === 'lam tu xa' || f === 'remote') return job.jobType === 'remote'
  return foldVi(job.location || '').includes(f)
}

/**
 * URL an toàn để đặt vào href: chỉ http/https. Dữ liệu cũ trong DB có thể còn
 * "javascript:..." từ trước khi backend chặn — React 19 chỉ chặn lúc chạy và
 * báo lỗi, nên lọc ngay ở đây và không render link nếu không hợp lệ.
 */
export function safeUrl(value?: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(candidate)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}
