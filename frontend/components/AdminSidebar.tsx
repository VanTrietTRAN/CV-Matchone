'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { LogoMark } from '@/components/brand/Logo'
import SidebarNav, { type NavItem } from '@/components/dashboard/SidebarNav'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Cpu,
  Megaphone,
  FileCheck2,
  Star,
  Server,
  KeyRound,
  LogOut,
} from 'lucide-react'
import { apiLogout } from '@/lib/api'

const navItems: NavItem[] = [
  { label: 'Tổng quan', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Tài khoản', href: '/admin/users', icon: Users },
  { label: 'Tin tuyển dụng', href: '/admin/jobs', icon: Briefcase },
  { label: 'AI Worker & CV', href: '/admin/ai-monitor', icon: Cpu },
  { label: 'Phát thông báo', href: '/admin/broadcast', icon: Megaphone },
  { label: 'Nhật ký Audit', href: '/admin/audit-logs', icon: FileCheck2 },
  { label: 'Đánh giá', href: '/admin/reviews', icon: Star },
  { label: 'Hệ thống', href: '/admin/system', icon: Server },
  { label: 'Tài khoản & bảo mật', href: '/admin/account-settings', icon: KeyRound },
]

export default function AdminSidebar() {
  const router = useRouter()

  const signOut = async () => {
    await apiLogout()
    router.push('/login')
  }

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div
        className="flex shrink-0 items-center gap-2.5 border-b border-slate-800 px-5"
        style={{ height: 'var(--header-h)' }}
      >
        <LogoMark size="sm" />
        <div>
          <p className="text-sm leading-none font-bold text-white">Smart Recruit</p>
          <p className="mt-1 text-[11px] font-semibold text-brand-500">Bảng điều khiển Admin</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          Quản trị
        </p>
        <SidebarNav items={navItems} tone="dark" />
      </div>

      <div className="shrink-0 border-t border-slate-800 p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-400 hover:bg-danger/10 hover:text-danger"
          onClick={signOut}
        >
          <LogOut className="size-[18px]" />
          Đăng xuất
        </Button>
        <p className="px-3 pt-2 text-[11px] text-slate-600">Smart Recruit v1.0</p>
      </div>
    </div>
  )
}
