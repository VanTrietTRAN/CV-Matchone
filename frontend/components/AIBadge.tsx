import React from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AIBadgeProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  className?: string
}

const sizeClasses = {
  sm: 'h-5 px-1.5 text-[10px] gap-1',
  md: 'h-6 px-2 text-[11px] gap-1',
  lg: 'h-7 px-2.5 text-xs gap-1.5',
} as const

const iconSize = {
  sm: 'size-3',
  md: 'size-3.5',
  lg: 'size-4',
} as const

export default function AIBadge({ size = 'md', text = 'AI', className }: AIBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-brand-200 bg-brand-50 font-bold tracking-wide text-brand-700 uppercase',
        sizeClasses[size],
        className,
      )}
    >
      <Sparkles className={iconSize[size]} />
      {text}
    </span>
  )
}
