'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { MailCheck, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

type Settings = {
  isEmailSubscribed: boolean
  jobMatchFrequency: string
  minMatchScore: number
}

const defaultSettings: Settings = {
  isEmailSubscribed: true,
  jobMatchFrequency: 'daily',
  minMatchScore: 70,
}

export default function EmailPreferences() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch<{ data: { user: any; cv: any } }>('/api/users/me/profile')
        const user = res.data?.user
        setSettings((prev) => ({
          ...prev,
          isEmailSubscribed: user?.isEmailSubscribed ?? true,
          minMatchScore: user?.minMatchScore ?? 70,
          jobMatchFrequency: user?.jobMatchFrequency ?? 'daily',
        }))
      } catch {
        toast.error('Không tải được cài đặt, hiển thị giá trị mặc định')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const persist = async (next: Settings) => {
    setSaving(true)
    try {
      await apiFetch('/api/users/me/settings', {
        method: 'PUT',
        body: JSON.stringify({
          isEmailSubscribed: next.isEmailSubscribed,
          minMatchScore: next.minMatchScore,
          jobMatchFrequency: next.jobMatchFrequency,
        }),
      })
      toast.success('Đã lưu cài đặt')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="surface-card flex h-32 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <MailCheck className="size-5" />
          </span>
          <div>
            <h2 className="font-bold">Email gợi ý việc làm bằng AI</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Hệ thống tự gợi ý việc làm dựa trên CV của bạn, không cần đặt bộ lọc. Nếu muốn lọc
              theo từ khoá, địa điểm hay mức lương cụ thể, hãy tạo thông báo việc làm bên dưới.
            </p>
          </div>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-2.5">
          <Switch
            checked={settings.isEmailSubscribed}
            onCheckedChange={(checked) => {
              const next = { ...settings, isEmailSubscribed: checked }
              setSettings(next)
              persist(next)
            }}
          />
          <span className="text-sm font-semibold">
            {settings.isEmailSubscribed ? 'Đang bật' : 'Đang tắt'}
          </span>
        </label>
      </div>

      {settings.isEmailSubscribed && (
        <div className="mt-5 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-semibold">Điểm phù hợp tối thiểu</label>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-700 tabular-nums">
              {settings.minMatchScore}%
            </span>
          </div>

          <Slider
            className="mt-4"
            min={0}
            max={100}
            step={10}
            value={[settings.minMatchScore]}
            onValueChange={([value]) => setSettings({ ...settings, minMatchScore: value })}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Chỉ gửi email khi có việc làm đạt từ {settings.minMatchScore}% độ phù hợp trở lên.
            </p>
            <Button size="sm" onClick={() => persist(settings)} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Lưu thay đổi
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
