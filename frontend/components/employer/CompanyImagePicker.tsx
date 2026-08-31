'use client'

import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  ACCEPTED_IMAGE_TYPES,
  fileToResizedDataUrl,
  validateImageFile,
} from '@/lib/image-resize'

/**
 * Nút tải ảnh thương hiệu của doanh nghiệp (ảnh bìa và logo).
 *
 * Trang hồ sơ công ty trước đây chỉ vẽ một dải gradient ghi sẵn chữ "Ảnh bìa
 * công ty" và một ô hiện hai chữ cái đầu thay cho logo. Cả hai trông như chỗ đặt
 * ảnh nhưng không có nút tải lên, cũng không có cột nào trong database — nên
 * doanh nghiệp không đổi được.
 *
 * Ảnh được cắt đúng tỉ lệ và thu nhỏ trên trình duyệt trước khi gửi đi.
 */

/** Kích thước đích cho từng loại ảnh. Ảnh bìa rộng, logo vuông. */
export const COVER_SIZE = { targetWidth: 1024, targetHeight: 341, quality: 0.8 }
export const LOGO_SIZE = { targetWidth: 256, targetHeight: 256, quality: 0.85 }

export default function CompanyImagePicker({
  value,
  onChange,
  size,
  chooseLabel,
  replaceLabel,
  removeLabel,
  className,
}: {
  value: string
  onChange: (next: string) => void
  /** Tỉ lệ và độ phân giải đích — dùng COVER_SIZE hoặc LOGO_SIZE. */
  size: typeof COVER_SIZE
  chooseLabel: string
  replaceLabel: string
  removeLabel: string
  className?: string
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
      onChange(await fileToResizedDataUrl(file, size))
      toast.success('Đã chọn ảnh. Nhớ bấm Lưu để cập nhật hồ sơ công ty.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không xử lý được ảnh.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {value ? replaceLabel : chooseLabel}
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
            {removeLabel}
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
  )
}
