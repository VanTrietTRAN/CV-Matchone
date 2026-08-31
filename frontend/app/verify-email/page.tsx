'use client'

import React, { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiFetch, type AuthResponse } from '@/lib/api'
import { setAuth } from '@/lib/auth-storage'
import { HOME_BY_ROLE } from '@/hooks/use-role-guard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Logo from '@/components/brand/Logo'
import { Loader2, MailCheck, RotateCw } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Nhập mã 6 số gửi về email để kích hoạt tài khoản mới.
 *
 * Đăng ký xong hệ thống không đăng nhập ngay nữa mà chuyển sang trang này. Nhập
 * đúng mã là vào thẳng khu vực của vai trò tương ứng, không phải đăng nhập lại.
 */

const CODE_LENGTH = 6
const RESEND_COOLDOWN = 60

function VerifyEmailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const emailFromUrl = searchParams.get('email') || ''

  const [email, setEmail] = useState(emailFromUrl)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Đếm ngược để không cho bấm gửi lại liên tục — mỗi lần bấm là một email thật
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== CODE_LENGTH) {
      toast.error(`Mã xác thực gồm ${CODE_LENGTH} chữ số.`)
      return
    }

    setLoading(true)
    try {
      const data = await apiFetch<AuthResponse & { alreadyVerified?: boolean; message?: string }>(
        '/api/auth/verify-email',
        { method: 'POST', body: JSON.stringify({ email, code }), skipAuth: true },
      )

      if (data.alreadyVerified) {
        toast.info(data.message || 'Tài khoản đã được xác thực.')
        router.push('/login')
        return
      }

      setAuth({ id: data._id, email: data.email, role: data.role })
      toast.success('Xác thực thành công! Chào mừng bạn đến với CVMatchOne.')
      router.push(HOME_BY_ROLE[data.role])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xác thực thất bại')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      toast.error('Vui lòng nhập địa chỉ email.')
      return
    }
    setResending(true)
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuth: true,
      })
      toast.success(res.message)
      setCooldown(RESEND_COOLDOWN)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không gửi lại được mã')
    } finally {
      setResending(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-brand-50">
              <MailCheck className="size-7 text-brand-600" />
            </div>
            <h1 className="text-2xl font-bold">Xác thực email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Chúng tôi đã gửi mã gồm {CODE_LENGTH} chữ số tới
              {email ? (
                <>
                  {' '}
                  <span className="font-medium text-foreground">{email}</span>.
                </>
              ) : (
                ' hộp thư của bạn.'
              )}{' '}
              Mã có hiệu lực trong 10 phút.
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            {!emailFromUrl && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@example.com"
                  required
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium">Mã xác thực</label>
              <Input
                ref={inputRef}
                // inputMode numeric để điện thoại bật bàn phím số
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                placeholder="000000"
                className="text-center font-mono text-2xl tracking-[0.5em]"
                required
              />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Xác thực và đăng nhập
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-4 text-center">
            <p className="text-sm text-muted-foreground">Không nhận được mã?</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 gap-2"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
            >
              {resending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Kiểm tra cả hộp thư rác. Đã có tài khoản?{' '}
              <Link href="/login" className="font-medium text-brand-600 hover:underline">
                Đăng nhập
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  )
}
