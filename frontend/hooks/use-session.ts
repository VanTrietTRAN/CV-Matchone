'use client'

import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiFetch, type AuthResponse } from '@/lib/api'
import { clearAuth, setAuth, type StoredUser } from '@/lib/auth-storage'

type SessionState = {
  user: StoredUser | null
  /** Còn đang hỏi server — dùng để không nháy nút "Đăng nhập" cho người đã đăng nhập */
  loading: boolean
  refresh: () => void
}

/**
 * Phiên đăng nhập nhìn từ các trang công khai (trang chủ, danh sách việc làm,
 * chi tiết tin).
 *
 * Khác với `useRoleGuard`: hook này KHÔNG chặn và không chuyển hướng ai cả —
 * chưa đăng nhập là trạng thái hợp lệ ở đây. Nhờ `allowUnauthenticated`, lần
 * gọi /api/auth/me trả 401 cũng không đá khách vãng lai sang trang đăng nhập.
 *
 * Không đọc localStorage ở lần render đầu: server render ra null, nếu client
 * dựng sẵn người dùng thì hai bên lệch nhau và React báo lỗi hydrate.
 */
export function useSession(): SessionState {
  const [user, setUser] = useState<StoredUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    apiFetch<AuthResponse>('/api/auth/me', { method: 'GET', allowUnauthenticated: true })
      .then((me) => {
        if (cancelled) return
        const next: StoredUser = { id: me._id, email: me.email, role: me.role }
        setAuth(next)
        setUser(next)
      })
      .catch((err) => {
        if (cancelled) return
        // Chỉ 401 mới là "phiên không còn"; mất mạng hay server chết thì giữ
        // nguyên thông tin đã lưu, đợi lần tải sau.
        if (err instanceof ApiError && err.status === 401) clearAuth()
        setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tick])

  return { user, loading, refresh }
}
