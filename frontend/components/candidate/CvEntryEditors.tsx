'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2 } from 'lucide-react'
import {
  emptyEducation,
  emptyExperience,
  emptyLanguage,
  type EducationEntry,
  type ExperienceEntry,
  type LanguageEntry,
} from '@/lib/cv-model'

/**
 * Các khối nhập liệu dạng danh sách cho CV: kinh nghiệm, học vấn, ngôn ngữ.
 *
 * Tách khỏi trang CV vì trang đó đã dài, và ba khối này có chung cách hoạt động
 * (thêm / xoá / sửa từng mục).
 */

function EntryCard({
  index,
  onRemove,
  children,
}: {
  index: number
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <div className="relative rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Mục {index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onRemove}
          className="text-danger-foreground hover:bg-danger/10 hover:text-danger-foreground"
        >
          <Trash2 className="size-3.5" />
          Xoá
        </Button>
      </div>
      {children}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className="w-full border-dashed">
      <Plus className="size-4" />
      {label}
    </Button>
  )
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{children}</label>
}

/** Ô chọn khoảng thời gian dùng chung cho kinh nghiệm và học vấn. */
function PeriodFields({
  startDate,
  endDate,
  current,
  onChange,
  currentLabel,
}: {
  startDate: string
  endDate: string
  current: boolean
  onChange: (patch: { startDate?: string; endDate?: string; current?: boolean }) => void
  currentLabel: string
}) {
  return (
    <>
      <div>
        <Lbl>Từ tháng</Lbl>
        <Input
          type="month"
          value={startDate}
          onChange={(e) => onChange({ startDate: e.target.value })}
        />
      </div>
      <div>
        <Lbl>Đến tháng</Lbl>
        <Input
          type="month"
          value={current ? '' : endDate}
          disabled={current}
          onChange={(e) => onChange({ endDate: e.target.value })}
        />
        <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={current}
            onChange={(e) => onChange({ current: e.target.checked })}
            className="size-3.5 rounded border-input accent-[var(--brand-500)]"
          />
          {currentLabel}
        </label>
      </div>
    </>
  )
}

export function ExperienceEditor({
  value,
  onChange,
}: {
  value: ExperienceEntry[]
  onChange: (next: ExperienceEntry[]) => void
}) {
  const patch = (i: number, p: Partial<ExperienceEntry>) =>
    onChange(value.map((e, idx) => (idx === i ? { ...e, ...p } : e)))

  return (
    <div className="space-y-3">
      {value.map((exp, i) => (
        <EntryCard key={i} index={i} onRemove={() => onChange(value.filter((_, x) => x !== i))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Lbl>Vị trí</Lbl>
              <Input
                value={exp.position}
                onChange={(e) => patch(i, { position: e.target.value })}
                placeholder="Lập trình viên Backend"
              />
            </div>
            <div>
              <Lbl>Công ty</Lbl>
              <Input
                value={exp.company}
                onChange={(e) => patch(i, { company: e.target.value })}
                placeholder="Công ty ABC"
              />
            </div>
            <PeriodFields
              startDate={exp.startDate}
              endDate={exp.endDate}
              current={exp.current}
              currentLabel="Đang làm ở đây"
              onChange={(p) => patch(i, p)}
            />
            <div className="sm:col-span-2">
              <Lbl>Mô tả công việc</Lbl>
              <Textarea
                rows={4}
                value={exp.description}
                onChange={(e) => patch(i, { description: e.target.value })}
                placeholder="Mỗi đầu việc một dòng — xuống dòng sẽ được giữ nguyên khi nhà tuyển dụng xem."
              />
            </div>
          </div>
        </EntryCard>
      ))}
      <AddButton
        label="Thêm kinh nghiệm làm việc"
        onClick={() => onChange([...value, emptyExperience()])}
      />
    </div>
  )
}

export function EducationEditor({
  value,
  onChange,
}: {
  value: EducationEntry[]
  onChange: (next: EducationEntry[]) => void
}) {
  const patch = (i: number, p: Partial<EducationEntry>) =>
    onChange(value.map((e, idx) => (idx === i ? { ...e, ...p } : e)))

  return (
    <div className="space-y-3">
      {value.map((edu, i) => (
        <EntryCard key={i} index={i} onRemove={() => onChange(value.filter((_, x) => x !== i))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Lbl>Trường</Lbl>
              <Input
                value={edu.school}
                onChange={(e) => patch(i, { school: e.target.value })}
                placeholder="Trường Đại học Bách khoa — Đại học Đà Nẵng"
              />
            </div>
            <div>
              <Lbl>Chuyên ngành</Lbl>
              <Input
                value={edu.major}
                onChange={(e) => patch(i, { major: e.target.value })}
                placeholder="Công nghệ Thông tin"
              />
            </div>
            <div>
              <Lbl>Bậc học</Lbl>
              <Input
                value={edu.degree}
                onChange={(e) => patch(i, { degree: e.target.value })}
                placeholder="Kỹ sư / Cử nhân / Thạc sĩ"
              />
            </div>
            <PeriodFields
              startDate={edu.startDate}
              endDate={edu.endDate}
              current={edu.current}
              currentLabel="Đang theo học"
              onChange={(p) => patch(i, p)}
            />
            <div className="sm:col-span-2">
              <Lbl>GPA (tuỳ chọn)</Lbl>
              <Input
                value={edu.gpa}
                onChange={(e) => patch(i, { gpa: e.target.value })}
                placeholder="3.2/4.0"
              />
            </div>
          </div>
        </EntryCard>
      ))}
      <AddButton label="Thêm học vấn" onClick={() => onChange([...value, emptyEducation()])} />
    </div>
  )
}

export function LanguageEditor({
  value,
  onChange,
}: {
  value: LanguageEntry[]
  onChange: (next: LanguageEntry[]) => void
}) {
  const patch = (i: number, p: Partial<LanguageEntry>) =>
    onChange(value.map((e, idx) => (idx === i ? { ...e, ...p } : e)))

  return (
    <div className="space-y-2">
      {value.map((lang, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={lang.name}
            onChange={(e) => patch(i, { name: e.target.value })}
            placeholder="Tiếng Anh"
            className="flex-1"
          />
          <Input
            value={lang.level}
            onChange={(e) => patch(i, { level: e.target.value })}
            placeholder="IELTS 7.0 / Giao tiếp tốt"
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(value.filter((_, x) => x !== i))}
            className="shrink-0 text-danger-foreground hover:bg-danger/10 hover:text-danger-foreground"
            aria-label="Xoá ngôn ngữ"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <AddButton label="Thêm ngôn ngữ" onClick={() => onChange([...value, emptyLanguage()])} />
    </div>
  )
}

/** Tiêu đề mục trong bản xem trước CV — chấm tròn + chữ in hoa nhỏ. */
export function PreviewSection({
  title,
  color,
  children,
}: {
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h4
        className="mb-2 flex items-center gap-1.5 font-bold tracking-wide"
        style={{ color }}
      >
        <span
          className="inline-block size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        {title}
      </h4>
      {children}
    </section>
  )
}

/** Một mục trong dòng thời gian: vạch dọc mảnh + chấm tròn bên trái. */
export function TimelineItem({
  color,
  children,
}: {
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="relative border-l pl-3.5" style={{ borderColor: `${color}33` }}>
      <span
        className="absolute top-1.5 -left-[3.5px] size-[7px] rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {children}
    </div>
  )
}
