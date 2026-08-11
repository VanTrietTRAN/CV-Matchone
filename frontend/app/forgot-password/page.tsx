'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import PublicLayout from '@/layouts/PublicLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { KeyRound, ArrowLeft, Mail, MailCheck, Loader2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Vui lòng nhập địa chỉ email của bạn')
      return
    }

    setLoading(true)
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      toast.success(res.message || 'Đã gửi hướng dẫn đặt lại mật khẩu!')
      setSubmitted(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể gửi yêu cầu đặt lại mật khẩu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicLayout hideFooter>
      <div className="hero-surface flex min-h-[calc(100vh-var(--header-h))] items-center justify-center px-4 py-14">
        <div className="surface-card w-full max-w-md p-6 sm:p-8">
          {submitted ? (
            <div className="text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
                <MailCheck className="size-7" />
              </span>
              <h1 className="mt-5 text-xl font-bold">Kiểm tra hộp thư của bạn</h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Nếu <strong className="text-foreground">{email}</strong> đã đăng ký trên hệ thống,
                chúng tôi vừa gửi một đường dẫn đặt lại mật khẩu có hiệu lực trong 60 phút.
              </p>
              <p className="mt-2.5 text-xs text-muted-foreground">
                Không thấy email? Hãy kiểm tra cả thư mục Spam / Quảng cáo.
              </p>

              <div className="mt-6 flex flex-col gap-2.5">
                <Button asChild size="lg">
                  <Link href="/login">Quay lại đăng nhập</Link>
                </Button>
                <Button variant="ghost" onClick={() => setSubmitted(false)}>
                  Gửi lại với email khác
                </Button>
              </div>
            </div>
          ) : (
            <>
              <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <KeyRound className="size-6" />
              </span>

              <h1 className="mt-5 text-2xl font-bold">Quên mật khẩu?</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Nhập email đã đăng ký, chúng tôi sẽ gửi đường dẫn để bạn tạo mật khẩu mới.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
                    Địa chỉ email <span className="text-danger">*</span>
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

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading && <Loader2 className="animate-spin" />}
                  {loading ? 'Đang gửi...' : 'Gửi đường dẫn đặt lại'}
                </Button>
              </form>

              <div className="mt-6 border-t border-border pt-5 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
                >
                  <ArrowLeft className="size-4" />
                  Quay lại trang đăng nhập
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  )
}
