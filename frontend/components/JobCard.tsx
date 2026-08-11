'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import MatchBadge from '@/components/MatchBadge'
import SkillTag from '@/components/SkillTag'
import AIBadge from '@/components/AIBadge'
import { MapPin, Clock, Building2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatRelativeTime,
  formatSalary,
  daysUntil,
  initials,
  WORK_TYPE_LABEL,
} from '@/lib/format'

interface JobCardProps {
  id: string
  title: string
  company: string
  logo?: string
  location: string
  salaryMin?: number
  salaryMax?: number
  currency?: string
  workType?: 'remote' | 'hybrid' | 'onsite'
  skills?: string[]
  matchScore?: number | null
  aiInsight?: string
  postedDate?: Date | string
  expiresAt?: Date | string
  /** Link tới trang chi tiết; mặc định /candidate/jobs/[id] */
  href?: string
  applied?: boolean
  onApply?: (id: string) => void
  onClick?: () => void
  className?: string
  showActions?: boolean
  /** Huy hiệu thứ hạng (#1, #2…) cho danh sách gợi ý AI */
  rank?: number
}

export default function JobCard({
  id,
  title,
  company,
  logo,
  location,
  salaryMin,
  salaryMax,
  currency = 'VND',
  workType,
  skills = [],
  matchScore,
  aiInsight,
  postedDate,
  expiresAt,
  href,
  applied = false,
  onApply,
  onClick,
  className,
  showActions = true,
  rank,
}: JobCardProps) {
  const detailHref = href ?? `/candidate/jobs/${id}`
  const remaining = daysUntil(expiresAt)
  const isUrgent = remaining !== null && remaining >= 0 && remaining <= 5

  return (
    <article
      onClick={onClick}
      className={cn(
        'surface-card surface-hover group relative flex flex-col gap-3.5 p-4 sm:p-5',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {typeof rank === 'number' && (
        <span className="absolute -top-2.5 -left-2.5 grid size-7 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white shadow-[var(--shadow-brand)]">
          #{rank}
        </span>
      )}

      <div className="flex items-start gap-3.5">
        <div className="logo-box size-14 sm:size-[60px]">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={company}
              className="size-full object-contain p-1.5"
              loading="lazy"
            />
          ) : (
            <span className="text-sm font-bold text-brand-600">{initials(company)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-[15px] leading-snug font-bold sm:text-base">
              <Link
                href={detailHref}
                className="line-clamp-2 transition-colors group-hover:text-brand-600"
                title={title}
              >
                {title}
              </Link>
            </h3>
            {matchScore !== undefined && (
              <MatchBadge score={matchScore} size="sm" showLabel={false} className="shrink-0" />
            )}
          </div>

          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate" title={company}>
              {company}
            </span>
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-bold text-salary">
              {formatSalary(salaryMin, salaryMax, currency)}
            </span>
            {location && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground/70">
                <MapPin className="size-3" />
                {location}
              </span>
            )}
            {workType && (
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground/70">
                {WORK_TYPE_LABEL[workType] ?? workType}
              </span>
            )}
          </div>
        </div>
      </div>

      {aiInsight && (
        <div className="flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50/60 p-2.5">
          <AIBadge size="sm" className="mt-px" />
          <p className="line-clamp-2 text-xs leading-relaxed text-brand-800">{aiInsight}</p>
        </div>
      )}

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.slice(0, 4).map((skill, index) => (
            <SkillTag key={`${skill}-${index}`} skill={skill} size="sm" />
          ))}
          {skills.length > 4 && (
            <span className="self-center text-[11px] font-medium text-muted-foreground">
              +{skills.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          {isUrgent ? (
            <span className="inline-flex items-center gap-1 font-semibold text-hot-600">
              <Clock className="size-3.5" />
              Còn {remaining} ngày để ứng tuyển
            </span>
          ) : (
            postedDate && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {formatRelativeTime(postedDate)}
              </span>
            )
          )}
        </div>

        {showActions && (
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={detailHref}>Chi tiết</Link>
            </Button>
            {applied ? (
              <Button size="sm" variant="soft" disabled>
                <CheckCircle2 />
                Đã ứng tuyển
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onApply?.(id)
                }}
              >
                Ứng tuyển
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export function JobCardSkeleton() {
  return (
    <div className="surface-card flex flex-col gap-3.5 p-4 sm:p-5">
      <div className="flex gap-3.5">
        <div className="skeleton size-14 shrink-0 rounded-lg sm:size-[60px]" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
          <div className="flex gap-1.5 pt-1">
            <div className="skeleton h-6 w-24" />
            <div className="skeleton h-6 w-20" />
          </div>
        </div>
      </div>
      <div className="flex gap-1.5">
        <div className="skeleton h-5 w-16" />
        <div className="skeleton h-5 w-20" />
        <div className="skeleton h-5 w-14" />
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-9 w-32" />
      </div>
    </div>
  )
}
