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

function formatVnd(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000
    const rounded = Number.isInteger(millions) ? millions : Math.round(millions * 10) / 10
    return `${rounded} triệu`
  }
  return new Intl.NumberFormat('vi-VN').format(amount)
}

/**
 * Hiển thị lương theo lối Việt Nam: "15 - 25 triệu", "Từ 20 triệu", "Thoả thuận".
 * Với ngoại tệ giữ nguyên ký hiệu tiền tệ.
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

  if (currency === 'VND') {
    if (hasMin && hasMax) return `${formatVnd(min!)} - ${formatVnd(max!)}`
    if (hasMin) return `Từ ${formatVnd(min!)}`
    return `Tới ${formatVnd(max!)}`
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n)

  if (hasMin && hasMax) return `${fmt(min!)} - ${fmt(max!)}`
  if (hasMin) return `Từ ${fmt(min!)}`
  return `Tới ${fmt(max!)}`
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
