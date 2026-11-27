'use client'

import React, { useCallback, useState } from 'react'
import AdminLayout from '@/layouts/AdminLayout'
import ExcelImporter from '@/components/shared/ExcelImporter'
import WelcomeQueuePanel, { type WelcomeQueue } from '@/components/admin/WelcomeQueuePanel'
import { Switch } from '@/components/ui/switch'
import { GraduationCap, UsersRound } from 'lucide-react'

const DEFAULT_SCHOOL_DOMAIN = 'sv1.dut.udn.vn'

/**
 * Admin tạo hàng loạt tài khoản sinh viên từ file Excel của nhà trường.
 *
 * Mỗi sinh viên nhận một mật khẩu ngẫu nhiên qua email kèm link đăng nhập, và
 * bị bắt đổi mật khẩu ngay lần đăng nhập đầu tiên.
 */
export default function AdminImportUsersPage() {
  const [queue, setQueue] = useState<WelcomeQueue | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Tắt mặc định: bật lên thì mỗi sinh viên mới tốn 2 lượt gửi, admin phải chủ động chọn
  const [sendSchoolEmail, setSendSchoolEmail] = useState(false)
  const schoolDomain = queue?.schoolDomain || DEFAULT_SCHOOL_DOMAIN
  const dailyCap = queue?.dailyCap ?? 300

  const refreshQueue = useCallback(() => setReloadKey((k) => k + 1), [])

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
              tone="dark"
              endpoint="/api/admin/import/users"
              templateUrl="/api/admin/import/template/users"
              extraFields={{ sendSchoolEmail: String(sendSchoolEmail) }}
              labels={{ unit: 'tài khoản', createVerb: 'tạo', requeueUnit: 'thư tới email trường' }}
              onDone={refreshQueue}
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
                      một ngày gửi được khoảng {Math.floor(dailyCap / 2)} sinh viên mới thay vì{' '}
                      {dailyCap}. Phần còn lại tự gửi tiếp vào hôm sau.
                    </li>
                  </ul>
                )}
              </div>
            </ExcelImporter>
          </div>
        </div>

        {/* Hàng đợi gửi email — import chỉ tạo tài khoản, thư gửi dần ở nền */}
        <WelcomeQueuePanel
          key={reloadKey}
          role="candidate"
          unitLabel="sinh viên"
          skippedNote="sinh viên đã tự đặt mật khẩu trước khi tới lượt — gửi mật khẩu tạm mới sẽ ghi đè mật khẩu họ đang dùng."
          onQueue={setQueue}
        />
      </div>
    </AdminLayout>
  )
}
