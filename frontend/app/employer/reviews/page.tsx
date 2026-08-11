'use client'

import React, { useEffect, useState } from 'react'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import { EmployerReviewsPanel } from '@/components/reviews/CompanyReview'
import { getStoredUser } from '@/lib/auth-storage'

export default function EmployerReviewsPage() {
  const [companyUserId, setCompanyUserId] = useState('')

  useEffect(() => {
    setCompanyUserId(getStoredUser()?.id || '')
  }, [])

  return (
    <EmployerLayout>
      <PageContainer size="sm">
        <PageHeader
          title="Đánh giá công ty"
          description="Xem ứng viên đánh giá công ty bạn và phản hồi lại để tăng độ tin cậy với người tìm việc."
        />

        {companyUserId && <EmployerReviewsPanel companyUserId={companyUserId} />}
      </PageContainer>
    </EmployerLayout>
  )
}
