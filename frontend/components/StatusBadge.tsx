import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Gộp cả status do backend trả về (pending/reviewed/...) và status hiển thị của tin
 * tuyển dụng để dùng chung một component ở mọi trang.
 */
export type Status =
  | 'pending'
  | 'applied'
  | 'reviewed'
  | 'reviewing'
  | 'interview'
  | 'accepted'
  | 'rejected'
  | 'open'
  | 'active'
  | 'paused'
  | 'closed'
  | 'expired'
  | 'draft'

type Tone = 'info' | 'brand' | 'warning' | 'danger' | 'neutral' | 'violet'

const toneClasses: Record<Tone, string> = {
  info: 'bg-info-surface text-info-foreground',
  brand: 'bg-success-surface text-success-foreground',
  warning: 'bg-warning-surface text-warning-foreground',
  danger: 'bg-danger-surface text-danger-foreground',
  neutral: 'bg-muted text-muted-foreground',
  violet: 'bg-chart-4/12 text-chart-4',
}

const statusConfig: Record<Status, { tone: Tone; label: string }> = {
  pending: { tone: 'info', label: 'Chờ duyệt' },
  applied: { tone: 'info', label: 'Đã ứng tuyển' },
  reviewed: { tone: 'violet', label: 'Đã xem hồ sơ' },
  reviewing: { tone: 'violet', label: 'Đang xem xét' },
  interview: { tone: 'warning', label: 'Phỏng vấn' },
  accepted: { tone: 'brand', label: 'Trúng tuyển' },
  rejected: { tone: 'danger', label: 'Từ chối' },
  open: { tone: 'brand', label: 'Đang tuyển' },
  active: { tone: 'brand', label: 'Đang hoạt động' },
  paused: { tone: 'warning', label: 'Tạm dừng' },
  closed: { tone: 'neutral', label: 'Đã đóng' },
  expired: { tone: 'neutral', label: 'Hết hạn' },
  draft: { tone: 'neutral', label: 'Bản nháp' },
}

interface StatusBadgeProps {
  status: Status | string
  size?: 'sm' | 'md'
  className?: string
}

export default function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const config = statusConfig[status as Status] ?? { tone: 'neutral' as Tone, label: status }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        toneClasses[config.tone],
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {config.label}
    </span>
  )
}
