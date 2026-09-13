'use client'

import React, { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/layouts/AdminLayout'
import ExcelImporter from '@/components/shared/ExcelImporter'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { GraduationCap, Loader2, Mail, RotateCw, UsersRound } from 'lucide-react'

const DEFAULT_SCHOOL_DOMAIN = 'sv1.dut.udn.vn'

type Queue = {
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
  failedUsers: { email: string; fullName?: string; studentId?: string; welcomeEmailError?: string }[]
}

/**
 * Admin tạo hàng loạt tài khoản sinh viên từ file Excel của nhà trường.
 *
 * Mỗi sinh viên nhận một mật khẩu ngẫu nhiên qua email kèm link đăng nhập, và
 * bị bắt đổi mật khẩu ngay lần đăng nhập đầu tiên.
 */
export default function AdminImportUsersPage() {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [retrying, setRetrying] = useState(false)
  // Tắt mặc định: bật lên thì mỗi sinh viên mới tốn 2 lượt gửi, admin phải chủ động chọn
  const [sendSchoolEmail, setSendSchoolEmail] = useState(false)
  const schoolDomain = queue?.schoolDomain || DEFAULT_SCHOOL_DOMAIN

  const loadQueue = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Queue }>('/api/admin/import/welcome-queue')
      setQueue(res.data)
    } catch {
      // Không chặn trang import chỉ vì không đọc được số liệu hàng đợi
    }
  }, [])

  useEffect(() => {
    loadQueue()
    // Còn thư đang chờ thì làm mới để admin thấy tiến độ nhích dần
    const t = setInterval(loadQueue, 10000)
    return () => clearInterval(t)
  }, [loadQueue])

  const handleRetry = async () => {
    setRetrying(true)
    try {
      const res = await apiFetch<{ message: string }>('/api/admin/import/welcome-queue/retry', {
        method: 'POST',
      })
      toast.success(res.message)
      loadQueue()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không xếp lại được hàng đợi')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <UsersRound className="size-6 text-brand-400" />
            Import tài khoản sinh viên
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Tải lên danh sách sinh viên từ file Excel. Hệ thống tạo tài khoản ứng viên với mật khẩu
            ngẫu nhiên, gửi email kèm thông tin đăng nhập, và bắt sinh viên đổi mật khẩu ở lần đăng
            nhập đầu tiên.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-3 text-sm font-bold tracking-wider text-slate-400 uppercase">
            Các cột trong file
          </h2>
          <div className="mb-5 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <p>• <strong className="text-white">Họ và tên</strong> — bắt buộc</p>
            <p>• <strong className="text-white">Email</strong> — bắt buộc, dùng để đăng nhập</p>
            <p>
              • <strong className="text-white">MSSV</strong> — bắt buộc khi bật gửi tới email trường
            </p>
            <p>• Ngành học</p>
            <p>• Điện thoại</p>
            <p>• Ghi chú</p>
          </div>
          <p className="mb-5 rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
            Thiếu các trường không bắt buộc vẫn tạo được tài khoản. Tiêu đề cột viết khác một chút
            (&quot;Họ tên&quot;, &quot;Mã số sinh viên&quot;, &quot;SĐT&quot;, &quot;Note&quot;...)
            hệ thống vẫn nhận ra.
          </p>

          <div className="rounded-xl bg-slate-950 p-5">
            <ExcelImporter
              endpoint="/api/admin/import/users"
              templateUrl="/api/admin/import/template/users"
              extraFields={{ sendSchoolEmail: String(sendSchoolEmail) }}
              labels={{ unit: 'tài khoản', createVerb: 'tạo', requeueUnit: 'thư tới email trường' }}
              onDone={loadQueue}
            >
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                <div className="flex items-start justify-between gap-4">
                  <label htmlFor="send-school-email" className="flex cursor-pointer items-start gap-3">
                    <GraduationCap className="mt-0.5 size-5 shrink-0 text-brand-400" />
                    <span>
                      <span className="block text-sm font-semibold text-white">
                        Gửi thêm tới email trường
                      </span>
                      <span className="block text-xs break-all text-slate-400">
                        MSSV@{schoolDomain}
                      </span>
                    </span>
                  </label>
                  <Switch
                    id="send-school-email"
                    checked={sendSchoolEmail}
                    onCheckedChange={setSendSchoolEmail}
                  />
                </div>

                {sendSchoolEmail && (
                  <ul className="mt-3 space-y-1.5 border-t border-slate-800 pt-3 text-xs text-slate-300">
                    <li>
                      • <strong className="text-white">Sinh viên mới:</strong> một thư gửi cùng lúc
                      tới email cá nhân và email trường.
                    </li>
                    <li>
                      • <strong className="text-white">Đã có tài khoản, đã đổi mật khẩu:</strong> bỏ
                      qua.
                    </li>
                    <li>
                      • <strong className="text-white">Đã có tài khoản, chưa đổi mật khẩu:</strong>{' '}
                      gửi bù <em>chỉ</em> tới email trường, kèm mật khẩu tạm mới. Mật khẩu trong
                      thư gmail trước sẽ hết hiệu lực — thư mới có ghi rõ điều này.
                    </li>
                    <li className="text-amber-300">
                      • Brevo tính hạn mức theo từng người nhận: mỗi sinh viên mới tốn 2 lượt, nên
                      một ngày gửi được khoảng {Math.floor((queue?.dailyCap ?? 300) / 2)} sinh viên
                      mới thay vì {queue?.dailyCap ?? 300}. Phần còn lại tự gửi tiếp vào hôm sau.
                    </li>
                  </ul>
                )}
              </div>
            </ExcelImporter>
          </div>
        </div>

        {/* Hàng đợi gửi email — import chỉ tạo tài khoản, thư gửi dần ở nền */}
        {queue && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-wider text-slate-400 uppercase">
                <Mail className="size-4" />
                Hàng đợi email chào mừng
              </h2>
              {queue.failed > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  onClick={handleRetry}
                  disabled={retrying}
                >
                  {retrying ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
                  Gửi lại {queue.failed} thư hỏng
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <QueueStat
                label="Đang chờ gửi"
                value={queue.pending}
                hint={
                  queue.pendingRecipients > queue.pending
                    ? `${queue.pendingRecipients} lượt gửi`
                    : undefined
                }
                tone="wait"
              />
              <QueueStat label="Đã gửi" value={queue.sent} tone="ok" />
              <QueueStat
                label="Đã gửi email trường"
                value={queue.schoolSent}
                hint={`@${queue.schoolDomain}`}
                tone="ok"
              />
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
                Hệ thống gửi 15 thư mỗi 20 giây, tối đa {queue.dailyCap} lượt gửi/ngày — đúng bằng
                hạn mức gói Brevo Free. Thư gửi cả email cá nhân lẫn email trường tính 2 lượt.
                {queue.estimatedDaysLeft > 0 &&
                  ` Ước tính cần thêm ${queue.estimatedDaysLeft} ngày để gửi hết.`}
              </p>
            )}

            {queue.skipped > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                {queue.skipped} thư không gửi vì sinh viên đã tự đặt mật khẩu trước khi tới lượt —
                gửi mật khẩu tạm mới sẽ ghi đè mật khẩu họ đang dùng.
              </p>
            )}

            {queue.remainingToday <= 20 && queue.sentToday > 0 && (
              <p className="mt-3 rounded-lg bg-warning-surface/20 p-3 text-xs text-amber-300">
                Hôm nay còn {queue.remainingToday} lượt gửi. Chạm trần thì mã xác thực đăng ký và
                mã đặt lại mật khẩu cũng không gửi được cho tới nửa đêm.
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
        )}
      </div>
    </AdminLayout>
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
