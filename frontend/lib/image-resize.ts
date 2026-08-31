/**
 * Thu nhỏ và cắt ảnh ngay trên trình duyệt trước khi gửi lên server.
 *
 * Dùng chung cho ảnh chân dung trên CV và bộ ảnh thương hiệu của doanh nghiệp.
 * Ảnh ra là data URL JPEG vài chục KB, lưu thẳng vào MongoDB nên không phụ thuộc
 * vào kho lưu trữ ngoài, và hiện được cả trong bản in PDF.
 */

export type ResizeOptions = {
  /** Chiều rộng tối đa của ảnh kết quả. */
  targetWidth: number
  /** Chiều cao tối đa của ảnh kết quả. Tỉ lệ này cũng là tỉ lệ cắt. */
  targetHeight: number
  /** 0–1. Càng cao càng nét và càng nặng. */
  quality?: number
}

/** Ảnh nguồn lớn hơn mức này thì từ chối luôn cho đỡ treo trình duyệt. */
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024

/** Định dạng ảnh nhận vào — dùng cho thuộc tính accept của input file. */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp'

/**
 * Kiểm tra file người dùng chọn. Trả về câu báo lỗi, hoặc null nếu hợp lệ.
 */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Vui lòng chọn file ảnh (JPG, PNG, WEBP).'
  if (file.size > MAX_SOURCE_BYTES) return 'Ảnh quá lớn (tối đa 8MB). Vui lòng chọn ảnh nhỏ hơn.'
  return null
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('File này không phải ảnh hợp lệ.'))
    el.src = src
  })
}

/**
 * Cắt ảnh theo đúng tỉ lệ đích (lấy phần giữa) rồi thu nhỏ vừa khung.
 *
 * Ảnh nhỏ hơn khung đích thì giữ nguyên kích thước, không phóng to — phóng to
 * chỉ làm ảnh vỡ mà file vẫn nặng thêm.
 */
export async function fileToResizedDataUrl(
  file: File,
  { targetWidth, targetHeight, quality = 0.85 }: ResizeOptions,
): Promise<string> {
  const img = await loadImage(await readAsDataUrl(file))

  const srcW = img.naturalWidth
  const srcH = img.naturalHeight
  if (!srcW || !srcH) throw new Error('Ảnh không có kích thước hợp lệ.')

  // Vùng cắt lớn nhất trong ảnh gốc mà đúng tỉ lệ đích
  const targetRatio = targetWidth / targetHeight
  const srcRatio = srcW / srcH
  const cropW = srcRatio > targetRatio ? srcH * targetRatio : srcW
  const cropH = srcRatio > targetRatio ? srcH : srcW / targetRatio
  const cropX = (srcW - cropW) / 2
  const cropY = (srcH - cropH) / 2

  // Không phóng to quá kích thước thật của vùng cắt
  const scale = Math.min(1, targetWidth / cropW)
  const outW = Math.max(1, Math.round(cropW * scale))
  const outH = Math.max(1, Math.round(cropH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.')

  // Nền trắng để ảnh PNG trong suốt không thành nền đen khi chuyển sang JPEG
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, outW, outH)
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

  return canvas.toDataURL('image/jpeg', quality)
}
