'use client'

import React from 'react'
import AdminLayout from '@/layouts/AdminLayout'
import { KeyRound } from 'lucide-react'
import ChangePasswordForm from '@/components/auth/ChangePasswordForm'

export default function AdminAccountSettingsPage() {
  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
            <KeyRound className="w-7 h-7 text-brand-400" /> Tài khoản & bảo mật
          </h1>
          <p className="text-sm text-slate-400">
            Quản lý thông tin đăng nhập của tài khoản quản trị.
          </p>
        </div>

        <ChangePasswordForm variant="admin" />

        <div className="mt-5 rounded-2xl border border-amber-900/40 bg-amber-950/30 p-4">
          <p className="text-sm leading-relaxed text-amber-300">
            <strong>Tài khoản quản trị có toàn quyền trên hệ thống.</strong> Dùng mật khẩu riêng,
            không trùng với bất kỳ tài khoản nào khác, và đổi ngay nếu nghi ngờ bị lộ. Việc đổi
            mật khẩu tại đây không ảnh hưởng tới phiên đăng nhập hiện tại của bạn.
          </p>
        </div>
      </div>
    </AdminLayout>
  )
}
