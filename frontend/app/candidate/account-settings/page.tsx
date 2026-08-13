'use client'

import React from 'react'
import CandidateLayout from '@/layouts/CandidateLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import ChangePasswordForm from '@/components/auth/ChangePasswordForm'

export default function CandidateAccountSettingsPage() {
  return (
    <CandidateLayout>
      <PageContainer size="md">
        <PageHeader
          title="Tài khoản & bảo mật"
          description="Quản lý thông tin đăng nhập của tài khoản ứng viên."
        />

        <div className="space-y-5">
          <ChangePasswordForm />
        </div>
      </PageContainer>
    </CandidateLayout>
  )
}
