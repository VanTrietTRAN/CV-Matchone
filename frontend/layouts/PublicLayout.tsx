import React from 'react'
import PublicNavbar from '@/components/PublicNavbar'
import Footer from '@/components/Footer'

interface PublicLayoutProps {
  children: React.ReactNode
  /** Ẩn footer cho các trang tập trung như đăng nhập/đăng ký */
  hideFooter?: boolean
}

export default function PublicLayout({ children, hideFooter = false }: PublicLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      <main className="flex-1">{children}</main>
      {!hideFooter && <Footer />}
    </div>
  )
}
