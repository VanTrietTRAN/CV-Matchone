import React from 'react'
import DashboardShell from '@/components/dashboard/DashboardShell'
import CandidateSidebar from '@/components/CandidateSidebar'

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell variant="candidate" sidebar={<CandidateSidebar />}>
      {children}
    </DashboardShell>
  )
}
