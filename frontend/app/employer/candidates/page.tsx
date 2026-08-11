'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import SkillTag from '@/components/SkillTag'
import MatchBadge from '@/components/MatchBadge'
import EmptyState from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Eye,
  Mail,
  Phone,
  Briefcase,
  GraduationCap,
  Clock,
  FileText,
  Users,
  Target,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { formatDate, formatRelativeTime, initials } from '@/lib/format'

type JobRow = { _id: string; title: string; status: string }

type Applicant = {
  _id: string
  candidateId: { _id: string; email: string } | null
  cvProfileId: {
    fullName?: string
    phone?: string
    skills?: string[]
    summary?: string
    experience?: any[]
    education?: any[]
    isLookingForJob?: boolean
    fileUrl?: string
    pdfUrl?: string
  } | null
  matchingScore: number
  status: string
  appliedAt: string
}

export default function EmployerCandidatesPage() {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [loadingApplicants, setLoadingApplicants] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await apiFetch<{ data: JobRow[] }>('/api/jobs/employer/my-jobs')
        const myJobs = res.data || []
        setJobs(myJobs)
        if (myJobs.length > 0) setSelectedJobId(myJobs[0]._id)
      } catch {
        toast.error('Không tải được danh sách tin tuyển dụng')
      } finally {
        setLoadingJobs(false)
      }
    })()
  }, [])

  const loadApplicants = useCallback(async (jobId: string) => {
    if (!jobId) return
    setLoadingApplicants(true)
    setExpandedId(null)
    try {
      const res = await apiFetch<{ data: Applicant[] }>(`/api/applications/job/${jobId}`)
      setApplicants(res.data || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không tải được danh sách ứng viên')
      setApplicants([])
    } finally {
      setLoadingApplicants(false)
    }
  }, [])

  useEffect(() => {
    if (selectedJobId) loadApplicants(selectedJobId)
  }, [selectedJobId, loadApplicants])

  const handleUpdateStatus = async (appId: string, newStatus: string) => {
    setUpdatingId(appId)
    try {
      await apiFetch(`/api/applications/${appId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      const labelMap: Record<string, string> = {
        reviewed: 'Đã chuyển sang trạng thái Đang xem xét',
        interview: 'Đã mời ứng viên phỏng vấn',
        accepted: 'Đã chấp nhận ứng viên',
        rejected: 'Đã từ chối ứng viên',
      }
      toast.success(labelMap[newStatus] || 'Cập nhật thành công')
      setApplicants((prev) =>
        prev.map((a) => (a._id === appId ? { ...a, status: newStatus } : a)),
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cập nhật thất bại')
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredApplicants = useMemo(() => {
    const list = searchText.trim()
      ? applicants.filter((a) => {
          const name = a.cvProfileId?.fullName?.toLowerCase() || ''
          const email = a.candidateId?.email?.toLowerCase() || ''
          const skills = (a.cvProfileId?.skills || []).join(' ').toLowerCase()
          const q = searchText.toLowerCase()
          return name.includes(q) || email.includes(q) || skills.includes(q)
        })
      : applicants
    return [...list].sort((a, b) => (b.matchingScore ?? 0) - (a.matchingScore ?? 0))
  }, [applicants, searchText])

  const selectedJob = jobs.find((j) => j._id === selectedJobId)
  const avgScore = applicants.length
    ? Math.round(applicants.reduce((s, a) => s + (a.matchingScore || 0), 0) / applicants.length)
    : 0

  return (
    <EmployerLayout>
      <PageContainer>
        <PageHeader
          title="Hồ sơ ứng viên"
          description="Danh sách được xếp hạng theo điểm phù hợp giữa CV ứng viên và mô tả công việc."
          actions={
            <Button
              variant="outline"
              onClick={() => loadApplicants(selectedJobId)}
              disabled={loadingApplicants || !selectedJobId}
            >
              <RefreshCw className={loadingApplicants ? 'animate-spin' : ''} />
              Làm mới
            </Button>
          }
        />

        {loadingJobs ? (
          <div className="surface-card flex h-32 items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-brand-500" />
            Đang tải tin tuyển dụng...
          </div>
        ) : jobs.length === 0 ? (
          <div className="surface-card">
            <EmptyState
              icon={Briefcase}
              title="Bạn chưa có tin tuyển dụng nào"
              description="Đăng tin tuyển dụng đầu tiên để bắt đầu nhận hồ sơ ứng viên."
              action={{ label: 'Đăng tin tuyển dụng', href: '/employer/post-job' }}
            />
          </div>
        ) : (
          <>
            {/* Bộ lọc */}
            <div className="surface-card p-4 sm:p-5">
              <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Tin tuyển dụng</label>
                  <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn tin tuyển dụng" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map((job) => (
                        <SelectItem key={job._id} value={job._id}>
                          {job.title} — {job.status === 'open' ? 'Đang mở' : 'Đã đóng'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Tìm trong hồ sơ</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Tên, email hoặc kỹ năng..."
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              {applicants.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-sm">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Users className="size-4 text-brand-600" />
                    <strong className="text-foreground">{applicants.length}</strong> hồ sơ
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Target className="size-4 text-brand-600" />
                    Điểm phù hợp trung bình{' '}
                    <strong className="text-foreground">{avgScore}%</strong>
                  </span>
                </div>
              )}
            </div>

            {loadingApplicants ? (
              <div className="mt-5 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-24 rounded-xl" />
                ))}
              </div>
            ) : filteredApplicants.length === 0 ? (
              <div className="surface-card mt-5">
                <EmptyState
                  icon={Users}
                  title={
                    applicants.length === 0 ? 'Chưa có ứng viên nộp hồ sơ' : 'Không tìm thấy hồ sơ'
                  }
                  description={
                    applicants.length === 0
                      ? `Tin “${selectedJob?.title || 'này'}” chưa nhận được hồ sơ nào. Hãy chia sẻ tin để tiếp cận nhiều ứng viên hơn.`
                      : 'Thử từ khoá khác hoặc xoá ô tìm kiếm để xem toàn bộ hồ sơ.'
                  }
                >
                  {applicants.length === 0 ? (
                    <Button asChild variant="outline">
                      <Link href="/fb-generator">Tạo bài đăng chia sẻ</Link>
                    </Button>
                  ) : (
                    <Button onClick={() => setSearchText('')}>Xoá tìm kiếm</Button>
                  )}
                </EmptyState>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hiển thị <strong className="text-foreground">{filteredApplicants.length}</strong>{' '}
                  hồ sơ, xếp theo điểm phù hợp giảm dần
                </p>

                {filteredApplicants.map((app, index) => {
                  const name =
                    app.cvProfileId?.fullName || app.candidateId?.email?.split('@')[0] || 'Ứng viên'
                  const email = app.candidateId?.email || ''
                  const skills = app.cvProfileId?.skills || []
                  const isExpanded = expandedId === app._id
                  const isUpdating = updatingId === app._id

                  return (
                    <article key={app._id} className="surface-card overflow-hidden">
                      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3.5">
                          <div className="relative shrink-0">
                            <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                              {initials(name)}
                            </span>
                            {index < 3 && (
                              <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
                                {index + 1}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <h2 className="truncate font-bold">{name}</h2>
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                              <Mail className="size-3.5 shrink-0" />
                              {email}
                            </p>
                            {skills.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {skills.slice(0, 5).map((skill: string) => (
                                  <SkillTag key={skill} skill={skill} size="sm" />
                                ))}
                                {skills.length > 5 && (
                                  <span className="self-center text-[11px] text-muted-foreground">
                                    +{skills.length - 5}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <MatchBadge
                            score={app.matchingScore > 0 ? app.matchingScore : null}
                            size="lg"
                          />
                          <StatusBadge status={app.status} />
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3.5" />
                            {formatRelativeTime(app.appliedAt)}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : app._id)}
                          >
                            <Eye />
                            {isExpanded ? 'Thu gọn' : 'Xem hồ sơ'}
                            {isExpanded ? <ChevronUp /> : <ChevronDown />}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border bg-muted/40 p-4 sm:p-5">
                          <div className="grid gap-6 md:grid-cols-2">
                            <div>
                              <h3 className="mb-3 flex items-center gap-2 font-bold">
                                <Briefcase className="size-4 text-brand-600" />
                                Thông tin liên hệ
                              </h3>
                              <div className="space-y-2 text-sm">
                                {app.cvProfileId?.phone && (
                                  <p className="flex items-center gap-2">
                                    <Phone className="size-3.5 text-muted-foreground" />
                                    {app.cvProfileId.phone}
                                  </p>
                                )}
                                <p className="flex items-center gap-2">
                                  <Mail className="size-3.5 text-muted-foreground" />
                                  {email}
                                </p>
                                <p className="flex items-center gap-2 text-muted-foreground">
                                  <Clock className="size-3.5" />
                                  Nộp ngày {formatDate(app.appliedAt)}
                                </p>
                              </div>

                              {app.cvProfileId?.summary && (
                                <div className="mt-4">
                                  <p className="mb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                                    Mục tiêu nghề nghiệp
                                  </p>
                                  <p className="text-sm leading-relaxed text-foreground/85">
                                    {app.cvProfileId.summary}
                                  </p>
                                </div>
                              )}

                              {skills.length > 0 && (
                                <div className="mt-4">
                                  <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                                    Toàn bộ kỹ năng
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {skills.map((skill: string) => (
                                      <SkillTag key={skill} skill={skill} variant="match" size="sm" />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-5">
                              {app.cvProfileId?.experience &&
                                app.cvProfileId.experience.length > 0 && (
                                  <div>
                                    <h3 className="mb-2.5 flex items-center gap-2 font-bold">
                                      <Briefcase className="size-4 text-brand-600" />
                                      Kinh nghiệm làm việc
                                    </h3>
                                    <div className="space-y-3">
                                      {app.cvProfileId.experience.map((exp: any, i: number) => (
                                        <div
                                          key={i}
                                          className="border-l-2 border-brand-300 pl-3 text-sm"
                                        >
                                          <p className="font-semibold">
                                            {exp.position || 'Xem chi tiết'}
                                          </p>
                                          {exp.company && (
                                            <p className="text-muted-foreground">{exp.company}</p>
                                          )}
                                          {exp.description && (
                                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                              {exp.description}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              {app.cvProfileId?.education &&
                                app.cvProfileId.education.length > 0 && (
                                  <div>
                                    <h3 className="mb-2.5 flex items-center gap-2 font-bold">
                                      <GraduationCap className="size-4 text-brand-600" />
                                      Học vấn
                                    </h3>
                                    <div className="space-y-3">
                                      {app.cvProfileId.education.map((edu: any, i: number) => (
                                        <div
                                          key={i}
                                          className="border-l-2 border-border pl-3 text-sm"
                                        >
                                          <p className="font-semibold">
                                            {edu.major || edu.school || 'Xem chi tiết'}
                                          </p>
                                          {edu.school && edu.major && (
                                            <p className="text-muted-foreground">{edu.school}</p>
                                          )}
                                          {edu.gpa && (
                                            <p className="text-xs text-muted-foreground">
                                              GPA: {edu.gpa}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>

                          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            {app.cvProfileId?.pdfUrl ? (
                              <Button asChild variant="outline" size="sm">
                                <a
                                  href={app.cvProfileId.pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <FileText />
                                  Xem CV bản PDF
                                </a>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Ứng viên không đính kèm file CV
                              </span>
                            )}

                            <div className="flex flex-wrap gap-2">
                              {app.status !== 'reviewed' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateStatus(app._id, 'reviewed')}
                                >
                                  {isUpdating ? <Loader2 className="animate-spin" /> : <Eye />}
                                  Đang xem xét
                                </Button>
                              )}

                              {app.status !== 'interview' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateStatus(app._id, 'interview')}
                                >
                                  {isUpdating ? <Loader2 className="animate-spin" /> : <Phone />}
                                  Mời phỏng vấn
                                </Button>
                              )}

                              {app.status !== 'accepted' && (
                                <Button
                                  size="sm"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateStatus(app._id, 'accepted')}
                                >
                                  {isUpdating ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <CheckCircle2 />
                                  )}
                                  Chấp nhận
                                </Button>
                              )}

                              {app.status !== 'rejected' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-danger-foreground hover:bg-danger/10 hover:text-danger-foreground"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateStatus(app._id, 'rejected')}
                                >
                                  {isUpdating ? <Loader2 className="animate-spin" /> : <XCircle />}
                                  Từ chối
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </PageContainer>
    </EmployerLayout>
  )
}
