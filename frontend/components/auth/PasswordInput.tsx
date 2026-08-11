'use client'

import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'> & {
  /** Hiện thanh đo độ mạnh mật khẩu (dùng cho form đăng ký / đặt lại mật khẩu) */
  showStrength?: boolean
}

const LEVELS = [
  { label: 'Yếu', className: 'bg-danger' },
  { label: 'Trung bình', className: 'bg-warning' },
  { label: 'Khá', className: 'bg-brand-400' },
  { label: 'Mạnh', className: 'bg-brand-500' },
]

function scorePassword(value: string): number {
  if (!value) return 0
  let score = 0
  if (value.length >= 6) score++
  if (value.length >= 10) score++
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++
  return Math.min(score, 4)
}

export default function PasswordInput({
  className,
  showStrength = false,
  value,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const score = showStrength ? scorePassword(String(value ?? '')) : 0

  return (
    <div>
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          className={cn('pr-11 pl-10', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {showStrength && String(value ?? '').length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {LEVELS.map((level, i) => (
              <span
                key={level.label}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i < score ? LEVELS[score - 1].className : 'bg-border',
                )}
              />
            ))}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {score > 0 ? LEVELS[score - 1].label : ''}
          </span>
        </div>
      )}
    </div>
  )
}
