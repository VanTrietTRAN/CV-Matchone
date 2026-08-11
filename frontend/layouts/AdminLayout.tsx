import React from 'react'
import DashboardShell from '@/components/dashboard/DashboardShell'
import AdminSidebar from '@/components/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell variant="admin" tone="dark" sidebar={<AdminSidebar />}>
      {children}
    </DashboardShell>
  )
}
