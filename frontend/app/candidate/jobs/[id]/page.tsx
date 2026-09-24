'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import CandidateLayout from '@/layouts/CandidateLayout'
import JobDetailView from '@/components/jobs/JobDetailView'

/**
 * Chi tiết tin tuyển dụng trong khu ứng viên — giữ sidebar và thanh điều hướng
 * của khu vực này. Phần nội dung tin dùng chung với trang công khai /jobs/[id]
 * (components/jobs/JobDetailView.tsx) để hai nơi không bao giờ lệch nhau.
 */
export default function CandidateJobDetailPage() {
  const params = useParams()
  const jobId = String(params?.id ?? '')

  return (
    <CandidateLayout>
      <JobDetailView jobId={jobId} basePath="/candidate/jobs" browseHref="/candidate/matches" />
    </CandidateLayout>
  )
}
