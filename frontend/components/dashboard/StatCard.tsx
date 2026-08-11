import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'brand' | 'info' | 'warning' | 'danger' | 'violet' | 'neutral'

const toneClasses: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  info: 'bg-info-surface text-info-foreground',
  warning: 'bg-warning-surface text-warning-foreground',
  danger: 'bg-danger-surface text-danger-foreground',
  violet: 'bg-chart-4/12 text-chart-4',
  neutral: 'bg-muted text-muted-foreground',
}

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  tone?: Tone
  hint?: string
  /** Ví dụ "+12% so với tuần trước" */
  trend?: { value: string; positive?: boolean }
  loading?: boolean
  className?: string
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  hint,
  trend,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <div className={cn('surface-card surface-hover p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', toneClasses[tone])}>
            <Icon className="size-[18px]" />
          </span>
        )}
      </div>

      {loading ? (
        <div className="skeleton mt-3 h-8 w-20" />
      ) : (
        <p className="mt-2 text-[28px] leading-none font-bold tabular-nums">{value}</p>
      )}

      {(hint || trend) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
          {trend && (
            <span
              className={cn(
                'font-semibold',
                trend.positive === false ? 'text-danger-foreground' : 'text-success-foreground',
              )}
            >
              {trend.value}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  )
}
