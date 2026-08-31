'use client'

import React, { useCallback, useEffect, useState } from 'react'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Bell, Users, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

/**
 * Cài đặt email của doanh nghiệp.
 *
 * Trước đây trang này chỉ là bản dựng giao diện: bấm "Lưu cài đặt" hiện thông báo
 * xanh rồi thôi, không gọi API nào, và có một công tắc ("Nhắc hạn tin tuyển dụng")
 * cho tính năng chưa tồn tại. Nay mọi tuỳ chọn đều lưu lên máy chủ và điều khiển
 * đúng email tổng hợp gửi lúc 15h hằng ngày.
 */
type Settings = {
  isEmailSubscribed: boolean
  minMatchScore: number
  employerDigestLimit: number
  jobMatchFrequency: string
}

const DEFAULTS: Settings = {
  isEmailSubscribed: true,
  minMatchScore: 70,
  employerDigestLimit: 0,
  jobMatchFrequency: 'daily',
}

function SettingCard({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ElementType
  title: string
  description: string
  enabled: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon className="size-5" />
          </span>
          <div>
            <h2 className="font-bold">{title}</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-2.5">
          <Switch checked={enabled} onCheckedChange={onToggle} />
          <span className="text-sm font-semibold">{enabled ? 'Đang bật' : 'Đang tắt'}</span>
        </label>
      </div>

      {enabled && children && (
        <div className="mt-5 space-y-4 border-t border-border pt-5">{children}</div>
      )}
    </section>
  )
}

export default function EmployerEmailSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { user: Partial<Settings> } }>('/api/users/me/profile')
      const u = res.data?.user || {}
      setSettings({
        isEmailSubscribed: u.isEmailSubscribed ?? DEFAULTS.isEmailSubscribed,
        minMatchScore: u.minMatchScore ?? DEFAULTS.minMatchScore,
        employerDigestLimit: u.employerDigestLimit ?? DEFAULTS.employerDigestLimit,
        jobMatchFrequency: u.jobMatchFrequency ?? DEFAULTS.jobMatchFrequency,
      })
    } catch {
      toast.error('Không tải được cài đặt email')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/users/me/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      toast.success('Đã lưu cài đặt. Email tổng hợp lúc 15h sẽ theo tuỳ chọn mới.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lưu cài đặt thất bại')
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  if (loading) {
    return (
      <EmployerLayout>
        <PageContainer size="sm">
          <div className="flex items-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Đang tải cài đặt...
          </div>
        </PageContainer>
      </EmployerLayout>
    )
  }

  return (
    <EmployerLayout>
      <PageContainer size="sm">
        <PageHeader
          title="Cài đặt email"
          description="Chọn khi nào và với điều kiện nào hệ thống gửi email tổng hợp ứng viên cho bạn."
        />

        <div className="space-y-5">
          <SettingCard
            icon={Users}
            title="Email tổng hợp ứng viên phù hợp"
            description="Mỗi ngày lúc 15h, hệ thống gom các hồ sơ có điểm phù hợp cao vừa ứng tuyển vào tin của bạn thành một email duy nhất."
            enabled={settings.isEmailSubscribed}
            onToggle={() => set('isEmailSubscribed', !settings.isEmailSubscribed)}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="text-sm font-semibold">Ngưỡng điểm phù hợp</label>
                <p className="text-xs text-muted-foreground">
                  Chỉ báo những hồ sơ đạt từ mức này trở lên.
                </p>
              </div>
              <Select
                value={String(settings.minMatchScore)}
                onValueChange={(v) => set('minMatchScore', Number(v))}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">Từ 50% trở lên</SelectItem>
                  <SelectItem value="60">Từ 60% trở lên</SelectItem>
                  <SelectItem value="70">Từ 70% trở lên</SelectItem>
                  <SelectItem value="80">Từ 80% trở lên</SelectItem>
                  <SelectItem value="90">Từ 90% trở lên</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="text-sm font-semibold">Số hồ sơ tối đa mỗi email</label>
                <p className="text-xs text-muted-foreground">
                  Hồ sơ điểm cao nhất được ưu tiên đưa vào trước.
                </p>
              </div>
              <Select
                value={String(settings.employerDigestLimit)}
                onValueChange={(v) => set('employerDigestLimit', Number(v))}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Không giới hạn</SelectItem>
                  <SelectItem value="5">5 hồ sơ</SelectItem>
                  <SelectItem value="10">10 hồ sơ</SelectItem>
                  <SelectItem value="20">20 hồ sơ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SettingCard>

          <SettingCard
            icon={Bell}
            title="Tần suất nhận email"
            description="Áp dụng cho email tổng hợp ứng viên ở trên."
            enabled={settings.jobMatchFrequency !== 'off'}
            onToggle={() =>
              set('jobMatchFrequency', settings.jobMatchFrequency === 'off' ? 'daily' : 'off')
            }
          >
            <Select
              value={settings.jobMatchFrequency}
              onValueChange={(v) => set('jobMatchFrequency', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Hằng ngày (15h)</SelectItem>
                <SelectItem value="weekly">Hằng tuần</SelectItem>
              </SelectContent>
            </Select>
          </SettingCard>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={handleSave} size="lg" disabled={saving} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Lưu cài đặt
          </Button>
          <Button onClick={() => setSettings(DEFAULTS)} variant="outline" size="lg">
            Khôi phục mặc định
          </Button>
        </div>
      </PageContainer>
    </EmployerLayout>
  )
}
