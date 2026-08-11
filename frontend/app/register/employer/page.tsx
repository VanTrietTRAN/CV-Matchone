'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PublicLayout from '@/layouts/PublicLayout'
import PasswordInput from '@/components/auth/PasswordInput'
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
import { ArrowLeft, RefreshCw, Loader2, Building2, UserRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { setAuth } from '@/lib/auth-storage'
import { apiFetch, type AuthResponse } from '@/lib/api'
import { cn } from '@/lib/utils'

const industries = [
  { value: 'technology', label: 'Công nghệ thông tin' },
  { value: 'finance', label: 'Tài chính / Ngân hàng' },
  { value: 'healthcare', label: 'Y tế / Dược phẩm' },
  { value: 'consulting', label: 'Tư vấn' },
  { value: 'logistics', label: 'Logistics / Vận tải' },
  { value: 'education', label: 'Giáo dục / Đào tạo' },
  { value: 'marketing', label: 'Marketing / Truyền thông' },
  { value: 'manufacturing', label: 'Sản xuất' },
  { value: 'other', label: 'Lĩnh vực khác' },
]

const sizes = [
  { value: 'startup', label: 'Startup (1 - 50 nhân sự)' },
  { value: 'small', label: 'Nhỏ (51 - 200 nhân sự)' },
  { value: 'medium', label: 'Vừa (201 - 1.000 nhân sự)' },
  { value: 'large', label: 'Lớn (trên 1.000 nhân sự)' },
]

const provinces = [
  'Hà Nội',
  'TP. Hồ Chí Minh',
  'Đà Nẵng',
  'Bình Dương',
  'Đồng Nai',
  'Khánh Hoà',
  'Quảng Ninh',
  'Cần Thơ',
  'Hải Phòng',
  'Tỉnh/thành khác',
]

/** Nhóm trường trong form — giúp form dài vẫn dễ quét mắt */
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
  error,
  hint,
  full,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
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
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger-foreground">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export default function EmployerSignupPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    industry: '',
    size: '',
    country: 'Việt Nam',
    province: '',
    address: '',
    about: '',
    contactName: '',
    phone: '',
    taxId: '',
  })

  const [captchaText, setCaptchaText] = useState('')
  const [captchaInput, setCaptchaInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let text = ''
    for (let i = 0; i < 6; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setCaptchaText(text)
    setCaptchaInput('')
  }

  useEffect(() => {
    generateCaptcha()
  }, [])

  const clearError = (name: string) => {
    setErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    clearError(name)
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
    clearError(name)
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    const requiredFields: (keyof typeof formData)[] = [
      'email',
      'password',
      'confirmPassword',
      'companyName',
      'industry',
      'size',
      'province',
      'address',
      'about',
      'contactName',
      'phone',
      'taxId',
    ]

    requiredFields.forEach((field) => {
      if (!formData[field] || !formData[field].trim()) {
        newErrors[field] = 'Vui lòng nhập thông tin này.'
      }
    })

    if (formData.password && formData.password.length < 6) {
      newErrors.password = 'Mật khẩu cần ít nhất 6 ký tự.'
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp.'
    }

    const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/
    if (formData.phone && !phoneRegex.test(formData.phone)) {
      newErrors.phone = 'Số điện thoại không hợp lệ (ví dụ: 0912345678).'
    }

    if (!captchaInput) {
      newErrors.captcha = 'Vui lòng nhập mã xác nhận.'
    } else if (captchaInput.toLowerCase() !== captchaText.toLowerCase()) {
      newErrors.captcha = 'Mã xác nhận chưa đúng.'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error('Vui lòng kiểm tra lại các trường còn thiếu.')
      return
    }

    setLoading(true)
    try {
      const data = await apiFetch<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          role: 'employer',
          companyName: formData.companyName,
          contactName: formData.contactName,
          industry: formData.industry,
          size: formData.size,
          country: formData.country,
          province: formData.province,
          address: formData.address,
          about: formData.about,
          phone: formData.phone,
          taxId: formData.taxId,
        }),
        skipAuth: true,
      })

      setAuth({ id: data._id, email: data.email, role: data.role })
      toast.success('Đăng ký tài khoản nhà tuyển dụng thành công!')
      router.push('/employer/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đăng ký thất bại')
      generateCaptcha()
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicLayout>
      <div className="bg-background py-10 lg:py-14">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
            <Link href="/register">
              <ArrowLeft />
              Chọn lại loại tài khoản
            </Link>
          </Button>

          <div className="mb-7">
            <h1 className="text-2xl font-bold sm:text-3xl">Đăng ký tài khoản nhà tuyển dụng</h1>
            <p className="mt-2 text-muted-foreground">
              Hoàn tất thông tin doanh nghiệp để bắt đầu đăng tin và tiếp cận ứng viên phù hợp.
              Các trường có dấu <span className="font-semibold text-danger">*</span> là bắt buộc.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <FormSection
              icon={ShieldCheck}
              title="Thông tin đăng nhập"
              description="Dùng để truy cập khu vực nhà tuyển dụng"
            >
              <Field label="Email đăng nhập" htmlFor="email" required error={errors.email} full>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="hr@congty.vn"
                  aria-invalid={!!errors.email}
                />
              </Field>

              <Field label="Mật khẩu" htmlFor="password" required error={errors.password}>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Tối thiểu 6 ký tự"
                  showStrength
                  aria-invalid={!!errors.password}
                />
              </Field>

              <Field
                label="Xác nhận mật khẩu"
                htmlFor="confirmPassword"
                required
                error={errors.confirmPassword}
              >
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Nhập lại mật khẩu"
                  aria-invalid={!!errors.confirmPassword}
                />
              </Field>
            </FormSection>

            <FormSection
              icon={Building2}
              title="Thông tin công ty"
              description="Hiển thị trên trang công ty và các tin tuyển dụng của bạn"
            >
              <Field label="Tên công ty" htmlFor="companyName" required error={errors.companyName} full>
                <Input
                  id="companyName"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  placeholder="Công ty Cổ phần ABC"
                  aria-invalid={!!errors.companyName}
                />
              </Field>

              <Field label="Lĩnh vực hoạt động" required error={errors.industry}>
                <Select
                  value={formData.industry || undefined}
                  onValueChange={(v) => handleSelectChange('industry', v)}
                >
                  <SelectTrigger className="w-full" aria-invalid={!!errors.industry}>
                    <SelectValue placeholder="Chọn lĩnh vực" />
                  </SelectTrigger>
                  <SelectContent>
                    {industries.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Quy mô nhân sự" required error={errors.size}>
                <Select
                  value={formData.size || undefined}
                  onValueChange={(v) => handleSelectChange('size', v)}
                >
                  <SelectTrigger className="w-full" aria-invalid={!!errors.size}>
                    <SelectValue placeholder="Chọn quy mô" />
                  </SelectTrigger>
                  <SelectContent>
                    {sizes.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Tỉnh / Thành phố" required error={errors.province}>
                <Select
                  value={formData.province || undefined}
                  onValueChange={(v) => handleSelectChange('province', v)}
                >
                  <SelectTrigger className="w-full" aria-invalid={!!errors.province}>
                    <SelectValue placeholder="Chọn tỉnh/thành" />
                  </SelectTrigger>
                  <SelectContent>
                    {provinces.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Mã số thuế" htmlFor="taxId" required error={errors.taxId}>
                <Input
                  id="taxId"
                  name="taxId"
                  value={formData.taxId}
                  onChange={handleChange}
                  placeholder="0101234567"
                  aria-invalid={!!errors.taxId}
                />
              </Field>

              <Field label="Địa chỉ trụ sở" htmlFor="address" required error={errors.address} full>
                <Input
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Số 1, đường ABC, quận XYZ"
                  aria-invalid={!!errors.address}
                />
              </Field>

              <Field
                label="Giới thiệu công ty"
                htmlFor="about"
                required
                error={errors.about}
                hint="Mô tả ngắn về lĩnh vực, văn hoá và định hướng của công ty."
                full
              >
                <Textarea
                  id="about"
                  name="about"
                  rows={4}
                  value={formData.about}
                  onChange={handleChange}
                  placeholder="Công ty chúng tôi hoạt động trong lĩnh vực..."
                  aria-invalid={!!errors.about}
                />
              </Field>
            </FormSection>

            <FormSection
              icon={UserRound}
              title="Người liên hệ"
              description="Thông tin để ứng viên và Smart Recruit liên lạc khi cần"
            >
              <Field label="Họ tên người liên hệ" htmlFor="contactName" required error={errors.contactName}>
                <Input
                  id="contactName"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleChange}
                  placeholder="Nguyễn Văn A"
                  aria-invalid={!!errors.contactName}
                />
              </Field>

              <Field label="Số điện thoại" htmlFor="phone" required error={errors.phone}>
                <Input
                  id="phone"
                  name="phone"
                  inputMode="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="0912345678"
                  aria-invalid={!!errors.phone}
                />
              </Field>

              <Field label="Mã xác nhận" htmlFor="captcha" required error={errors.captcha} full>
                <div className="flex items-center gap-2.5">
                  <Input
                    id="captcha"
                    value={captchaInput}
                    onChange={(e) => {
                      setCaptchaInput(e.target.value)
                      clearError('captcha')
                    }}
                    placeholder="Nhập mã bên cạnh"
                    className="flex-1"
                    aria-invalid={!!errors.captcha}
                  />
                  <span className="grid h-10 shrink-0 place-items-center rounded-md border border-border bg-muted px-4 font-mono text-base font-bold tracking-[0.2em] text-foreground/80 italic line-through select-none">
                    {captchaText}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={generateCaptcha}
                    aria-label="Tạo mã mới"
                  >
                    <RefreshCw />
                  </Button>
                </div>
              </Field>
            </FormSection>

            <div className="surface-card flex flex-col-reverse gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Bằng việc đăng ký, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật.
              </p>
              <div className="flex gap-3">
                <Button asChild type="button" variant="outline" size="lg">
                  <Link href="/register">Quay lại</Link>
                </Button>
                <Button type="submit" size="lg" disabled={loading}>
                  {loading && <Loader2 className="animate-spin" />}
                  {loading ? 'Đang đăng ký...' : 'Hoàn tất đăng ký'}
                </Button>
              </div>
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Đã có tài khoản?{' '}
            <Link href="/login?role=employer" className="link-brand">
              Đăng nhập nhà tuyển dụng
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  )
}
