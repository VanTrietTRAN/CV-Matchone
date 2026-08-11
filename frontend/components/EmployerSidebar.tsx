'use client'

import React, { useState } from 'react'
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
  ArrowLeftRight,
  Loader2,
  LogOut,
} from 'lucide-react'
import { apiFetch, apiLogout } from '@/lib/api'
import { useUnreadCount } from '@/hooks/use-unread-count'
import { setAuth } from '@/lib/auth-storage'
import { toast } from 'sonner'

const baseItems: NavItem[] = [
  { label: 'Tổng quan', href: '/employer/dashboard', icon: LayoutDashboard },
  { label: 'Đăng tin tuyển dụng', href: '/employer/post-job', icon: PlusCircle },
  { label: 'Hồ sơ ứng viên', href: '/employer/candidates', icon: Users },
  { label: 'Đánh giá công ty', href: '/employer/reviews', icon: Star },
  { label: 'Trang công ty', href: '/employer/company-profile', icon: Building2 },
  { label: 'Thông báo', href: '/employer/notifications', icon: Bell },
  { label: 'Bài đăng mạng xã hội', href: '/fb-generator', icon: Share2 },
  { label: 'Cài đặt email', href: '/employer/email-settings', icon: Mail },
]

export default function EmployerSidebar() {
  const router = useRouter()
  const [switching, setSwitching] = useState(false)
  const unread = useUnreadCount()

  const items = baseItems.map((item) =>
    item.href === '/employer/notifications' ? { ...item, badge: unread } : item,
  )

  const signOut = async () => {
    await apiLogout()
    router.push('/login?role=employer')
  }

  const handleSwitchRole = async () => {
    setSwitching(true)
    try {
      const res = await apiFetch<{ data: { _id: string; email: string; role: string } }>(
        '/api/users/me/switch-role',
        { method: 'PATCH' },
      )
      const user = res.data
      setAuth({
        id: user._id,
        email: user.email,
        role: user.role as 'candidate' | 'employer' | 'admin',
      })
      toast.success('Đã chuyển sang giao diện Ứng viên')
      router.push('/candidate/dashboard')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Đổi vai trò thất bại')
    } finally {
      setSwitching(false)
    }
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
          variant="soft"
          className="w-full justify-start gap-3"
          onClick={handleSwitchRole}
          disabled={switching}
        >
          {switching ? (
            <Loader2 className="size-[18px] animate-spin" />
          ) : (
            <ArrowLeftRight className="size-[18px]" />
          )}
          Chuyển sang Ứng viên
        </Button>

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
