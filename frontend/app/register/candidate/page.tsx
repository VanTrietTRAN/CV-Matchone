'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PublicLayout from '@/layouts/PublicLayout'
import AuthAside from '@/components/auth/AuthAside'
import PasswordInput from '@/components/auth/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Loader2, Mail, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { setAuth } from '@/lib/auth-storage'
import { apiFetch, type AuthResponse } from '@/lib/api'

export default function CandidateSignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < 6) {
      toast.error('Mật khẩu cần ít nhất 6 ký tự')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp')
      return
    }
    if (!accepted) {
      toast.error('Vui lòng đồng ý với điều khoản sử dụng')
      return
    }

    setLoading(true)
    try {
      const data = await apiFetch<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, role: 'candidate' }),
        skipAuth: true,
      })

      setAuth({ id: data._id, email: data.email, role: data.role })
      toast.success('Đăng ký thành công! Hãy hoàn thiện hồ sơ để nhận gợi ý việc làm.')
      router.push('/candidate/cv')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đăng ký thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicLayout hideFooter>
      <div className="grid min-h-[calc(100vh-var(--header-h))] lg:grid-cols-2">
        <AuthAside
          eyebrow="Dành cho ứng viên"
          title="Tạo hồ sơ, để AI tìm việc giúp bạn"
          description="Chỉ cần email và mật khẩu để bắt đầu. Sau khi đăng ký, tải CV lên và hệ thống sẽ chấm điểm phù hợp cho từng tin tuyển dụng."
          points={[
            'Miễn phí toàn bộ tính năng dành cho ứng viên',
            'Xem điểm phù hợp trước khi ứng tuyển',
            'Nhận thông báo việc làm theo tiêu chí của bạn',
          ]}
        />

        <div className="flex items-center justify-center px-4 py-12 sm:px-8">
          <div className="w-full max-w-md">
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
              <Link href="/register">
                <ArrowLeft />
                Chọn lại loại tài khoản
              </Link>
            </Button>

            <h1 className="text-2xl font-bold sm:text-3xl">Đăng ký tài khoản ứng viên</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Đã có tài khoản?{' '}
              <Link href="/login" className="link-brand">
                Đăng nhập
              </Link>
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
                  Email <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ban@email.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
                  Mật khẩu <span className="text-danger">*</span>
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  minLength={6}
                  showStrength
                  required
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-semibold">
                  Xác nhận mật khẩu <span className="text-danger">*</span>
                </label>
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  required
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="mt-1.5 text-xs text-danger-foreground">
                    Mật khẩu xác nhận chưa khớp
                  </p>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--brand-500)]"
                />
                <span className="leading-relaxed">
                  Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật của Smart Recruit
                </span>
              </label>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
              </Button>
            </form>

            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-brand-100 bg-brand-50/60 p-3.5">
              <FileText className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <p className="text-xs leading-relaxed text-brand-800">
                Sau khi đăng ký, bạn sẽ được đưa tới mục <strong>Hồ sơ &amp; CV</strong> để tải CV
                lên. Đây là bước bắt buộc để hệ thống chấm điểm phù hợp cho từng việc làm.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
