'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

const MIN_LENGTH = 6

type Field = 'current' | 'next' | 'confirm'

const emptyForm = { current: '', next: '', confirm: '' }

export default function ChangePasswordForm() {
  const [form, setForm] = useState(emptyForm)
  const [visible, setVisible] = useState<Record<Field, boolean>>({
    current: false,
    next: false,
    confirm: false,
  })
  const [saving, setSaving] = useState(false)

  const set = (field: Field, value: string) => setForm((prev) => ({ ...prev, [field]: value }))
  const toggle = (field: Field) => setVisible((prev) => ({ ...prev, [field]: !prev[field] }))

  // Kiểm tra phía client chỉ để phản hồi nhanh — máy chủ vẫn kiểm lại toàn bộ
  const validate = (): string | null => {
    if (!form.current) return 'Vui lòng nhập mật khẩu hiện tại.'
    if (!form.next) return 'Vui lòng nhập mật khẩu mới.'
    if (form.next.length < MIN_LENGTH) return `Mật khẩu mới cần ít nhất ${MIN_LENGTH} ký tự.`
    if (form.next === form.current) return 'Mật khẩu mới phải khác mật khẩu hiện tại.'
    if (form.next !== form.confirm) return 'Xác nhận mật khẩu không khớp.'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const error = validate()
    if (error) {
      toast.error(error)
      return
    }

    setSaving(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: form.current,
          newPassword: form.next,
        }),
      })
      toast.success('Đổi mật khẩu thành công.')
      setForm(emptyForm)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đổi mật khẩu thất bại.')
    } finally {
      setSaving(false)
    }
  }

  const renderField = (
    field: Field,
    label: string,
    autoComplete: string,
    hint?: string,
  ) => (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" htmlFor={`password-${field}`}>
        {label}
      </label>
      <div className="relative">
        <Input
          id={`password-${field}`}
          type={visible[field] ? 'text' : 'password'}
          value={form[field]}
          onChange={(e) => set(field, e.target.value)}
          autoComplete={autoComplete}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => toggle(field)}
          aria-label={visible[field] ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible[field] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <KeyRound className="size-5" />
        </span>
        <div>
          <h2 className="font-bold">Đổi mật khẩu</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Nhập mật khẩu hiện tại để xác nhận danh tính, sau đó đặt mật khẩu mới. Bạn vẫn giữ
            nguyên phiên đăng nhập sau khi đổi.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4 border-t border-border pt-5">
        {renderField('current', 'Mật khẩu hiện tại', 'current-password')}
        {renderField(
          'next',
          'Mật khẩu mới',
          'new-password',
          `Tối thiểu ${MIN_LENGTH} ký tự.`,
        )}
        {renderField('confirm', 'Nhập lại mật khẩu mới', 'new-password')}

        <div className="flex flex-wrap gap-3 pt-1">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Đổi mật khẩu
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setForm(emptyForm)}
            disabled={saving}
          >
            Xoá form
          </Button>
        </div>
      </form>

      <p className="mt-4 text-xs text-muted-foreground">
        Quên mật khẩu hiện tại? Đăng xuất rồi dùng chức năng{' '}
        <a href="/forgot-password" className="font-semibold text-brand-600 hover:underline">
          Quên mật khẩu
        </a>{' '}
        để nhận link đặt lại qua email.
      </p>
    </section>
  )
}
