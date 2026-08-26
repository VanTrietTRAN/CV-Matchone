/**
 * Cấu trúc dữ liệu của CV phía client, và cầu nối sang định dạng của API.
 *
 * Trước đây trang tạo CV lưu kinh nghiệm và học vấn dưới dạng MỘT ô text tự do,
 * rồi lúc gửi lên server thì nhét vào mảng bằng chỗ giữ chỗ:
 *
 *     [{ company: 'Xem chi tiết', position: 'Xem chi tiết', description: <toàn bộ text> }]
 *
 * Hệ quả: nhà tuyển dụng mở hồ sơ ra thấy hai dòng "Xem chi tiết", không có
 * thời gian làm việc, không có chuyên ngành, và cả khối chữ dính liền nhau.
 *
 * Nay mỗi mục là một bản ghi riêng có ngày bắt đầu / kết thúc. `fromApi` vẫn đọc
 * được dữ liệu cũ: gặp bản ghi giữ chỗ thì bóc phần mô tả ra và bỏ chỗ giữ chỗ đi.
 */

export type ExperienceEntry = {
  company: string
  position: string
  startDate: string // yyyy-MM (input type="month")
  endDate: string
  current: boolean
  description: string
}

export type EducationEntry = {
  school: string
  major: string // Chuyên ngành
  degree: string // Bậc học
  startDate: string
  endDate: string
  current: boolean
  gpa: string
}

export type LanguageEntry = { name: string; level: string }

export type CvData = {
  _id?: string
  name: string
  headline: string
  email: string
  phone: string
  location: string
  address: string
  dateOfBirth: string
  website: string
  /** Ảnh chân dung dạng data URL (image/jpeg), đã thu nhỏ phía trình duyệt. */
  photo: string
  objective: string
  experience: ExperienceEntry[]
  education: EducationEntry[]
  languages: LanguageEntry[]
  skills: string[]
  certifications: string
  isPrimary?: boolean
  hasEmbedding?: boolean
  fileUrl?: string
  createdAt?: string
  processingStatus?: 'queued' | 'processing' | 'ready' | 'failed'
  processingError?: string
}

export const emptyExperience = (): ExperienceEntry => ({
  company: '',
  position: '',
  startDate: '',
  endDate: '',
  current: false,
  description: '',
})

export const emptyEducation = (): EducationEntry => ({
  school: '',
  major: '',
  degree: '',
  startDate: '',
  endDate: '',
  current: false,
  gpa: '',
})

export const emptyLanguage = (): LanguageEntry => ({ name: '', level: '' })

export const emptyCv: CvData = {
  name: '',
  headline: '',
  email: '',
  phone: '',
  location: '',
  address: '',
  dateOfBirth: '',
  website: '',
  photo: '',
  objective: '',
  experience: [],
  education: [],
  languages: [],
  skills: [],
  certifications: '',
  isPrimary: false,
  hasEmbedding: false,
  processingStatus: 'ready',
}

/** Chỗ giữ chỗ mà bản cũ ghi vào company/position. */
const PLACEHOLDER = 'Xem chi tiết'

/** Date (ISO) hoặc chuỗi -> 'yyyy-MM' cho <input type="month">. */
function toMonthInput(value?: string | Date | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 'yyyy-MM' -> ISO để lưu vào cột Date; rỗng thì trả null. */
function fromMonthInput(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}-01T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 'yyyy-MM' -> 'MM/yyyy' để hiển thị. */
export function formatMonth(value?: string | null): string {
  if (!value) return ''
  const [y, m] = value.split('-')
  return y && m ? `${m}/${y}` : value
}

/** Khoảng thời gian hiển thị trên CV: "03/2022 – Hiện tại". */
export function formatPeriod(start: string, end: string, current: boolean): string {
  const s = formatMonth(start)
  const e = current ? 'Hiện tại' : formatMonth(end)
  if (!s && !e) return ''
  if (!s) return e
  if (!e) return s
  return `${s} – ${e}`
}

export function cvFromApi(cv: Record<string, any>, fallbackEmail: string): CvData {
  const experience: ExperienceEntry[] = Array.isArray(cv.experience)
    ? cv.experience.map((e: any) => {
        // Bản ghi cũ: company/position đều là "Xem chi tiết", nội dung nằm hết ở description
        const isLegacy = e.company === PLACEHOLDER || e.position === PLACEHOLDER
        return {
          company: isLegacy ? '' : e.company || '',
          position: isLegacy ? '' : e.position || '',
          startDate: toMonthInput(e.startDate),
          endDate: toMonthInput(e.endDate),
          current: Boolean(e.startDate && !e.endDate),
          description: e.description || '',
        }
      })
    : []

  const education: EducationEntry[] = Array.isArray(cv.education)
    ? cv.education.map((e: any) => ({
        school: e.school || '',
        major: e.major || '',
        degree: e.degree || '',
        startDate: toMonthInput(e.startDate),
        endDate: toMonthInput(e.endDate),
        current: Boolean(e.startDate && !e.endDate),
        gpa: e.gpa || '',
      }))
    : []

  const languages: LanguageEntry[] = Array.isArray(cv.languages)
    ? cv.languages.map((l: any) => ({ name: l.name || '', level: l.level || '' }))
    : []

  return {
    _id: cv._id,
    name: cv.fullName || '',
    headline: cv.headline || '',
    email: cv.email || fallbackEmail,
    phone: cv.phone || '',
    location: cv.location || '',
    address: cv.address || '',
    dateOfBirth: cv.dateOfBirth || '',
    website: cv.website || '',
    photo: cv.photo || '',
    objective: cv.summary || '',
    experience,
    education,
    languages,
    skills: cv.skills || [],
    certifications: cv.certifications || '',
    isPrimary: cv.isPrimary || false,
    hasEmbedding: Boolean(cv.embedding?.length),
    fileUrl: cv.fileUrl || '',
    createdAt: cv.createdAt || '',
    processingStatus: cv.processingStatus || 'ready',
    processingError: cv.processingError || '',
  }
}

export function cvToPayload(form: CvData) {
  return {
    fullName: form.name,
    headline: form.headline,
    email: form.email,
    phone: form.phone,
    location: form.location,
    address: form.address,
    dateOfBirth: form.dateOfBirth,
    website: form.website,
    photo: form.photo,
    summary: form.objective,
    certifications: form.certifications,
    skills: form.skills,
    // Bỏ các mục còn trống hoàn toàn để không lưu rác
    experience: form.experience
      .filter((e) => e.company || e.position || e.description)
      .map((e) => ({
        company: e.company,
        position: e.position,
        description: e.description,
        startDate: fromMonthInput(e.startDate),
        endDate: e.current ? null : fromMonthInput(e.endDate),
      })),
    education: form.education
      .filter((e) => e.school || e.major || e.degree)
      .map((e) => ({
        school: e.school,
        major: e.major,
        degree: e.degree,
        gpa: e.gpa,
        startDate: fromMonthInput(e.startDate),
        endDate: e.current ? null : fromMonthInput(e.endDate),
      })),
    languages: form.languages.filter((l) => l.name),
    isLookingForJob: true,
  }
}
