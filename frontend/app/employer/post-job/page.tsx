'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import SkillTag from '@/components/SkillTag'
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
import { AlertCircle, Loader2, Sparkles, Briefcase, FileText, Target, MapPin } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import {
  JOB_CATEGORIES,
  categoryLabel,
  positionLabel,
  positionsOf,
  positionBelongsTo,
} from '@/lib/job-categories'
import PositionCombobox from '@/components/employer/PositionCombobox'
import { formatSalary, WORK_TYPE_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

const initialFormData = {
  title: '',
  industry: '',
  specialization: '',
  workType: '',
  location: '',
  salaryMin: '',
  salaryMax: '',
  currency: 'VND',
  description: '',
  requiredSkills: '',
  niceToHaveSkills: '',
  experienceLevel: '',
  education: '',
  deadline: '',
  duration: '',
}


const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Mới tốt nghiệp / dưới 1 năm' },
  { value: 'mid', label: 'Từ 1 – 3 năm' },
  { value: 'senior', label: 'Từ 3 – 5 năm' },
  { value: 'expert', label: 'Trên 5 năm' },
]

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3 border-b border-border pb-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  full,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn(full && 'sm:col-span-2')}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default function PostJobPage() {
  const router = useRouter()
  const [formData, setFormData] = useState(initialFormData)
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelect = (name: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value }
      // Đổi ngành thì vị trí cũ có thể không còn thuộc ngành mới → bỏ đi
      if (name === 'industry' && prev.specialization) {
        if (!positionBelongsTo(value, prev.specialization)) next.specialization = ''
      }
      return next
    })
  }

  const splitSkills = (value: string) =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const reqSkills = splitSkills(formData.requiredSkills)
    const niceSkills = splitSkills(formData.niceToHaveSkills)
    const requirements = [...reqSkills, ...niceSkills]

    // Các trường chưa có cột riêng trong model job được ghi kèm vào mô tả
    let extra = ''
    if (formData.industry) extra += `\nNgành nghề: ${categoryLabel(formData.industry)}`
    if (formData.specialization) {
      extra += `\nVị trí chuyên môn: ${positionLabel(formData.specialization)}`
    }
    if (formData.workType) extra += `\nHình thức: ${WORK_TYPE_LABEL[formData.workType] ?? formData.workType}`
    if (formData.experienceLevel) {
      extra += `\nKinh nghiệm: ${EXPERIENCE_LEVELS.find((l) => l.value === formData.experienceLevel)?.label ?? formData.experienceLevel}`
    }
    if (formData.education) extra += `\nHọc vấn: ${formData.education}`
    if (formData.salaryMin || formData.salaryMax) {
      extra += `\nMức lương: ${formatSalary(Number(formData.salaryMin), Number(formData.salaryMax), formData.currency)}`
    }

    let expiresAt: string | undefined
    if (formData.deadline) {
      expiresAt = new Date(formData.deadline).toISOString()
    } else if (formData.duration && Number(formData.duration) > 0) {
      const d = new Date()
      d.setDate(d.getDate() + Number(formData.duration))
      expiresAt = d.toISOString()
    }

    try {
      await apiFetch('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: formData.title,
          description: formData.description + extra,
          requirements,
          location: formData.location || undefined,
          // Trước đây ngành nghề chỉ được nhét vào mô tả; nay lưu thành cột riêng
          // để còn lọc và thống kê được.
          industry: formData.industry || undefined,
          specialization: formData.specialization || undefined,
          expiresAt,
          isEmailEnabled: true,
          status: 'open',
        }),
      })
      toast.success('Đã đăng tin tuyển dụng')
      router.push('/employer/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể đăng tin')
    } finally {
      setSubmitting(false)
    }
  }

  const previewSkills = splitSkills(formData.requiredSkills)

  return (
    <EmployerLayout>
      <PageContainer>
        <PageHeader
          title="Đăng tin tuyển dụng"
          description="Mô tả càng rõ ràng, AI càng chấm điểm phù hợp chính xác và giới thiệu đúng ứng viên."
          breadcrumbs={[{ label: 'Tổng quan', href: '/employer/dashboard' }, { label: 'Đăng tin' }]}
        />

        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="space-y-5">
            <FormSection
              icon={Briefcase}
              title="Thông tin cơ bản"
              description="Những thông tin ứng viên nhìn thấy đầu tiên"
            >
              <Field label="Tiêu đề tin tuyển dụng" htmlFor="title" required full>
                <Input
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Ví dụ: Lập trình viên Frontend (ReactJS)"
                  required
                />
              </Field>

              <Field label="Ngành nghề">
                <Select
                  value={formData.industry || undefined}
                  onValueChange={(v) => handleSelect('industry', v)}
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
                  formData.industry
                    ? `${positionsOf(formData.industry).length} vị trí trong ngành này`
                    : undefined
                }
              >
                <PositionCombobox
                  positions={positionsOf(formData.industry)}
                  value={formData.specialization}
                  onChange={(v) => handleSelect('specialization', v)}
                  disabled={!formData.industry}
                />
              </Field>

              <Field label="Hình thức làm việc">
                <Select
                  value={formData.workType || undefined}
                  onValueChange={(v) => handleSelect('workType', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chọn hình thức" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onsite">Tại văn phòng</SelectItem>
                    <SelectItem value="hybrid">Linh hoạt (hybrid)</SelectItem>
                    <SelectItem value="remote">Làm từ xa</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Địa điểm làm việc" htmlFor="location" full>
                <Input
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="Ví dụ: Cầu Giấy, Hà Nội"
                />
              </Field>

              <Field label="Lương tối thiểu" htmlFor="salaryMin">
                <Input
                  id="salaryMin"
                  type="number"
                  name="salaryMin"
                  min={0}
                  value={formData.salaryMin}
                  onChange={handleChange}
                  placeholder="15000000"
                />
              </Field>

              <Field label="Lương tối đa" htmlFor="salaryMax">
                <Input
                  id="salaryMax"
                  type="number"
                  name="salaryMax"
                  min={0}
                  value={formData.salaryMax}
                  onChange={handleChange}
                  placeholder="25000000"
                />
              </Field>

              <Field
                label="Đơn vị tiền tệ"
                hint="Để trống mức lương nếu muốn hiển thị “Thoả thuận”."
                full
              >
                <Select
                  value={formData.currency}
                  onValueChange={(v) => handleSelect('currency', v)}
                >
                  <SelectTrigger className="w-full sm:w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VND">VND (đồng)</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FormSection>

            <FormSection
              icon={FileText}
              title="Mô tả công việc"
              description="Nội dung này được dùng để tính điểm phù hợp với CV ứng viên"
            >
              <Field
                label="Mô tả chi tiết"
                htmlFor="description"
                required
                hint="Nêu rõ trách nhiệm chính, sản phẩm/dự án, quy trình làm việc và quyền lợi."
                full
              >
                <Textarea
                  id="description"
                  name="description"
                  rows={8}
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Mô tả công việc, trách nhiệm chính, quyền lợi..."
                  required
                />
              </Field>
            </FormSection>

            <FormSection
              icon={Target}
              title="Yêu cầu ứng viên"
              description="Kỹ năng ghi càng cụ thể, kết quả so khớp càng chính xác"
            >
              <Field
                label="Kỹ năng bắt buộc"
                htmlFor="requiredSkills"
                hint="Ngăn cách bằng dấu phẩy. Ví dụ: ReactJS, TypeScript, REST API"
                full
              >
                <Input
                  id="requiredSkills"
                  name="requiredSkills"
                  value={formData.requiredSkills}
                  onChange={handleChange}
                  placeholder="ReactJS, TypeScript, NodeJS"
                />
              </Field>

              <Field
                label="Kỹ năng là lợi thế"
                htmlFor="niceToHaveSkills"
                hint="Ngăn cách bằng dấu phẩy."
                full
              >
                <Input
                  id="niceToHaveSkills"
                  name="niceToHaveSkills"
                  value={formData.niceToHaveSkills}
                  onChange={handleChange}
                  placeholder="AWS, Docker, GraphQL"
                />
              </Field>

              <Field label="Kinh nghiệm yêu cầu">
                <Select
                  value={formData.experienceLevel || undefined}
                  onValueChange={(v) => handleSelect('experienceLevel', v)}
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

              <Field label="Yêu cầu học vấn" htmlFor="education">
                <Input
                  id="education"
                  name="education"
                  value={formData.education}
                  onChange={handleChange}
                  placeholder="Cử nhân CNTT hoặc tương đương"
                />
              </Field>

              <Field label="Hạn nộp hồ sơ" htmlFor="deadline">
                <Input
                  id="deadline"
                  type="date"
                  name="deadline"
                  value={formData.deadline}
                  onChange={handleChange}
                />
              </Field>

              <Field
                label="Hoặc số ngày hiển thị tin"
                htmlFor="duration"
                hint="Dùng khi bạn không chọn ngày cụ thể."
              >
                <Input
                  id="duration"
                  type="number"
                  name="duration"
                  min={1}
                  value={formData.duration}
                  onChange={handleChange}
                  placeholder="30"
                />
              </Field>
            </FormSection>

            <div className="surface-card flex flex-col-reverse gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Tin sẽ hiển thị ngay với ứng viên sau khi đăng. Bạn có thể đóng tin bất cứ lúc nào ở
                trang Tổng quan.
              </p>
              <Button type="submit" size="lg" disabled={submitting} className="shrink-0">
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? 'Đang đăng tin...' : 'Đăng tin tuyển dụng'}
              </Button>
            </div>
          </div>

          {/* Xem trước tin đăng */}
          <aside className="lg:sticky lg:top-[calc(var(--header-h)+16px)]">
            <div className="surface-card p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Sparkles className="size-4 text-brand-600" />
                Xem trước tin đăng
              </h3>

              <div className="mt-4 rounded-xl border border-border p-4">
                <p className="text-[15px] leading-snug font-bold">
                  {formData.title || 'Tiêu đề tin tuyển dụng'}
                </p>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-bold text-salary">
                    {formatSalary(
                      Number(formData.salaryMin) || undefined,
                      Number(formData.salaryMax) || undefined,
                      formData.currency,
                    )}
                  </span>
                  {formData.location && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground/70">
                      <MapPin className="size-3" />
                      {formData.location}
                    </span>
                  )}
                  {formData.workType && (
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground/70">
                      {WORK_TYPE_LABEL[formData.workType]}
                    </span>
                  )}
                </div>

                {previewSkills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {previewSkills.slice(0, 5).map((skill, i) => (
                      <SkillTag key={`${skill}-${i}`} skill={skill} size="sm" />
                    ))}
                    {previewSkills.length > 5 && (
                      <span className="self-center text-[11px] text-muted-foreground">
                        +{previewSkills.length - 5}
                      </span>
                    )}
                  </div>
                )}

                {formData.description && (
                  <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                    {formData.description}
                  </p>
                )}
              </div>

              <div className="mt-4 flex gap-2 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <p className="text-xs leading-relaxed text-brand-800">
                  Bản xem trước cập nhật theo nội dung bạn nhập. Mô tả và kỹ năng là dữ liệu chính
                  để AI so khớp với CV ứng viên.
                </p>
              </div>
            </div>
          </aside>
        </form>
      </PageContainer>
    </EmployerLayout>
  )
}
