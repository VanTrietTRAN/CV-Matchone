import React from 'react'
import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MatchBadgeProps {
  /** 0–100. null = chưa tính được điểm (CV chưa có embedding) */
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'h-6 px-2 text-[11px] gap-1',
  md: 'h-7 px-2.5 text-xs gap-1',
  lg: 'h-9 px-3.5 text-sm gap-1.5',
} as const

const iconSize = {
  sm: 'size-3',
  md: 'size-3.5',
  lg: 'size-4',
} as const

export function matchTone(score: number | null) {
  if (score === null) return 'bg-muted text-muted-foreground'
  if (score >= 80) return 'bg-brand-500 text-white'
  if (score >= 60) return 'bg-success-surface text-success-foreground'
  if (score >= 40) return 'bg-warning-surface text-warning-foreground'
  return 'bg-muted text-muted-foreground'
}

export default function MatchBadge({
  score,
  size = 'md',
  showLabel = true,
  className,
}: MatchBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-bold whitespace-nowrap tabular-nums',
        matchTone(score),
        sizeClasses[size],
        className,
      )}
      title={score === null ? 'Chưa có điểm phù hợp' : `Độ phù hợp ${score}%`}
    >
      <Zap className={cn(iconSize[size], 'shrink-0')} />
      {score === null ? 'Chưa chấm' : `${score}%`}
      {showLabel && score !== null && <span className="font-semibold">phù hợp</span>}
    </span>
  )
}
