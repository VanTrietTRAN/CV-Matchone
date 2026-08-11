'use client'

import React from 'react'
import CandidateLayout from '@/layouts/CandidateLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import JobAlertsManager from '@/components/candidate/JobAlertsManager'
import EmailPreferences from '@/components/candidate/EmailPreferences'

export default function NotificationSettingsPage() {
  return (
    <CandidateLayout>
      <PageContainer size="md">
        <PageHeader
          title="Cài đặt thông báo"
          description="Chọn loại email bạn muốn nhận và tạo bộ lọc để được báo khi có việc làm phù hợp."
          breadcrumbs={[
            { label: 'Thông báo', href: '/candidate/notifications' },
            { label: 'Cài đặt' },
          ]}
        />

        <div className="space-y-5">
          <EmailPreferences />
          <JobAlertsManager />
        </div>
      </PageContainer>
    </CandidateLayout>
  )
}
