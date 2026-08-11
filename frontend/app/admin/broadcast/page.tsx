'use client'

import React, { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/layouts/AdminLayout'
import { apiFetch } from '@/lib/api'
import { Megaphone, Send, RefreshCw, CheckCircle2, Clock, Mail, Bell, Users, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

type BroadcastItem = {
  _id: string
  title: string
  message: string
  targetGroup: 'all' | 'candidates' | 'employers'
  sendEmail: boolean
  sendInApp: boolean
  status: 'draft' | 'processing' | 'completed' | 'failed'
  stats: {
    totalTargets: number
    sentCount: number
    failCount: number
  }
  createdAdminId?: {
    fullName: string
    email: string
  }
  createdAt: string
  completedAt?: string
}

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)

  // Form State
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [targetGroup, setTargetGroup] = useState<'all' | 'candidates' | 'employers'>('all')
  const [sendEmail, setSendEmail] = useState(true)
  const [sendInApp, setSendInApp] = useState(true)

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: BroadcastItem[]; total: number; pages: number }>(
        `/api/admin/broadcast?page=${page}&limit=10`
      )
      setBroadcasts(res.data || [])
      setPages(res.pages || 1)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast.error(`Không thể tải lịch sử thông báo: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchBroadcasts()
  }, [fetchBroadcasts])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) {
      toast.error('Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo!')
      return
    }

    if (!sendEmail && !sendInApp) {
      toast.error('Vui lòng chọn ít nhất 1 kênh phát (In-App hoặc Email)!')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title,
          message,
          targetGroup,
          sendEmail,
          sendInApp,
        }),
      })

      toast.success('Thông báo đã được tạo và đang được hệ thống gửi ngầm!')
      setTitle('')
      setMessage('')
      fetchBroadcasts()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast.error(`Không thể phát thông báo: ${errorMsg}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminLayout>
      <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Megaphone className="w-7 h-7 text-blue-400" />
              <h1 className="text-2xl font-bold text-white tracking-tight">Phát thông báo Hệ thống (System Broadcast)</h1>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              Gửi thông điệp In-App và Email đồng loạt tới toàn bộ Ứng viên hoặc Nhà tuyển dụng bằng tiến trình xử lý ngầm (Non-blocking).
            </p>
          </div>

          <Button
            onClick={fetchBroadcasts}
            disabled={loading}
            variant="outline"
            className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 gap-2 self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>

        {/* Creation Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 space-y-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-400" /> Soạn thông báo mới
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-medium text-slate-300">Tiêu đề thông báo *</label>
              <Input
                placeholder="Ví dụ: Thông báo bảo trì hệ thống hoặc Tính năng mới..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">Đối tượng nhận *</label>
              <Select value={targetGroup} onValueChange={(val: 'all' | 'candidates' | 'employers') => setTargetGroup(val)}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  <SelectItem value="all">🌐 Tất cả người dùng (All)</SelectItem>
                  <SelectItem value="candidates">🎓 Chỉ Ứng viên (Candidates)</SelectItem>
                  <SelectItem value="employers">🏢 Chỉ Nhà tuyển dụng (Employers)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">Nội dung thông báo *</label>
            <Textarea
              rows={4}
              placeholder="Nhập nội dung chi tiết thông báo..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-blue-500"
            />
          </div>

          {/* Checkboxes */}
          <div className="flex flex-wrap items-center gap-6 pt-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendInApp"
                checked={sendInApp}
                onCheckedChange={(checked) => setSendInApp(!!checked)}
                className="border-slate-700 data-[state=checked]:bg-blue-600"
              />
              <label htmlFor="sendInApp" className="text-sm font-medium text-slate-300 cursor-pointer flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-blue-400" /> Gửi Thông báo trong App (In-App)
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendEmail"
                checked={sendEmail}
                onCheckedChange={(checked) => setSendEmail(!!checked)}
                className="border-slate-700 data-[state=checked]:bg-blue-600"
              />
              <label htmlFor="sendEmail" className="text-sm font-medium text-slate-300 cursor-pointer flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-brand-400" /> Gửi Email trực tiếp (Resend)
              </label>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 font-medium gap-2 shadow-lg shadow-blue-600/20"
            >
              <Send className={`w-4 h-4 ${submitting ? 'animate-bounce' : ''}`} />
              {submitting ? 'Đang khởi tạo phát ngầm...' : 'Phát thông báo ngầm'}
            </Button>
          </div>
        </form>

        {/* History Table */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" /> Lịch sử phát thông báo
          </h2>

          <div className="bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Tiêu đề & Nội dung</th>
                    <th className="py-3.5 px-4">Đối tượng</th>
                    <th className="py-3.5 px-4">Kênh phát</th>
                    <th className="py-3.5 px-4">Trạng thái</th>
                    <th className="py-3.5 px-4">Tiến độ gửi</th>
                    <th className="py-3.5 px-4">Thời gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                        Đang tải lịch sử phát thông báo...
                      </td>
                    </tr>
                  ) : broadcasts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        <Megaphone className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        Chưa có thông báo toàn hệ thống nào được phát.
                      </td>
                    </tr>
                  ) : (
                    broadcasts.map((item) => {
                      const isCompleted = item.status === 'completed'
                      const isProcessing = item.status === 'processing'
                      const isFailed = item.status === 'failed'

                      return (
                        <tr key={item._id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3.5 px-4 max-w-sm">
                            <p className="text-white font-medium text-sm">{item.title}</p>
                            <p className="text-slate-400 text-xs truncate max-w-xs mt-0.5">{item.message}</p>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                            {item.targetGroup === 'all' && <span className="text-blue-300 font-medium">🌐 Tất cả người dùng</span>}
                            {item.targetGroup === 'candidates' && <span className="text-brand-300 font-medium">🎓 Ứng viên</span>}
                            {item.targetGroup === 'employers' && <span className="text-purple-300 font-medium">🏢 Nhà tuyển dụng</span>}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                            <div className="flex items-center gap-2">
                              {item.sendInApp && <span className="px-2 py-0.5 rounded bg-slate-800 text-blue-400">In-App</span>}
                              {item.sendEmail && <span className="px-2 py-0.5 rounded bg-slate-800 text-brand-400">Email</span>}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isCompleted && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn tất
                              </span>
                            )}
                            {isProcessing && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang phát ngầm
                              </span>
                            )}
                            {isFailed && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                                <AlertCircle className="w-3.5 h-3.5" /> Lỗi phát
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap text-xs font-mono">
                            <span className="text-brand-400 font-semibold">{item.stats?.sentCount || 0}</span>
                            <span className="text-slate-500"> / {item.stats?.totalTargets || 0}</span>
                            {item.stats?.failCount > 0 && (
                              <span className="text-red-400 text-[11px] block">({item.stats.failCount} lỗi)</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-400">
                            {new Date(item.createdAt).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-800 text-xs text-slate-400">
                <p>Trang <strong>{page}</strong> / {pages}</p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
                  >
                    Trang trước
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= pages}
                    onClick={() => setPage((p) => p + 1)}
                    className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
                  >
                    Trang sau
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
