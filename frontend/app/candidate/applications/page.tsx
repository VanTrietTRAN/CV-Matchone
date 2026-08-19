'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import CandidateLayout from '@/layouts/CandidateLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import StatCard from '@/components/dashboard/StatCard'
import StatusBadge, { STATUS_LABEL } from '@/components/StatusBadge'
import EmptyState from '@/components/EmptyState'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw, ClipboardCheck, Clock, Eye, CheckCircle2, Building2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { ReviewCompanyButton } from '@/components/reviews/CompanyReview'
import { formatDate, formatRelativeTime } from '@/lib/format'
import { matchTone } from '@/components/MatchBadge'
import { cn } from '@/lib/utils'

type ApiJob = {
  _id: string
  title: string
  location?: string
  employerId?: { _id?: string; email?: string } | string
}

type Application = {
  _id: string
  jobId: ApiJob | string | null
  matchingScore: number
  status: string
  appliedAt: string
}

// Nhãn lấy từ STATUS_LABEL để tab, badge và toast luôn gọi cùng một tên trạng thái.
const TABS = [
  { value: 'all', label: 'Tất cả' },
  ...['pending', 'reviewed', 'interview', 'accepted', 'rejected'].map((value) => ({
    value,
    label: STATUS_LABEL[value] ?? value,
  })),
]

function getJob(app: Application): ApiJob | null {
  return typeof app.jobId === 'object' && app.jobId !== null ? app.jobId : null
}

function getJobId(app: Application): string {
  const j = getJob(app)
  return j ? j._id : typeof app.jobId === 'string' ? app.jobId : ''
}

function getEmployerEmail(app: Application): string {
  const e = getJob(app)?.employerId
  if (e && typeof e === 'object' && 'email' in e) return e.email || 'Nhà tuyển dụng'
  return 'Nhà tuyển dụng'
}

function getEmployerId(app: Application): string {
  const e = getJob(app)?.employerId
  if (e && typeof e === 'object' && '_id' in e) return e._id || ''
  return typeof e === 'string' ? e : ''
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [cancelTarget, setCancelTarget] = useState<Application | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const loadApplications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: Application[] }>('/api/applications/me')
      setApplications(res.data || [])
    } catch {
      toast.error('Không tải được danh sách đơn ứng tuyển')
      setApplications([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadApplications()
  }, [loadApplications])

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: applications.length }
    for (const t of TABS.slice(1)) {
      map[t.value] = applications.filter((a) => a.status === t.value).length
    }
    return map
  }, [applications])

  const visible = tab === 'all' ? applications : applications.filter((a) => a.status === tab)

  const handleCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await apiFetch(`/api/applications/${cancelTarget._id}`, { method: 'DELETE' })
      toast.success('Đã huỷ đơn ứng tuyển')
      setCancelTarget(null)
      loadApplications()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không thể huỷ đơn ứng tuyển')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <CandidateLayout>
      <PageContainer>
        <PageHeader
          title="Việc làm đã ứng tuyển"
          description="Theo dõi trạng thái từng hồ sơ và điểm phù hợp tại thời điểm ứng tuyển."
          actions={
            <Button variant="outline" onClick={loadApplications} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              Làm mới
            </Button>
          }
        />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Tổng hồ sơ"
            value={counts.all}
            icon={ClipboardCheck}
            tone="neutral"
            loading={loading}
          />
          <StatCard
            label="Chờ duyệt"
            value={counts.pending ?? 0}
            icon={Clock}
            tone="info"
            loading={loading}
          />
          <StatCard
            label="Đang xem xét"
            value={counts.reviewed ?? 0}
            icon={Eye}
            tone="violet"
            loading={loading}
          />
          <StatCard
            label="Chấp nhận"
            value={counts.accepted ?? 0}
            icon={CheckCircle2}
            tone="brand"
            loading={loading}
          />
        </section>

        <div className="mt-7">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="flex-none px-3 py-2">
                  {t.label}
                  <span className="ml-1 text-xs opacity-70">({counts[t.value] ?? 0})</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="surface-card mt-4 overflow-hidden">
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-14 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={
                tab === 'all' ? 'Bạn chưa ứng tuyển vị trí nào' : 'Không có hồ sơ ở trạng thái này'
              }
              description={
                tab === 'all'
                  ? 'Khám phá danh sách việc làm phù hợp và ứng tuyển vị trí đầu tiên.'
                  : 'Hãy chọn tab khác để xem các hồ sơ còn lại.'
              }
              action={tab === 'all' ? { label: 'Tìm việc làm', href: '/candidate/matches' } : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-left">
                    <th className="px-5 py-3 font-semibold">Vị trí &amp; nhà tuyển dụng</th>
                    <th className="px-5 py-3 font-semibold">Độ phù hợp</th>
                    <th className="px-5 py-3 font-semibold">Trạng thái</th>
                    <th className="px-5 py-3 font-semibold">Ngày nộp</th>
                    <th className="px-5 py-3 text-right font-semibold">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((app) => (
                    <tr
                      key={app._id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-5 py-4">
                        <Link href={`/candidate/jobs/${getJobId(app)}`} className="group block">
                          <p className="font-semibold transition-colors group-hover:text-brand-600">
                            {getJob(app)?.title || '—'}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Building2 className="size-3" />
                            {getEmployerEmail(app)}
                          </p>
                        </Link>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-bold tabular-nums',
                            matchTone(app.matchingScore ?? null),
                          )}
                        >
                          {app.matchingScore ? `${app.matchingScore}%` : 'Chưa chấm'}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={app.status} size="sm" />
                      </td>

                      <td className="px-5 py-4">
                        <p className="tabular-nums">{formatDate(app.appliedAt)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatRelativeTime(app.appliedAt)}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {['reviewed', 'interview', 'accepted'].includes(app.status) &&
                            getEmployerId(app) && (
                              <ReviewCompanyButton
                                companyUserId={getEmployerId(app)}
                                companyName={getEmployerEmail(app)}
                              />
                            )}
                          {['pending', 'reviewed'].includes(app.status) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger-foreground hover:bg-danger/10 hover:text-danger-foreground"
                              onClick={() => setCancelTarget(app)}
                            >
                              Huỷ đơn
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageContainer>

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Huỷ đơn ứng tuyển?"
        description={`Đơn ứng tuyển cho vị trí “${getJob(cancelTarget ?? ({} as Application))?.title ?? ''}” sẽ bị xoá khỏi hệ thống. Bạn có thể ứng tuyển lại sau nếu tin vẫn còn hạn.`}
        actionLabel="Huỷ đơn"
        destructive
        loading={cancelling}
        onConfirm={handleCancel}
      />
    </CandidateLayout>
  )
}
