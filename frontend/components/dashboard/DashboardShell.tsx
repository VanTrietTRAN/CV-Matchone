'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Logo from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Bell, LogOut, Menu, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiLogout } from '@/lib/api'
import { useUnreadCount } from '@/hooks/use-unread-count'
import { useRoleGuard } from '@/hooks/use-role-guard'
import { initials } from '@/lib/format'

type Variant = 'candidate' | 'employer' | 'admin'

const ROLE_LABEL: Record<Variant, string> = {
  candidate: 'Ứng viên',
  employer: 'Nhà tuyển dụng',
  admin: 'Quản trị viên',
}

const NOTIFICATIONS_HREF: Record<Variant, string | null> = {
  candidate: '/candidate/notifications',
  employer: '/employer/notifications',
  admin: null,
}

interface DashboardShellProps {
  variant: Variant
  sidebar: React.ReactNode
  children: React.ReactNode
  /** Khu vực admin dùng nền tối */
  tone?: 'light' | 'dark'
}

export default function DashboardShell({
  variant,
  sidebar,
  children,
  tone = 'light',
}: DashboardShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Chặn truy cập chéo vai trò + lấy đúng người đang đăng nhập
  const guard = useRoleGuard(variant)
  const user = guard.user

  const notificationsHref = NOTIFICATIONS_HREF[variant]
  const isDark = tone === 'dark'
  const unread = useUnreadCount(Boolean(notificationsHref))

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const signOut = async () => {
    await apiLogout()
    router.push(variant === 'employer' ? '/login?role=employer' : '/login')
  }

  // Sai vai trò thì không vẽ gì trong lúc đợi chuyển hướng, tránh nháy nội dung của khu vực khác
  if (guard.status === 'denied') {
    return (
      <div
        className={cn(
          'grid min-h-screen place-items-center',
          isDark ? 'bg-slate-950' : 'bg-background',
        )}
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={cn('min-h-screen', isDark ? 'bg-slate-950 text-slate-100' : 'bg-background')}>
      {/* Sidebar cố định trên desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r lg:block',
          isDark ? 'border-slate-800 bg-slate-950' : 'border-sidebar-border bg-sidebar',
        )}
      >
        {sidebar}
      </aside>

      {/* Sidebar dạng drawer trên mobile */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className={cn(
            'w-[280px] gap-0 p-0',
            isDark && 'border-slate-800 bg-slate-950 text-slate-100',
          )}
        >
          <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="lg:pl-[264px]">
        {/* Topbar */}
        <header
          className={cn(
            'sticky top-0 z-30 flex items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6',
            isDark
              ? 'border-slate-800 bg-slate-950/85'
              : 'border-border bg-card/85',
          )}
          style={{ height: 'var(--header-h)' }}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('lg:hidden', isDark && 'text-slate-300 hover:bg-white/10 hover:text-white')}
            onClick={() => setOpen(true)}
            aria-label="Mở menu"
          >
            <Menu className="size-5" />
          </Button>

          <div className="lg:hidden">
            <Logo size="sm" href={null} inverted={isDark} />
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {notificationsHref && (
              <Button
                asChild
                variant="ghost"
                size="icon-sm"
                className={cn('relative', isDark && 'text-slate-300 hover:bg-white/10 hover:text-white')}
              >
                <Link href={notificationsHref} aria-label="Thông báo">
                  <Bell className="size-[18px]" />
                  {unread > 0 && (
                    <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors',
                    isDark ? 'hover:bg-white/10' : 'hover:bg-muted',
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">
                    {initials(user?.email)}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[140px] truncate text-[13px] font-semibold">
                      {user?.email?.split('@')[0] ?? 'Tài khoản'}
                    </span>
                    <span
                      className={cn(
                        'block text-[11px]',
                        isDark ? 'text-slate-400' : 'text-muted-foreground',
                      )}
                    >
                      {user ? ROLE_LABEL[user.role] : '—'}
                    </span>
                  </span>
                  <ChevronDown className="size-4 opacity-60" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-semibold">{user?.email ?? 'Chưa đăng nhập'}</p>
                  <p className="text-xs text-muted-foreground">{user ? ROLE_LABEL[user.role] : '—'}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {variant === 'candidate' && (
                  <DropdownMenuItem asChild>
                    <Link href="/candidate/cv">Hồ sơ &amp; CV của tôi</Link>
                  </DropdownMenuItem>
                )}
                {variant === 'employer' && (
                  <DropdownMenuItem asChild>
                    <Link href="/employer/company-profile">Trang công ty</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={signOut}>
                  <LogOut />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-[calc(100vh-var(--header-h))]">{children}</main>
      </div>
    </div>
  )
}
