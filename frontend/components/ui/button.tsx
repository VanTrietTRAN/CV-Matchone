import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:ring-offset-0 aria-invalid:ring-destructive/20 aria-invalid:border-destructive active:scale-[0.985]",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[var(--shadow-brand)] hover:bg-brand-600 hover:shadow-[0_8px_20px_-8px_var(--brand-500)]',
        destructive:
          'bg-destructive text-white hover:brightness-95 focus-visible:ring-destructive/30',
        outline:
          'border border-border bg-card text-foreground hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700',
        /** Viền brand – dùng cho CTA phụ trên nền sáng (kiểu "Đăng tuyển" của TopCV) */
        brandOutline:
          'border border-brand-500 bg-transparent text-brand-600 hover:bg-brand-50 hover:text-brand-700',
        /** Nền brand rất nhạt – dùng cho action trong bảng/list */
        soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        /** Cam – nhấn mạnh tin hot / nâng cấp gói */
        hot: 'bg-hot-500 text-white hover:bg-hot-600 shadow-[0_6px_16px_-6px_var(--accent-500)]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
        ghost: 'text-foreground/75 hover:bg-muted hover:text-foreground',
        link: 'text-brand-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3.5',
        sm: 'h-9 rounded-md gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5',
        xs: 'h-8 rounded-md gap-1 px-2.5 text-xs has-[>svg]:px-2',
        lg: 'h-12 rounded-lg px-7 text-base has-[>svg]:px-5',
        icon: 'size-10',
        'icon-sm': 'size-9',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
