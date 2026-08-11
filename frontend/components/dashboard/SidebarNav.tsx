'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Hiện chấm đỏ (true) hoặc số lượng chưa đọc */
  badge?: boolean | number
  /** Chỉ active khi khớp chính xác đường dẫn */
  exact?: boolean
}

export function isNavItemActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface SidebarNavProps {
  items: NavItem[]
  /** Bảng màu tối cho khu vực admin */
  tone?: 'light' | 'dark'
  className?: string
}

export default function SidebarNav({ items, tone = 'light', className }: SidebarNavProps) {
  const pathname = usePathname() ?? ''

  return (
    <nav className={cn('flex flex-col gap-0.5', className)}>
      {items.map((item) => {
        const Icon = item.icon
        const active = isNavItemActive(pathname, item.href, item.exact)
        const badgeCount = typeof item.badge === 'number' ? item.badge : 0

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              tone === 'light'
                ? active
                  ? 'bg-brand-50 font-semibold text-brand-700'
                  : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                : active
                  ? 'bg-brand-500/15 font-semibold text-brand-500'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white',
            )}
          >
            {/* Thanh chỉ báo bên trái — dấu hiệu active quen thuộc của TopCV */}
            <span
              className={cn(
                'absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500 transition-opacity',
                active ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden="true"
            />

            <span className="relative shrink-0">
              <Icon className="size-[18px]" />
              {item.badge === true && (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger ring-2 ring-sidebar" />
              )}
            </span>

            <span className="flex-1 truncate">{item.label}</span>

            {badgeCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
