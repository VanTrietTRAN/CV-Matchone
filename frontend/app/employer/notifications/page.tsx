'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import EmptyState from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { BellOff, Trash2, CheckCheck, Zap, User, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/format'
import { matchTone } from '@/components/MatchBadge'
import { refreshUnreadCount } from '@/hooks/use-unread-count'

type Notification = {
  _id: string
  type: string
  title: string
  body: string
  matchingScore: number | null
  jobId: { _id: string; title: string } | null
  candidateId: { _id: string; email: string } | null
  cvProfileId: { _id: string; fullName: string } | null
  applicationId: string | null
  isRead: boolean
  createdAt: string
}

export default function EmployerNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
  const router = useRouter()

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Notification[] }>('/api/notifications')
      setNotifications(res.data || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleMarkRead = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)))
      refreshUnreadCount()
      // Ở tab "Chưa đọc" thông báo sẽ biến mất khỏi danh sách — nói rõ nó đi đâu
      if (filter === 'unread') toast.success('Đã chuyển sang tab “Đã đọc”')
    } catch {
      toast.error('Không thể đánh dấu đã đọc')
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PATCH' })
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      refreshUnreadCount()
      toast.success('Đã đánh dấu tất cả là đã đọc')
    } catch {
      toast.error('Có lỗi xảy ra')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' })
      setNotifications((prev) => prev.filter((n) => n._id !== id))
      refreshUnreadCount()
      toast.success('Đã xoá thông báo')
    } catch {
      toast.error('Không thể xoá thông báo')
    }
  }

  const handleViewCandidate = (notif: Notification) => {
    router.push(
      notif.jobId ? `/employer/candidates?jobId=${notif.jobId._id}` : '/employer/candidates',
    )
    if (!notif.isRead) handleMarkRead(notif._id)
  }

  // Mỗi chế độ là một lát cắt riêng: đánh dấu đã đọc sẽ chuyển thông báo
  // từ tab "Chưa đọc" sang tab "Đã đọc" ngay lập tức.
  const displayed =
    filter === 'unread'
      ? notifications.filter((n) => !n.isRead)
      : filter === 'read'
        ? notifications.filter((n) => n.isRead)
        : notifications
  const unreadCount = notifications.filter((n) => !n.isRead).length
  const readCount = notifications.length - unreadCount

  return (
    <EmployerLayout>
      <PageContainer size="md">
        <PageHeader
          title="Thông báo tuyển dụng"
          description={
            unreadCount > 0
              ? `Bạn có ${unreadCount} thông báo chưa đọc`
              : 'Bạn đã đọc hết thông báo'
          }
          actions={
            unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                <CheckCheck />
                Đánh dấu tất cả đã đọc
              </Button>
            )
          }
        />

        <div className="mb-5 flex flex-wrap gap-2">
          {(['all', 'unread', 'read'] as const).map((f) => (
            <button
              key={f}
              type="button"
              data-active={filter === f}
              onClick={() => setFilter(f)}
              className="chip"
            >
              {f === 'all' && `Tất cả (${notifications.length})`}
              {f === 'unread' && `Chưa đọc (${unreadCount})`}
              {f === 'read' && `Đã đọc (${readCount})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-28 rounded-xl" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="surface-card">
            <EmptyState
              icon={BellOff}
              title={
                filter === 'unread'
                  ? 'Không có thông báo chưa đọc'
                  : filter === 'read'
                    ? 'Chưa đọc thông báo nào'
                    : 'Chưa có thông báo nào'
              }
              description={
                filter === 'unread'
                  ? 'Bạn đã xử lý hết thông báo mới.'
                  : filter === 'read'
                    ? 'Các thông báo bạn đã đọc sẽ được chuyển sang đây.'
                    : 'Thông báo sẽ xuất hiện khi có ứng viên nộp hồ sơ hoặc khi AI tìm được ứng viên phù hợp.'
              }
              action={
                filter === 'all'
                  ? { label: 'Đăng tin tuyển dụng', href: '/employer/post-job' }
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map((notif) => (
              <article
                key={notif._id}
                className={cn(
                  'surface-card relative p-4',
                  !notif.isRead && 'border-brand-200 bg-brand-50/40',
                )}
              >
                {!notif.isRead && (
                  <span className="absolute top-4 right-4 size-2 rounded-full bg-danger" />
                )}

                <div className="flex gap-3 pr-6">
                  <span
                    className={cn(
                      'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
                      notif.matchingScore && notif.matchingScore >= 70
                        ? 'bg-brand-500 text-white'
                        : 'bg-brand-50 text-brand-600',
                    )}
                  >
                    <Zap className="size-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm leading-snug font-semibold',
                        notif.isRead && 'text-foreground/75',
                      )}
                    >
                      {notif.title}
                    </p>

                    {notif.body && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {notif.body}
                      </p>
                    )}

                    {(notif.cvProfileId?.fullName || notif.candidateId?.email) && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="size-3" />
                        {notif.cvProfileId?.fullName || notif.candidateId?.email}
                      </p>
                    )}

                    {notif.jobId?.title && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Briefcase className="size-3" />
                        Vị trí:{' '}
                        <span className="font-semibold text-foreground/80">
                          {notif.jobId.title}
                        </span>
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2.5">
                      {notif.matchingScore != null && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
                            matchTone(notif.matchingScore),
                          )}
                        >
                          <Zap className="size-3" />
                          {notif.matchingScore}% phù hợp
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {notif.candidateId && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleViewCandidate(notif)}
                        >
                          <User />
                          Xem hồ sơ ứng viên
                        </Button>
                      )}
                      {!notif.isRead && (
                        <Button size="xs" variant="ghost" onClick={() => handleMarkRead(notif._id)}>
                          <CheckCheck />
                          Đã đọc
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-danger-foreground hover:bg-danger/10 hover:text-danger-foreground"
                        onClick={() => handleDelete(notif._id)}
                      >
                        <Trash2 />
                        Xoá
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </PageContainer>
    </EmployerLayout>
  )
}
