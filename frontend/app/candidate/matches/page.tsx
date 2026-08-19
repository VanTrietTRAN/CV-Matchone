'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import CandidateLayout from '@/layouts/CandidateLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import JobCard, { JobCardSkeleton } from '@/components/JobCard'
import EmptyState from '@/components/EmptyState'
import ApplyCVModal from '@/components/ApplyCVModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X, RefreshCw, SlidersHorizontal, FileText, Briefcase } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import TaxonomyFilter, {
  hasTaxonomyFilter,
  type TaxonomyValue,
} from '@/components/filters/TaxonomyFilter'
import { toast } from 'sonner'

type ApiJob = {
  _id: string
  title: string
  description: string
  requirements?: string[]
  location?: string
  industry?: string
  specialization?: string
  status: string
  createdAt: string
  expiresAt?: string
  employerId?: { email?: string } | string
  previewScore: number | null // null = CV chưa có embedding
}

type SortKey = 'match' | 'newest' | 'deadline'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'match', label: 'Độ phù hợp cao nhất' },
  { value: 'newest', label: 'Tin mới nhất' },
  { value: 'deadline', label: 'Sắp hết hạn' },
]

function getEmployerName(job: ApiJob): string {
  const e = job.employerId
  if (e && typeof e === 'object' && 'email' in e && e.email) return e.email
  return 'Nhà tuyển dụng'
}

function MatchesContent() {
  const searchParams = useSearchParams()

  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [hasEmbedding, setHasEmbedding] = useState<boolean | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [locationFilter, setLocationFilter] = useState<string | null>(null)
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>({ industry: '', specialization: '' })
  const [sort, setSort] = useState<SortKey>('match')
  const [applyModal, setApplyModal] = useState<{ jobId: string; jobTitle: string } | null>(null)

  // Nhận từ khoá/địa điểm từ ô tìm kiếm ngoài trang chủ
  useEffect(() => {
    const q = searchParams.get('q')
    const loc = searchParams.get('location')
    if (q) setSearchText(q)
    if (loc) setLocationFilter(loc)
  }, [searchParams])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [matchRes, appsRes] = await Promise.allSettled([
        apiFetch<{ data: ApiJob[]; hasEmbedding: boolean }>('/api/jobs/match-preview'),
        apiFetch<{ data: { jobId: { _id: string } | string }[] }>('/api/applications/me'),
      ])

      if (matchRes.status === 'fulfilled') {
        setJobs(matchRes.value.data || [])
        setHasEmbedding(matchRes.value.hasEmbedding ?? false)
      } else {
        toast.error('Không tải được danh sách việc làm')
      }

      if (appsRes.status === 'fulfilled') {
        setAppliedIds(
          new Set(
            (appsRes.value.data || []).map((a) =>
              typeof a.jobId === 'object' && a.jobId ? a.jobId._id : (a.jobId as string),
            ),
          ),
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const uniqueLocations = useMemo(
    () => [...new Set(jobs.map((j) => j.location).filter(Boolean))] as string[],
    [jobs],
  )

  const filteredJobs = useMemo(() => {
    let result = [...jobs]

    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          (j.description || '').toLowerCase().includes(q) ||
          (j.requirements || []).some((r) => r.toLowerCase().includes(q)),
      )
    }

    if (locationFilter) {
      result = result.filter((j) => j.location === locationFilter)
    }

    if (taxonomy.industry) {
      result = result.filter((j) => j.industry === taxonomy.industry)
    }
    if (taxonomy.specialization) {
      result = result.filter((j) => j.specialization === taxonomy.specialization)
    }

    result.sort((a, b) => {
      if (sort === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      if (sort === 'deadline') {
        const at = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY
        const bt = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY
        return at - bt
      }
      // match: null xuống cuối danh sách
      if (a.previewScore === null && b.previewScore === null) return 0
      if (a.previewScore === null) return 1
      if (b.previewScore === null) return -1
      return b.previewScore - a.previewScore
    })

    return result
  }, [jobs, searchText, locationFilter, taxonomy, sort])

  const hasFilter = Boolean(searchText || locationFilter) || hasTaxonomyFilter(taxonomy)
  const clearFilters = () => {
    setSearchText('')
    setLocationFilter(null)
    setTaxonomy({ industry: '', specialization: '' })
  }

  return (
    <>
      <CandidateLayout>
        <PageContainer>
          <PageHeader
            title="Việc làm phù hợp"
            description="Danh sách được chấm điểm dựa trên CV của bạn — vị trí phù hợp nhất hiển thị trước."
            actions={
              <Button variant="outline" onClick={loadData} disabled={loading}>
                <RefreshCw className={loading ? 'animate-spin' : ''} />
                Làm mới
              </Button>
            }
          />

          {hasEmbedding === false && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-brand-600" />
                <div>
                  <p className="font-semibold text-brand-800">
                    CV của bạn chưa được phân tích bằng AI
                  </p>
                  <p className="mt-0.5 text-sm text-brand-800/80">
                    Vào mục Hồ sơ &amp; CV, tải CV lên rồi lưu lại để nhận điểm phù hợp cho từng vị
                    trí.
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className="shrink-0">
                <Link href="/candidate/cv">Cập nhật CV</Link>
              </Button>
            </div>
          )}

          {/* Thanh lọc dính khi cuộn — giống trang tìm việc của TopCV */}
          <div className="surface-card sticky top-[calc(var(--header-h)+8px)] z-20 mb-5 p-3.5 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Tìm theo vị trí, kỹ năng, mô tả công việc..."
                  aria-label="Từ khoá tìm việc"
                  className="pl-10"
                />
              </div>

              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SlidersHorizontal className="size-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <TaxonomyFilter
                value={taxonomy}
                onChange={setTaxonomy}
                showLabels={false}
                className="w-full sm:w-auto sm:flex-nowrap"
              />

              {hasFilter && (
                <Button variant="outline" onClick={clearFilters} className="shrink-0">
                  <X />
                  Xoá lọc
                </Button>
              )}
            </div>

            {uniqueLocations.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <span className="text-sm font-medium text-muted-foreground">Địa điểm:</span>
                {uniqueLocations.slice(0, 8).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    data-active={locationFilter === loc}
                    onClick={() => setLocationFilter(locationFilter === loc ? null : loc)}
                    className="chip py-1 text-[13px]"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="mb-4 text-sm text-muted-foreground">
            {loading ? (
              'Đang tải việc làm...'
            ) : (
              <>
                Tìm thấy <strong className="text-foreground">{filteredJobs.length}</strong> vị trí
                {hasFilter ? ' phù hợp với bộ lọc' : ' đang tuyển'}
              </>
            )}
          </p>

          {loading ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="surface-card">
              <EmptyState
                icon={Briefcase}
                title={hasFilter ? 'Không có việc làm khớp bộ lọc' : 'Chưa có tin tuyển dụng nào'}
                description={
                  hasFilter
                    ? 'Thử bỏ bớt điều kiện lọc hoặc dùng từ khoá tổng quát hơn.'
                    : 'Hiện chưa có vị trí nào đang mở. Bật thông báo để nhận tin ngay khi có việc làm mới.'
                }
              >
                {hasFilter ? (
                  <Button onClick={clearFilters}>Xoá bộ lọc</Button>
                ) : (
                  <Button asChild>
                    <Link href="/candidate/notification-settings">Cài đặt thông báo</Link>
                  </Button>
                )}
              </EmptyState>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredJobs.map((job, index) => (
                <JobCard
                  key={job._id}
                  id={job._id}
                  title={job.title}
                  company={getEmployerName(job)}
                  location={job.location || 'Chưa cập nhật'}
                  skills={job.requirements || []}
                  matchScore={job.previewScore}
                  postedDate={job.createdAt}
                  expiresAt={job.expiresAt}
                  applied={appliedIds.has(job._id)}
                  rank={sort === 'match' && job.previewScore !== null && index < 3 ? index + 1 : undefined}
                  onApply={() => setApplyModal({ jobId: job._id, jobTitle: job.title })}
                />
              ))}
            </div>
          )}
        </PageContainer>
      </CandidateLayout>

      {applyModal && (
        <ApplyCVModal
          jobId={applyModal.jobId}
          jobTitle={applyModal.jobTitle}
          onClose={() => setApplyModal(null)}
          onSuccess={(jid) => setAppliedIds((prev) => new Set([...prev, jid]))}
        />
      )}
    </>
  )
}

export default function MatchesPage() {
  return (
    <Suspense
      fallback={
        <CandidateLayout>
          <PageContainer>
            <div className="skeleton h-9 w-64" />
          </PageContainer>
        </CandidateLayout>
      }
    >
      <MatchesContent />
    </Suspense>
  )
}
