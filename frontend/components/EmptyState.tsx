import React from 'react'
import { Button } from '@/components/ui/button'
import { LucideIcon, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  /** Nội dung tuỳ biến thay cho nút action mặc định */
  children?: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  children,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        size === 'sm' ? 'py-10' : 'py-16',
        className,
      )}
    >
      <div
        className={cn(
          'mb-4 grid place-items-center rounded-full bg-brand-50 text-brand-500',
          size === 'sm' ? 'size-12' : 'size-16',
        )}
      >
        <Icon className={size === 'sm' ? 'size-6' : 'size-7'} />
      </div>
      <h3 className={cn('font-bold', size === 'sm' ? 'text-base' : 'text-lg')}>{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {(action || children) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {action &&
            (action.href ? (
              <Button asChild>
                <a href={action.href}>{action.label}</a>
              </Button>
            ) : (
              <Button onClick={action.onClick}>{action.label}</Button>
            ))}
          {children}
        </div>
      )}
    </div>
  )
}
