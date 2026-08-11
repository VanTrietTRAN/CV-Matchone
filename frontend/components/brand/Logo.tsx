import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type LogoSize = 'sm' | 'md' | 'lg'

const markSize: Record<LogoSize, string> = {
  sm: 'size-7 rounded-[7px]',
  md: 'size-9 rounded-[9px]',
  lg: 'size-11 rounded-[11px]',
}

const textSize: Record<LogoSize, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
}

export function LogoMark({
  size = 'md',
  className,
}: {
  size?: LogoSize
  className?: string
}) {
  return (
    <span
      className={cn(
        'brand-gradient inline-flex items-center justify-center text-white shadow-[var(--shadow-brand)]',
        markSize[size],
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="size-[62%]" fill="none">
        <path
          d="M12.4 10V8.9A2.9 2.9 0 0 1 15.3 6h1.4a2.9 2.9 0 0 1 2.9 2.9V10"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <rect x="6" y="10.6" width="20" height="14" rx="3.2" fill="currentColor" />
        <rect x="13.9" y="14.6" width="4.2" height="3.6" rx="1.3" className="fill-brand-600" />
      </svg>
    </span>
  )
}

interface LogoProps {
  size?: LogoSize
  href?: string | null
  className?: string
  /** Ẩn phần chữ, chỉ hiện mark (dùng cho sidebar thu gọn) */
  markOnly?: boolean
  /** Dùng trên nền tối */
  inverted?: boolean
}

export default function Logo({
  size = 'md',
  href = '/',
  className,
  markOnly = false,
  inverted = false,
}: LogoProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      {!markOnly && (
        <span
          className={cn(
            'font-bold tracking-tight whitespace-nowrap',
            textSize[size],
            inverted ? 'text-white' : 'text-foreground',
          )}
        >
          Smart<span className="text-brand-500">Recruit</span>
        </span>
      )}
    </span>
  )

  if (!href) return content

  return (
    <Link href={href} aria-label="Smart Recruit — Trang chủ" className="inline-flex">
      {content}
    </Link>
  )
}
