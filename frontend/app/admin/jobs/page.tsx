'use client'

import React, { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/layouts/AdminLayout'
import { apiFetch } from '@/lib/api'
import TaxonomyFilter, {
  applyTaxonomyParams,
  type TaxonomyValue,
} from '@/components/filters/TaxonomyFilter'
import { toast } from 'sonner'
import { Briefcase, Search, RefreshCw, XCircle, Trash2, ChevronLeft, ChevronRight, MapPin, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AdminJob = {
  _id: string
  title: string
  location?: string
  status: 'open' | 'closed' | 'archived'
  createdAt: string
  applyCount: number
  employerId: { email: string } | null
}

const statusCls: Record<string, string> = {
  open: 'bg-brand-500/15 text-brand-400 border border-brand-500/20',
  closed: 'bg-slate-500/15 text-slate-400 border border-slate-600/20',
  archived: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
}
const statusLabel: Record<string, string> = { open: 'Đang mở', closed: 'Đã đóng', archived: 'Lưu trữ' }

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>({ industry: '', specialization: '' })
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      applyTaxonomyParams(params, taxonomy)
      const res = await apiFetch<{ data: AdminJob[]; total: number; pages: number }>(`/api/admin/jobs?${params}`)
      setJobs(res.data)
      setTotal(res.total)
      setPages(res.pages)
    } catch {
      toast.error('Không tải được danh sách tin tuyển dụng')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, taxonomy])

  useEffect(() => { load() }, [load])

  const handleClose = async (id: string, title: string) => {
    if (!confirm(`Đóng tin tuyển dụng "${title}"?`)) return
    setActionLoading(id + '-close')
    try {
      await apiFetch(`/api/admin/jobs/${id}/close`, { method: 'PATCH' })
      toast.success('Đã đóng tin tuyển dụng')
      setJobs(prev => prev.map(j => j._id === id ? { ...j, status: 'closed' } : j))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Thao tác thất bại')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Xóa vĩnh viễn tin tuyển dụng "${title}"? Hành động này không thể hoàn tác.`)) return
    setActionLoading(id + '-delete')
    try {
      await apiFetch(`/api/admin/jobs/${id}`, { method: 'DELETE' })
      toast.success('Đã xóa tin tuyển dụng')
      setJobs(prev => prev.filter(j => j._id !== id))
      setTotal(t => t - 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Xóa thất bại')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
              <Briefcase className="w-7 h-7 text-amber-400" /> Kiểm duyệt Tin tuyển dụng
            </h1>
            <p className="text-slate-400">{total} tin tổng cộng</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Làm mới
          </Button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Tìm theo tên tin tuyển dụng..."
              className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Tất cả Trạng thái</option>
            <option value="open">Đang mở</option>
            <option value="closed">Đã đóng</option>
            <option value="archived">Lưu trữ</option>
          </select>

          <TaxonomyFilter
            value={taxonomy}
            onChange={(v) => {
              setTaxonomy(v)
              setPage(1)
            }}
            tone="dark"
            showLabels={false}
            className="w-full sm:w-auto"
          />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tin tuyển dụng</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Nhà tuyển dụng</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Trạng thái</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Ứng tuyển</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Ngày đăng</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(6)].map((__, j) => (
                        <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-800 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-500">Không tìm thấy tin tuyển dụng nào</td>
                  </tr>
                ) : jobs.map((job) => (
                  <tr key={job._id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-slate-100 font-medium">{job.title}</p>
                      {job.location && (
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{job.location}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-400 text-xs">{job.employerId?.email || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', statusCls[job.status])}>
                        {statusLabel[job.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="flex items-center gap-1 text-slate-300 text-sm">
                        <Users className="w-3.5 h-3.5 text-slate-500" />{job.applyCount}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400 text-xs">{new Date(job.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {job.status === 'open' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleClose(job._id, job.title)}
                            disabled={actionLoading === job._id + '-close'}
                            className="h-7 text-xs gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 bg-transparent"
                          >
                            <XCircle className="w-3 h-3" /> Đóng tin
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(job._id, job.title)}
                          disabled={actionLoading === job._id + '-delete'}
                          className="h-7 text-xs gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10 bg-transparent"
                        >
                          <Trash2 className="w-3 h-3" /> Xóa
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between">
              <p className="text-sm text-slate-400">Trang {page} / {pages}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 gap-1">
                  <ChevronLeft className="w-4 h-4" /> Trước
                </Button>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                  className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 gap-1">
                  Sau <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
