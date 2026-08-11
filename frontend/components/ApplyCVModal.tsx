'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import SkillTag from '@/components/SkillTag'
import { apiFetch } from '@/lib/api'
import { Loader2, FileText, Star, CheckCircle2, AlertCircle, Zap, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'

type CvSummary = {
  _id: string
  fullName: string
  headline?: string
  skills?: string[]
  isPrimary: boolean
  isLookingForJob: boolean
  fileUrl?: string
  embedding?: number[]
  createdAt: string
}

type Props = {
  jobId: string
  jobTitle: string
  onClose: () => void
  onSuccess: (jobId: string) => void
}

export default function ApplyCVModal({ jobId, jobTitle, onClose, onSuccess }: Props) {
  const [cvList, setCvList] = useState<CvSummary[]>([])
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch<{ data: CvSummary[] }>('/api/cv')
        const list = res.data || []
        setCvList(list)
        // Ưu tiên CV chính, nếu không có thì lấy CV đầu danh sách
        setSelectedCvId(list.find((c) => c.isPrimary)?._id || list[0]?._id || null)
      } catch {
        toast.error('Không tải được danh sách CV')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleApply = async () => {
    if (!selectedCvId) {
      toast.error('Vui lòng chọn CV để ứng tuyển')
      return
    }
    setApplying(true)
    try {
      await apiFetch('/api/applications', {
        method: 'POST',
        body: JSON.stringify({ jobId, cvProfileId: selectedCvId }),
      })
      toast.success('Đã gửi đơn ứng tuyển thành công!')
      onSuccess(jobId)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không thể ứng tuyển')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border bg-brand-50/60 p-5 text-left">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-card text-brand-600 ring-1 ring-brand-200">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg">Chọn CV để ứng tuyển</DialogTitle>
              <DialogDescription className="truncate">{jobTitle}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[52vh] overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-32 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Đang tải danh sách CV...
            </div>
          ) : cvList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-warning-surface text-warning-foreground">
                <AlertCircle className="size-6" />
              </span>
              <div>
                <p className="font-semibold">Bạn chưa có CV nào</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Hãy tạo CV trong mục Hồ sơ &amp; CV trước khi ứng tuyển.
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/candidate/cv">Tạo CV ngay</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-sm text-muted-foreground">
                Điểm phù hợp sẽ được tính lại theo CV bạn chọn.
              </p>

              {cvList.map((cv) => {
                const isSelected = selectedCvId === cv._id
                const hasEmbedding = Boolean(cv.embedding && cv.embedding.length > 0)

                return (
                  <button
                    key={cv._id}
                    type="button"
                    onClick={() => setSelectedCvId(cv._id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left transition-all',
                      isSelected
                        ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/25'
                        : 'border-border hover:border-brand-300 hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
                          isSelected ? 'border-brand-500 bg-brand-500' : 'border-input',
                        )}
                      >
                        {isSelected && <span className="size-2 rounded-full bg-white" />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold">{cv.fullName}</span>
                          {cv.isPrimary && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
                              <Star className="size-3 fill-current" />
                              CV chính
                            </span>
                          )}
                        </div>

                        {cv.headline && (
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {cv.headline}
                          </p>
                        )}

                        {cv.skills && cv.skills.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {cv.skills.slice(0, 4).map((s) => (
                              <SkillTag key={s} skill={s} size="sm" />
                            ))}
                            {cv.skills.length > 4 && (
                              <span className="self-center text-[11px] text-muted-foreground">
                                +{cv.skills.length - 4}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {hasEmbedding ? (
                            <span className="inline-flex items-center gap-1 font-medium text-success-foreground">
                              <Zap className="size-3" />
                              Đã phân tích AI
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-warning-foreground">
                              <AlertCircle className="size-3" />
                              Chưa phân tích AI
                            </span>
                          )}
                          {cv.fileUrl && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <FileText className="size-3" />
                              Có file đính kèm
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            Tạo ngày {formatDate(cv.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border p-4 sm:justify-between">
          <Link
            href="/candidate/cv"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-brand-600"
          >
            <Upload className="size-3.5" />
            Quản lý CV
          </Link>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={applying}>
              Huỷ
            </Button>
            <Button
              onClick={handleApply}
              disabled={applying || loading || cvList.length === 0 || !selectedCvId}
            >
              {applying ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {applying ? 'Đang gửi...' : 'Xác nhận ứng tuyển'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
