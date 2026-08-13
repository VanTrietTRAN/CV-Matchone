'use client'

import React from 'react'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import ChangePasswordForm from '@/components/auth/ChangePasswordForm'

export default function EmployerAccountSettingsPage() {
  return (
    <EmployerLayout>
      <PageContainer size="md">
        <PageHeader
          title="Tài khoản & bảo mật"
          description="Quản lý thông tin đăng nhập của tài khoản nhà tuyển dụng."
        />

        <div className="space-y-5">
          <ChangePasswordForm />
        </div>
      </PageContainer>
    </EmployerLayout>
  )
}
