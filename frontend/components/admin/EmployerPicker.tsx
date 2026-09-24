'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Building2, Crown, Loader2, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EmployerOption = {
  _id: string
  email: string
  companyName: string
  isPro: boolean
  status: 'active' | 'banned'
  /** Tài khoản do admin import, chưa đăng nhập lần nào */
  pendingFirstLogin: boolean
}

/**
 * Ô chọn doanh nghiệp cho khu vực quản trị (nền tối).
 *
 * Danh sách lấy từ /api/admin/employers vì tên công ty nằm ở CompanyProfile chứ
 * không ở User — chọn theo email thì admin phải tự nhớ email nào là công ty nào.
 */
export default function EmployerPicker({
  value,
  onChange,
  label = 'Doanh nghiệp quản lý tin',
  hint,
}: {
  value: string
  onChange: (employer: EmployerOption | null) => void
  label?: string
  hint?: string
}) {
  const [options, setOptions] = useState<EmployerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    apiFetch<{ data: EmployerOption[] }>('/api/admin/employers')
      .then((res) => {
        if (!cancelled) setOptions(res.data || [])
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.email.toLowerCase().includes(q) || o.companyName.toLowerCase().includes(q),
    )
  }, [options, search])

  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-white">{label}</label>
      {hint && <p className="mb-3 text-xs text-slate-400">{hint}</p>}

      <div className="relative mb-3">
        <Search className="absolute top-2.5 left-3 size-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên công ty hoặc email..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pr-3 pl-9 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-brand-500 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin" />
          Đang tải danh sách doanh nghiệp...
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          {options.length === 0
            ? 'Chưa có tài khoản doanh nghiệp nào. Hãy import doanh nghiệp trước.'
            : 'Không có doanh nghiệp nào khớp từ khoá.'}
        </p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
          {visible.map((o) => {
            const selected = o._id === value
            return (
              <li key={o._id}>
                <button
                  type="button"
                  onClick={() => onChange(selected ? null : o)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                    selected
                      ? 'border-brand-500/50 bg-brand-500/10'
                      : 'border-transparent hover:bg-slate-800/70',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-lg',
                      selected ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400',
                    )}
                  >
                    {selected ? <Check className="size-4" /> : <Building2 className="size-4" />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-white">
                        {o.companyName || o.email.split('@')[0]}
                      </span>
                      {o.isPro && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                          <Crown className="size-3" />
                          PRO
                        </span>
                      )}
                      {o.status === 'banned' && (
                        <span className="rounded-full border border-red-500/20 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                          ĐANG KHOÁ
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-slate-400">{o.email}</span>
                    {o.pendingFirstLogin && (
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Chưa đăng nhập lần nào — tin vẫn thuộc về họ khi kích hoạt tài khoản
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
