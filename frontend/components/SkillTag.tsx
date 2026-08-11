import React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SkillTagProps {
  skill: string
  onRemove?: (skill: string) => void
  removable?: boolean
  variant?: 'default' | 'match' | 'missing'
  size?: 'sm' | 'md'
  className?: string
}

const variantClasses = {
  default: 'bg-muted text-foreground/75 border-transparent',
  match: 'bg-success-surface text-success-foreground border-transparent',
  missing: 'bg-danger-surface text-danger-foreground border-transparent',
} as const

const sizeClasses = {
  sm: 'px-2 py-0.5 text-[11px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
} as const

export default function SkillTag({
  skill,
  onRemove,
  removable = false,
  variant = 'default',
  size = 'md',
  className,
}: SkillTagProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-md border font-medium',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      <span className="truncate">{skill}</span>
      {removable && (
        <button
          type="button"
          onClick={() => onRemove?.(skill)}
          className="-mr-0.5 grid size-4 shrink-0 place-items-center rounded-full transition-colors hover:bg-foreground/10"
          aria-label={`Xoá kỹ năng ${skill}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}
