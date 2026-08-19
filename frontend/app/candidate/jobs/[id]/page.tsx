'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import CandidateLayout from '@/layouts/CandidateLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import MatchBadge from '@/components/MatchBadge'
import EmptyState from '@/components/EmptyState'
import ApplyCVModal from '@/components/ApplyCVModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MapPin,
  Calendar,
  Briefcase,
  Wallet,
  Users,
  Globe,
  Building2,
  Loader2,
  ArrowLeft,
  Clock,
  CheckCircle2,
  Award,
  TrendingUp,
  SearchX,
  Gift,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { categoryLabel, positionLabel, COMPANY_SECTOR_LABEL } from '@/lib/job-categories'
import { toast } from 'sonner'
import { CompanyReviews } from '@/components/reviews/CompanyReview'
import { formatDate, formatRelativeTime, daysUntil, initials } from '@/lib/format'

type Job = {
  _id: string
  title: string
  description: string
  requirements: string[]
  location: string
  salary: string
  jobType: string
  experience: string
  level: string
  industry: string
  specialization?: string
  benefits: string[]
  expiresAt: string
  createdAt: string
  updatedAt: string
  employerId: { _id: string; email: string }
  previewScore?: number | null
}

type CompanyProfile = {
  companyName: string
  about: string
  industry: string
  size: string
  website: string
  address: string
  foundedYear: number
  benefits: string[]
}

type OtherJob = {
  _id: string
  title: string
  location: string
  salary: string
  expiresAt: string
  createdAt: string
}

const sizeLabels: Record<string, string> = {
  startup: 'Startup (1 – 50 nhân sự)',
  small: 'Nhỏ (51 – 200 nhân sự)',
  medium: 'Vừa (201 – 1.000 nhân sự)',
  large: 'Lớn (trên 1.000 nhân sự)',
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <section className="surface-card p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 border-l-[3px] border-brand-500 pl-2.5 text-base font-bold">
        {Icon && <Icon className="size-4 text-brand-600" />}
        {title}
      </h2>
      {children}
    </section>
  )
}

function InfoItem({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-sm font-semibold ${highlight ? 'text-hot-600' : ''}`}>{value}</p>
      </div>
    </div>
  )
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params?.id as string

  const [job, setJob] = useState<Job | null>(null)
  const [company, setCompany] = useState<CompanyProfile | null>(null)
  const [otherJobs, setOtherJobs] = useState<OtherJob[]>([])
  const [loading, setLoading] = useState(true)
  const [applied, setApplied] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)

  useEffect(() => {
    if (!jobId) return
    const load = async () => {
      setLoading(true)
      try {
        const [jobRes, appsRes] = await Promise.allSettled([
          apiFetch<{ data: Job; companyProfile: CompanyProfile | null; otherJobs: OtherJob[] }>(
            `/api/jobs/${jobId}`,
          ),
          apiFetch<{ data: { jobId: { _id: string } | string }[] }>('/api/applications/me'),
        ])

        if (jobRes.status === 'fulfilled') {
          setJob(jobRes.value.data)
          setCompany(jobRes.value.companyProfile)
          setOtherJobs(jobRes.value.otherJobs || [])
        }

        if (appsRes.status === 'fulfilled') {
          const ids = (appsRes.value.data || []).map((a) =>
            typeof a.jobId === 'object' && a.jobId ? a.jobId._id : (a.jobId as string),
          )
          setApplied(ids.includes(jobId))
        }
      } catch {
        toast.error('Không tải được thông tin công việc')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobId])

  if (loading) {
    return (
      <CandidateLayout>
        <PageContainer size="lg">
          <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-brand-500" />
            Đang tải thông tin tuyển dụng...
          </div>
        </PageContainer>
      </CandidateLayout>
    )
  }

  if (!job) {
    return (
      <CandidateLayout>
        <PageContainer size="lg">
          <div className="surface-card">
            <EmptyState
              icon={SearchX}
              title="Không tìm thấy tin tuyển dụng"
              description="Tin này có thể đã bị gỡ hoặc hết hạn. Hãy quay lại danh sách để xem các vị trí khác."
              action={{ label: 'Xem việc làm khác', href: '/candidate/matches' }}
            />
          </div>
        </PageContainer>
      </CandidateLayout>
    )
  }

  const companyName =
    company?.companyName || job.employerId?.email?.split('@')[0] || 'Nhà tuyển dụng'
  const remaining = daysUntil(job.expiresAt)
  const benefits = job.benefits?.length ? job.benefits : company?.benefits || []

  const applyButton = (size: 'default' | 'lg' = 'default', full = false) =>
    applied ? (
      <Button size={size} variant="soft" disabled className={full ? 'w-full' : ''}>
        <CheckCircle2 />
        Đã ứng tuyển
      </Button>
    ) : (
      <Button size={size} onClick={() => setShowApplyModal(true)} className={full ? 'w-full' : ''}>
        Ứng tuyển ngay
      </Button>
    )

  return (
    <>
      <CandidateLayout>
        <PageContainer size="xl">
          <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => router.back()}>
            <ArrowLeft />
            Quay lại
          </Button>

          {/* Header tin tuyển dụng */}
          <div className="surface-card p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="logo-box size-16 text-xl font-bold text-brand-600 sm:size-20">
                {initials(companyName)}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-xl leading-snug font-bold sm:text-2xl">{job.title}</h1>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="size-4" />
                  {companyName}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-brand-50 px-2.5 py-1 text-sm font-bold text-salary">
                    {job.salary || 'Thoả thuận'}
                  </span>
                  {job.location && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-foreground/70">
                      <MapPin className="size-3.5" />
                      {job.location}
                    </span>
                  )}
                  {job.experience && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-foreground/70">
                      <TrendingUp className="size-3.5" />
                      {job.experience}
                    </span>
                  )}
                  {job.previewScore !== undefined && job.previewScore !== null && (
                    <MatchBadge score={job.previewScore} size="lg" />
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    Cập nhật {formatRelativeTime(job.updatedAt || job.createdAt)}
                  </span>
                  {job.expiresAt && (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        remaining !== null && remaining <= 5 ? 'font-semibold text-hot-600' : ''
                      }`}
                    >
                      <Calendar className="size-3.5" />
                      Hạn nộp: {formatDate(job.expiresAt)}
                      {remaining !== null && remaining >= 0 && ` (còn ${remaining} ngày)`}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 sm:w-44">{applyButton('lg', true)}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
            {/* Cột nội dung chính */}
            <div className="space-y-5">
              <Section title="Thông tin chung" icon={Briefcase}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoItem icon={Wallet} label="Mức lương" value={job.salary || 'Thoả thuận'} />
                  <InfoItem icon={MapPin} label="Địa điểm" value={job.location || '—'} />
                  <InfoItem
                    icon={Briefcase}
                    label="Ngành nghề"
                    value={
                      categoryLabel(job.industry) ||
                      COMPANY_SECTOR_LABEL[company?.industry || ''] ||
                      '—'
                    }
                  />
                  {job.specialization && (
                    <InfoItem
                      icon={Award}
                      label="Vị trí chuyên môn"
                      value={positionLabel(job.specialization)}
                    />
                  )}
                  <InfoItem icon={Building2} label="Hình thức" value={job.jobType || '—'} />
                  <InfoItem icon={TrendingUp} label="Kinh nghiệm" value={job.experience || '—'} />
                  <InfoItem icon={Award} label="Cấp bậc" value={job.level || '—'} />
                  <InfoItem
                    icon={Calendar}
                    label="Hạn nộp hồ sơ"
                    value={formatDate(job.expiresAt)}
                    highlight={remaining !== null && remaining <= 5}
                  />
                  <InfoItem
                    icon={Clock}
                    label="Ngày cập nhật"
                    value={formatDate(job.updatedAt || job.createdAt)}
                  />
                </div>
              </Section>

              <Section title="Mô tả công việc" icon={Briefcase}>
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
                  {job.description || 'Nhà tuyển dụng chưa cập nhật mô tả chi tiết.'}
                </div>
              </Section>

              {job.requirements?.length > 0 && (
                <Section title="Yêu cầu ứng viên" icon={CheckCircle2}>
                  <ul className="space-y-2.5">
                    {job.requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                        <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand-500" />
                        <span className="text-foreground/85">{req}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {benefits.length > 0 && (
                <Section title="Quyền lợi" icon={Gift}>
                  <div className="flex flex-wrap gap-2">
                    {benefits.map((b) => (
                      <Badge key={b} variant="brand" size="lg">
                        {b}
                      </Badge>
                    ))}
                  </div>
                </Section>
              )}

              {job.employerId?._id && (
                <Section title="Đánh giá về công ty" icon={Users}>
                  <CompanyReviews companyUserId={job.employerId._id} />
                </Section>
              )}

              <div className="surface-card flex flex-col items-center gap-3 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Thấy vị trí này phù hợp? Gửi hồ sơ ngay để nhà tuyển dụng liên hệ sớm.
                </p>
                {applyButton('lg')}
              </div>
            </div>

            {/* Cột phải: công ty + việc làm khác */}
            <aside className="space-y-5 lg:sticky lg:top-[calc(var(--header-h)+16px)]">
              <div className="surface-card p-5">
                <div className="flex items-center gap-3">
                  <div className="logo-box size-12 text-sm font-bold text-brand-600">
                    {initials(companyName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{companyName}</p>
                    {company?.industry && (
                      <p className="truncate text-xs text-muted-foreground">
                        {COMPANY_SECTOR_LABEL[company.industry] || company.industry}
                      </p>
                    )}
                  </div>
                </div>

                <dl className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
                  {company?.size && (
                    <div className="flex items-start gap-2.5">
                      <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div>
                        <dt className="text-xs text-muted-foreground">Quy mô</dt>
                        <dd className="font-medium">{sizeLabels[company.size] || company.size}</dd>
                      </div>
                    </div>
                  )}
                  {company?.foundedYear && (
                    <div className="flex items-start gap-2.5">
                      <Calendar className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div>
                        <dt className="text-xs text-muted-foreground">Năm thành lập</dt>
                        <dd className="font-medium">{company.foundedYear}</dd>
                      </div>
                    </div>
                  )}
                  {company?.address && (
                    <div className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div>
                        <dt className="text-xs text-muted-foreground">Địa chỉ</dt>
                        <dd className="font-medium">{company.address}</dd>
                      </div>
                    </div>
                  )}
                  {company?.website && (
                    <div className="flex items-start gap-2.5">
                      <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Website</dt>
                        <dd>
                          <a
                            href={company.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-brand block truncate"
                          >
                            {company.website}
                          </a>
                        </dd>
                      </div>
                    </div>
                  )}
                </dl>

                {company?.about && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-xs font-semibold text-muted-foreground">Giới thiệu</p>
                    <p className="mt-1.5 line-clamp-6 text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
                      {company.about}
                    </p>
                  </div>
                )}

                {!company && (
                  <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                    Công ty chưa cập nhật hồ sơ giới thiệu.
                  </p>
                )}
              </div>

              {otherJobs.length > 0 && (
                <div className="surface-card p-5">
                  <h3 className="mb-3.5 text-sm font-bold">Việc làm khác của công ty</h3>
                  <div className="space-y-2.5">
                    {otherJobs.map((j) => (
                      <Link
                        key={j._id}
                        href={`/candidate/jobs/${j._id}`}
                        className="block rounded-lg border border-border p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/50"
                      >
                        <p className="line-clamp-2 text-sm font-semibold">{j.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {j.salary && (
                            <span className="font-semibold text-salary">{j.salary}</span>
                          )}
                          {j.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />
                              {j.location}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </PageContainer>
      </CandidateLayout>

      {showApplyModal && job && (
        <ApplyCVModal
          jobId={jobId}
          jobTitle={job.title}
          onClose={() => setShowApplyModal(false)}
          onSuccess={() => setApplied(true)}
        />
      )}
    </>
  )
}
