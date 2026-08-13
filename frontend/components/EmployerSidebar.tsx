'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import Logo from '@/components/brand/Logo'
import SidebarNav, { type NavItem } from '@/components/dashboard/SidebarNav'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  PlusCircle,
  Users,
  Star,
  Building2,
  Bell,
  Share2,
  Mail,
  KeyRound,
  LogOut,
} from 'lucide-react'
import { apiLogout } from '@/lib/api'
import { useUnreadCount } from '@/hooks/use-unread-count'

const baseItems: NavItem[] = [
  { label: 'Tổng quan', href: '/employer/dashboard', icon: LayoutDashboard },
  { label: 'Đăng tin tuyển dụng', href: '/employer/post-job', icon: PlusCircle },
  { label: 'Hồ sơ ứng viên', href: '/employer/candidates', icon: Users },
  { label: 'Đánh giá công ty', href: '/employer/reviews', icon: Star },
  { label: 'Trang công ty', href: '/employer/company-profile', icon: Building2 },
  { label: 'Thông báo', href: '/employer/notifications', icon: Bell },
  { label: 'Bài đăng mạng xã hội', href: '/fb-generator', icon: Share2 },
  { label: 'Cài đặt email', href: '/employer/email-settings', icon: Mail },
  { label: 'Tài khoản & bảo mật', href: '/employer/account-settings', icon: KeyRound },
]

export default function EmployerSidebar() {
  const router = useRouter()
  const unread = useUnreadCount()

  const items = baseItems.map((item) =>
    item.href === '/employer/notifications' ? { ...item, badge: unread } : item,
  )

  const signOut = async () => {
    await apiLogout()
    router.push('/login?role=employer')
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
          Nhà tuyển dụng
        </p>
        <SidebarNav items={items} />
      </div>

      <div className="shrink-0 space-y-1 border-t border-sidebar-border p-3">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-3 font-medium"
          onClick={signOut}
        >
          <LogOut className="size-[18px]" />
          Đăng xuất
        </Button>
        <p className="px-3 pt-1 text-[11px] text-muted-foreground">Smart Recruit v1.0</p>
      </div>
    </div>
  )
}
