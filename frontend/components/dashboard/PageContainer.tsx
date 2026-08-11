import React from 'react'
import { cn } from '@/lib/utils'

const widths = {
  sm: 'max-w-3xl',
  md: 'max-w-4xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
  full: 'max-w-[1240px]',
} as const

interface PageContainerProps {
  children: React.ReactNode
  /** sm: form ngắn · md: form dài · lg: trang chi tiết · xl/full: danh sách & dashboard */
  size?: keyof typeof widths
  className?: string
}

export default function PageContainer({
  children,
  size = 'full',
  className,
}: PageContainerProps) {
  return (
    <div className={cn('mx-auto w-full p-4 sm:p-6 lg:p-8', widths[size], className)}>
      {children}
    </div>
  )
}
