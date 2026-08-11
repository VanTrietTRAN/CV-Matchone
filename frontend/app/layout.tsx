import type { Metadata, Viewport } from 'next'
import { Be_Vietnam_Pro, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import './globals.css'

// Be Vietnam Pro: font được thiết kế riêng cho tiếng Việt — dấu thanh cân đối,
// không bị rơi về font hệ thống như Geist (chỉ có subset latin).
const appSans = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-app-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: {
    default: 'Smart Recruit — Tìm việc làm phù hợp bằng AI',
    template: '%s | Smart Recruit',
  },
  description:
    'Smart Recruit dùng AI để chấm điểm độ phù hợp giữa CV của bạn và từng tin tuyển dụng. Tìm việc nhanh hơn, ứng tuyển đúng chỗ hơn.',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#00B14F' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1720' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="vi" className={`${appSans.variable} ${geistMono.variable}`}>
      <body className="bg-background font-sans antialiased">
        {children}
        <Toaster position="top-right" richColors closeButton />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
