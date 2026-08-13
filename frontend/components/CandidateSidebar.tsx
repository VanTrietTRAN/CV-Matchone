'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import Logo from '@/components/brand/Logo'
import SidebarNav, { type NavItem } from '@/components/dashboard/SidebarNav'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Sparkles,
  FileText,
  ClipboardCheck,
  Bell,
  Settings,
  KeyRound,
  LogOut,
} from 'lucide-react'
import { apiLogout } from '@/lib/api'
import { useUnreadCount } from '@/hooks/use-unread-count'

const baseItems: NavItem[] = [
  { label: 'Tổng quan', href: '/candidate/dashboard', icon: LayoutDashboard },
  { label: 'Việc làm phù hợp', href: '/candidate/matches', icon: Sparkles },
  { label: 'Việc đã ứng tuyển', href: '/candidate/applications', icon: ClipboardCheck },
  { label: 'Hồ sơ & CV', href: '/candidate/cv', icon: FileText },
  { label: 'Thông báo', href: '/candidate/notifications', icon: Bell },
  { label: 'Cài đặt thông báo', href: '/candidate/notification-settings', icon: Settings },
  { label: 'Tài khoản & bảo mật', href: '/candidate/account-settings', icon: KeyRound },
]

export default function CandidateSidebar() {
  const router = useRouter()
  const unread = useUnreadCount()

  const items = baseItems.map((item) =>
    item.href === '/candidate/notifications' ? { ...item, badge: unread } : item,
  )

  const signOut = async () => {
    await apiLogout()
    router.push('/login')
  }

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div
        className="flex shrink-0 items-center border-b border-sidebar-border px-5"
        style={{ height: 'var(--header-h)' }}
      >
        <Logo size="sm" />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          Ứng viên
        </p>
        <SidebarNav items={items} />
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-3 font-medium"
          onClick={signOut}
        >
          <LogOut className="size-[18px]" />
          Đăng xuất
        </Button>
        <p className="px-3 pt-2 text-[11px] text-muted-foreground">Smart Recruit v1.0</p>
      </div>
    </div>
  )
}
