'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import CandidateLayout from '@/layouts/CandidateLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import StatCard from '@/components/dashboard/StatCard'
import JobCard, { JobCardSkeleton } from '@/components/JobCard'
import StatusBadge from '@/components/StatusBadge'
import EmptyState from '@/components/EmptyState'
import ApplyCVModal from '@/components/ApplyCVModal'
import { Button } from '@/components/ui/button'
import {
  Briefcase,
  ClipboardCheck,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  FileText,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-storage'
import { formatDate } from '@/lib/format'

type ApiJob = {
  _id: string
  title: string
  description: string
  requirements?: string[]
  location?: string
  createdAt: string
  expiresAt?: string
  previewScore?: number | null
  employerId?: { email?: string } | string
}

type ApiApplication = {
  _id: string
  matchingScore: number
  status: string
  appliedAt: string
  jobId: ApiJob | string
}

function employerLabel(job: ApiJob): string {
  const e = job.employerId
  if (e && typeof e === 'object' && 'email' in e && e.email) return e.email
  return 'Nhà tuyển dụng'
}

export default function CandidateDashboardPage() {
  const [welcome, setWelcome] = useState('bạn')
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [applications, setApplications] = useState<ApiApplication[]>([])
  const [hasEmbedding, setHasEmbedding] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [applyModal, setApplyModal] = useState<{ jobId: string; jobTitle: string } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)

    // Ưu tiên endpoint có điểm phù hợp; nếu không khả dụng thì lấy danh sách thường
    try {
      const res = await apiFetch<{ data: ApiJob[]; hasEmbedding?: boolean }>(
        '/api/jobs/match-preview',
      )
      setJobs(res.data || [])
      setHasEmbedding(res.hasEmbedding ?? null)
    } catch {
      try {
        const res = await apiFetch<{ data: ApiJob[] }>('/api/jobs')
        setJobs(res.data || [])
      } catch {
        toast.error('Không tải được danh sách việc làm. Kiểm tra kết nối tới máy chủ.')
        setJobs([])
      }
    }

    try {
      const appRes = await apiFetch<{ data: ApiApplication[] }>('/api/applications/me')
      setApplications(appRes.data || [])
    } catch {
      setApplications([])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    const u = getStoredUser()
    if (u?.email) setWelcome(u.email.split('@')[0] || u.email)
    loadData()
  }, [loadData])

  const pendingCount = applications.filter((a) => a.status === 'pending').length
  const reviewedCount = applications.filter((a) => a.status === 'reviewed').length
  const acceptedCount = applications.filter((a) => a.status === 'accepted').length
  const averageMatch = applications.length
    ? Math.round(
        applications.reduce((s, a) => s + (a.matchingScore || 0), 0) / applications.length,
      )
    : 0

  const appliedIds = new Set(
    applications.map((a) => (typeof a.jobId === 'object' && a.jobId ? a.jobId._id : a.jobId)),
  )

  const recommended = [...jobs]
    .sort((a, b) => (b.previewScore ?? -1) - (a.previewScore ?? -1))
    .slice(0, 3)

  return (
    <>
      <CandidateLayout>
        <PageContainer>
          <PageHeader
            title={`Xin chào, ${welcome}`}
            description="Đây là bức tranh tổng quan về hành trình tìm việc của bạn."
            actions={
              <Button asChild>
                <Link href="/candidate/matches">
                  <Search />
                  Tìm việc làm
                </Link>
              </Button>
            }
          />

          {hasEmbedding === false && (
            <div className="mb-6 flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-brand-600" />
                <div>
                  <p className="font-semibold text-brand-800">CV của bạn chưa được AI phân tích</p>
                  <p className="mt-0.5 text-sm text-brand-800/80">
                    Tải CV lên để hệ thống chấm điểm phù hợp cho từng tin tuyển dụng.
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className="shrink-0">
                <Link href="/candidate/cv">Cập nhật CV ngay</Link>
              </Button>
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Chờ phản hồi"
              value={pendingCount}
              icon={Briefcase}
              tone="info"
              hint="Nhà tuyển dụng chưa xem"
              loading={loading}
            />
            <StatCard
              label="Đã được xem"
              value={reviewedCount}
              icon={ClipboardCheck}
              tone="violet"
              hint="Hồ sơ đã được mở"
              loading={loading}
            />
            <StatCard
              label="Trúng tuyển"
              value={acceptedCount}
              icon={CheckCircle2}
              tone="brand"
              hint="Chúc mừng bạn!"
              loading={loading}
            />
            <StatCard
              label="Điểm phù hợp trung bình"
              value={applications.length ? `${averageMatch}%` : '—'}
              icon={Sparkles}
              tone="warning"
              hint="Tính trên các hồ sơ đã nộp"
              loading={loading}
            />
          </section>

          {/* Việc làm gợi ý */}
          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Việc làm gợi ý cho bạn</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Sắp xếp theo mức độ phù hợp với hồ sơ của bạn
                </p>
              </div>
              <Button asChild variant="brandOutline" size="sm">
                <Link href="/candidate/matches">
                  Xem tất cả
                  <ArrowRight />
                </Link>
              </Button>
            </div>

            {loading ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <JobCardSkeleton key={i} />
                ))}
              </div>
            ) : recommended.length === 0 ? (
              <div className="surface-card">
                <EmptyState
                  icon={Briefcase}
                  title="Chưa có tin tuyển dụng nào"
                  description="Hiện chưa có vị trí nào đang mở. Hãy quay lại sau hoặc bật thông báo việc làm để không bỏ lỡ."
                  action={{ label: 'Cài đặt thông báo', href: '/candidate/notification-settings' }}
                />
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {recommended.map((job) => (
                  <JobCard
                    key={job._id}
                    id={job._id}
                    title={job.title}
                    company={employerLabel(job)}
                    location={job.location || 'Chưa cập nhật'}
                    skills={job.requirements || []}
                    matchScore={job.previewScore ?? undefined}
                    postedDate={job.createdAt}
                    expiresAt={job.expiresAt}
                    applied={appliedIds.has(job._id)}
                    onApply={() => setApplyModal({ jobId: job._id, jobTitle: job.title })}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Hồ sơ đã ứng tuyển */}
          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-lg font-bold">Hồ sơ ứng tuyển gần đây</h2>
              <Button asChild variant="outline" size="sm">
                <Link href="/candidate/applications">Xem tất cả</Link>
              </Button>
            </div>

            <div className="surface-card overflow-hidden">
              {applications.length === 0 ? (
                <EmptyState
                  icon={ClipboardCheck}
                  size="sm"
                  title="Bạn chưa ứng tuyển vị trí nào"
                  description="Hãy xem danh sách việc làm phù hợp và ứng tuyển vị trí đầu tiên của bạn."
                  action={{ label: 'Khám phá việc làm', href: '/candidate/matches' }}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/60 text-left">
                        <th className="px-5 py-3 font-semibold">Vị trí</th>
                        <th className="px-5 py-3 font-semibold">Nhà tuyển dụng</th>
                        <th className="px-5 py-3 font-semibold">Độ phù hợp</th>
                        <th className="px-5 py-3 font-semibold">Trạng thái</th>
                        <th className="px-5 py-3 font-semibold">Ngày nộp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.slice(0, 5).map((app) => {
                        const job =
                          typeof app.jobId === 'object' && app.jobId !== null ? app.jobId : null
                        return (
                          <tr
                            key={app._id}
                            className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                          >
                            <td className="px-5 py-3.5 font-semibold">
                              {job ? (
                                <Link
                                  href={`/candidate/jobs/${job._id}`}
                                  className="transition-colors hover:text-brand-600"
                                >
                                  {job.title}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-muted-foreground">
                              {job ? employerLabel(job) : '—'}
                            </td>
                            <td className="px-5 py-3.5 font-bold text-salary tabular-nums">
                              {app.matchingScore ?? 0}%
                            </td>
                            <td className="px-5 py-3.5">
                              <StatusBadge status={app.status} size="sm" />
                            </td>
                            <td className="px-5 py-3.5 text-muted-foreground tabular-nums">
                              {formatDate(app.appliedAt)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </PageContainer>
      </CandidateLayout>

      {applyModal && (
        <ApplyCVModal
          jobId={applyModal.jobId}
          jobTitle={applyModal.jobTitle}
          onClose={() => setApplyModal(null)}
          onSuccess={() => {
            loadData()
            setApplyModal(null)
          }}
        />
      )}
    </>
  )
}
