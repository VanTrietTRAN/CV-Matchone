'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import StatusBadge from '@/components/StatusBadge'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import PositionCombobox from '@/components/employer/PositionCombobox'
import {
  JOB_CATEGORIES,
  EXPERIENCE_LEVELS,
  categoryLabel,
  positionLabel,
  experienceLabel,
  positionsOf,
  positionBelongsTo,
} from '@/lib/job-categories'
import { apiFetch } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-storage'
import { formatDate, formatSalary, WORK_TYPE_LABEL } from '@/lib/format'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Loader2,
  Pencil,
  X,
  Save,
  Users,
  Calendar,
  MapPin,
  Lock,
  Copy,
} from 'lucide-react'

type Job = {
  _id: string
  title: string
  description: string
  requirements: string[]
  location?: string
  industry?: string
  specialization?: string
  jobType?: string
  experience?: string
  education?: string
  salary?: string
  salaryMin?: number | null
  salaryMax?: number | null
  currency?: string
  benefits?: string[]
  expiresAt?: string | null
  status: string
  createdAt: string
  employerId?: { _id?: string } | string
}

type FormState = {
  title: string
  description: string
  requirements: string
  location: string
  industry: string
  specialization: string
  jobType: string
  experience: string
  education: string
  salaryMin: string
  salaryMax: string
  currency: string
  benefits: string
  deadline: string
  status: string
}

const toForm = (j: Job): FormState => ({
  title: j.title ?? '',
  description: j.description ?? '',
  requirements: (j.requirements ?? []).join(', '),
  location: j.location ?? '',
  industry: j.industry ?? '',
  specialization: j.specialization ?? '',
  jobType: j.jobType ?? '',
  experience: j.experience ?? '',
  education: j.education ?? '',
  salaryMin: j.salaryMin != null ? String(j.salaryMin) : '',
  salaryMax: j.salaryMax != null ? String(j.salaryMax) : '',
  currency: j.currency || 'VND',
  benefits: (j.benefits ?? []).join(', '),
  // <input type="date"> chỉ nhận yyyy-mm-dd
  deadline: j.expiresAt ? new Date(j.expiresAt).toISOString().slice(0, 10) : '',
  status: j.status ?? 'open',
})

const splitList = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-44 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

function Field({
  label,
  children,
  full,
  hint,
}: {
  label: string
  children: React.ReactNode
  full?: boolean
  hint?: string
}) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <label className="mb-1.5 block text-sm font-semibold">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default function EmployerJobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = String(params?.id ?? '')

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [applyCount, setApplyCount] = useState<number | null>(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [denied, setDenied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: Job }>(`/api/jobs/${jobId}`)

      // GET /api/jobs/:id là endpoint công khai nên trả về tin của bất kỳ ai.
      // Không phải chủ tin thì không hiển thị ở khu vực nhà tuyển dụng;
      // phía server đã chặn sửa ở updateJob, đây chặn thêm ở giao diện.
      const me = getStoredUser()
      const ownerId =
        typeof res.data.employerId === 'string'
          ? res.data.employerId
          : res.data.employerId?._id
      if (me?.role !== 'admin' && ownerId && me?.id && ownerId !== me.id) {
        setJob(null)
        setDenied(true)
        return
      }

      setJob(res.data)
      setForm(toForm(res.data))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không tải được tin tuyển dụng')
      setJob(null)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    if (jobId) load()
  }, [jobId, load])

  // Số hồ sơ đã nhận cho tin này — lấy từ danh sách ứng viên của nhà tuyển dụng
  useEffect(() => {
    if (!jobId) return
    apiFetch<{ data: unknown[] }>(`/api/applications/job/${jobId}`)
      .then((r) => setApplyCount(r.data?.length ?? 0))
      .catch(() => setApplyCount(null))
  }, [jobId])

  const set = (k: keyof FormState, v: string) => {
    setForm((prev) => {
      if (!prev) return prev
      const next = { ...prev, [k]: v }
      // Đổi ngành thì bỏ vị trí cũ nếu không còn thuộc ngành mới
      if (k === 'industry' && prev.specialization && !positionBelongsTo(v, prev.specialization)) {
        next.specialization = ''
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!form) return
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Tiêu đề và mô tả không được để trống')
      return
    }
    setSaving(true)
    try {
      const salaryMin = form.salaryMin ? Number(form.salaryMin) : null
      const salaryMax = form.salaryMax ? Number(form.salaryMax) : null

      const res = await apiFetch<{ data: Job }>(`/api/jobs/${jobId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description,
          requirements: splitList(form.requirements),
          location: form.location.trim(),
          industry: form.industry,
          specialization: form.specialization,
          jobType: form.jobType,
          experience: form.experience,
          education: form.education.trim(),
          salaryMin,
          salaryMax,
          currency: form.currency,
          salary:
            salaryMin || salaryMax ? formatSalary(salaryMin, salaryMax, form.currency) : '',
          benefits: splitList(form.benefits),
          expiresAt: form.deadline ? new Date(form.deadline).toISOString() : null,
          status: form.status,
        }),
      })
      setJob(res.data)
      setForm(toForm(res.data))
      setEditing(false)
      toast.success('Đã lưu thay đổi')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không lưu được thay đổi')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = async () => {
    try {
      await apiFetch(`/api/jobs/${jobId}/close`, { method: 'PATCH' })
      toast.success('Đã đóng tin tuyển dụng')
      setCloseOpen(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không đóng được tin')
    }
  }

  const handleClone = async () => {
    try {
      const res = await apiFetch<{ data: Job }>(`/api/jobs/${jobId}/clone`, { method: 'POST' })
      toast.success('Đã tạo tin mới từ tin này')
      router.push(`/employer/jobs/${res.data._id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không sao chép được tin')
    }
  }

  if (loading) {
    return (
      <EmployerLayout>
        <PageContainer>
          <div className="grid place-items-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </PageContainer>
      </EmployerLayout>
    )
  }

  if (!job || !form) {
    return (
      <EmployerLayout>
        <PageContainer>
          <div className="surface-card p-10 text-center">
            <p className="font-semibold">
              {denied ? 'Tin này không thuộc về bạn' : 'Không tìm thấy tin tuyển dụng'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {denied
                ? 'Bạn chỉ xem và sửa được tin tuyển dụng do chính mình đăng.'
                : 'Tin có thể đã bị xoá hoặc đường dẫn không đúng.'}
            </p>
            <Button asChild className="mt-5">
              <Link href="/employer/dashboard">Về trang tổng quan</Link>
            </Button>
          </div>
        </PageContainer>
      </EmployerLayout>
    )
  }

  return (
    <EmployerLayout>
      <PageContainer>
        <Link
          href="/employer/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Tin tuyển dụng của bạn
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{job.title}</h1>
              <StatusBadge status={job.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4" />
                Đăng ngày {formatDate(job.createdAt)}
              </span>
              {job.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {job.location}
                </span>
              )}
              {applyCount !== null && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" />
                  {applyCount} hồ sơ
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setForm(toForm(job))
                    setEditing(false)
                  }}
                  disabled={saving}
                >
                  <X />
                  Huỷ
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  Lưu thay đổi
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={handleClone}>
                  <Copy />
                  Nhân bản
                </Button>
                {job.status === 'open' && (
                  <Button
                    variant="ghost"
                    className="text-danger-foreground hover:bg-danger/10 hover:text-danger-foreground"
                    onClick={() => setCloseOpen(true)}
                  >
                    <Lock />
                    Đóng tin
                  </Button>
                )}
                <Button onClick={() => setEditing(true)}>
                  <Pencil />
                  Chỉnh sửa
                </Button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="surface-card space-y-6 p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Tiêu đề tin tuyển dụng" full>
                <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
              </Field>

              <Field label="Ngành nghề">
                <Select
                  value={form.industry || undefined}
                  onValueChange={(v) => set('industry', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chọn ngành nghề" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {JOB_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Vị trí chuyên môn"
                hint={
                  form.industry
                    ? `${positionsOf(form.industry).length} vị trí trong ngành này`
                    : undefined
                }
              >
                <PositionCombobox
                  positions={positionsOf(form.industry)}
                  value={form.specialization}
                  onChange={(v) => set('specialization', v)}
                  disabled={!form.industry}
                />
              </Field>

              <Field label="Hình thức làm việc">
                <Select value={form.jobType || undefined} onValueChange={(v) => set('jobType', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chọn hình thức" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(WORK_TYPE_LABEL).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Địa điểm làm việc">
                <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
              </Field>

              <Field label="Kinh nghiệm yêu cầu">
                <Select
                  value={form.experience || undefined}
                  onValueChange={(v) => set('experience', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chọn mức kinh nghiệm" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Học vấn">
                <Input
                  value={form.education}
                  onChange={(e) => set('education', e.target.value)}
                  placeholder="Ví dụ: Đại học"
                />
              </Field>

              <Field label="Lương tối thiểu">
                <Input
                  type="number"
                  min={0}
                  value={form.salaryMin}
                  onChange={(e) => set('salaryMin', e.target.value)}
                  placeholder="15000000"
                />
              </Field>

              <Field label="Lương tối đa">
                <Input
                  type="number"
                  min={0}
                  value={form.salaryMax}
                  onChange={(e) => set('salaryMax', e.target.value)}
                  placeholder="25000000"
                />
              </Field>

              <Field label="Đơn vị tiền">
                <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VND">VND (đồng)</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Hạn nộp hồ sơ">
                <Input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => set('deadline', e.target.value)}
                />
              </Field>

              <Field label="Trạng thái tin">
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Đang tuyển</SelectItem>
                    <SelectItem value="closed">Đã đóng</SelectItem>
                    <SelectItem value="archived">Lưu trữ</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Mô tả công việc"
                full
                hint="Sửa tiêu đề, mô tả hoặc yêu cầu sẽ khiến AI tính lại điểm phù hợp cho tin này."
              >
                <Textarea
                  rows={10}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>

              <Field label="Kỹ năng / yêu cầu" full hint="Ngăn cách bằng dấu phẩy">
                <Textarea
                  rows={3}
                  value={form.requirements}
                  onChange={(e) => set('requirements', e.target.value)}
                  placeholder="ReactJS, TypeScript, Git"
                />
              </Field>

              <Field label="Phúc lợi" full hint="Ngăn cách bằng dấu phẩy">
                <Textarea
                  rows={2}
                  value={form.benefits}
                  onChange={(e) => set('benefits', e.target.value)}
                  placeholder="Bảo hiểm sức khoẻ, Thưởng quý, Làm việc linh hoạt"
                />
              </Field>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="surface-card p-6">
              <h2 className="mb-3 font-bold">Mô tả công việc</h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
                {job.description || 'Chưa có mô tả.'}
              </p>

              <h2 className="mt-7 mb-3 font-bold">Kỹ năng / yêu cầu</h2>
              {job.requirements?.length ? (
                <div className="flex flex-wrap gap-2">
                  {job.requirements.map((r) => (
                    <span key={r} className="chip">
                      {r}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa khai báo.</p>
              )}

              {job.benefits?.length ? (
                <>
                  <h2 className="mt-7 mb-3 font-bold">Phúc lợi</h2>
                  <ul className="list-inside list-disc space-y-1 text-sm text-foreground/85">
                    {job.benefits.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>

            <div className="surface-card h-fit p-6">
              <h2 className="mb-2 font-bold">Thông tin tin đăng</h2>
              <dl>
                <Row label="Ngành nghề">{categoryLabel(job.industry) || '—'}</Row>
                <Row label="Vị trí chuyên môn">{positionLabel(job.specialization) || '—'}</Row>
                <Row label="Hình thức">
                  {job.jobType ? (WORK_TYPE_LABEL[job.jobType] ?? job.jobType) : '—'}
                </Row>
                <Row label="Địa điểm">{job.location || '—'}</Row>
                <Row label="Mức lương">
                  {formatSalary(job.salaryMin, job.salaryMax, job.currency) ||
                    job.salary ||
                    'Thoả thuận'}
                </Row>
                <Row label="Kinh nghiệm">{experienceLabel(job.experience) || '—'}</Row>
                <Row label="Học vấn">{job.education || '—'}</Row>
                <Row label="Hạn nộp">
                  {job.expiresAt ? formatDate(job.expiresAt) : 'Không đặt hạn'}
                </Row>
              </dl>

              <Button asChild variant="outline" className="mt-5 w-full">
                <Link href={`/employer/candidates?jobId=${job._id}`}>
                  <Users />
                  Xem hồ sơ ứng tuyển
                </Link>
              </Button>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={closeOpen}
          onOpenChange={setCloseOpen}
          title="Đóng tin tuyển dụng?"
          description="Tin sẽ không còn hiển thị với ứng viên. Hồ sơ đã nhận vẫn được giữ nguyên."
          actionLabel="Đóng tin"
          destructive
          onConfirm={handleClose}
        />
      </PageContainer>
    </EmployerLayout>
  )
}
