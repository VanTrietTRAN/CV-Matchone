'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { Loader2, Mail, RotateCw } from 'lucide-react'

export type WelcomeQueue = {
  pending: number
  sent: number
  failed: number
  skipped: number
  schoolSent: number
  schoolDomain: string
  pendingRecipients: number
  sentToday: number
  dailyCap: number
  remainingToday: number
  estimatedDaysLeft: number
  batchSize: number
  hourlyCap?: number
  gapSeconds?: [number, number]
  breaker?: { state: 'CLOSED' | 'THROTTLED' | 'OPEN' | 'HALF_OPEN'; lastTripReason?: string; resumeAt?: string }
  cooldownToday?: boolean
  warmup?: { stage: number; label: string }
  pausedBatches?: { batchId: string; reason?: string }[]
  failedUsers: { email: string; fullName?: string; studentId?: string; welcomeEmailError?: string }[]
}

/**
 * Hàng đợi thư mời của tài khoản do admin import.
 *
 * Import chỉ tạo tài khoản; thư gửi dần ở nền theo hạn mức Brevo, nên admin cần
 * một chỗ nhìn thấy tiến độ và gửi lại những thư hỏng.
 *
 * Sinh viên và doanh nghiệp dùng chung một hàng đợi và chung hạn mức ngày, nhưng
 * mỗi trang chỉ hiện số liệu của loại tài khoản mình phụ trách (`role`) — trộn
 * hai con số vào nhau thì không ai biết đang chờ gửi cho ai.
 */
export default function WelcomeQueuePanel({
  role,
  unitLabel,
  skippedNote,
  onQueue,
}: {
  role: 'candidate' | 'employer'
  /** "sinh viên" / "doanh nghiệp" — dùng trong các câu mô tả */
  unitLabel: string
  /** Giải thích vì sao có thư bị bỏ qua, khác nhau giữa hai loại tài khoản */
  skippedNote: string
  onQueue?: (queue: WelcomeQueue | null) => void
}) {
  const [queue, setQueue] = useState<WelcomeQueue | null>(null)
  const [retrying, setRetrying] = useState(false)

  // Giữ callback trong ref: trang cha thường truyền một arrow function mới ở mỗi
  // lần render, để nó vào mảng phụ thuộc thì mỗi lần nhận số liệu lại dựng lại
  // interval rồi gọi tiếp — vòng lặp render không có điểm dừng.
  const onQueueRef = useRef(onQueue)
  onQueueRef.current = onQueue

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: WelcomeQueue }>(
        `/api/admin/import/welcome-queue?role=${role}`,
      )
      setQueue(res.data)
      onQueueRef.current?.(res.data)
    } catch {
      // Không chặn trang import chỉ vì không đọc được số liệu hàng đợi
    }
  }, [role])

  useEffect(() => {
    load()
    // Còn thư đang chờ thì làm mới để admin thấy tiến độ nhích dần
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  const handleRetry = async () => {
    setRetrying(true)
    try {
      const res = await apiFetch<{ message: string }>(
        `/api/admin/import/welcome-queue/retry?role=${role}`,
        { method: 'POST' },
      )
      toast.success(res.message)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không xếp lại được hàng đợi')
    } finally {
      setRetrying(false)
    }
  }

  if (!queue) return null

  const isCandidate = role === 'candidate'

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wider text-slate-400 uppercase">
          <Mail className="size-4" />
          Hàng đợi thư mời {unitLabel}
        </h2>
        {queue.failed > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCw className="size-4" />
            )}
            Gửi lại {queue.failed} thư hỏng
          </Button>
        )}
      </div>

      <div className={`grid grid-cols-2 gap-3 ${isCandidate ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <QueueStat
          label="Đang chờ gửi"
          value={queue.pending}
          hint={
            queue.pendingRecipients > queue.pending ? `${queue.pendingRecipients} lượt gửi` : undefined
          }
          tone="wait"
        />
        <QueueStat label="Đã gửi" value={queue.sent} tone="ok" />
        {isCandidate && (
          <QueueStat
            label="Đã gửi email trường"
            value={queue.schoolSent}
            hint={`@${queue.schoolDomain}`}
            tone="ok"
          />
        )}
        <QueueStat label="Gửi hỏng" value={queue.failed} tone="bad" />
        <QueueStat
          label="Lượt gửi còn hôm nay"
          value={queue.remainingToday}
          hint={`${queue.sentToday}/${queue.dailyCap}`}
          tone="wait"
        />
      </div>

      {queue.pending > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Thư mời đi theo làn riêng (P1): tối đa {queue.hourlyCap ?? queue.batchSize} thư/giờ
          {queue.gapSeconds && `, mỗi thư cách nhau ${queue.gapSeconds[0]}–${queue.gapSeconds[1]} giây`}, hôm nay tối
          đa {queue.dailyCap} lượt, dùng chung cho thư sinh viên lẫn thư doanh nghiệp. Thư đổi mật khẩu có suất riêng
          nên không bị hàng đợi này chiếm chỗ.
          {queue.warmup && queue.warmup.stage < 4 && ` Đang warm-up (${queue.warmup.label}) nên trần ngày thấp hơn bình thường.`}
          {queue.estimatedDaysLeft > 0 &&
            ` Ước tính cần thêm ${queue.estimatedDaysLeft} ngày để gửi hết.`}
        </p>
      )}

      {queue.pending > 0 && queue.breaker && queue.breaker.state !== 'CLOSED' && (
        <p className="mt-3 rounded-lg bg-warning-surface/20 p-3 text-xs text-amber-300">
          {queue.breaker.state === 'OPEN'
            ? 'Circuit Breaker đang NGẮT thư mời'
            : queue.breaker.state === 'THROTTLED'
              ? 'Circuit Breaker đang GIẢM TỐC (50%, 1 thư/2 phút)'
              : 'Đang gửi thăm dò sau sự cố'}
          {queue.breaker.lastTripReason && ` — ${queue.breaker.lastTripReason}`}
          {queue.breaker.resumeAt && `, tới ${new Date(queue.breaker.resumeAt).toLocaleString('vi-VN')}`}. Xem
          chi tiết ở trang Hệ thống.
        </p>
      )}

      {queue.pending > 0 && queue.cooldownToday && (
        <p className="mt-3 text-xs text-slate-400">Hôm nay là ngày nghỉ của thư mời — hàng đợi chạy tiếp vào ngày mai.</p>
      )}

      {(queue.pausedBatches?.length ?? 0) > 0 && (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger-surface/20 p-3 text-xs text-red-300">
          {queue.pausedBatches!.length} lô import bị dừng vì sinh nhiều hard bounce (
          {queue.pausedBatches!.map((b) => b.batchId).join(', ')}). Rà lại file gốc rồi mở lại ở trang Hệ thống.
        </p>
      )}

      {queue.skipped > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          {queue.skipped} thư không gửi: {skippedNote}
        </p>
      )}

      {queue.remainingToday === 0 && queue.pending > 0 && !queue.cooldownToday && (
        <p className="mt-3 text-xs text-slate-400">
          Làn thư mời đã dùng hết suất hôm nay — phần còn lại tự gửi tiếp vào ngày mai.
        </p>
      )}

      {queue.failedUsers?.length > 0 && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger-surface/20 p-3">
          <p className="mb-2 text-xs font-semibold text-red-300">Tài khoản chưa nhận được thư</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-200/80">
            {queue.failedUsers.map((u) => (
              <li key={u.email}>
                {u.email} — {u.welcomeEmailError}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function QueueStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint?: string
  tone: 'ok' | 'wait' | 'bad'
}) {
  const tones = {
    ok: 'border-brand-500/30 bg-brand-500/10 text-brand-300',
    wait: 'border-slate-700 bg-slate-800 text-slate-200',
    bad: 'border-red-500/30 bg-red-500/10 text-red-300',
  }
  return (
    <div className={`rounded-lg border p-3 text-center ${tones[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] opacity-70">{hint}</p>}
    </div>
  )
}
