'use client'

import React, { useState } from 'react'
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
import { CheckCircle2, Bell, Users, CalendarClock, Info } from 'lucide-react'

const initialSettings = {
  autoEmailMatched: true,
  emailTopTenOnly: false,
  matchThreshold: 70,
  applicationAlerts: true,
  alertFrequency: 'daily',
  jobReminders: true,
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
  const [settings, setSettings] = useState(initialSettings)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleToggle = (key: keyof typeof initialSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSelect = (key: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: isNaN(Number(value)) ? value : Number(value),
    }))
  }

  return (
    <EmployerLayout>
      <PageContainer size="sm">
        <PageHeader
          title="Cài đặt email & thông báo"
          description="Chọn thời điểm hệ thống gửi email về ứng viên phù hợp, hồ sơ mới và hạn tin tuyển dụng."
        />

        {/* Trạng thái thật của tính năng — tránh gây hiểu nhầm là đã lưu lên máy chủ */}
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-surface p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-warning-foreground" />
          <p className="text-sm leading-relaxed text-warning-foreground">
            <strong>Tính năng đang hoàn thiện:</strong> các tuỳ chọn dưới đây mới áp dụng trong
            phiên làm việc hiện tại và chưa được đồng bộ với máy chủ.
          </p>
        </div>

        {saved && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" />
            <p className="text-sm font-semibold text-brand-800">Đã ghi nhận tuỳ chọn của bạn.</p>
          </div>
        )}

        <div className="space-y-5">
          <SettingCard
            icon={Users}
            title="Ứng viên phù hợp do AI gợi ý"
            description="Gửi email cho bạn khi có ứng viên có điểm phù hợp cao với tin tuyển dụng đang mở."
            enabled={settings.autoEmailMatched}
            onToggle={() => handleToggle('autoEmailMatched')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-semibold">Ngưỡng điểm phù hợp</label>
              <Select
                value={String(settings.matchThreshold)}
                onValueChange={(value) => handleSelect('matchThreshold', value)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">Từ 50% trở lên</SelectItem>
                  <SelectItem value="70">Từ 70% trở lên</SelectItem>
                  <SelectItem value="80">Từ 80% trở lên</SelectItem>
                  <SelectItem value="90">Từ 90% trở lên</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5">
              <Switch
                checked={settings.emailTopTenOnly}
                onCheckedChange={() => handleToggle('emailTopTenOnly')}
              />
              <span className="text-sm">Chỉ gửi 10 ứng viên phù hợp nhất mỗi tin</span>
            </label>
          </SettingCard>

          <SettingCard
            icon={Bell}
            title="Thông báo hồ sơ ứng tuyển mới"
            description="Nhận email khi có ứng viên nộp hồ sơ vào tin tuyển dụng của bạn."
            enabled={settings.applicationAlerts}
            onToggle={() => handleToggle('applicationAlerts')}
          >
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Tần suất nhận email</label>
              <Select
                value={settings.alertFrequency}
                onValueChange={(value) => handleSelect('alertFrequency', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="realtime">Ngay khi có hồ sơ mới</SelectItem>
                  <SelectItem value="daily">Tổng hợp hằng ngày</SelectItem>
                  <SelectItem value="weekly">Tổng hợp hằng tuần</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SettingCard>

          <SettingCard
            icon={CalendarClock}
            title="Nhắc hạn tin tuyển dụng"
            description="Nhắc bạn trước khi tin tuyển dụng hết hạn hiển thị để kịp gia hạn."
            enabled={settings.jobReminders}
            onToggle={() => handleToggle('jobReminders')}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={handleSave} size="lg">
            Lưu cài đặt
          </Button>
          <Button onClick={() => setSettings(initialSettings)} variant="outline" size="lg">
            Khôi phục mặc định
          </Button>
        </div>
      </PageContainer>
    </EmployerLayout>
  )
}
