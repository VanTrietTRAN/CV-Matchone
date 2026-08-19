'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '@/layouts/AdminLayout'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import {
  Users,
  Building2,
  Briefcase,
  FileText,
  TrendingUp,
  Search,
  RefreshCw,
  Download,
  ArrowUpDown,
  Loader2,
} from 'lucide-react'

type Overview = {
  totals: {
    users: number
    candidates: number
    employers: number
    banned: number
    jobs: number
    openJobs: number
    applications: number
    cvs: number
  }
  period: {
    users: number
    candidates: number
    employers: number
    jobs: number
    applications: number
    activeEmployers: number
  }
  series: {
    users: Array<{ date: string; count: number }>
    jobs: Array<{ date: string; count: number }>
    applications: Array<{ date: string; count: number }>
  }
}

type EmployerRow = {
  _id: string
  email: string
  status: string
  createdAt: string
  companyName: string
  industry: string
  jobs: number
  openJobs: number
  applications: number
}

type UsageRes = {
  data: EmployerRow[]
  summary: { employers: number; jobs: number; applications: number; avgJobsPerEmployer: number }
  pagination: { page: number; limit: number; total: number; pages: number }
}

const PRESETS = [
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
  { label: '1 năm', days: 365 },
]

const INDUSTRY_LABEL: Record<string, string> = {
  technology: 'Công nghệ',
  finance: 'Tài chính',
  healthcare: 'Y tế',
  consulting: 'Tư vấn',
  logistics: 'Vận tải',
  education: 'Giáo dục',
  marketing: 'Marketing',
  manufacturing: 'Sản xuất',
  other: 'Khác',
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  sub?: string
  color: string
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 transition-colors hover:border-slate-700">
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="size-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-400">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-white">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  )
}

/** Biểu đồ cột thuần CSS — tránh kéo thêm thư viện chart chỉ cho một trang. */
function MiniBarChart({
  series,
  color,
  title,
}: {
  series: Array<{ date: string; count: number }>
  color: string
  title: string
}) {
  const max = Math.max(1, ...series.map((s) => s.count))
  const total = series.reduce((sum, s) => sum + s.count, 0)

  // Khoảng dài thì gom bớt cột để mỗi cột còn nhìn được
  const step = series.length > 60 ? Math.ceil(series.length / 60) : 1
  const points =
    step === 1
      ? series
      : series.reduce<Array<{ date: string; count: number }>>((acc, cur, i) => {
          if (i % step === 0) acc.push({ ...cur })
          else acc[acc.length - 1].count += cur.count
          return acc
        }, [])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
        <span className="text-lg font-bold text-white">{total.toLocaleString('vi-VN')}</span>
      </div>
      <div className="flex h-24 items-end gap-[2px]">
        {points.map((p) => (
          <div
            key={p.date}
            className={`flex-1 rounded-t-sm ${color} transition-opacity hover:opacity-70`}
            style={{ height: `${Math.max((p.count / max) * 100, p.count > 0 ? 6 : 2)}%` }}
            title={`${p.date}: ${p.count}`}
          />
        ))}
      </div>
      {points.length > 0 && (
        <div className="mt-2 flex justify-between text-[11px] text-slate-600">
          <span>{points[0].date}</span>
          <span>{points[points.length - 1].date}</span>
        </div>
      )}
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [overview, setOverview] = useState<Overview | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)

  const [usage, setUsage] = useState<UsageRes | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(true)

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('all')
  const [minJobs, setMinJobs] = useState(0)
  const [sortBy, setSortBy] = useState<'jobs' | 'openJobs' | 'applications' | 'createdAt'>('jobs')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  // Khoảng ngày tự chọn được ưu tiên hơn preset
  const rangeQuery = useMemo(() => {
    const p = new URLSearchParams()
    if (from && to) {
      p.set('from', from)
      p.set('to', to)
    } else {
      p.set('days', String(days))
    }
    return p
  }, [days, from, to])

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true)
    try {
      const res = await apiFetch<{ data: Overview }>(`/api/admin/analytics?${rangeQuery}`)
      setOverview(res.data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không tải được số liệu tổng quan')
    } finally {
      setLoadingOverview(false)
    }
  }, [rangeQuery])

  const loadUsage = useCallback(async () => {
    setLoadingUsage(true)
    try {
      const p = new URLSearchParams(rangeQuery)
      p.set('page', String(page))
      p.set('limit', '20')
      p.set('sortBy', sortBy)
      p.set('sortDir', sortDir)
      if (search) p.set('search', search)
      if (status !== 'all') p.set('status', status)
      if (minJobs > 0) p.set('minJobs', String(minJobs))

      const res = await apiFetch<UsageRes>(`/api/admin/analytics/employers?${p}`)
      setUsage(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không tải được thống kê doanh nghiệp')
    } finally {
      setLoadingUsage(false)
    }
  }, [rangeQuery, page, sortBy, sortDir, search, status, minJobs])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])
  useEffect(() => {
    loadUsage()
  }, [loadUsage])

  // Đổi bộ lọc thì quay về trang 1, tránh rơi vào trang trống
  useEffect(() => {
    setPage(1)
  }, [rangeQuery, search, status, minJobs, sortBy, sortDir])

  const toggleSort = (key: typeof sortBy) => {
    if (sortBy === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortBy(key)
      setSortDir('desc')
    }
  }

  const exportCsv = () => {
    if (!usage?.data.length) return
    const head = ['Email', 'Ten cong ty', 'Nganh', 'Trang thai', 'Tin dang', 'Tin mo', 'Ho so nhan', 'Ngay tao']
    const rows = usage.data.map((r) => [
      r.email,
      r.companyName || '',
      INDUSTRY_LABEL[r.industry] || r.industry || '',
      r.status,
      r.jobs,
      r.openJobs,
      r.applications,
      new Date(r.createdAt).toLocaleDateString('vi-VN'),
    ])
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `thong-ke-doanh-nghiep-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const t = overview?.totals
  const p = overview?.period

  const SortHead = ({ label, k }: { label: string; k: typeof sortBy }) => (
    <button
      onClick={() => toggleSort(k)}
      className={`inline-flex items-center gap-1 transition-colors hover:text-white ${
        sortBy === k ? 'text-white' : ''
      }`}
    >
      {label}
      <ArrowUpDown className="size-3" />
      {sortBy === k && <span className="text-[10px]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </button>
  )

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Thống kê hệ thống</h1>
            <p className="mt-1 text-sm text-slate-400">
              Quy mô người dùng, doanh nghiệp và khối lượng sử dụng theo khoảng thời gian.
            </p>
          </div>
          <button
            onClick={() => {
              loadOverview()
              loadUsage()
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
          >
            <RefreshCw className="size-4" />
            Làm mới
          </button>
        </div>

        {/* ── Bộ lọc thời gian ─────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Khoảng nhanh</p>
            <div className="flex gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  onClick={() => {
                    setDays(preset.days)
                    setFrom('')
                    setTo('')
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    !from && !to && days === preset.days
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Từ ngày</p>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Đến ngày</p>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200"
            />
          </div>
          {(from || to) && (
            <button
              onClick={() => {
                setFrom('')
                setTo('')
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-white"
            >
              Bỏ chọn ngày
            </button>
          )}
        </div>

        {/* ── Quy mô hệ thống ──────────────────────────────────────────── */}
        {loadingOverview ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-6 animate-spin text-slate-500" />
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-400 uppercase">
              Toàn hệ thống
            </h2>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={Users}
                label="Ứng viên"
                value={t?.candidates ?? 0}
                sub={`+${p?.candidates ?? 0} trong kỳ`}
                color="bg-blue-600"
              />
              <StatCard
                icon={Building2}
                label="Doanh nghiệp"
                value={t?.employers ?? 0}
                sub={`+${p?.employers ?? 0} trong kỳ · ${p?.activeEmployers ?? 0} có đăng tin`}
                color="bg-emerald-600"
              />
              <StatCard
                icon={Briefcase}
                label="Tin tuyển dụng"
                value={t?.jobs ?? 0}
                sub={`${t?.openJobs ?? 0} đang mở · +${p?.jobs ?? 0} trong kỳ`}
                color="bg-violet-600"
              />
              <StatCard
                icon={FileText}
                label="Hồ sơ ứng tuyển"
                value={t?.applications ?? 0}
                sub={`+${p?.applications ?? 0} trong kỳ`}
                color="bg-amber-600"
              />
            </div>

            <div className="mb-8 grid gap-4 lg:grid-cols-3">
              <MiniBarChart
                title="Người dùng mới"
                series={overview?.series.users ?? []}
                color="bg-blue-500"
              />
              <MiniBarChart
                title="Tin đăng mới"
                series={overview?.series.jobs ?? []}
                color="bg-violet-500"
              />
              <MiniBarChart
                title="Lượt ứng tuyển"
                series={overview?.series.applications ?? []}
                color="bg-amber-500"
              />
            </div>
          </>
        )}

        {/* ── Khối lượng sử dụng theo doanh nghiệp ─────────────────────── */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
            Khối lượng sử dụng theo doanh nghiệp
          </h2>
          <button
            onClick={exportCsv}
            disabled={!usage?.data.length}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="size-4" />
            Xuất CSV
          </button>
        </div>

        {usage && (
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={Building2}
              label="Doanh nghiệp khớp lọc"
              value={usage.summary.employers}
              color="bg-slate-700"
            />
            <StatCard
              icon={Briefcase}
              label="Tổng tin đăng"
              value={usage.summary.jobs}
              color="bg-slate-700"
            />
            <StatCard
              icon={TrendingUp}
              label="Trung bình tin/doanh nghiệp"
              value={usage.summary.avgJobsPerEmployer}
              color="bg-slate-700"
            />
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="min-w-[220px] flex-1">
            <p className="mb-1.5 text-xs font-medium text-slate-400">Tìm theo email</p>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
                onBlur={() => setSearch(searchInput)}
                placeholder="vd: congty.vn"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pr-3 pl-9 text-sm text-slate-200 placeholder:text-slate-600"
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Trạng thái</p>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200"
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang hoạt động</option>
              <option value="banned">Bị khoá</option>
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Số tin tối thiểu</p>
            <select
              value={minJobs}
              onChange={(e) => setMinJobs(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200"
            >
              <option value={0}>Không lọc</option>
              <option value={1}>Từ 1 tin</option>
              <option value={5}>Từ 5 tin</option>
              <option value={10}>Từ 10 tin</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 text-left text-xs text-slate-400 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Doanh nghiệp</th>
                  <th className="px-5 py-3 font-medium">Ngành</th>
                  <th className="px-5 py-3 font-medium">Trạng thái</th>
                  <th className="px-5 py-3 text-right font-medium">
                    <SortHead label="Tin đăng" k="jobs" />
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    <SortHead label="Đang mở" k="openJobs" />
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    <SortHead label="Hồ sơ nhận" k="applications" />
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    <SortHead label="Ngày tạo" k="createdAt" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loadingUsage ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-slate-500" />
                    </td>
                  </tr>
                ) : !usage?.data.length ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      Không có doanh nghiệp nào khớp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  usage.data.map((r) => (
                    <tr key={r._id} className="transition-colors hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <p className="font-medium text-white">{r.companyName || '(chưa đặt tên)'}</p>
                        <p className="text-xs text-slate-500">{r.email}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-400">
                        {INDUSTRY_LABEL[r.industry] || r.industry || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.status === 'banned'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-emerald-500/15 text-emerald-400'
                          }`}
                        >
                          {r.status === 'banned' ? 'Bị khoá' : 'Hoạt động'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-white">{r.jobs}</td>
                      <td className="px-5 py-3 text-right text-slate-300">{r.openJobs}</td>
                      <td className="px-5 py-3 text-right text-slate-300">{r.applications}</td>
                      <td className="px-5 py-3 text-right text-slate-500">
                        {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {usage && usage.pagination.pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3 text-sm">
              <span className="text-slate-500">
                Trang {usage.pagination.page}/{usage.pagination.pages} · {usage.pagination.total}{' '}
                doanh nghiệp
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((v) => v - 1)}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-slate-300 disabled:opacity-40"
                >
                  Trước
                </button>
                <button
                  disabled={page >= usage.pagination.pages}
                  onClick={() => setPage((v) => v + 1)}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-slate-300 disabled:opacity-40"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
