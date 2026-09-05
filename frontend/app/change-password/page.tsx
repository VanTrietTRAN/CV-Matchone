'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ChangePasswordForm from '@/components/auth/ChangePasswordForm'
import Logo from '@/components/brand/Logo'
import { apiFetch, type AuthResponse } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-storage'
import { HOME_BY_ROLE } from '@/hooks/use-role-guard'
import { KeyRound, Loader2 } from 'lucide-react'

/**
 * Đổi mật khẩu bắt buộc ở lần đăng nhập đầu tiên.
 *
 * Tài khoản do admin import có mật khẩu tạm gửi qua email. Trang này chặn giữa
 * bước đăng nhập và khu vực làm việc cho tới khi người dùng đặt mật khẩu riêng.
 */
function ChangePasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isFirstLogin = searchParams.get('first') === '1'
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Xác nhận phiên còn hợp lệ; nếu đã đổi rồi thì không giữ người dùng lại đây
    apiFetch<AuthResponse & { mustChangePassword?: boolean }>('/api/auth/me')
      .then((me) => {
        if (isFirstLogin && !me.mustChangePassword) {
          router.replace(HOME_BY_ROLE[me.role])
          return
        }
        setChecking(false)
      })
      .catch(() => router.replace('/login'))
  }, [isFirstLogin, router])

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    )
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
              <KeyRound className="size-7 text-brand-600" />
            </div>
            <h1 className="text-2xl font-bold">
              {isFirstLogin ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}
            </h1>
            {isFirstLogin && (
              <p className="mt-2 text-sm text-muted-foreground">
                Tài khoản của bạn đang dùng mật khẩu tạm do hệ thống cấp. Hãy đặt một mật khẩu
                riêng trước khi tiếp tục.
              </p>
            )}
          </div>

          <ChangePasswordForm
            onSuccess={() => {
              const user = getStoredUser()
              router.replace(user ? HOME_BY_ROLE[user.role] : '/login')
            }}
          />

          {isFirstLogin && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Mật khẩu hiện tại là mật khẩu tạm trong email hệ thống gửi cho bạn.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={null}>
      <ChangePasswordInner />
    </Suspense>
  )
}
