'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Activity, AlertTriangle, Loader2, Play, RefreshCw, ShieldCheck } from 'lucide-react'

type BreakerState = 'CLOSED' | 'THROTTLED' | 'OPEN' | 'HALF_OPEN'

type EmailHealth = {
  breaker: {
    state: BreakerState
    resumeAt?: string
    lastTripReason?: string
    lastTripAt?: string
    probeSent?: number
    probeLimit: number
    smtpErrorStreak?: number
  }
  quota: {
    date: string
    providerLimit: number
    softCap: number
    buffer: number
    cooldownToday: boolean
    totalSent: number
    lanes: { lane: number; label: string; sent: number; cap: number; fullCap?: number; reserved?: boolean }[]
  }
  warmup: { stage: number; forced: boolean; label: string; since?: string; activeDays: number }
  signals: { last24h: Record<string, number>; softLastHour: number; sentLastHour: number }
  suppression: Record<string, number>
  outbox: Record<string, number>
  pausedBatches: { batchId: string; reason?: string; at: string }[]
  config: {
    webhookConfigured: boolean
    unsubscribeConfigured: boolean
    alertChannels: string[]
    p2Window: string
    cooldownWeekdays: number[]
  }
  recentSignals: { _id: string; type: string; email?: string; code?: number; reason?: string; createdAt: string }[]
}

const BREAKER_UI: Record<BreakerState, { label: string; tone: string; note: string }> = {
  CLOSED: {
    label: 'Bình thường',
    tone: 'bg-brand-500/15 text-brand-300 border-brand-500/30',
    note: 'Cả ba làn gửi theo nhịp bình thường.',
  },
  THROTTLED: {
    label: 'Giảm tốc',
    tone: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    note: 'Tạm tắt thư gợi ý (P2), thư mời (P1) còn 50% và 1 thư/2 phút.',
  },
  OPEN: {
    label: 'Đã ngắt',
    tone: 'bg-red-500/15 text-red-300 border-red-500/30',
    note: 'Ngừng thư mời và thư gợi ý. Thư đổi mật khẩu (P0) vẫn gửi bình thường.',
  },
  HALF_OPEN: {
    label: 'Gửi thăm dò',
    tone: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    note: 'Đang gửi một nhóm nhỏ thư để thử. Sạch 24 giờ thì tự mở lại.',
  },
}

const SIGNAL_LABELS: Record<string, string> = {
  spam: 'Báo cáo spam',
  hard_bounce: 'Hard bounce',
  invalid_email: 'Địa chỉ không tồn tại',
  soft_bounce: 'Soft bounce',
  deferred: 'Deferred',
  blocked: 'Brevo chặn',
  smtp_error: 'Lỗi SMTP',
  unsubscribed: 'Huỷ nhận',
  error: 'Lỗi Brevo',
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

const fmt = (d?: string) => (d ? new Date(d).toLocaleString('vi-VN') : '—')

/**
 * Tình trạng đường gửi mail: 3 làn ưu tiên, lộ trình warm-up, Circuit Breaker,
 * danh sách chặn và các lô import bị dừng vì sinh hard bounce.
 */
export default function EmailHealthPanel() {
  const [health, setHealth] = useState<EmailHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: EmailHealth }>('/api/admin/system/email-health')
      setHealth(res.data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được tình trạng gửi mail.')
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const act = async (key: string, path: string, init: RequestInit) => {
    setBusy(key)
    try {
      const res = await apiFetch<{ message: string }>(path, init)
      toast.success(res.message)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Thao tác thất bại.')
    } finally {
      setBusy(null)
    }
  }

  const resetBreaker = () => {
    if (!confirm('Đóng Circuit Breaker ngay? Chỉ làm khi đã xử lý xong nguyên nhân (rà danh sách, sửa cấu hình).')) return
    act('reset', '/api/admin/system/email-health/reset-breaker', { method: 'POST' })
  }

  const setStage = (stage: string) =>
    act('stage', '/api/admin/system/email-health/warmup', {
      method: 'PUT',
      body: JSON.stringify({ stage: Number(stage) }),
    })

  const resumeBatch = (batchId: string) => {
    if (!confirm(`Mở lại lô ${batchId}? Chỉ làm khi đã rà và sửa các địa chỉ hỏng trong file gốc.`)) return
    act(`batch:${batchId}`, `/api/admin/system/email-health/batches/${encodeURIComponent(batchId)}/resume`, {
      method: 'POST',
    })
  }

  if (error && !health) {
    return (
      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-red-300">{error}</div>
    )
  }
  if (!health) {
    return <div className="mt-5 h-56 animate-pulse rounded-2xl bg-slate-800" />
  }

  const b = BREAKER_UI[health.breaker.state] ?? BREAKER_UI.CLOSED
  const s = health.signals.last24h
  const configNotes = [
    !health.config.webhookConfigured &&
      'Chưa đặt BREVO_WEBHOOK_TOKEN: breaker không thấy báo cáo spam và hard bounce từ Brevo.',
    !health.config.unsubscribeConfigured &&
      'Chưa đặt API_PUBLIC_URL: thư gợi ý thiếu nút huỷ nhận một chạm (List-Unsubscribe).',
    health.config.alertChannels.length === 0 &&
      'Chưa có kênh cảnh báo (Slack/Telegram): breaker ngắt chỉ được ghi vào log.',
  ].filter(Boolean) as string[]

  return (
    <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <Activity className="size-4 text-brand-400" />
          Đường gửi mail
        </h2>
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', b.tone)}>
            Circuit Breaker: {b.label}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="gap-1.5 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw className="size-3.5" /> Làm mới
          </Button>
        </div>
      </div>

      {/* Circuit Breaker */}
      <div className={cn('rounded-xl border p-4 text-sm', b.tone)}>
        <p>{b.note}</p>
        {health.breaker.state !== 'CLOSED' && (
          <div className="mt-2 space-y-1 text-xs opacity-90">
            {health.breaker.lastTripReason && <p>Lý do: {health.breaker.lastTripReason}</p>}
            {health.breaker.resumeAt && <p>Tự chuyển bậc lúc: {fmt(health.breaker.resumeAt)}</p>}
            {health.breaker.state === 'HALF_OPEN' && (
              <p>
                Đã gửi thăm dò {health.breaker.probeSent ?? 0}/{health.breaker.probeLimit} thư.
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={resetBreaker}
              disabled={busy === 'reset'}
              className="mt-2 gap-1.5 border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
            >
              {busy === 'reset' ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
              Đóng breaker (đã xử lý xong)
            </Button>
          </div>
        )}
      </div>

      {/* Quota 3 làn */}
      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Quota hôm nay ({health.quota.date})
          </h3>
          <span className="text-xs text-slate-500">
            Đã dùng {health.quota.totalSent}/{health.quota.providerLimit} · trần mềm {health.quota.softCap} · đệm{' '}
            {health.quota.buffer}
          </span>
        </div>
        {health.quota.cooldownToday && (
          <p className="mb-2 rounded-md bg-slate-800 p-2 text-xs text-slate-300">
            Hôm nay là ngày nghỉ: chỉ gửi thư bảo mật (P0).
          </p>
        )}
        <div className="space-y-3">
          {health.quota.lanes.map((l) => {
            const pct = l.cap > 0 ? Math.min(100, Math.round((l.sent / l.cap) * 100)) : 0
            return (
              <div key={l.lane}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-300">{l.label}</span>
                  <span className="tabular-nums text-slate-400">
                    {l.sent}/{l.cap}
                    {l.reserved && ' (giữ riêng, được mượn đệm)'}
                    {l.fullCap !== undefined && l.cap < l.fullCap && ` · trần đầy đủ ${l.fullCap}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      l.lane === 0 ? 'bg-brand-500' : l.lane === 1 ? 'bg-amber-500' : 'bg-slate-400',
                    )}
                    style={{ width: `${l.cap > 0 ? pct : 0}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Thư gợi ý (P2) chỉ gửi {health.config.p2Window}, người dùng hoạt động trong {health.warmup.activeDays} ngày
          gần nhất
          {health.config.cooldownWeekdays.length > 0 &&
            `; nghỉ P1/P2 vào ${health.config.cooldownWeekdays.map((d) => WEEKDAYS[d]).join(', ')}`}
          .
        </p>
      </div>

      {/* Warm-up */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-800/60 p-4">
        <div>
          <p className="text-sm font-medium text-slate-100">Warm-up: {health.warmup.label}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {health.warmup.forced
              ? 'Đang ép bậc bằng biến EMAIL_WARMUP_STAGE.'
              : `Từ ${fmt(health.warmup.since)}. Tự lên bậc sau 7 ngày nếu hard bounce < 2% và không có báo cáo spam.`}
          </p>
        </div>
        <Select value={String(health.warmup.stage)} onValueChange={setStage} disabled={busy === 'stage' || health.warmup.forced}>
          <SelectTrigger className="w-40 border-slate-700 bg-slate-900 text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Tuần 1</SelectItem>
            <SelectItem value="2">Tuần 2</SelectItem>
            <SelectItem value="3">Tuần 3</SelectItem>
            <SelectItem value="4">Tuần 4+</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tín hiệu + danh sách chặn + outbox */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Báo cáo spam (24h)" value={s.spam ?? 0} bad={(s.spam ?? 0) > 0} />
        <Stat label="Hard bounce (24h)" value={(s.hard_bounce ?? 0) + (s.invalid_email ?? 0)} bad={(s.hard_bounce ?? 0) >= 3} />
        <Stat
          label="Deferred/soft (1 giờ)"
          value={health.signals.softLastHour}
          hint={`trên ${health.signals.sentLastHour} thư`}
        />
        <Stat label="Lỗi SMTP (24h)" value={s.smtp_error ?? 0} hint={`chuỗi hiện tại ${health.breaker.smtpErrorStreak ?? 0}`} />
        <Stat
          label="Danh sách chặn"
          value={Object.values(health.suppression).reduce((a, n) => a + n, 0)}
          hint={Object.entries(health.suppression)
            .map(([k, n]) => `${SIGNAL_LABELS[k] ?? k} ${n}`)
            .join(' · ')}
        />
        <Stat label="P2 đang chờ" value={(health.outbox.pending ?? 0) + (health.outbox.sending ?? 0)} />
        <Stat label="P2 đã gửi (30 ngày)" value={health.outbox.sent ?? 0} />
        <Stat label="P2 tự huỷ quá 48h" value={health.outbox.expired ?? 0} />
      </div>

      {health.pausedBatches.length > 0 && (
        <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="mb-2 text-xs font-semibold text-red-300">Lô import bị dừng vì sinh hard bounce</p>
          <ul className="space-y-2">
            {health.pausedBatches.map((p) => (
              <li key={p.batchId} className="flex flex-wrap items-center justify-between gap-2 text-xs text-red-200">
                <span>
                  <code className="rounded bg-slate-800 px-1">{p.batchId}</code> — {p.reason} · {fmt(p.at)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resumeBatch(p.batchId)}
                  disabled={busy === `batch:${p.batchId}`}
                  className="h-7 gap-1 border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
                >
                  <Play className="size-3" /> Mở lại
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {configNotes.length > 0 && (
        <div className="mt-5 space-y-2">
          {configNotes.map((n) => (
            <p key={n} className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {n}
            </p>
          ))}
        </div>
      )}

      {health.recentSignals.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Tín hiệu gần đây</h3>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <tbody>
                {health.recentSignals.map((e) => (
                  <tr key={e._id} className="border-b border-slate-800 last:border-0">
                    <td className="whitespace-nowrap p-2 text-slate-500">{fmt(e.createdAt)}</td>
                    <td className="p-2 text-slate-200">
                      {SIGNAL_LABELS[e.type] ?? e.type}
                      {e.code ? ` (${e.code})` : ''}
                    </td>
                    <td className="break-all p-2 text-slate-400">{e.email ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint, bad }: { label: string; value: number; hint?: string; bad?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        bad ? 'border-red-500/30 bg-red-500/10' : 'border-slate-800 bg-slate-800/50',
      )}
    >
      <p className={cn('text-xl font-bold tabular-nums', bad ? 'text-red-300' : 'text-slate-100')}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-slate-500" title={hint}>{hint}</p>}
    </div>
  )
}
