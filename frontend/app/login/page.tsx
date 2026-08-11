'use client'

import React, { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import PublicLayout from '@/layouts/PublicLayout'
import AuthAside from '@/components/auth/AuthAside'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { setAuth } from '@/lib/auth-storage'
import { apiFetch, type AuthResponse } from '@/lib/api'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'candidate' | 'employer'>('candidate')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Xử lý OAuth callback redirect: backend đã gắn cookie, chỉ cần điều hướng đúng trang
  useEffect(() => {
    const oauthSuccess = searchParams.get('oauth')
    const error = searchParams.get('error')

    if (error) {
      const errMap: Record<string, string> = {
        oauth_disabled: 'Đăng nhập mạng xã hội chưa được kích hoạt trên server này.',
        auth_failed: 'Đăng nhập thất bại. Vui lòng thử lại.',
        email_required: 'Tài khoản mạng xã hội không có email. Hãy dùng email/mật khẩu.',
      }
      const msg = errMap[error] || searchParams.get('message') || 'Đăng nhập mạng xã hội thất bại.'
      toast.error(decodeURIComponent(msg))
      router.replace('/login')
      return
    }

    if (oauthSuccess === 'success') {
      apiFetch<AuthResponse>('/api/auth/me', { method: 'GET' })
        .then((data) => {
          setAuth({ id: data._id, email: data.email, role: data.role })
          toast.success('Đăng nhập thành công!')
          router.push(data.role === 'employer' ? '/employer/dashboard' : '/candidate/dashboard')
        })
        .catch(() => {
          toast.error('Xác thực thất bại. Vui lòng đăng nhập lại.')
          router.replace('/login')
        })
    }
  }, [searchParams, router])

  useEffect(() => {
    if (searchParams.get('role') === 'employer') setActiveTab('employer')
  }, [searchParams])

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'candidate' | 'employer')
    setEmail('')
    setPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const data = await apiFetch<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role: activeTab }),
      })

      setAuth({ id: data._id, email: data.email, role: data.role })
      setLoading(false)

      if (data.role === 'admin') {
        router.push('/admin/dashboard')
      } else {
        router.push(data.role === 'employer' ? '/employer/dashboard' : '/candidate/dashboard')
      }
    } catch (err) {
      setLoading(false)
      toast.error(err instanceof Error ? err.message : 'Đăng nhập thất bại')
    }
  }

  const isEmployer = activeTab === 'employer'

  return (
    <PublicLayout hideFooter>
      <div className="grid min-h-[calc(100vh-var(--header-h))] lg:grid-cols-2">
        <AuthAside
          eyebrow={isEmployer ? 'Dành cho nhà tuyển dụng' : 'Dành cho ứng viên'}
          title={
            isEmployer
              ? 'Tuyển đúng người, nhanh hơn'
              : 'Chào mừng bạn quay lại Smart Recruit'
          }
          description={
            isEmployer
              ? 'Đăng nhập để quản lý tin tuyển dụng và xem danh sách ứng viên đã được AI xếp hạng theo mức độ phù hợp.'
              : 'Đăng nhập để xem điểm phù hợp của bạn với từng vị trí và theo dõi hồ sơ đã ứng tuyển.'
          }
          points={
            isEmployer
              ? [
                  'Ứng viên được xếp hạng theo điểm phù hợp',
                  'Quản lý tin tuyển dụng ở một nơi',
                  'Trang công ty và đánh giá minh bạch',
                ]
              : [
                  'Điểm phù hợp cho từng tin tuyển dụng',
                  'Theo dõi trạng thái hồ sơ đã nộp',
                  'Thông báo khi có việc làm mới phù hợp',
                ]
          }
        />

        <div className="flex items-center justify-center px-4 py-12 sm:px-8">
          <div className="w-full max-w-md">
            <h1 className="text-2xl font-bold sm:text-3xl">Đăng nhập</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Chưa có tài khoản?{' '}
              <Link href="/register" className="link-brand">
                Đăng ký miễn phí
              </Link>
            </p>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="candidate">Ứng viên</TabsTrigger>
                <TabsTrigger value="employer">Nhà tuyển dụng</TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={isEmployer ? 'hr@congty.vn' : 'ban@email.com'}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
                  Mật khẩu
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className="pr-11 pl-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-[var(--brand-500)]"
                  />
                  Ghi nhớ đăng nhập
                </label>
                <Link href="/forgot-password" className="link-brand">
                  Quên mật khẩu?
                </Link>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>
            </form>

            <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
              Bằng việc đăng nhập, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật của Smart
              Recruit.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginContent />
    </Suspense>
  )
}
