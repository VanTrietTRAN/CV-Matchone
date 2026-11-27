'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/layouts/AdminLayout'
import ExcelImporter from '@/components/shared/ExcelImporter'
import EmployerPicker, { type EmployerOption } from '@/components/admin/EmployerPicker'
import { Briefcase, Building2, CheckCircle2 } from 'lucide-react'

/**
 * Admin đăng tin tuyển dụng hộ doanh nghiệp từ file Excel.
 *
 * Bắt buộc chọn doanh nghiệp đứng tên trước khi tải file: tin tạo ra mang
 * employerId của họ, nên từ lúc đó doanh nghiệp có toàn quyền với tin — sửa, gia
 * hạn, đóng, nhân bản, xem hồ sơ ứng tuyển — y như tin họ tự đăng. Không chọn ai
 * thì tin sẽ đứng tên tài khoản admin và doanh nghiệp không đụng vào được.
 */
export default function AdminImportJobsPage() {
  const [employer, setEmployer] = useState<EmployerOption | null>(null)

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Briefcase className="size-6 text-amber-400" />
            Import tin tuyển dụng cho doanh nghiệp
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Đăng nhiều tin cùng lúc từ file Excel và gán cho doanh nghiệp quản lý. Tin được gán
            thuộc về doanh nghiệp hoàn toàn, giống hệt tin do chính họ đăng.
          </p>
        </div>

        {/* Bước 1 — chọn doanh nghiệp đứng tên */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">
              1
            </span>
            <h2 className="text-sm font-bold tracking-wider text-slate-400 uppercase">
              Chọn doanh nghiệp đứng tên
            </h2>
          </div>

          <EmployerPicker
            value={employer?._id || ''}
            onChange={setEmployer}
            hint="Chưa có tài khoản doanh nghiệp? Tạo trước ở trang Import doanh nghiệp."
          />

          {employer && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-brand-500/30 bg-brand-500/10 p-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-400" />
              <p className="text-sm text-brand-100">
                Toàn bộ tin trong file sẽ đứng tên{' '}
                <strong>{employer.companyName || employer.email}</strong> và xuất hiện trong mục
                Quản lý tin tuyển dụng của tài khoản <strong>{employer.email}</strong>.
                {employer.status === 'banned' && (
                  <span className="mt-1 block text-amber-300">
                    Tài khoản này đang bị khoá — tin vẫn được tạo nhưng doanh nghiệp chưa đăng nhập
                    để quản lý được.
                  </span>
                )}
              </p>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">
            <Building2 className="mr-1 inline size-3.5" />
            Cần thêm doanh nghiệp mới?{' '}
            <Link href="/admin/import-employers" className="text-brand-400 hover:underline">
              Import tài khoản doanh nghiệp
            </Link>
          </p>
        </div>

        {/* Bước 2 — tải file tin tuyển dụng */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center gap-2">
            <span
              className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                employer ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-500'
              }`}
            >
              2
            </span>
            <h2 className="text-sm font-bold tracking-wider text-slate-400 uppercase">
              Tải file tin tuyển dụng
            </h2>
          </div>

          {!employer ? (
            <p className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-center text-sm text-slate-400">
              Chọn doanh nghiệp ở bước 1 để tiếp tục.
            </p>
          ) : (
            <>
              <div className="mb-5 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                <p>
                  • <strong className="text-white">Tiêu đề tin tuyển dụng</strong> — bắt buộc
                </p>
                <p>
                  • <strong className="text-white">Mô tả chi tiết</strong> — bắt buộc
                </p>
                <p>• Kỹ năng bắt buộc · Kỹ năng là lợi thế</p>
                <p>• Quyền lợi</p>
                <p>• Ngành nghề · Vị trí chuyên môn</p>
                <p>• Hình thức làm việc · Địa điểm làm việc</p>
                <p>• Lương tối thiểu · Lương tối đa · Đơn vị tiền tệ</p>
                <p>• Kinh nghiệm yêu cầu · Yêu cầu học vấn · Hạn nộp hồ sơ</p>
              </div>

              <div className="mb-5 space-y-2 rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
                <p>
                  Ô nhiều giá trị (kỹ năng, quyền lợi) ngăn nhau bằng dấu phẩy, chấm phẩy hoặc xuống
                  dòng. Kỹ năng bắt buộc và kỹ năng là lợi thế đều được đưa vào vector AI để so khớp
                  ứng viên.
                </p>
                <p>
                  Lương ghi số đủ theo lối Việt Nam, dấu chấm ngăn hàng nghìn:{' '}
                  <code className="font-mono">176.000</code>. Hạn nộp nhận cả{' '}
                  <code className="font-mono">31/12/2026</code> và{' '}
                  <code className="font-mono">2026-12-31</code>.
                </p>
              </div>

              <div className="rounded-xl bg-slate-950 p-5">
                <ExcelImporter
              tone="dark"
                  endpoint="/api/admin/import/jobs"
                  templateUrl="/api/admin/import/template/jobs"
                  extraFields={{ employerId: employer._id }}
                  labels={{ unit: 'tin', createVerb: 'đăng' }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
