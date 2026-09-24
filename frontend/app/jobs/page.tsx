'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import PublicLayout from '@/layouts/PublicLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import JobCard, { JobCardSkeleton } from '@/components/JobCard'
import EmptyState from '@/components/EmptyState'
import ApplyCVModal from '@/components/ApplyCVModal'
import ProBadge from '@/components/ProBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X, SlidersHorizontal, Briefcase, Sparkles } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import TaxonomyFilter, {
  applyTaxonomyParams,
  hasTaxonomyFilter,
  type TaxonomyValue,
} from '@/components/filters/TaxonomyFilter'
import { useSession } from '@/hooks/use-session'
import { toast } from 'sonner'

type ApiJob = {
  _id: string
  title: string
  description: string
  requirements?: string[]
  location?: string
  salary?: string
  salaryMin?: number | null
  salaryMax?: number | null
  currency?: string
  industry?: string
  specialization?: string
  status: string
  createdAt: string
  expiresAt?: string
  employerId?: { email?: string } | string
  isPro?: boolean
}

type SortKey = 'newest' | 'deadline'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Tin mới nhất' },
  { value: 'deadline', label: 'Sắp hết hạn' },
]

function getEmployerName(job: ApiJob): string {
  const e = job.employerId
  if (e && typeof e === 'object' && 'email' in e && e.email) return e.email
  return 'Nhà tuyển dụng'
}

function JobsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useSession()
  const isCandidate = user?.role === 'candidate'
  const isEmployerViewer = user?.role === 'employer' || user?.role === 'admin'

  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  // Ô nhập tách khỏi từ khoá đang tìm: gõ tới đâu gọi API tới đó thì mỗi chữ cái
  // là một lượt quét toàn bộ tin.
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [locationFilter, setLocationFilter] = useState<string | null>(null)
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>({ industry: '', specialization: '' })
  const [sort, setSort] = useState<SortKey>('newest')
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [applyModal, setApplyModal] = useState<{ jobId: string; jobTitle: string } | null>(null)

  // Nhận điều kiện tìm từ ô tìm kiếm ngoài trang chủ và từ link được chia sẻ
  useEffect(() => {
    const q = searchParams.get('q') || ''
    setKeyword(q)
    setQuery(q)
    setLocationFilter(searchParams.get('location'))
    setTaxonomy({
      industry: searchParams.get('industry') || '',
      specialization: searchParams.get('specialization') || '',
    })
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    applyTaxonomyParams(params, taxonomy)

    apiFetch<{ data: ApiJob[] }>(`/api/jobs?${params}`)
      .then((res) => {
        if (!cancelled) setJobs(res.data || [])
      })
      .catch(() => {
        if (!cancelled) {
          setJobs([])
          toast.error('Không tải được danh sách việc làm')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [query, taxonomy])

  // Ứng viên đã đăng nhập thì thẻ tin hiện luôn "Đã ứng tuyển" cho tin đã nộp
  useEffect(() => {
    if (!isCandidate) {
      setAppliedIds(new Set())
      return
    }
    apiFetch<{ data: { jobId: { _id: string } | string }[] }>('/api/applications/me')
      .then((res) =>
        setAppliedIds(
          new Set(
            (res.data || []).map((a) =>
              typeof a.jobId === 'object' && a.jobId ? a.jobId._id : (a.jobId as string),
            ),
          ),
        ),
      )
      .catch(() => setAppliedIds(new Set()))
  }, [isCandidate])

  /** Ghi điều kiện tìm vào URL để copy link ra là mở lại đúng kết quả đó. */
  const pushSearch = useCallback(
    (next: { q?: string; location?: string | null; taxonomy?: TaxonomyValue }) => {
      const params = new URLSearchParams()
      const q = next.q ?? query
      const loc = next.location !== undefined ? next.location : locationFilter
      const tax = next.taxonomy ?? taxonomy
      if (q.trim()) params.set('q', q.trim())
      if (loc) params.set('location', loc)
      applyTaxonomyParams(params, tax)
      const qs = params.toString()
      router.replace(qs ? `/jobs?${qs}` : '/jobs', { scroll: false })
    },
    [query, locationFilter, taxonomy, router],
  )

  const uniqueLocations = useMemo(
    () => [...new Set(jobs.map((j) => j.location).filter(Boolean))] as string[],
    [jobs],
  )

  const visibleJobs = useMemo(() => {
    const result = locationFilter ? jobs.filter((j) => j.location === locationFilter) : [...jobs]

    // Tin của doanh nghiệp PRO luôn đứng trước, đổi kiểu sắp xếp chỉ đổi thứ tự
    // bên trong từng nhóm — server cũng trả về theo đúng quy tắc này.
    result.sort((a, b) => {
      if (Boolean(a.isPro) !== Boolean(b.isPro)) return a.isPro ? -1 : 1
      if (sort === 'deadline') {
        const at = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY
        const bt = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY
        return at - bt
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return result
  }, [jobs, locationFilter, sort])

  const proCount = useMemo(() => visibleJobs.filter((j) => j.isPro).length, [visibleJobs])
  const hasFilter = Boolean(query || locationFilter) || hasTaxonomyFilter(taxonomy)

  const clearFilters = () => {
    setKeyword('')
    setQuery('')
    setLocationFilter(null)
    setTaxonomy({ industry: '', specialization: '' })
    router.replace('/jobs', { scroll: false })
  }

  const handleApply = (jobId: string, jobTitle: string) => {
    if (!isCandidate) {
      toast.info('Đăng nhập bằng tài khoản ứng viên để ứng tuyển vị trí này.')
      router.push('/login')
      return
    }
    setApplyModal({ jobId, jobTitle })
  }

  return (
    <>
      <PageContainer>
        <div className="mb-5">
          <h1 className="text-2xl font-bold sm:text-3xl">Tìm việc làm</h1>
          <p className="mt-1.5 text-muted-foreground">
            Tìm theo vị trí, kỹ năng hoặc ngành nghề. Đăng nhập bằng tài khoản ứng viên để xem thêm
            điểm phù hợp với CV của bạn.
          </p>
        </div>

        {/* Thanh lọc dính khi cuộn */}
        <div className="surface-card sticky top-[calc(var(--header-h)+8px)] z-20 mb-5 p-3.5 sm:p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              setQuery(keyword)
              pushSearch({ q: keyword })
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm theo vị trí, kỹ năng, mô tả công việc..."
                aria-label="Từ khoá tìm việc"
                className="pl-10"
              />
            </div>

            <Button type="submit" className="shrink-0">
              <Search />
              Tìm kiếm
            </Button>

            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-full sm:w-[190px]">
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
          </form>

          <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row">
            <TaxonomyFilter
              value={taxonomy}
              onChange={(v) => {
                setTaxonomy(v)
                pushSearch({ taxonomy: v })
              }}
              showLabels={false}
              className="w-full sm:flex-1"
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
                  onClick={() => {
                    const next = locationFilter === loc ? null : loc
                    setLocationFilter(next)
                    pushSearch({ location: next })
                  }}
                  className="chip py-1 text-[13px]"
                >
                  {loc}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {loading ? (
              'Đang tải việc làm...'
            ) : (
              <>
                Tìm thấy <strong className="text-foreground">{visibleJobs.length}</strong> vị trí
                {hasFilter ? ' phù hợp với bộ lọc' : ' đang tuyển'}
              </>
            )}
          </p>
          {!loading && proCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ProBadge />
              {proCount} tin của doanh nghiệp PRO được ưu tiên hiển thị trước
            </p>
          )}
        </div>

        {loading ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : visibleJobs.length === 0 ? (
          <div className="surface-card">
            <EmptyState
              icon={Briefcase}
              title={hasFilter ? 'Không có việc làm khớp bộ lọc' : 'Chưa có tin tuyển dụng nào'}
              description={
                hasFilter
                  ? 'Thử bỏ bớt điều kiện lọc hoặc dùng từ khoá tổng quát hơn.'
                  : 'Hiện chưa có vị trí nào đang mở. Quay lại sau hoặc tạo tài khoản để nhận thông báo khi có tin mới.'
              }
            >
              {hasFilter ? (
                <Button onClick={clearFilters}>Xoá bộ lọc</Button>
              ) : (
                <Button asChild>
                  <Link href="/register/candidate">Tạo tài khoản ứng viên</Link>
                </Button>
              )}
            </EmptyState>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleJobs.map((job) => (
              <JobCard
                key={job._id}
                id={job._id}
                title={job.title}
                company={getEmployerName(job)}
                location={job.location || 'Chưa cập nhật'}
                salaryMin={job.salaryMin}
                salaryMax={job.salaryMax}
                currency={job.currency}
                salaryText={job.salary}
                skills={job.requirements || []}
                postedDate={job.createdAt}
                expiresAt={job.expiresAt}
                href={`/jobs/${job._id}`}
                isPro={job.isPro}
                canApply={!isEmployerViewer}
                applied={appliedIds.has(job._id)}
                onApply={() => handleApply(job._id, job.title)}
              />
            ))}
          </div>
        )}

        {!user && !loading && visibleJobs.length > 0 && (
          <div className="surface-card mt-6 flex flex-col items-center gap-3 p-6 text-center">
            <Sparkles className="size-5 text-brand-500" />
            <p className="text-sm text-muted-foreground">
              Đăng nhập bằng tài khoản ứng viên để xem điểm phù hợp của CV với từng vị trí.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/register/candidate">Tạo hồ sơ miễn phí</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login">Đăng nhập</Link>
              </Button>
            </div>
          </div>
        )}
      </PageContainer>

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

export default function PublicJobsPage() {
  return (
    <PublicLayout>
      <Suspense
        fallback={
          <PageContainer>
            <div className="skeleton h-9 w-64" />
          </PageContainer>
        }
      >
        <JobsContent />
      </Suspense>
    </PublicLayout>
  )
}
