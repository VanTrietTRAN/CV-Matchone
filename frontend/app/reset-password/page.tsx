'use client'

import React, { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PublicLayout from '@/layouts/PublicLayout'
import PasswordInput from '@/components/auth/PasswordInput'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { Lock, ArrowLeft, CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      toast.error('Mã xác thực không tồn tại hoặc đã bị lỗi!')
      return
    }
    if (password.length < 6) {
      toast.error('Mật khẩu mới phải có ít nhất 6 ký tự!')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không trùng khớp!')
      return
    }

    setLoading(true)
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      toast.success(res.message || 'Đặt lại mật khẩu thành công!')
      setSuccess(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Đặt lại mật khẩu thất bại')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-danger-surface text-danger-foreground">
          <ShieldAlert className="size-7" />
        </span>
        <h1 className="mt-5 text-xl font-bold">Đường dẫn không hợp lệ</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          Liên kết đặt lại mật khẩu đã hết hạn hoặc thiếu mã xác thực. Hãy gửi lại yêu cầu mới.
        </p>
        <Button asChild className="mt-6 w-full" size="lg">
          <Link href="/forgot-password">Gửi lại yêu cầu</Link>
        </Button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="mt-5 text-xl font-bold">Đã đổi mật khẩu thành công</h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Đang chuyển tới trang đăng nhập trong giây lát...
        </p>
        <Button asChild className="mt-6 w-full" size="lg">
          <Link href="/login">Đăng nhập ngay</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <Lock className="size-6" />
      </span>

      <h1 className="mt-5 text-2xl font-bold">Đặt lại mật khẩu</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Tạo mật khẩu mới cho tài khoản của bạn. Nên dùng tối thiểu 8 ký tự, có chữ hoa và số.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
            Mật khẩu mới <span className="text-danger">*</span>
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
            Xác nhận mật khẩu mới <span className="text-danger">*</span>
          </label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Nhập lại mật khẩu mới"
            minLength={6}
            required
          />
          {confirmPassword && confirmPassword !== password && (
            <p className="mt-1.5 text-xs text-danger-foreground">Mật khẩu xác nhận chưa khớp</p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {loading ? 'Đang cập nhật...' : 'Xác nhận đổi mật khẩu'}
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <PublicLayout hideFooter>
      <div className="hero-surface flex min-h-[calc(100vh-var(--header-h))] items-center justify-center px-4 py-14">
        <div className="surface-card w-full max-w-md p-6 sm:p-8">
          <Suspense
            fallback={
              <div className="py-10 text-center text-sm text-muted-foreground">Đang tải...</div>
            }
          >
            <ResetPasswordForm />
          </Suspense>

          <div className="mt-6 border-t border-border pt-5 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
            >
              <ArrowLeft className="size-4" />
              Quay lại trang đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
