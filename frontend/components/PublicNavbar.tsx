'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Logo from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Menu, Building2, Sparkles, LogIn, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

const navLinks = [
  { label: 'Việc làm AI', href: '/#viec-lam' },
  { label: 'Cách hoạt động', href: '/#cach-hoat-dong' },
  { label: 'Nhà tuyển dụng', href: '/#nha-tuyen-dung' },
  { label: 'Câu hỏi thường gặp', href: '/#faq' },
]

export default function PublicNavbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Bỏ đổ bóng khi ở đỉnh trang để header hoà vào hero
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b bg-card/90 backdrop-blur-md transition-shadow',
        scrolled ? 'border-border shadow-[var(--shadow-card)]' : 'border-transparent',
      )}
      style={{ height: 'var(--header-h)' }}
    >
      <div className="container-page flex h-full items-center gap-6">
        <Logo size="sm" />

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Đăng nhập</Link>
            </Button>
            <Button asChild variant="brandOutline" size="sm">
              <Link href="/register">Đăng ký</Link>
            </Button>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
            <Button asChild size="sm">
              <Link href="/login?role=employer">
                <Building2 />
                Đăng tuyển &amp; tìm hồ sơ
              </Link>
            </Button>
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Mở menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-sm gap-0 p-0">
              <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>

              <div className="border-b border-border p-5">
                <Logo size="sm" />
              </div>

              <nav className="flex flex-col p-3">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-md px-3 py-3 text-[15px] font-medium text-foreground/80 transition-colors hover:bg-brand-50 hover:text-brand-700"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-auto space-y-2.5 border-t border-border p-5">
                <Button asChild className="w-full" size="lg">
                  <Link href="/register">
                    <UserPlus />
                    Tạo tài khoản miễn phí
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full" size="lg">
                  <Link href="/login">
                    <LogIn />
                    Đăng nhập
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="w-full" size="lg">
                  <Link href="/login?role=employer">
                    <Building2 />
                    Dành cho nhà tuyển dụng
                  </Link>
                </Button>
                <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-brand-500" />
                  Gợi ý việc làm bằng AI
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
