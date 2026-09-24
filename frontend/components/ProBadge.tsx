import React from 'react'
import { Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Nhãn doanh nghiệp PRO.
 *
 * Chỉ admin cấp được nhãn này (Quản lý tài khoản → nút PRO); tin của doanh
 * nghiệp PRO luôn được xếp lên đầu danh sách việc làm và đầu kết quả tìm kiếm,
 * nên nhãn phải nhìn thấy ngay trên thẻ tin để ứng viên hiểu vì sao nó ở đó.
 */
export default function ProBadge({
  size = 'sm',
  className,
}: {
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span
      title="Doanh nghiệp PRO — tin tuyển dụng được ưu tiên hiển thị"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-surface font-bold tracking-wide text-warning-foreground uppercase',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <Crown className={size === 'sm' ? 'size-3' : 'size-3.5'} />
      PRO
    </span>
  )
}
