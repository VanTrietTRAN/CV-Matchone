'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import PublicLayout from '@/layouts/PublicLayout'
import JobDetailView from '@/components/jobs/JobDetailView'

/**
 * Chi tiết tin tuyển dụng ở khu công khai: khách vãng lai, ứng viên và nhà
 * tuyển dụng đang đăng nhập đều mở được cùng một đường dẫn.
 */
export default function PublicJobDetailPage() {
  const params = useParams()
  const jobId = String(params?.id ?? '')

  return (
    <PublicLayout>
      <JobDetailView jobId={jobId} basePath="/jobs" browseHref="/jobs" />
    </PublicLayout>
  )
}
