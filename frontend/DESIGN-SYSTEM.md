# Design System — Smart Recruit

Chuẩn đối sánh: **topcv.vn**. Toàn bộ token nằm trong [`app/globals.css`](app/globals.css).
Nguyên tắc: **không viết màu Tailwind cứng** (`bg-green-50`, `text-red-600`…) trong page/component —
luôn dùng token để light/dark và các trạng thái đồng bộ với nhau.

## 1. Màu

| Nhóm | Token / class | Dùng cho |
|---|---|---|
| Thương hiệu | `brand-50 … brand-900` (`brand-500` = `#00B14F`) | CTA chính, active state, nhấn mạnh |
| Nhấn phụ | `hot-50 … hot-700` (cam) | Tin sắp hết hạn, nhãn "hot", nâng cấp gói |
| Lương | `text-salary` | Mức lương (TopCV luôn hiển thị lương màu brand) |
| Trạng thái | `success` · `warning` · `danger` · `info` + `-foreground` / `-surface` | Badge, alert, thông báo |
| Nền | `background` (xám nhạt) · `card` (trắng) · `muted` | Nền trang / thẻ / vùng phụ |
| Chữ | `foreground` · `muted-foreground` | Chữ chính / chữ phụ |

Bố cục chủ đạo: **nền trang xám + thẻ trắng** (`surface-card`), giống TopCV.

## 2. Class tiện ích

| Class | Ý nghĩa |
|---|---|
| `container-page` | Khung nội dung 1240px + padding ngang |
| `container-narrow` | Khung hẹp (form, FAQ) |
| `surface-card` | Thẻ trắng: nền + viền + bo góc + đổ bóng |
| `surface-hover` | Hiệu ứng hover viền xanh + nâng bóng |
| `chip` | Chip lọc; bật trạng thái bằng `data-active="true"` |
| `logo-box` | Khung logo công ty (viền, nền trắng, `object-contain`) |
| `hero-surface` / `brand-gradient` | Nền hero / dải gradient thương hiệu |
| `link-brand` | Link nhấn màu brand |
| `skeleton` | Khối loading |

## 3. Component dùng chung

**Khung trang**

- `layouts/PublicLayout` — navbar + footer (prop `hideFooter` cho trang auth)
- `components/dashboard/DashboardShell` — sidebar cố định + drawer mobile + topbar (avatar, chuông)
- `components/dashboard/PageContainer` — padding + `max-width` theo `size`: `sm | md | lg | xl | full`
- `components/dashboard/PageHeader` — tiêu đề, mô tả, breadcrumb, vùng nút hành động
- `components/dashboard/StatCard` — ô số liệu (icon, tone, trend, `loading`)
- `components/dashboard/SidebarNav` — danh sách menu + active state + badge chưa đọc

**Hiển thị dữ liệu**

- `components/JobCard` (+ `JobCardSkeleton`) — thẻ việc làm chuẩn TopCV
- `components/MatchBadge` — điểm phù hợp (`matchTone()` tái dùng cho chip inline)
- `components/StatusBadge` — trạng thái hồ sơ / tin tuyển dụng (nhãn tiếng Việt)
- `components/SkillTag`, `components/AIBadge`, `components/EmptyState`, `components/ConfirmDialog`

**Auth**: `components/auth/AuthAside` (cột thương hiệu), `components/auth/PasswordInput` (ẩn/hiện + đo độ mạnh).

## 4. Định dạng dữ liệu — `lib/format.ts`

`formatSalary` ("15 - 25 triệu" / "Thoả thuận") · `formatDate` · `formatDateTime` ·
`formatRelativeTime` ("3 ngày trước") · `daysUntil` · `formatNumber` · `initials` · `WORK_TYPE_LABEL`.

Không tự viết `new Date(...).toLocaleDateString('vi-VN')` trong page nữa — gọi helper để đồng nhất.

## 5. Typography

Font **Be Vietnam Pro** (`subsets: latin + vietnamese`) — bắt buộc để dấu tiếng Việt không rơi về
font hệ thống. Font mono giữ Geist Mono.

## 6. Khu vực admin

Admin dùng bảng màu tối riêng: nền `slate-950/900`, viền `slate-800`, accent `brand-*`,
trạng thái `red` / `amber` / `blue` / `purple`. Đặt qua `DashboardShell tone="dark"`.
