import React from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import PublicLayout from '@/layouts/PublicLayout'
import { Button } from '@/components/ui/button'
import { UserRound, Building2, ArrowRight, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Đăng ký tài khoản',
  description: 'Chọn loại tài khoản để bắt đầu với Smart Recruit: ứng viên tìm việc hoặc nhà tuyển dụng.',
}

const options = [
  {
    href: '/register/candidate',
    icon: UserRound,
    eyebrow: 'Miễn phí trọn đời',
    title: 'Tôi đang tìm việc',
    description:
      'Tạo hồ sơ, tải CV lên và nhận danh sách việc làm được chấm điểm phù hợp với năng lực của bạn.',
    benefits: [
      'Điểm phù hợp cho từng tin tuyển dụng',
      'Quản lý nhiều CV, chọn CV khi ứng tuyển',
      'Theo dõi trạng thái hồ sơ đã nộp',
      'Thông báo khi có việc làm mới phù hợp',
    ],
    cta: 'Đăng ký ứng viên',
  },
  {
    href: '/register/employer',
    icon: Building2,
    eyebrow: 'Dành cho doanh nghiệp',
    title: 'Tôi đang tuyển dụng',
    description:
      'Đăng tin tuyển dụng và nhận danh sách ứng viên đã được xếp hạng theo mức độ phù hợp với mô tả công việc.',
    benefits: [
      'Ứng viên xếp hạng tự động theo điểm phù hợp',
      'Đăng tin tuyển dụng không giới hạn',
      'Trang công ty riêng kèm đánh giá',
      'Tạo bài đăng mạng xã hội từ tin tuyển dụng',
    ],
    cta: 'Đăng ký nhà tuyển dụng',
  },
]

export default function RegisterPage() {
  return (
    <PublicLayout>
      <div className="hero-surface min-h-[calc(100vh-var(--header-h))] py-14 lg:py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-bold sm:text-4xl">Bạn muốn bắt đầu với vai trò nào?</h1>
            <p className="mt-3 text-muted-foreground">
              Chọn loại tài khoản phù hợp — bạn có thể chuyển đổi vai trò sau khi đăng ký.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
            {options.map(({ href, icon: Icon, eyebrow, title, description, benefits, cta }) => (
              <Link
                key={href}
                href={href}
                className="surface-card surface-hover group flex flex-col p-6 lg:p-7"
              >
                <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <Icon className="size-6" />
                </span>

                <p className="mt-5 text-[11px] font-bold tracking-wider text-brand-600 uppercase">
                  {eyebrow}
                </p>
                <h2 className="mt-1.5 text-xl font-bold">{title}</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{description}</p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-500" />
                      <span className="leading-relaxed text-foreground/80">{benefit}</span>
                    </li>
                  ))}
                </ul>

                <Button asChild className="mt-6 w-full" size="lg" tabIndex={-1}>
                  <span>
                    {cta}
                    <ArrowRight />
                  </span>
                </Button>
              </Link>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Đã có tài khoản?{' '}
            <Link href="/login" className="link-brand">
              Đăng nhập ngay
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  )
}
