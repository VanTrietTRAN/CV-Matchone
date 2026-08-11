import React from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { LogoMark } from '@/components/brand/Logo'

interface AuthAsideProps {
  eyebrow?: string
  title: string
  description: string
  points?: string[]
}

/**
 * Cột thương hiệu bên trái của các trang xác thực.
 * Ẩn trên mobile để form chiếm trọn màn hình.
 */
export default function AuthAside({ eyebrow, title, description, points = [] }: AuthAsideProps) {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-800 px-10 py-14 text-white lg:flex lg:flex-col lg:justify-center xl:px-16">
      <div
        className="absolute -top-24 -right-16 size-80 rounded-full bg-brand-500/30 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-28 -left-20 size-96 rounded-full bg-brand-600/25 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative max-w-md">
        <LogoMark size="lg" className="shadow-none ring-1 ring-white/25" />

        {eyebrow && (
          <p className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold">
            <Sparkles className="size-3.5" />
            {eyebrow}
          </p>
        )}

        <h2 className="mt-4 text-[32px] leading-tight font-bold text-white">{title}</h2>
        <p className="mt-4 leading-relaxed text-white/80">{description}</p>

        {points.length > 0 && (
          <ul className="mt-8 space-y-3.5">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-300" />
                <span className="text-[15px] leading-relaxed text-white/90">{point}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
