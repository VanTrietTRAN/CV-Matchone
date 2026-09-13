'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getApiBase } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Mail,
  Upload,
  XCircle,
} from 'lucide-react'

/**
 * Khối import hàng loạt từ file Excel, dùng chung cho import sinh viên (admin) và
 * import tin tuyển dụng (doanh nghiệp / admin).
 *
 * Luôn chạy XEM TRƯỚC trước khi ghi: người dùng thấy chính xác dòng nào sẽ tạo,
 * dòng nào bị bỏ qua và vì sao, rồi mới bấm xác nhận. Tạo nhầm hàng trăm bản ghi
 * rồi dọn tay là việc rất mệt và dễ sót.
 */

type RowResult = {
  row: number
  email?: string
  fullName?: string
  title?: string
  reason?: string
  emailSent?: boolean
  emailError?: string
  hasEmbedding?: boolean
  sendTo?: 'personal' | 'school' | 'both'
}

type ImportResult = {
  applied: boolean
  totalRows: number
  truncated?: boolean
  created: RowResult[]
  /** Bản ghi đã có, được xếp lại để làm tiếp một việc (vd. gửi bù email trường) */
  requeued?: RowResult[]
  skipped?: RowResult[]
  failed: RowResult[]
  /** Không chặn việc tạo, nhưng admin nên biết (vd. thiếu MSSV) */
  warnings?: RowResult[]
  /** Số lượt gửi email sẽ tốn — Brevo tính theo từng người nhận */
  quotaUnits?: number
}

export default function ExcelImporter({
  endpoint,
  templateUrl,
  extraFields,
  labels,
  onDone,
  children,
}: {
  /** Đường dẫn API nhận file, ví dụ /api/admin/import/users */
  endpoint: string
  templateUrl: string
  /** Trường gửi kèm, ví dụ { employerId } khi admin import hộ doanh nghiệp */
  extraFields?: Record<string, string>
  labels: { unit: string; createVerb: string; requeueUnit?: string }
  onDone?: () => void
  /** Tuỳ chọn hiển thị phía trên nút gửi, ví dụ công tắc gửi email trường */
  children?: React.ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  // Đổi tuỳ chọn sau khi đã xem trước thì bản xem trước không còn đúng nữa (bật
  // email trường làm thay đổi cả số tài khoản được gửi bù). Bỏ đi để admin phải
  // xem lại, tránh bấm xác nhận theo con số cũ.
  const extraKey = JSON.stringify(extraFields || {})
  useEffect(() => {
    setPreview(null)
  }, [extraKey])

  const send = async (apply: boolean) => {
    if (!file) {
      toast.error('Vui lòng chọn file Excel.')
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('apply', String(apply))
      for (const [k, v] of Object.entries(extraFields || {})) form.append(k, v)

      // Dùng fetch thủ công vì apiFetch đặt Content-Type: application/json
      const res = await fetch(`${getApiBase()}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })

      const raw = await res.text()
      let data: any
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        throw new Error(`Máy chủ trả về dữ liệu không đọc được (HTTP ${res.status}).`)
      }
      if (!res.ok) throw new Error(data?.message || `Thất bại (HTTP ${res.status})`)

      if (apply) {
        setResult(data.data)
        setPreview(null)
        toast.success(data.message)
        onDone?.()
      } else {
        setPreview(data.data)
        setResult(null)
        toast.info(data.message)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import thất bại')
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const shown = result || preview

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className="gap-2">
          <a href={`${getApiBase()}${templateUrl}`} download>
            <Download className="size-4" />
            Tải file mẫu
          </a>
        </Button>
        <p className="text-sm text-muted-foreground">
          Tải mẫu về, điền dữ liệu rồi tải lên. Tiêu đề cột có thể viết khác một chút,
          hệ thống vẫn nhận ra.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <FileSpreadsheet className="mx-auto mb-3 size-10 text-muted-foreground" />
        {file ? (
          <p className="text-sm">
            <span className="font-medium">{file.name}</span>{' '}
            <span className="text-muted-foreground">({Math.round(file.size / 1024)} KB)</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa chọn file (.xlsx, .xls hoặc .csv)</p>
        )}

        {children && <div className="mt-4 text-left">{children}</div>}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Upload className="size-4" />
            {file ? 'Chọn file khác' : 'Chọn file'}
          </Button>
          <Button type="button" className="gap-2" onClick={() => send(false)} disabled={busy || !file}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Xem trước
          </Button>
          {preview && preview.created.length + (preview.requeued?.length ?? 0) > 0 && (
            <Button
              type="button"
              className="gap-2 bg-brand-600 hover:bg-brand-700"
              onClick={() => send(true)}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Xác nhận {labels.createVerb} {preview.created.length} {labels.unit}
              {(preview.requeued?.length ?? 0) > 0 &&
                ` và gửi bù ${preview.requeued!.length} ${labels.requeueUnit || 'bản ghi'}`}
            </Button>
          )}
          {(file || shown) && (
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              Làm lại
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null)
            setPreview(null)
            setResult(null)
          }}
        />
      </div>

      {shown && (
        <div className="space-y-4">
          {shown.truncated && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-surface p-3 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              File có nhiều hơn 1000 dòng. Hệ thống chỉ xử lý 1000 dòng đầu — hãy chia nhỏ file.
            </p>
          )}

          <div
            className={cn(
              'grid gap-3',
              (shown.requeued?.length ?? 0) > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'sm:grid-cols-3',
            )}
          >
            <Stat
              label={result ? `Đã ${labels.createVerb}` : `Sẽ ${labels.createVerb}`}
              value={shown.created.length}
              tone="ok"
            />
            {(shown.requeued?.length ?? 0) > 0 && (
              <Stat
                label={result ? 'Đã xếp gửi bù' : 'Sẽ gửi bù'}
                value={shown.requeued!.length}
                tone="ok"
              />
            )}
            <Stat label="Bỏ qua" value={shown.skipped?.length ?? 0} tone="warn" />
            <Stat label="Lỗi" value={shown.failed.length} tone="bad" />
          </div>

          {typeof shown.quotaUnits === 'number' && shown.quotaUnits > 0 && (
            <p className="flex items-start gap-2 text-left text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Cần {shown.quotaUnits} lượt gửi email (Brevo tính mỗi địa chỉ nhận là một lượt).
            </p>
          )}

          <RowList
            title={labels.requeueUnit ? `Gửi bù ${labels.requeueUnit}` : 'Xếp lại'}
            rows={shown.requeued || []}
            tone="info"
          />
          <RowList title="Lưu ý" rows={shown.warnings || []} tone="warn" />
          <RowList title="Bỏ qua" rows={shown.skipped || []} tone="warn" />
          <RowList title="Lỗi" rows={shown.failed} tone="bad" />

          {result && result.created.some((c) => c.emailSent === false) && (
            <div className="rounded-lg border border-warning/30 bg-warning-surface p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning-foreground">
                <AlertTriangle className="size-4" />
                Đã tạo tài khoản nhưng chưa gửi được email
              </p>
              <ul className="space-y-1 text-xs text-warning-foreground">
                {result.created
                  .filter((c) => c.emailSent === false)
                  .map((c) => (
                    <li key={c.row}>
                      Dòng {c.row} · {c.email} — {c.emailError}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'bad' }) {
  const tones = {
    ok: 'border-brand-200 bg-brand-50 text-brand-700',
    warn: 'border-warning/30 bg-warning-surface text-warning-foreground',
    bad: 'border-danger/30 bg-danger-surface text-danger-foreground',
  }
  return (
    <div className={cn('rounded-lg border p-3 text-center', tones[tone])}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  )
}

function RowList({
  title,
  rows,
  tone,
}: {
  title: string
  rows: RowResult[]
  tone: 'info' | 'warn' | 'bad'
}) {
  if (!rows.length) return null
  const Icon = tone === 'bad' ? XCircle : tone === 'info' ? Mail : AlertTriangle
  const iconTone = {
    info: 'text-brand-600',
    warn: 'text-warning-foreground',
    bad: 'text-danger-foreground',
  }
  return (
    <div className="rounded-lg border border-border p-3 text-left">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn('size-4', iconTone[tone])} />
        {title} ({rows.length})
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
        {rows.map((r) => (
          <li key={`${r.row}-${r.reason}`}>
            <span className="font-medium text-foreground">Dòng {r.row}</span>
            {r.email || r.title ? ` · ${r.email || r.title}` : ''} — {r.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}
