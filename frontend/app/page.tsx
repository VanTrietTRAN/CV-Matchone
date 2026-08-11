import React from 'react'
import Link from 'next/link'
import PublicLayout from '@/layouts/PublicLayout'
import HeroSearch from '@/components/home/HeroSearch'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Sparkles,
  Target,
  ShieldCheck,
  BellRing,
  FileText,
  Users,
  ArrowRight,
  Code2,
  LineChart,
  Megaphone,
  Wallet,
  Stethoscope,
  GraduationCap,
  Truck,
  Wrench,
  CheckCircle2,
  Building2,
  MapPin,
} from 'lucide-react'

const categories = [
  { label: 'Công nghệ thông tin', icon: Code2, query: 'IT' },
  { label: 'Kinh doanh / Bán hàng', icon: LineChart, query: 'Kinh doanh' },
  { label: 'Marketing / Truyền thông', icon: Megaphone, query: 'Marketing' },
  { label: 'Kế toán / Tài chính', icon: Wallet, query: 'Kế toán' },
  { label: 'Y tế / Dược', icon: Stethoscope, query: 'Y tế' },
  { label: 'Giáo dục / Đào tạo', icon: GraduationCap, query: 'Giáo dục' },
  { label: 'Logistics / Vận tải', icon: Truck, query: 'Logistics' },
  { label: 'Kỹ thuật / Sản xuất', icon: Wrench, query: 'Kỹ thuật' },
]

const features = [
  {
    icon: Target,
    title: 'Điểm phù hợp minh bạch',
    description:
      'Mỗi tin tuyển dụng đều có điểm phù hợp tính từ CV của bạn, kèm lý do vì sao khớp — không còn ứng tuyển theo cảm tính.',
  },
  {
    icon: FileText,
    title: 'CV được AI đọc hiểu',
    description:
      'Tải CV lên một lần, hệ thống tự bóc tách kỹ năng, kinh nghiệm và dùng chúng để so khớp với mọi tin đăng.',
  },
  {
    icon: BellRing,
    title: 'Thông báo việc làm đúng lúc',
    description:
      'Đặt tiêu chí một lần, nhận email khi có vị trí mới phù hợp. Không spam, chỉ những tin thực sự đáng đọc.',
  },
  {
    icon: ShieldCheck,
    title: 'Dữ liệu được bảo vệ',
    description:
      'Đăng nhập bằng cookie HTTPOnly, hồ sơ chỉ hiển thị với nhà tuyển dụng bạn đã ứng tuyển.',
  },
]

const steps = [
  {
    title: 'Tạo tài khoản',
    description: 'Đăng ký bằng email hoặc tài khoản Google/Facebook trong chưa đầy một phút.',
  },
  {
    title: 'Tải CV lên',
    description: 'AI bóc tách kỹ năng, kinh nghiệm và tạo hồ sơ năng lực của bạn.',
  },
  {
    title: 'Xem điểm phù hợp',
    description: 'Danh sách việc làm được sắp xếp theo mức độ khớp với hồ sơ của bạn.',
  },
  {
    title: 'Ứng tuyển & theo dõi',
    description: 'Ứng tuyển bằng CV phù hợp nhất và theo dõi trạng thái ở một nơi duy nhất.',
  },
]

const employerBenefits = [
  'Đăng tin tuyển dụng không giới hạn, hiển thị ngay với ứng viên phù hợp',
  'Danh sách ứng viên được xếp hạng theo điểm phù hợp với mô tả công việc',
  'Trang công ty riêng, hiển thị đánh giá thực tế từ nhân sự',
  'Tạo bài đăng mạng xã hội cho tin tuyển dụng chỉ bằng một cú nhấp',
]

const faqs = [
  {
    q: 'Smart Recruit tính điểm phù hợp như thế nào?',
    a: 'Hệ thống chuyển CV của bạn và mô tả công việc thành vector ngữ nghĩa (embedding), sau đó đo độ tương đồng giữa hai bên. Điểm càng cao nghĩa là kỹ năng và kinh nghiệm trong CV càng sát với yêu cầu của tin tuyển dụng.',
  },
  {
    q: 'Tôi có mất phí khi sử dụng không?',
    a: 'Ứng viên sử dụng miễn phí toàn bộ tính năng: tạo hồ sơ, xem điểm phù hợp, ứng tuyển và nhận thông báo việc làm.',
  },
  {
    q: 'Vì sao việc làm của tôi chưa có điểm phù hợp?',
    a: 'Điểm chỉ xuất hiện sau khi CV của bạn được phân tích. Hãy vào mục Hồ sơ & CV, tải CV lên hoặc điền thông tin rồi lưu lại — hệ thống sẽ chấm điểm cho toàn bộ tin tuyển dụng.',
  },
  {
    q: 'Nhà tuyển dụng thấy được những gì trong hồ sơ của tôi?',
    a: 'Nhà tuyển dụng chỉ xem được hồ sơ và CV bạn đã dùng để ứng tuyển vào tin của họ. Bạn luôn kiểm soát CV nào được gửi đi ở bước ứng tuyển.',
  },
  {
    q: 'Tôi vừa là ứng viên vừa muốn tuyển dụng thì sao?',
    a: 'Một tài khoản có thể chuyển đổi giữa hai vai trò. Trong khu vực nhà tuyển dụng có nút “Chuyển sang Ứng viên” ở cuối thanh điều hướng bên trái.',
  },
]

export default function HomePage() {
  return (
    <PublicLayout>
      {/* ================= HERO ================= */}
      <section className="hero-surface border-b border-border">
        <div className="container-page grid gap-12 py-14 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:py-20">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-card px-3 py-1.5 text-xs font-semibold text-brand-700">
              <Sparkles className="size-3.5" />
              Gợi ý việc làm bằng AI
            </span>

            <h1 className="mt-5 text-[34px] leading-[1.2] font-bold tracking-tight sm:text-5xl">
              Tìm việc làm <span className="text-brand-500">phù hợp</span> với hồ sơ của bạn
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Smart Recruit so khớp CV của bạn với từng tin tuyển dụng và cho biết mức độ phù hợp
              trước khi ứng tuyển. Bớt rải hồ sơ, tăng cơ hội được gọi phỏng vấn.
            </p>

            <div className="mt-7">
              <HeroSearch />
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-sm text-muted-foreground">
              {['Miễn phí với ứng viên', 'Không spam email', 'Chấm điểm minh bạch'].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-brand-500" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Minh hoạ sản phẩm: thẻ việc làm có điểm phù hợp */}
          <div className="relative hidden lg:block">
            <div
              className="absolute -top-6 -right-4 size-40 rounded-full bg-brand-200/40 blur-3xl"
              aria-hidden="true"
            />
            <div className="surface-card relative space-y-3 p-5">
              <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                Ví dụ minh hoạ giao diện
              </p>

              {[
                { title: 'Frontend Developer (ReactJS)', company: 'Công ty ABC', score: 92, salary: '20 - 30 triệu' },
                { title: 'Fullstack Engineer', company: 'Công ty XYZ', score: 78, salary: '18 - 28 triệu' },
                { title: 'UI/UX Designer', company: 'Studio DEF', score: 54, salary: 'Thoả thuận' },
              ].map((job, i) => (
                <div
                  key={job.title}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                  style={{ opacity: 1 - i * 0.16 }}
                >
                  <div className="logo-box size-11 text-xs font-bold text-brand-600">
                    {job.company.split(' ').pop()?.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{job.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <Building2 className="size-3" />
                      {job.company}
                    </p>
                    <p className="mt-1 text-xs font-bold text-salary">{job.salary}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      job.score >= 80
                        ? 'bg-brand-500 text-white'
                        : job.score >= 60
                          ? 'bg-success-surface text-success-foreground'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {job.score}%
                  </span>
                </div>
              ))}

              <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-brand-500" />
                Danh sách được sắp xếp theo điểm phù hợp giảm dần
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= DANH MỤC ================= */}
      <section className="border-b border-border bg-card py-14">
        <div className="container-page">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold sm:text-[28px]">Khám phá theo ngành nghề</h2>
              <p className="mt-1.5 text-muted-foreground">
                Chọn lĩnh vực bạn quan tâm để xem những vị trí phù hợp nhất
              </p>
            </div>
            <Button asChild variant="brandOutline">
              <Link href="/candidate/matches">
                Xem tất cả việc làm
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map(({ label, icon: Icon, query }) => (
              <Link
                key={label}
                href={`/candidate/matches?q=${encodeURIComponent(query)}`}
                className="surface-card surface-hover group flex items-center gap-3 p-4"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm leading-snug font-semibold">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ================= TÍNH NĂNG ================= */}
      <section id="viec-lam" className="py-14 lg:py-16">
        <div className="container-page">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-2xl font-bold sm:text-[28px]">
              Vì sao ứng viên chọn Smart Recruit?
            </h2>
            <p className="mt-2.5 text-muted-foreground">
              Bốn điều tạo nên khác biệt so với cách tìm việc truyền thống
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="surface-card surface-hover p-5">
                <span className="grid size-11 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CÁCH HOẠT ĐỘNG ================= */}
      <section id="cach-hoat-dong" className="border-y border-border bg-card py-14 lg:py-16">
        <div className="container-page">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-2xl font-bold sm:text-[28px]">Bắt đầu chỉ với 4 bước</h2>
            <p className="mt-2.5 text-muted-foreground">
              Từ lúc đăng ký tới khi nhận việc làm gợi ý — thường mất chưa tới 10 phút
            </p>
          </div>

          <ol className="grid gap-6 md:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="relative">
                {/* Đường nối giữa các bước trên màn hình lớn */}
                {index < steps.length - 1 && (
                  <span
                    className="absolute top-5 left-[calc(50%+28px)] hidden h-px w-[calc(100%-56px)] bg-border md:block"
                    aria-hidden="true"
                  />
                )}
                <div className="flex flex-col items-center text-center md:items-center">
                  <span className="grid size-10 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white shadow-[var(--shadow-brand)]">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/register/candidate">
                Tạo hồ sơ miễn phí
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/login">Tôi đã có tài khoản</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ================= NHÀ TUYỂN DỤNG ================= */}
      <section id="nha-tuyen-dung" className="py-14 lg:py-16">
        <div className="container-page grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hot-200 bg-hot-50 px-3 py-1.5 text-xs font-semibold text-hot-700">
              <Users className="size-3.5" />
              Dành cho nhà tuyển dụng
            </span>
            <h2 className="mt-5 text-2xl font-bold sm:text-[28px]">
              Tiếp cận đúng ứng viên, bớt thời gian sàng lọc
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              Mỗi hồ sơ ứng tuyển đều đi kèm điểm phù hợp với mô tả công việc của bạn. Đội ngũ tuyển
              dụng biết nên đọc hồ sơ nào trước thay vì lướt qua hàng trăm CV.
            </p>

            <ul className="mt-6 space-y-3">
              {employerBenefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-brand-500" />
                  <span className="leading-relaxed">{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/register/employer">Đăng ký tài khoản tuyển dụng</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login?role=employer">Đăng nhập nhà tuyển dụng</Link>
              </Button>
            </div>
          </div>

          <div className="surface-card p-5 lg:p-6">
            <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Ví dụ minh hoạ danh sách ứng viên
            </p>
            <div className="mt-3 space-y-2.5">
              {[
                { name: 'Ứng viên A', role: 'Frontend Developer · 3 năm KN', score: 94 },
                { name: 'Ứng viên B', role: 'ReactJS Developer · 2 năm KN', score: 81 },
                { name: 'Ứng viên C', role: 'Web Developer · 1 năm KN', score: 63 },
              ].map((c) => (
                <div key={c.name} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                    {c.name.split(' ').pop()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.role}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-brand-600">{c.score}%</p>
                    <p className="text-[11px] text-muted-foreground">phù hợp</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 text-brand-500" />
              Danh sách xếp hạng tự động theo mô tả công việc bạn đăng
            </p>
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="border-t border-border bg-card py-14 lg:py-16">
        <div className="container-narrow">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold sm:text-[28px]">Câu hỏi thường gặp</h2>
            <p className="mt-2.5 text-muted-foreground">
              Những thắc mắc phổ biến nhất về cách Smart Recruit hoạt động
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q}>
                <AccordionTrigger className="text-left text-[15px] font-semibold hover:text-brand-600">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="brand-gradient py-14 text-white lg:py-16">
        <div className="container-page text-center">
          <h2 className="text-2xl font-bold sm:text-[32px]">Sẵn sàng tìm công việc tiếp theo?</h2>
          <p className="mx-auto mt-3 max-w-xl leading-relaxed text-white/85">
            Tạo hồ sơ, tải CV lên và xem ngay những vị trí phù hợp nhất với bạn.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="secondary" className="text-brand-700">
              <Link href="/register/candidate">Tôi đang tìm việc</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/60 bg-transparent text-white hover:border-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/register/employer">Tôi đang tuyển dụng</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}
