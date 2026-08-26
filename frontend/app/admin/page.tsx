import { redirect } from 'next/navigation'

/**
 * Trang mặc định của khu vực quản trị.
 *
 * Thư mục /admin trước đây chỉ có các trang con, không có trang chỉ mục — nên gõ
 * thẳng /admin (hoặc bấm một link cũ trỏ tới đó) là gặp 404. Đưa về Tổng quan,
 * đúng mục đầu tiên trong menu quản trị.
 */
export default function AdminIndexPage() {
  redirect('/admin/dashboard')
}
