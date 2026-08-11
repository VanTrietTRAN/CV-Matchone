import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-brand-600',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-muted',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:brightness-95',
        outline: 'border-border text-foreground/80 [a&]:hover:bg-muted',
        /** Trạng thái – nền nhạt + chữ đậm màu, đọc tốt cả light/dark */
        success: 'border-transparent bg-success-surface text-success-foreground',
        warning: 'border-transparent bg-warning-surface text-warning-foreground',
        danger: 'border-transparent bg-danger-surface text-danger-foreground',
        info: 'border-transparent bg-info-surface text-info-foreground',
        brand: 'border-transparent bg-brand-50 text-brand-700',
        hot: 'border-transparent bg-hot-500 text-white',
        neutral: 'border-transparent bg-muted text-muted-foreground',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-0 text-[11px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
