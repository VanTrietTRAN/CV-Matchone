'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Search, MapPin } from 'lucide-react'

const LOCATIONS = [
  'Tất cả địa điểm',
  'Hà Nội',
  'TP. Hồ Chí Minh',
  'Đà Nẵng',
  'Hải Phòng',
  'Cần Thơ',
  'Bình Dương',
  'Làm từ xa',
]

const SUGGESTIONS = ['Frontend Developer', 'Backend Developer', 'Data Analyst', 'Kế toán', 'Nhân sự']

export default function HeroSearch() {
  const router = useRouter()
  const [keyword, setKeyword] = useState('')
  const [location, setLocation] = useState(LOCATIONS[0])

  const search = (q: string, loc = location) => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (loc && loc !== LOCATIONS[0]) params.set('location', loc)
    const query = params.toString()
    router.push(`/candidate/matches${query ? `?${query}` : ''}`)
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          search(keyword)
        }}
        className="surface-card flex flex-col gap-2 p-2 shadow-[var(--shadow-card-hover)] sm:flex-row sm:items-center sm:rounded-full sm:p-1.5"
      >
        <div className="flex flex-1 items-center gap-2 px-3">
          <Search className="size-5 shrink-0 text-brand-500" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Vị trí ứng tuyển, kỹ năng, tên công ty..."
            aria-label="Từ khoá tìm việc"
            className="h-11 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2 border-border px-3 sm:border-l">
          <MapPin className="size-4.5 shrink-0 text-muted-foreground" />
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            aria-label="Địa điểm làm việc"
            className="h-11 w-full cursor-pointer bg-transparent pr-1 text-sm font-medium outline-none sm:w-[150px]"
          >
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" size="lg" className="shrink-0 sm:rounded-full">
          <Search />
          Tìm việc làm
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Từ khoá phổ biến:</span>
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => search(s)} className="chip py-1 text-[13px]">
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
