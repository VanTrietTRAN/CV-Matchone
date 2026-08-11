import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground hover:border-brand-300 focus-visible:border-brand-500 focus-visible:ring-brand-500/18 aria-invalid:ring-destructive/20 aria-invalid:border-destructive bg-card flex field-sizing-content min-h-20 w-full rounded-md border px-3.5 py-2.5 text-base leading-relaxed transition-[color,border-color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
