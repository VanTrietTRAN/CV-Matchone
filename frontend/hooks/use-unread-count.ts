'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

/**
 * Số thông báo chưa đọc, dùng chung cho topbar và sidebar.
 *
 * Sidebar được mount hai lần (bản cố định trên desktop + bản trong drawer mobile),
 * nên nếu mỗi component tự đặt setInterval sẽ có nhiều request trùng nhau.
 * Store singleton bên dưới giữ đúng MỘT vòng polling cho cả trang.
 */

const POLL_INTERVAL = 30_000

let count = 0
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<(value: number) => void>()

async function fetchCount() {
  try {
    const data = await apiFetch<{ count: number }>('/api/notifications/unread-count')
    const next = data.count || 0
    if (next !== count) {
      count = next
      listeners.forEach((listener) => listener(count))
    }
  } catch {
    /* im lặng — không chặn UI khi backend chưa sẵn sàng */
  }
}

function subscribe(listener: (value: number) => void) {
  listeners.add(listener)

  if (timer === null) {
    fetchCount()
    timer = setInterval(fetchCount, POLL_INTERVAL)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function useUnreadCount(enabled = true) {
  const [value, setValue] = useState(count)

  useEffect(() => {
    if (!enabled) return
    setValue(count)
    return subscribe(setValue)
  }, [enabled])

  return enabled ? value : 0
}

/** Gọi sau khi đánh dấu đã đọc / xoá thông báo để đồng bộ ngay lập tức */
export function refreshUnreadCount() {
  if (listeners.size > 0) fetchCount()
}
