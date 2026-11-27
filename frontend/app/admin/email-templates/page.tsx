'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '@/layouts/AdminLayout'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Eye, Loader2, MailOpen, RotateCcw, Save } from 'lucide-react'

/**
 * Sửa lời văn của các email hệ thống gửi đi.
 *
 * Chỉ phần chữ được lưu vào database; bố cục HTML nằm trong
 * backend/src/services/emailTemplates.js để admin không làm vỡ giao diện thư.
 * Đổi nội dung ở đây có hiệu lực ngay, không cần deploy lại.
 */

type Group = Record<string, string>
type Templates = Record<string, Group>

type Payload = {
  templates: Templates
  defaults: Templates
  variables: Record<string, string[]>
  fieldLabels: Record<string, string>
  templateLabels: Record<string, string>
}

/** Trường nào nên dùng ô nhiều dòng thay vì một dòng. */
const MULTILINE = new Set(['intro', 'note', 'footer'])

export default function EmailTemplatesPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [draft, setDraft] = useState<Templates>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeKey, setActiveKey] = useState<string>('jobMatch')
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiFetch<{ data: Payload }>('/api/admin/system/email-templates')
      setData(res.data)
      setDraft(JSON.parse(JSON.stringify(res.data.templates)))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Không tải được mẫu email'
      setLoadError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setField = (group: string, field: string, value: string) =>
    setDraft((prev) => ({ ...prev, [group]: { ...prev[group], [field]: value } }))

  const dirty = useMemo(
    () => Boolean(data) && JSON.stringify(draft) !== JSON.stringify(data?.templates),
    [draft, data],
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await apiFetch<{ message: string; data: { templates: Templates } }>(
        '/api/admin/system/email-templates',
        { method: 'PUT', body: JSON.stringify({ templates: draft }) },
      )
      toast.success(res.message)
      setData((prev) => (prev ? { ...prev, templates: res.data.templates } : prev))
      setDraft(JSON.parse(JSON.stringify(res.data.templates)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  /** Xem trước dùng chính nội dung đang gõ dở, không cần lưu trước. */
  const handlePreview = async () => {
    setPreviewing(true)
    try {
      const res = await apiFetch<{ data: { subject: string; html: string } }>(
        `/api/admin/system/email-templates/${activeKey}/preview`,
        { method: 'POST', body: JSON.stringify({ templates: draft }) },
      )
      setPreview(res.data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không dựng được bản xem trước')
    } finally {
      setPreviewing(false)
    }
  }

  const resetGroup = (group: string) => {
    if (!data) return
    setDraft((prev) => ({ ...prev, [group]: { ...data.defaults[group] } }))
    toast.info('Đã đưa về nội dung mặc định. Bấm Lưu để áp dụng.')
  }

  // API lỗi: hiện lỗi và nút thử lại — trước đây kẹt mãi ở "Đang tải mẫu email..."
  if (!loading && !data) {
    return (
      <AdminLayout>
        <div className="space-y-3 p-8">
          <p className="text-sm text-red-300">{loadError || 'Không tải được mẫu email.'}</p>
          <Button variant="outline" onClick={load} className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700">
            Thử lại
          </Button>
        </div>
      </AdminLayout>
    )
  }

  if (loading || !data) {
    return (
      <AdminLayout>
        <div className="flex items-center gap-2 p-8 text-slate-400">
          <Loader2 className="size-4 animate-spin" />
          Đang tải mẫu email...
        </div>
      </AdminLayout>
    )
  }

  const templateKeys = Object.keys(data.templateLabels)
  const activeGroup = draft[activeKey] || {}
  const activeVars = data.variables[activeKey] || []

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              <MailOpen className="size-6 text-brand-400" />
              Nội dung email
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Sửa lời văn của các email hệ thống gửi tự động. Bố cục và màu sắc giữ nguyên trong
              code để thư không bị vỡ. Đổi nội dung có hiệu lực ngay, không cần deploy lại.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              onClick={handlePreview}
              disabled={previewing}
            >
              {previewing ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
              Xem trước
            </Button>
            <Button className="gap-2" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {dirty ? 'Lưu thay đổi' : 'Đã lưu'}
            </Button>
          </div>
        </div>

        {/* Tên thương hiệu dùng chung cho mọi email */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-bold tracking-wider text-slate-400 uppercase">
            Dùng chung cho mọi email
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Tên thương hiệu"
              value={draft.brand?.name ?? ''}
              onChange={(v) => setField('brand', 'name', v)}
              hint="Hiện ở đầu mỗi email và thay cho {{brand}}"
            />
            <Field
              label="Câu mô tả dưới tên"
              value={draft.brand?.tagline ?? ''}
              onChange={(v) => setField('brand', 'tagline', v)}
            />
          </div>
        </div>

        {/* Chọn loại email */}
        <div className="flex flex-wrap gap-2">
          {templateKeys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setActiveKey(k)
                setPreview(null)
              }}
              className={cn(
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                activeKey === k
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800',
              )}
            >
              {data.templateLabels[k]}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Cột trái: các ô nhập */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-white">{data.templateLabels[activeKey]}</h2>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                onClick={() => resetGroup(activeKey)}
              >
                <RotateCcw className="size-3.5" />
                Về mặc định
              </Button>
            </div>

            {activeVars.length > 0 && (
              <div className="rounded-lg bg-slate-800/60 p-3">
                <p className="mb-2 text-xs text-slate-400">
                  Biến dùng được — gõ đúng dạng này, hệ thống sẽ thay bằng giá trị thật:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {activeVars.map((v) => (
                    <code
                      key={v}
                      className="rounded bg-slate-950 px-2 py-0.5 font-mono text-xs text-brand-300"
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(data.defaults[activeKey] || {}).map((field) => (
              <Field
                key={field}
                label={data.fieldLabels[field] || field}
                value={activeGroup[field] ?? ''}
                onChange={(v) => setField(activeKey, field, v)}
                multiline={MULTILINE.has(field)}
                hint={field === 'subject' ? 'Dòng tiêu đề người nhận thấy trong hộp thư' : undefined}
              />
            ))}

            <p className="text-xs text-slate-500">
              Để trống một ô thì hệ thống tự dùng lại nội dung mặc định của ô đó.
            </p>
          </div>

          {/* Cột phải: xem trước */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 font-semibold text-white">Bản xem trước</h2>
            {preview ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-800/60 p-3">
                  <p className="text-xs text-slate-400">Tiêu đề</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">{preview.subject}</p>
                </div>
                {/* Nội dung do chính admin soạn, dựng lại bằng bố cục cố định phía server */}
                <iframe
                  title="Xem trước email"
                  srcDoc={preview.html}
                  sandbox=""
                  className="h-[560px] w-full rounded-lg border border-slate-700 bg-white"
                />
              </div>
            ) : (
              <div className="flex h-[560px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-700 text-slate-500">
                <Eye className="size-8" />
                <p className="text-sm">Bấm “Xem trước” để dựng thư bằng dữ liệu mẫu</p>
                <p className="text-xs">Không gửi đi, không tốn quota Brevo</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

function Field({
  label,
  value,
  onChange,
  multiline,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>
      {multiline ? (
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-slate-700 bg-slate-950 text-slate-100"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-slate-700 bg-slate-950 text-slate-100"
        />
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
