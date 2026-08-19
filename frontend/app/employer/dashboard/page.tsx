'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import StatCard from '@/components/dashboard/StatCard'
import StatusBadge from '@/components/StatusBadge'
import EmptyState from '@/components/EmptyState'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Briefcase, Users, TrendingUp, Plus, Share2, Lock, Copy, MapPin } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import TaxonomyFilter, {
  hasTaxonomyFilter,
  type TaxonomyValue,
} from '@/components/filters/TaxonomyFilter'
import { getStoredUser } from '@/lib/auth-storage'
import { toast } from 'sonner'
import { formatDate, formatRelativeTime } from '@/lib/format'

type JobRow = {
  _id: string
  title: string
  location?: string
  status: string
  createdAt: string
  industry?: string
  specialization?: string
}

export default function EmployerDashboardPage() {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [welcome, setWelcome] = useState('Nhà tuyển dụng')
  const [stats, setStats] = useState({ totalApplications: 0, avgMatchScore: 0 })
  const [closeTarget, setCloseTarget] = useState<JobRow | null>(null)
  const [closing, setClosing] = useState(false)
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>({ industry: '', specialization: '' })

  useEffect(() => {
    const u = getStoredUser()
    if (u?.email) setWelcome(u.email.split('@')[0] || u.email)

    let cancelled = false
    ;(async () => {
      try {
        const [jobsRes, statsRes] = await Promise.allSettled([
          apiFetch<{ data: JobRow[] }>('/api/jobs/employer/my-jobs'),
          apiFetch<{ data: { totalApplications: number; avgMatchScore: number } }>(
            '/api/users/employer/stats',
          ),
        ])
        if (!cancelled) {
          setJobs(jobsRes.status === 'fulfilled' ? jobsRes.value.data || [] : [])
          if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
        }
      } catch {
        if (!cancelled) setJobs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const handleCloseJob = async () => {
    if (!closeTarget) return
    setClosing(true)
    try {
      await apiFetch(`/api/jobs/${closeTarget._id}/close`, { method: 'PATCH' })
      setJobs((prev) =>
        prev.map((j) => (j._id === closeTarget._id ? { ...j, status: 'closed' } : j)),
      )
      toast.success('Đã đóng tin tuyển dụng')
      setCloseTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không thể đóng tin')
    } finally {
      setClosing(false)
    }
  }

  const handleCloneJob = async (jobId: string) => {
    try {
      const res = await apiFetch<{ data: JobRow }>(`/api/jobs/${jobId}/clone`, { method: 'POST' })
      setJobs((prev) => [res.data, ...prev])
      toast.success('Đã tạo tin mới từ tin này')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không thể sao chép tin')
    }
  }

  const visibleJobs = jobs.filter(
    (j) =>
      (!taxonomy.industry || j.industry === taxonomy.industry) &&
      (!taxonomy.specialization || j.specialization === taxonomy.specialization),
  )

  const activeJobsCount = jobs.filter((j) => j.status === 'open').length

  return (
    <EmployerLayout>
      <PageContainer>
        <PageHeader
          title={`Xin chào, ${welcome}`}
          description="Quản lý tin tuyển dụng và tiếp cận ứng viên được AI xếp hạng theo độ phù hợp."
          actions={
            <>
              <Button asChild>
                <Link href="/employer/post-job">
                  <Plus />
                  Đăng tin tuyển dụng
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/employer/candidates">
                  <Users />
                  Xem ứng viên
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/fb-generator">
                  <Share2 />
                  Tạo bài đăng
                </Link>
              </Button>
            </>
          }
        />

        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Tin đang tuyển"
            value={activeJobsCount}
            icon={Briefcase}
            tone="brand"
            hint={`Trên tổng ${jobs.length} tin đã đăng`}
            loading={loading}
          />
          <StatCard
            label="Tổng hồ sơ nhận được"
            value={stats.totalApplications}
            icon={Users}
            tone="info"
            hint="Từ tất cả tin tuyển dụng"
            loading={loading}
          />
          <StatCard
            label="Điểm phù hợp trung bình"
            value={stats.totalApplications > 0 ? `${stats.avgMatchScore}%` : '—'}
            icon={TrendingUp}
            tone="violet"
            hint="Tính bằng độ tương đồng ngữ nghĩa CV – JD"
            loading={loading}
          />
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-bold">Tin tuyển dụng của bạn</h2>
            {jobs.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {activeJobsCount} tin đang mở / {jobs.length} tin
                {hasTaxonomyFilter(taxonomy) && ` · ${visibleJobs.length} tin khớp lọc`}
              </p>
            )}
          </div>

          {jobs.length > 0 && (
            <div className="surface-card mb-4 flex flex-wrap items-end gap-3 p-4">
              <TaxonomyFilter value={taxonomy} onChange={setTaxonomy} className="flex-1" />
              {hasTaxonomyFilter(taxonomy) && (
                <Button
                  variant="ghost"
                  onClick={() => setTaxonomy({ industry: '', specialization: '' })}
                >
                  Xoá lọc
                </Button>
              )}
            </div>
          )}

          <div className="surface-card overflow-hidden">
            {loading ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-12 w-full" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="Bạn chưa đăng tin tuyển dụng nào"
                description="Đăng tin đầu tiên để bắt đầu nhận hồ sơ ứng viên được AI chấm điểm phù hợp."
                action={{ label: 'Đăng tin đầu tiên', href: '/employer/post-job' }}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/60 text-left">
                      <th className="px-5 py-3 font-semibold">Tiêu đề tin</th>
                      <th className="px-5 py-3 font-semibold">Địa điểm</th>
                      <th className="px-5 py-3 font-semibold">Ngày đăng</th>
                      <th className="px-5 py-3 font-semibold">Trạng thái</th>
                      <th className="px-5 py-3 text-right font-semibold">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleJobs.map((job) => (
                      <tr
                        key={job._id}
                        className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/candidate/jobs/${job._id}`}
                            className="font-semibold transition-colors hover:text-brand-600"
                          >
                            {job.title}
                          </Link>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="size-3.5" />
                            {job.location || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="tabular-nums">{formatDate(job.createdAt)}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatRelativeTime(job.createdAt)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={job.status} size="sm" />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => handleCloneJob(job._id)}
                              title="Tạo tin mới từ tin này"
                            >
                              <Copy />
                              Nhân bản
                            </Button>
                            {job.status === 'open' && (
                              <Button
                                size="xs"
                                variant="ghost"
                                className="text-danger-foreground hover:bg-danger/10 hover:text-danger-foreground"
                                onClick={() => setCloseTarget(job)}
                                title="Đóng tin tuyển dụng"
                              >
                                <Lock />
                                Đóng tin
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
        </section>
      </PageContainer>

      <ConfirmDialog
        open={closeTarget !== null}
        onOpenChange={(open) => !open && setCloseTarget(null)}
        title="Đóng tin tuyển dụng?"
        description={`Tin “${closeTarget?.title ?? ''}” sẽ không còn hiển thị với ứng viên. Hồ sơ đã nhận vẫn được giữ nguyên.`}
        actionLabel="Đóng tin"
        destructive
        loading={closing}
        onConfirm={handleCloseJob}
      />
    </EmployerLayout>
  )
}
