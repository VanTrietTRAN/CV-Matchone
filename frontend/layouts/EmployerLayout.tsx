import React from 'react'
import DashboardShell from '@/components/dashboard/DashboardShell'
import EmployerSidebar from '@/components/EmployerSidebar'

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell variant="employer" sidebar={<EmployerSidebar />}>
      {children}
    </DashboardShell>
  )
}
