# ROUTES

Dự án dùng **App Router** (`/app`), không có thư mục `/pages`.
Quy ước giao diện: xem [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## 1) Danh sách route

### Công khai — `PublicLayout` (navbar + footer)

| Route | File |
|---|---|
| `/` | `app/page.tsx` |
| `/login` | `app/login/page.tsx` |
| `/register` | `app/register/page.tsx` |
| `/register/candidate` | `app/register/candidate/page.tsx` |
| `/register/employer` | `app/register/employer/page.tsx` |
| `/forgot-password` | `app/forgot-password/page.tsx` |
| `/reset-password` | `app/reset-password/page.tsx` |

### Ứng viên — `CandidateLayout`

| Route | File |
|---|---|
| `/candidate/dashboard` | `app/candidate/dashboard/page.tsx` |
| `/candidate/matches` | `app/candidate/matches/page.tsx` (nhận `?q=` & `?location=` từ ô tìm kiếm trang chủ) |
| `/candidate/jobs/[id]` | `app/candidate/jobs/[id]/page.tsx` |
| `/candidate/applications` | `app/candidate/applications/page.tsx` |
| `/candidate/cv` | `app/candidate/cv/page.tsx` |
| `/candidate/notifications` | `app/candidate/notifications/page.tsx` |
| `/candidate/notification-settings` | `app/candidate/notification-settings/page.tsx` |
| `/candidate/job-alerts` | redirect → `/candidate/notification-settings?tab=alerts` |
| `/candidate/email-settings` | redirect → `/candidate/notification-settings?tab=email` |

### Nhà tuyển dụng — `EmployerLayout`

| Route | File |
|---|---|
| `/employer/dashboard` | `app/employer/dashboard/page.tsx` |
| `/employer/post-job` | `app/employer/post-job/page.tsx` |
| `/employer/candidates` | `app/employer/candidates/page.tsx` |
| `/employer/reviews` | `app/employer/reviews/page.tsx` |
| `/employer/company-profile` | `app/employer/company-profile/page.tsx` |
| `/employer/notifications` | `app/employer/notifications/page.tsx` |
| `/employer/email-settings` | `app/employer/email-settings/page.tsx` |
| `/fb-generator` | `app/fb-generator/page.tsx` |

### Quản trị — `AdminLayout` (nền tối)

`/admin/dashboard` · `/admin/users` · `/admin/jobs` · `/admin/ai-monitor` ·
`/admin/broadcast` · `/admin/audit-logs` · `/admin/reviews` · `/admin/system`

### Khác

`/sentry-example-page` (trang kiểm thử Sentry).

## 2) Cấu trúc layout

Cả ba khu vực đăng nhập dùng chung `components/dashboard/DashboardShell`:

```
DashboardShell
├── <aside> sidebar cố định (desktop, 264px)
├── <Sheet> sidebar dạng drawer (mobile)
├── <header> topbar: hamburger · logo (mobile) · chuông thông báo · menu tài khoản
└── <main> {children}   ← page tự bọc bằng <PageContainer>
```

- `CandidateLayout` / `EmployerLayout` / `AdminLayout` chỉ truyền `sidebar` + `variant` tương ứng.
- `DashboardShell` **không** tự thêm padding; mỗi page dùng `<PageContainer size="…">` để chọn bề rộng.
- Số thông báo chưa đọc lấy từ `hooks/use-unread-count.ts` (một vòng polling duy nhất cho cả trang).

## 3) Điều hướng

- Public: `PublicNavbar` (menu neo tới các section trang chủ) + `Footer`.
- Dashboard: `SidebarNav` render menu từ mảng `NavItem`, tự tính active state và badge chưa đọc.
