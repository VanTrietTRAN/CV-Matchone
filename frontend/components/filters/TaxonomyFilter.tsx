'use client'

import React from 'react'
import { JOB_CATEGORIES, positionsOf, positionBelongsTo } from '@/lib/job-categories'
import { cn } from '@/lib/utils'

export type TaxonomyValue = { industry: string; specialization: string }

interface TaxonomyFilterProps {
  value: TaxonomyValue
  onChange: (next: TaxonomyValue) => void
  /** Khu vực admin dùng nền tối */
  tone?: 'light' | 'dark'
  /** Ẩn nhãn khi đặt trong thanh lọc đã có tiêu đề riêng */
  showLabels?: boolean
  className?: string
}

/**
 * Bộ lọc ngành nghề / vị trí chuyên môn dùng chung cho ứng viên, nhà tuyển dụng
 * và admin — cùng một danh mục trong lib/job-categories.ts, cùng một tên tham số
 * gửi lên server (`industry`, `specialization`).
 *
 * Dùng <select> gốc thay vì Select của shadcn để một component chạy được trên cả
 * nền sáng lẫn nền tối mà không phải dựng hai bộ token màu.
 */
export default function TaxonomyFilter({
  value,
  onChange,
  tone = 'light',
  showLabels = true,
  className,
}: TaxonomyFilterProps) {
  const isDark = tone === 'dark'
  const positions = positionsOf(value.industry)

  const selectClass = cn(
    'w-full rounded-lg border px-3 py-1.5 text-sm transition-colors',
    isDark
      ? 'border-slate-700 bg-slate-950 text-slate-200 disabled:opacity-40'
      : 'border-input bg-background text-foreground disabled:opacity-50',
  )
  const labelClass = cn(
    'mb-1.5 block text-xs font-medium',
    isDark ? 'text-slate-400' : 'text-muted-foreground',
  )

  const setIndustry = (industry: string) => {
    // Đổi ngành thì bỏ vị trí cũ nếu nó không còn thuộc ngành mới
    const keep = industry && positionBelongsTo(industry, value.specialization)
    onChange({ industry, specialization: keep ? value.specialization : '' })
  }

  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      <div className="min-w-[180px] flex-1">
        {showLabels && <label className={labelClass}>Ngành nghề</label>}
        <select
          value={value.industry}
          onChange={(e) => setIndustry(e.target.value)}
          className={selectClass}
          aria-label="Lọc theo ngành nghề"
        >
          <option value="">Tất cả ngành nghề</option>
          {JOB_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-[180px] flex-1">
        {showLabels && <label className={labelClass}>Vị trí chuyên môn</label>}
        <select
          value={value.specialization}
          onChange={(e) => onChange({ ...value, specialization: e.target.value })}
          className={selectClass}
          disabled={!value.industry}
          aria-label="Lọc theo vị trí chuyên môn"
        >
          <option value="">
            {value.industry ? `Tất cả vị trí (${positions.length})` : 'Chọn ngành trước'}
          </option>
          {positions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** Có đang lọc gì không — để hiện nút "Xoá lọc". */
export function hasTaxonomyFilter(v: TaxonomyValue): boolean {
  return Boolean(v.industry || v.specialization)
}

/** Gắn vào URLSearchParams gửi lên server. Bỏ qua giá trị rỗng. */
export function applyTaxonomyParams(params: URLSearchParams, v: TaxonomyValue): URLSearchParams {
  if (v.industry) params.set('industry', v.industry)
  if (v.specialization) params.set('specialization', v.specialization)
  return params
}
