'use client'

import React from 'react'
import AdminLayout from '@/layouts/AdminLayout'
import ExcelImporter from '@/components/shared/ExcelImporter'
import { UsersRound } from 'lucide-react'

/**
 * Admin tạo hàng loạt tài khoản sinh viên từ file Excel của nhà trường.
 *
 * Mỗi sinh viên nhận một mật khẩu ngẫu nhiên qua email kèm link đăng nhập, và
 * bị bắt đổi mật khẩu ngay lần đăng nhập đầu tiên.
 */
export default function AdminImportUsersPage() {
  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <UsersRound className="size-6 text-brand-400" />
            Import tài khoản sinh viên
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Tải lên danh sách sinh viên từ file Excel. Hệ thống tạo tài khoản ứng viên với mật khẩu
            ngẫu nhiên, gửi email kèm thông tin đăng nhập, và bắt sinh viên đổi mật khẩu ở lần đăng
            nhập đầu tiên.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-3 text-sm font-bold tracking-wider text-slate-400 uppercase">
            Các cột trong file
          </h2>
          <div className="mb-5 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <p>• <strong className="text-white">Họ và tên</strong> — bắt buộc</p>
            <p>• <strong className="text-white">Email</strong> — bắt buộc, dùng để đăng nhập</p>
            <p>• Ngành học</p>
            <p>• Điện thoại</p>
            <p>• Ghi chú</p>
          </div>
          <p className="mb-5 rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
            Thiếu ba trường không bắt buộc vẫn tạo được tài khoản. Tiêu đề cột viết khác một chút
            (&quot;Họ tên&quot;, &quot;SĐT&quot;, &quot;Note&quot;...) hệ thống vẫn nhận ra.
          </p>

          <div className="rounded-xl bg-slate-950 p-5">
            <ExcelImporter
              endpoint="/api/admin/import/users"
              templateUrl="/api/admin/import/template/users"
              labels={{ unit: 'tài khoản', createVerb: 'tạo' }}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
