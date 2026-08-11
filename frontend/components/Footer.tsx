import React from 'react'
import Link from 'next/link'
import Logo from '@/components/brand/Logo'
import { Facebook, Linkedin, Youtube } from 'lucide-react'

const columns = [
  {
    title: 'Dành cho ứng viên',
    links: [
      { label: 'Việc làm gợi ý bằng AI', href: '/candidate/matches' },
      { label: 'Quản lý hồ sơ & CV', href: '/candidate/cv' },
      { label: 'Việc làm đã ứng tuyển', href: '/candidate/applications' },
      { label: 'Thông báo việc làm', href: '/candidate/notification-settings' },
    ],
  },
  {
    title: 'Dành cho nhà tuyển dụng',
    links: [
      { label: 'Đăng tin tuyển dụng', href: '/employer/post-job' },
      { label: 'Tìm hồ sơ ứng viên', href: '/employer/candidates' },
      { label: 'Trang công ty', href: '/employer/company-profile' },
      { label: 'Bài đăng mạng xã hội', href: '/fb-generator' },
    ],
  },
  {
    title: 'Về Smart Recruit',
    links: [
      { label: 'Cách hoạt động', href: '/#cach-hoat-dong' },
      { label: 'Câu hỏi thường gặp', href: '/#faq' },
      { label: 'Điều khoản sử dụng', href: '/#faq' },
      { label: 'Chính sách bảo mật', href: '/#faq' },
    ],
  },
]

const socials = [
  { label: 'Facebook', href: '#', icon: Facebook },
  { label: 'LinkedIn', href: '#', icon: Linkedin },
  { label: 'YouTube', href: '#', icon: Youtube },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="container-page py-12 lg:py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo size="md" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Nền tảng tuyển dụng ứng dụng AI: chấm điểm độ phù hợp giữa CV và tin tuyển dụng,
              giúp ứng viên và nhà tuyển dụng gặp nhau nhanh hơn.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-sm font-bold tracking-wide text-foreground uppercase">
                {col.title}
              </h3>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground transition-colors hover:text-brand-600"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col-reverse items-center justify-between gap-5 border-t border-border pt-7 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Smart Recruit. Bảo lưu mọi quyền.
          </p>
          <div className="flex items-center gap-2">
            {socials.map(({ label, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                aria-label={label}
                className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600"
              >
                <Icon className="size-4" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
