'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import CandidateLayout from '@/layouts/CandidateLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import EmptyState from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { BellOff, Trash2, ExternalLink, CheckCheck, Zap, ChevronDown, Settings } from 'lucide-react'
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
  jobId: { _id: string; title: string; location?: string } | null
  cvProfileId: { _id: string; fullName: string } | null
  isRead: boolean
  createdAt: string
}

type Group = {
  key: string
  job: { _id: string; title: string; location?: string } | null
  items: Notification[]
}

/** Gộp các thông báo cùng một job thành 1 nhóm. Thông báo không gắn job thì đứng riêng. */
function groupByJob(list: Notification[]): Group[] {
  const groups: Group[] = []
  const indexByKey = new Map<string, number>()
  for (const n of list) {
    const key = n.jobId?._id ? `job-${n.jobId._id}` : `single-${n._id}`
    const existing = indexByKey.get(key)
    if (existing === undefined) {
      indexByKey.set(key, groups.length)
      groups.push({ key, job: n.jobId, items: [n] })
    } else {
      groups[existing].items.push(n)
    }
  }
  return groups
}

export default function CandidateNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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
    } catch {
      toast.error('Không thể đánh dấu đã đọc')
    }
  }

  const handleMarkGroupRead = async (items: Notification[]) => {
    const unread = items.filter((n) => !n.isRead)
    if (unread.length === 0) return
    await Promise.allSettled(unread.map((n) => handleMarkRead(n._id)))
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

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const displayed = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications
  const unreadCount = notifications.filter((n) => !n.isRead).length
  const groups = groupByJob(displayed)

  /** Một dòng thông báo (dùng cho cả thẻ đơn lẫn item trong nhóm). */
  const NotifRow = ({ notif, nested }: { notif: Notification; nested?: boolean }) => (
    <div className={cn(nested && 'mt-3 border-t border-border pt-3')}>
      <p className={cn('text-sm leading-snug font-semibold', notif.isRead && 'text-foreground/75')}>
        {notif.title}
      </p>

      {notif.body && (
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{notif.body}</p>
      )}

      {notif.cvProfileId?.fullName && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-brand-400" />
          Dựa trên CV:
          <span className="font-semibold text-foreground/80">{notif.cvProfileId.fullName}</span>
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
        <span className="text-xs text-muted-foreground">{formatRelativeTime(notif.createdAt)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
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
  )

  return (
    <CandidateLayout>
      <PageContainer size="md">
        <PageHeader
          title="Thông báo"
          description={
            unreadCount > 0
              ? `Bạn có ${unreadCount} thông báo chưa đọc`
              : 'Bạn đã đọc hết thông báo'
          }
          actions={
            <>
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                  <CheckCheck />
                  Đánh dấu tất cả đã đọc
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/candidate/notification-settings">
                  <Settings />
                  Cài đặt
                </Link>
              </Button>
            </>
          }
        />

        <div className="mb-5 flex gap-2">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              type="button"
              data-active={filter === f}
              onClick={() => setFilter(f)}
              className="chip"
            >
              {f === 'all'
                ? `Tất cả (${notifications.length})`
                : `Chưa đọc${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 rounded-xl" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="surface-card">
            <EmptyState
              icon={BellOff}
              title={filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
              description={
                filter === 'unread'
                  ? 'Bạn đã xử lý hết thông báo. Quay lại tab “Tất cả” để xem lịch sử.'
                  : 'Bật thông báo việc làm để nhận tin ngay khi có vị trí phù hợp với hồ sơ của bạn.'
              }
              action={
                filter === 'all'
                  ? { label: 'Cài đặt thông báo', href: '/candidate/notification-settings' }
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const groupUnread = group.items.some((n) => !n.isRead)
              const isGroup = group.items.length > 1
              const latest = group.items[0]

              const cardClass = cn(
                'surface-card p-4 transition-colors',
                groupUnread && 'border-brand-200 bg-brand-50/40',
              )

              // Thẻ đơn: 1 thông báo
              if (!isGroup) {
                return (
                  <div key={group.key} className={cardClass}>
                    <div className="flex gap-3">
                      <span
                        className={cn(
                          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
                          latest.matchingScore && latest.matchingScore >= 70
                            ? 'bg-brand-500 text-white'
                            : 'bg-brand-50 text-brand-600',
                        )}
                      >
                        <Zap className="size-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <NotifRow notif={latest} />
                        {latest.jobId && (
                          <Button asChild size="xs" variant="outline" className="mt-2">
                            <Link href={`/candidate/jobs/${latest.jobId._id}`}>
                              <ExternalLink />
                              Xem tin tuyển dụng
                            </Link>
                          </Button>
                        )}
                      </div>

                      {!latest.isRead && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" />
                      )}
                    </div>
                  </div>
                )
              }

              // Thẻ nhóm: nhiều thông báo cùng một tin tuyển dụng
              const isOpen = expanded.has(group.key)
              const visibleItems = isOpen ? group.items : group.items.slice(0, 1)

              return (
                <div key={group.key} className={cardClass}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                      <Zap className="size-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold">{group.job?.title || 'Thông báo'}</p>
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                          {group.items.length} cập nhật
                        </span>
                        {groupUnread && <span className="size-2 rounded-full bg-danger" />}
                      </div>

                      {group.job?.location && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{group.job.location}</p>
                      )}

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {group.job && (
                          <Button asChild size="xs" variant="outline">
                            <Link href={`/candidate/jobs/${group.job._id}`}>
                              <ExternalLink />
                              Xem tin tuyển dụng
                            </Link>
                          </Button>
                        )}
                        {groupUnread && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleMarkGroupRead(group.items)}
                          >
                            <CheckCheck />
                            Đánh dấu nhóm đã đọc
                          </Button>
                        )}
                        <Button size="xs" variant="ghost" onClick={() => toggleExpand(group.key)}>
                          <ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />
                          {isOpen ? 'Thu gọn' : `Xem thêm ${group.items.length - 1} thông báo`}
                        </Button>
                      </div>

                      <div className="mt-1">
                        {visibleItems.map((n, idx) => (
                          <NotifRow key={n._id} notif={n} nested={idx > 0} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PageContainer>
    </CandidateLayout>
  )
}
