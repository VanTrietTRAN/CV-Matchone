'use client'

import React, { useState } from 'react'
import EmployerLayout from '@/layouts/EmployerLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Sparkles, Copy, Check, Info } from 'lucide-react'
import { toast } from 'sonner'

function buildPost(companyName: string, jobTitle: string, location: string, salary: string) {
  const lines = [
    `🚀 ${companyName || 'Công ty chúng tôi'} đang tuyển ${jobTitle || 'nhân sự mới'}!`,
    '',
    'Chúng tôi tìm kiếm ứng viên nhiệt huyết, sẵn sàng cùng đội ngũ xây dựng sản phẩm có ảnh hưởng thực sự.',
    '',
    salary ? `💰 Mức lương: ${salary}` : '💰 Mức lương: thoả thuận theo năng lực',
    location ? `📍 Địa điểm: ${location}` : '📍 Địa điểm: linh hoạt',
    '✅ Môi trường làm việc cởi mở, lộ trình phát triển rõ ràng',
    '',
    '👉 Ứng tuyển ngay trên Smart Recruit để được chấm điểm phù hợp với CV của bạn.',
    '',
    '#tuyendung #vieclam #SmartRecruit',
  ]
  return lines.join('\n')
}

export default function SocialPostGeneratorPage() {
  const [companyName, setCompanyName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [location, setLocation] = useState('')
  const [salary, setSalary] = useState('')
  const [postContent, setPostContent] = useState('')
  const [copied, setCopied] = useState(false)

  const handleGenerate = () => {
    setPostContent(buildPost(companyName, jobTitle, location, salary))
    toast.success('Đã tạo nội dung bài đăng')
  }

  const handleCopy = async () => {
    if (!postContent.trim()) {
      toast.error('Chưa có nội dung để sao chép')
      return
    }
    try {
      await navigator.clipboard.writeText(postContent)
      setCopied(true)
      toast.success('Đã sao chép nội dung')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Trình duyệt không cho phép sao chép tự động')
    }
  }

  return (
    <EmployerLayout>
      <PageContainer size="md">
        <PageHeader
          title="Tạo bài đăng mạng xã hội"
          description="Soạn nhanh nội dung chia sẻ tin tuyển dụng lên Facebook, LinkedIn hoặc nhóm cộng đồng."
        />

        <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-muted/60 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Công cụ ghép nội dung theo mẫu có sẵn từ thông tin bạn nhập. Bạn có thể chỉnh sửa tự do
            trước khi sao chép và đăng lên mạng xã hội.
          </p>
        </div>

        <section className="surface-card p-5 sm:p-6">
          <h2 className="mb-4 font-bold">Thông tin tin tuyển dụng</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="company" className="mb-1.5 block text-sm font-semibold">
                Tên công ty
              </label>
              <Input
                id="company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Công ty Cổ phần ABC"
              />
            </div>
            <div>
              <label htmlFor="jobTitle" className="mb-1.5 block text-sm font-semibold">
                Vị trí tuyển dụng
              </label>
              <Input
                id="jobTitle"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Lập trình viên Frontend"
              />
            </div>
            <div>
              <label htmlFor="location" className="mb-1.5 block text-sm font-semibold">
                Địa điểm làm việc
              </label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Cầu Giấy, Hà Nội"
              />
            </div>
            <div>
              <label htmlFor="salary" className="mb-1.5 block text-sm font-semibold">
                Mức lương
              </label>
              <Input
                id="salary"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="20 - 30 triệu"
              />
            </div>
          </div>

          <Button onClick={handleGenerate} className="mt-5">
            <Sparkles />
            Tạo nội dung bài đăng
          </Button>
        </section>

        <section className="surface-card mt-5 p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold">Nội dung bài đăng</h2>
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!postContent.trim()}>
              {copied ? <Check /> : <Copy />}
              {copied ? 'Đã sao chép' : 'Sao chép'}
            </Button>
          </div>

          <Textarea
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            rows={14}
            placeholder="Điền thông tin bên trên rồi bấm “Tạo nội dung bài đăng”, hoặc tự soạn nội dung tại đây..."
            className="font-normal"
          />

          <p className="mt-2.5 text-xs text-muted-foreground">
            {postContent.length} ký tự
          </p>
        </section>
      </PageContainer>
    </EmployerLayout>
  )
}
