'use client'

import React, { useCallback, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/layouts/AdminLayout'
import ExcelImporter from '@/components/shared/ExcelImporter'
import WelcomeQueuePanel from '@/components/admin/WelcomeQueuePanel'
import { Building2, ArrowRight } from 'lucide-react'

/**
 * Admin tạo hàng loạt tài khoản doanh nghiệp từ file Excel.
 *
 * Chạy y như import sinh viên: tạo tài khoản với mật khẩu ngẫu nhiên, xếp thư
 * mời vào hàng đợi gửi nền, và bắt đổi mật khẩu ở lần đăng nhập đầu tiên. Khác
 * ở nội dung thư (thư mời doanh nghiệp) và ở chỗ mỗi dòng còn tạo kèm hồ sơ công
 * ty, để tên công ty hiện ngay trên các tin tuyển dụng đăng hộ.
 */
export default function AdminImportEmployersPage() {
  const [reloadKey, setReloadKey] = useState(0)
  const refreshQueue = useCallback(() => setReloadKey((k) => k + 1), [])

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Building2 className="size-6 text-brand-400" />
            Import tài khoản doanh nghiệp
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Tải lên danh sách doanh nghiệp từ file Excel. Hệ thống tạo tài khoản nhà tuyển dụng kèm
            hồ sơ công ty, gửi thư mời kèm mật khẩu đăng nhập lần đầu, và bắt doanh nghiệp đổi mật
            khẩu ngay khi đăng nhập.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-3 text-sm font-bold tracking-wider text-slate-400 uppercase">
            Các cột trong file
          </h2>
          <div className="mb-5 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <p>
              • <strong className="text-white">Tên doanh nghiệp</strong> — bắt buộc
            </p>
            <p>
              • <strong className="text-white">Email</strong> — bắt buộc, vừa là khoá chính vừa là
              tên đăng nhập
            </p>
            <p>• Số điện thoại</p>
            <p>• Địa chỉ</p>
          </div>

          <div className="mb-5 space-y-2 rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
            <p>
              Mỗi email chỉ ứng với một doanh nghiệp. Email đã có tài khoản ứng viên hoặc quản trị
              thì dòng đó báo lỗi chứ không đổi vai trò — đổi vai trò một tài khoản đang dùng sẽ làm
              mất toàn bộ dữ liệu bên kia.
            </p>
            <p>
              Doanh nghiệp đã import trước đó mà chưa đăng nhập lần nào sẽ được{' '}
              <strong className="text-slate-200">gửi lại thư mời</strong> với mật khẩu mới. Doanh
              nghiệp đã tự đăng ký hoặc đã đổi mật khẩu thì bỏ qua — không cấp lại mật khẩu tạm cho
              một tài khoản đang hoạt động.
            </p>
            <p>
              Tên công ty, điện thoại, địa chỉ chỉ điền vào những ô hồ sơ đang trống; phần doanh
              nghiệp đã tự sửa được giữ nguyên.
            </p>
          </div>

          <div className="rounded-xl bg-slate-950 p-5">
            <ExcelImporter
              tone="dark"
              endpoint="/api/admin/import/employers"
              templateUrl="/api/admin/import/template/employers"
              labels={{ unit: 'doanh nghiệp', createVerb: 'tạo', requeueUnit: 'thư mời' }}
              onDone={refreshQueue}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-2 text-sm font-bold tracking-wider text-slate-400 uppercase">
            Bước tiếp theo
          </h2>
          <p className="mb-4 text-sm text-slate-300">
            Sau khi có tài khoản, admin có thể import tin tuyển dụng và gán cho doanh nghiệp đứng
            tên. Tin được gán thuộc về họ hoàn toàn: sửa, gia hạn, đóng tin, xem hồ sơ ứng tuyển —
            giống hệt tin do chính doanh nghiệp đăng.
          </p>
          <Link
            href="/admin/import-jobs"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
          >
            Import tin tuyển dụng cho doanh nghiệp
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <WelcomeQueuePanel
          key={reloadKey}
          role="employer"
          unitLabel="doanh nghiệp"
          skippedNote="doanh nghiệp đã tự đặt mật khẩu trước khi tới lượt gửi — gửi mật khẩu tạm mới sẽ ghi đè mật khẩu họ đang dùng."
        />
      </div>
    </AdminLayout>
  )
}
