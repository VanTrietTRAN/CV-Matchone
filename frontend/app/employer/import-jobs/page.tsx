'use client'

import React from 'react'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import ExcelImporter from '@/components/shared/ExcelImporter'
import { useRouter } from 'next/navigation'

/**
 * Đăng nhiều tin tuyển dụng cùng lúc từ file Excel.
 * Tin được đăng ngay ở trạng thái đang mở và tự tạo vector AI để vào gợi ý.
 */
export default function EmployerImportJobsPage() {
  const router = useRouter()

  return (
    <EmployerLayout>
      <PageContainer size="md">
        <PageHeader
          title="Import tin tuyển dụng"
          description="Tải lên file Excel để đăng nhiều tin cùng lúc. Các cột đặt tên theo đúng nhãn ở trang Đăng tin tuyển dụng."
        />

        <section className="surface-card p-5 sm:p-6">
          <h2 className="mb-3 font-bold">Các cột trong file</h2>
          <div className="mb-5 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <p>• <strong className="text-foreground">Tiêu đề tin tuyển dụng</strong> — bắt buộc</p>
            <p>• <strong className="text-foreground">Mô tả chi tiết</strong> — bắt buộc</p>
            <p>• Kỹ năng bắt buộc</p>
            <p>• Kỹ năng là lợi thế</p>
            <p>• Quyền lợi</p>
            <p>• Ngành nghề · Vị trí chuyên môn</p>
            <p>• Hình thức làm việc · Địa điểm làm việc</p>
            <p>• Lương tối thiểu · Lương tối đa · Đơn vị tiền tệ</p>
            <p>• Kinh nghiệm yêu cầu · Yêu cầu học vấn</p>
            <p>• Hạn nộp hồ sơ</p>
          </div>
          <p className="mb-5 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Ô nhiều giá trị (kỹ năng, quyền lợi) ngăn nhau bằng dấu phẩy, chấm phẩy hoặc xuống
            dòng — giống ô nhập ở trang Đăng tin. Kỹ năng bắt buộc và kỹ năng là lợi thế đều
            được dùng để AI so khớp ứng viên; Quyền lợi hiển thị riêng ở mục Phúc lợi.
            Hạn nộp nhận cả dạng <code className="font-mono">31/12/2026</code> và{' '}
            <code className="font-mono">2026-12-31</code>.
          </p>

          <ExcelImporter
            endpoint="/api/jobs/import"
            templateUrl="/api/jobs/import/template"
            labels={{ unit: 'tin', createVerb: 'đăng' }}
            onDone={() => router.refresh()}
          />
        </section>
      </PageContainer>
    </EmployerLayout>
  )
}
