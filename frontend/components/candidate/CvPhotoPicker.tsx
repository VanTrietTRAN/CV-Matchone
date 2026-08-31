'use client'

import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ImagePlus, Loader2, Trash2, User } from 'lucide-react'
import { toast } from 'sonner'
import {
  ACCEPTED_IMAGE_TYPES,
  fileToResizedDataUrl,
  validateImageFile,
} from '@/lib/image-resize'

/**
 * Chọn ảnh chân dung cho CV.
 *
 * Bản xem trước vốn đã chừa sẵn một vòng tròn cho ảnh, nhưng không có chỗ nào để
 * tải ảnh lên nên vòng tròn đó luôn trống.
 *
 * Ảnh được thu nhỏ và cắt vuông ngay trên trình duyệt trước khi gửi đi, nên thứ
 * lưu vào database chỉ là một data URL vài chục KB — không cần thêm kho lưu trữ,
 * và ảnh đi thẳng vào file PDF khi xuất CV.
 */

const MAX_EDGE = 320 // px — đủ nét cho khung ảnh in ra giấy

export default function CvPhotoPicker({
  value,
  onChange,
  labels,
}: {
  value: string
  onChange: (next: string) => void
  labels: { title: string; hint: string; choose: string; replace: string; remove: string }
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Cho phép chọn lại đúng file vừa xoá
    event.target.value = ''
    if (!file) return

    const problem = validateImageFile(file)
    if (problem) {
      toast.error(problem)
      return
    }

    setBusy(true)
    try {
      onChange(
        await fileToResizedDataUrl(file, { targetWidth: MAX_EDGE, targetHeight: MAX_EDGE }),
      )
      toast.success('Đã thêm ảnh vào CV. Nhớ bấm Lưu để cập nhật hồ sơ.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không xử lý được ảnh.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
        {value ? (
          // Ảnh là data URL nên next/image không tối ưu được gì — dùng thẻ img thường.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Ảnh chân dung trên CV" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <User className="size-8" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="min-w-0 space-y-2">
        <div>
          <p className="text-sm font-medium">{labels.title}</p>
          <p className="text-xs text-muted-foreground">{labels.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {value ? labels.replace : labels.choose}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-danger-foreground hover:bg-danger/10 hover:text-danger-foreground"
              disabled={busy}
              onClick={() => onChange('')}
            >
              <Trash2 className="size-4" />
              {labels.remove}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="hidden"
          onChange={handleFile}
          disabled={busy}
        />
      </div>
    </div>
  )
}
