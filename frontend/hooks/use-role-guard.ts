'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, type AuthResponse } from '@/lib/api'
import { getStoredUser, setAuth, type StoredUser } from '@/lib/auth-storage'

export type Role = 'candidate' | 'employer' | 'admin'

/** Khu quản lý của từng vai trò — đích của nút "Quản lý" trên thanh trên cùng. */
export const HOME_BY_ROLE: Record<Role, string> = {
  candidate: '/candidate/dashboard',
  employer: '/employer/dashboard',
  admin: '/admin/dashboard',
}

/**
 * Nơi đưa người dùng tới ngay sau khi đăng nhập / xác thực xong.
 *
 * Ứng viên và nhà tuyển dụng vào trang chủ để tìm tin trước đã — đăng nhập xong
 * mà rơi thẳng vào bảng điều khiển thì không còn đường xem tin của người khác.
 * Muốn vào khu quản lý thì bấm "Quản lý" ở góc trên bên phải.
 * Admin không có việc gì ở trang chủ nên vẫn vào thẳng bảng điều khiển.
 */
export const LANDING_BY_ROLE: Record<Role, string> = {
  candidate: '/',
  employer: '/',
  admin: '/admin/dashboard',
}

/** Nhãn khu quản lý, dùng cho tooltip / menu tài khoản ngoài trang công khai. */
export const AREA_LABEL: Record<Role, string> = {
  candidate: 'Khu vực ứng viên',
  employer: 'Khu vực nhà tuyển dụng',
  admin: 'Khu vực quản trị',
}

type GuardState =
  | { status: 'checking'; user: StoredUser | null }
  | { status: 'allowed'; user: StoredUser }
  | { status: 'denied'; user: StoredUser | null }

/**
 * Chặn truy cập chéo vai trò trong khu vực đăng nhập.
 *
 * Trước đây các layout chỉ vẽ sidebar theo `variant` mà không hề kiểm tra vai trò
 * thật của phiên đăng nhập, nên gõ thẳng /candidate/... khi đang là nhà tuyển dụng
 * vẫn vào được và thanh trên còn ghi nhầm "Ứng viên".
 *
 * Kiểm tra 2 lớp:
 *  1. localStorage — chặn tức thì, không kịp nháy nội dung sai.
 *  2. /api/auth/me — nguồn sự thật (đọc HTTPOnly cookie), sửa lại localStorage nếu lệch.
 *
 * Admin đi được mọi khu vực để còn hỗ trợ vận hành.
 */
export function useRoleGuard(required: Role): GuardState {
  const router = useRouter()
  const [state, setState] = useState<GuardState>({ status: 'checking', user: null })

  useEffect(() => {
    let cancelled = false

    const allow = (role: Role) => role === required || role === 'admin'

    const stored = getStoredUser()
    if (stored && !allow(stored.role)) {
      router.replace(HOME_BY_ROLE[stored.role])
      setState({ status: 'denied', user: stored })
      return
    }
    if (stored) setState({ status: 'allowed', user: stored })

    apiFetch<AuthResponse>('/api/auth/me', { method: 'GET' })
      .then((me) => {
        if (cancelled) return
        const user: StoredUser = { id: me._id, email: me.email, role: me.role }
        // Đồng bộ lại localStorage phòng khi vai trò đã đổi ở phía server
        if (!stored || stored.role !== me.role || stored.email !== me.email) setAuth(user)

        if (!allow(me.role)) {
          router.replace(HOME_BY_ROLE[me.role])
          setState({ status: 'denied', user })
          return
        }
        setState({ status: 'allowed', user })
      })
      .catch(() => {
        // apiFetch đã tự dọn session và đưa về /login khi gặp 401
        if (!cancelled) setState({ status: 'denied', user: null })
      })

    return () => {
      cancelled = true
    }
  }, [required, router])

  return state
}
