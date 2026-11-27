'use client'

import React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  actionLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
  destructive?: boolean
  loading?: boolean
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  cancelLabel = 'Huỷ bỏ',
  onConfirm,
  onCancel,
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Radix tự đóng hộp thoại ngay khi bấm — tác vụ async còn đang chạy
              // thì spinner "Đang xử lý..." không kịp hiện. Giữ hộp thoại mở; nơi
              // gọi tự đóng khi tác vụ xong (mọi chỗ gọi đều đã làm vậy).
              e.preventDefault()
              onConfirm()
            }}
            disabled={loading}
            className={cn(destructive && 'bg-destructive text-white hover:brightness-95')}
          >
            {loading && <Loader2 className="animate-spin" />}
            {loading ? 'Đang xử lý...' : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
