'use client'

import React, { useEffect, useRef, useState } from 'react'

import CandidateLayout from '@/layouts/CandidateLayout'
import PageContainer from '@/components/dashboard/PageContainer'
import PageHeader from '@/components/dashboard/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import SkillTag from '@/components/SkillTag'
import { FileUp, Palette, Languages, Type, Plus, Download, Save, Loader2, Star, Trash2, FileText, CheckCircle, Eye } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  cvFromApi,
  cvToPayload,
  emptyCv,
  emptyEducation,
  emptyExperience,
  emptyLanguage,
  formatPeriod,
  type CvData,
  type EducationEntry,
  type ExperienceEntry,
  type LanguageEntry,
} from '@/lib/cv-model'
import {
  EducationEditor,
  ExperienceEditor,
  LanguageEditor,
  PreviewSection,
  TimelineItem,
} from '@/components/candidate/CvEntryEditors'
import CvPhotoPicker from '@/components/candidate/CvPhotoPicker'
import { apiFetch, getApiBase } from '@/lib/api'
import { toast } from 'sonner'

const themeOptions = [
  { key: 'slate', label: 'Slate', color: '#334155' },
  { key: 'blue', label: 'Blue', color: '#1d4ed8' },
  { key: 'emerald', label: 'Emerald', color: '#047857' },
  { key: 'purple', label: 'Purple', color: '#6d28d9' },
]

export default function CVPage() {
  const [cvList, setCvList] = useState<CvData[]>([])
  const [formData, setFormData] = useState<CvData>(emptyCv)
  const [cvId, setCvId] = useState<string | null>(null)
  const [newSkill, setNewSkill] = useState('')
  const [importedCvFileName, setImportedCvFileName] = useState<string | null>(null)
  const [language, setLanguage] = useState<'vi' | 'en'>('vi')
  const [theme, setTheme] = useState<(typeof themeOptions)[number]['key']>('blue')
  const [fontScale, setFontScale] = useState<'compact' | 'default' | 'comfortable'>('default')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Trạng thái bóc tách của CV vừa tải lên, để hiện băng trạng thái ở khối Import
  const [processingStatus, setProcessingStatus] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const cvPreviewRef = useRef<HTMLDivElement>(null)
  const [userEmail, setUserEmail] = useState('')

  const handleLanguageChange = (val: 'vi' | 'en') => {
    setLanguage(val)
    localStorage.setItem('cv_language', val)
  }

  // Hidden portal + print CSS so only the CV is printed
  const handleExportPDF = () => {
    if (!cvPreviewRef.current) return
    setExporting(true)

    const printStyle = document.createElement('style')
    printStyle.id = 'cv-print-style'
    printStyle.innerHTML = `
      @media print {
        body > *:not(#cv-print-portal) { display: none !important; }
        #cv-print-portal { display: block !important; position: fixed; top: 0; left: 0; width: 100%; z-index: 99999; }
        #cv-print-area { display: block !important; background: white; }
        @page { size: A4 portrait; margin: 0; }
      }
    `
    document.head.appendChild(printStyle)

    const portal = document.createElement('div')
    portal.id = 'cv-print-portal'
    portal.style.display = 'none'
    const clone = cvPreviewRef.current.cloneNode(true) as HTMLElement
    clone.id = 'cv-print-area'
    clone.style.width = '210mm'
    clone.style.minHeight = '297mm'
    clone.style.padding = '0'
    clone.style.background = 'white'
    portal.appendChild(clone)
    document.body.appendChild(portal)

    setTimeout(() => {
      window.print()
      setTimeout(() => {
        printStyle.remove()
        portal.remove()
        setExporting(false)
        toast.success('Mở hộp thoại in — chọn "Save as PDF" để xuất file PDF!')
      }, 500)
    }, 300)
  }

  useEffect(() => {
    // Restore language preference safely on client side
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('cv_language') as 'vi' | 'en'
      if (savedLang) {
        setLanguage(savedLang)
      }
    }

    const loadCv = async () => {
      try {
        const userRes = await apiFetch<{ data: { user: any; cv: any } }>('/api/users/me/profile')
        const { user } = userRes.data
        const email = user?.email || ''
        setUserEmail(email)

        const cvRes = await apiFetch<{ data: any[] }>('/api/cv')
        const all = cvRes.data || []
        const mapped = all.map((cv: any) => cvFromApi(cv, email))
        setCvList(mapped)

        const primary = mapped.find((c) => c.isPrimary) || mapped[0]
        if (primary) {
          setCvId(primary._id || null)
          setFormData(primary)
          setImportedCvFileName(primary.fileUrl ? primary.fileUrl.split(/[\\/]/).pop() || null : null)
        } else {
          setFormData((prev) => ({ ...prev, email }))
        }
      } catch {
        toast.error('Không tải được hồ sơ CV')
      } finally {
        setLoading(false)
      }
    }
    loadCv()
  }, [])

  // MỘT vòng polling duy nhất (5 giây) khi có CV đang queued / processing.
  //
  // Bản cũ chạy hai vòng song song: vòng này và pollCvProcessing (4 giây) sau khi
  // tải lên; vòng kia không dừng khi rời trang (chạy tiếp tới 3 phút) và khi AI
  // xong thì ghi đè form vô điều kiện — kể cả khi người dùng đã chuyển sang sửa
  // CV khác hoặc đang gõ dở.
  const hasPending = cvList.some(
    (c) => c.processingStatus === 'queued' || c.processingStatus === 'processing'
  )
  // Giá trị mới nhất cho callback trong setInterval (tránh closure cũ)
  const cvIdRef = useRef<string | null>(null)
  const formDataRef = useRef(formData)
  useEffect(() => {
    cvIdRef.current = cvId
    formDataRef.current = formData
  }, [cvId, formData])
  // CV vừa tải lên đang chờ AI, kèm ảnh chụp form lúc tải lên để biết người dùng đã sửa gì chưa
  const awaitingRef = useRef<{ id: string; snapshot: string; deadline: number } | null>(null)

  useEffect(() => {
    if (!hasPending) return
    let cancelled = false

    const tick = async () => {
      try {
        const cvRes = await apiFetch<{ data: any[] }>('/api/cv')
        if (cancelled) return
        const all = cvRes.data || []
        const mapped = all.map((cv: any) => cvFromApi(cv, userEmail))
        setCvList(mapped)

        const awaiting = awaitingRef.current
        if (!awaiting) return
        const raw = all.find((cv: any) => cv._id === awaiting.id)
        const status = raw?.processingStatus
        if (raw) setProcessingStatus(status)

        if (status === 'ready') {
          awaitingRef.current = null
          const parsed = cvFromApi(raw, userEmail)
          const stillViewing = cvIdRef.current === awaiting.id
          const untouched = JSON.stringify(formDataRef.current) === awaiting.snapshot
          if (stillViewing && untouched) {
            setFormData(parsed)
            toast.success('AI đã bóc tách xong nội dung CV.')
          } else {
            toast.success('AI đã bóc tách xong CV vừa tải lên. Mở CV đó để xem kết quả.')
          }
        } else if (status === 'failed') {
          awaitingRef.current = null
          toast.error(`AI không bóc tách được CV: ${raw?.processingError || 'lỗi không rõ'}`)
        } else if (Date.now() > awaiting.deadline) {
          awaitingRef.current = null
          toast.warning('CV vẫn đang được xử lý ở nền. Bạn có thể tải lại trang sau ít phút để xem kết quả.')
        }
      } catch (err) {
        console.error('Lỗi khi cập nhật trạng thái CV:', err)
      }
    }

    const interval = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [hasPending, userEmail])

  const handleRetryAi = async (id: string) => {
    try {
      const res = await apiFetch<{ message: string }>(`/api/cv/${id}/retry`, { method: 'POST' })
      toast.success(res.message || 'Đã đưa CV vào hàng chờ bóc tách lại AI!')
      const cvRes = await apiFetch<{ data: any[] }>('/api/cv')
      const all = cvRes.data || []
      setCvList(all.map((cv: any) => cvFromApi(cv, userEmail)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không thể thử lại AI')
    }
  }

  const handleAddSkill = () => {
    const normalizedSkill = newSkill.trim()
    if (normalizedSkill && !formData.skills.includes(normalizedSkill)) {
      setFormData({ ...formData, skills: [...formData.skills, normalizedSkill] })
      setNewSkill('')
    }
  }

  const handleRemoveSkill = (skill: string) => {
    setFormData({ ...formData, skills: formData.skills.filter((s) => s !== skill) })
  }

  const handleSetPrimary = async (id: string) => {
    setSettingPrimary(id)
    try {
      await apiFetch(`/api/cv/${id}/set-primary`, { method: 'PATCH' })
      toast.success('Đã đặt làm CV chính!')
      setCvList((prev) => prev.map((c) => ({ ...c, isPrimary: c._id === id })))
      setFormData((prev) => ({ ...prev, isPrimary: prev._id === id }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không thể đặt CV chính')
    } finally {
      setSettingPrimary(null)
    }
  }

  const handleDeleteCV = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa CV này không?')) return
    setDeletingId(id)
    try {
      await apiFetch(`/api/cv/${id}`, { method: 'DELETE' })
      toast.success('Đã xóa CV!')
      const newList = cvList.filter((c) => c._id !== id)
      setCvList(newList)
      if (cvId === id) {
        const next = newList.find((c) => c.isPrimary) || newList[0]
        if (next) {
          setCvId(next._id || null)
          setFormData(next)
        } else {
          setCvId(null)
          setFormData({ ...emptyCv, email: userEmail })
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không thể xóa CV')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSelectCV = (cv: CvData) => {
    setCvId(cv._id || null)
    setFormData(cv)
    setImportedCvFileName(cv.fileUrl ? cv.fileUrl.split(/[\\/]/).pop() || null : null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = cvToPayload(formData)
      if (cvId) {
        const res = await apiFetch<{ data: any }>(`/api/cv/${cvId}`, { method: 'PUT', body: JSON.stringify(payload) })
        toast.success('Đã cập nhật hồ sơ CV!')
        if (res.data) {
          const updated = cvFromApi(res.data, userEmail)
          setCvList((prev) => prev.map((c) => c._id === cvId ? { ...updated, isPrimary: c.isPrimary } : c))
        }
      } else {
        const res = await apiFetch<{ data: any }>('/api/cv', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        const newId = res.data?._id || null
        setCvId(newId)
        toast.success('Đã lưu hồ sơ CV!')
        if (res.data) {
          const newCv = cvFromApi(res.data, userEmail)
          setCvList((prev) => [newCv, ...prev])
          setFormData(newCv)
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  const handleCvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImportedCvFileName(file.name)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('cv', file)
      form.append('fullName', formData.name || 'Ứng viên')
      // Dùng fetch thủ công vì apiFetch set Content-Type JSON
      // credentials: 'include' để gửi HTTPOnly cookie theo request
      const { getApiBase } = await import('@/lib/api')
      const res = await fetch(`${getApiBase()}/api/cv/upload`, {
        method: 'POST',
        credentials: 'include', // Gửi cookie thay vì Authorization header
        body: form,
      })
      // Lỗi từ multer hoặc proxy có thể trả HTML thay vì JSON; đọc text trước
      // rồi mới parse để không che mất mã lỗi thật bằng "Unexpected token '<'".
      const raw = await res.text()
      let data: any = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        throw new Error(
          res.ok
            ? 'Máy chủ trả về dữ liệu không đọc được.'
            : `Máy chủ báo lỗi ${res.status}. ${raw.slice(0, 160)}`,
        )
      }
      if (!res.ok) throw new Error(data?.message || `Upload thất bại (HTTP ${res.status})`)
      if (!data?.data?._id) {
        toast.success('Đã tải CV lên.')
        return
      }

      const uploadedId: string = data.data._id
      setCvId(uploadedId)
      const initial = cvFromApi(data.data, userEmail || formData.email)
      setFormData(initial)
      setCvList((prev) => [initial, ...prev.filter((c) => c._id !== uploadedId)])

      // Bóc tách chạy ở nền (worker quét hàng đợi mỗi 30 giây). Bản cũ báo
      // "trích xuất thành công" ngay lúc này, trong khi hồ sơ mới chỉ đang xếp
      // hàng — người dùng thấy toàn ô trống và tưởng tính năng hỏng.
      toast.info('Đã tải CV lên. Đang bóc tách nội dung bằng AI, vui lòng đợi...')
      setProcessingStatus(initial.processingStatus || 'queued')
      // Worker quét hàng đợi mỗi 30 giây và thử lại tối đa 3 lần — chờ tối đa 3 phút
      awaitingRef.current = {
        id: uploadedId,
        snapshot: JSON.stringify(initial),
        deadline: Date.now() + 3 * 60 * 1000,
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload thất bại')
    } finally {
      setUploading(false)
    }
  }

  const currentTheme = themeOptions.find((item) => item.key === theme) || themeOptions[1]
  const previewTextSize =
    fontScale === 'compact' ? 'text-xs' : fontScale === 'comfortable' ? 'text-sm' : 'text-[13px]'

  const labels = {
    vi: {
      pageTitle: 'CV Builder',
      pageSubtitle: cvId
        ? 'Hồ sơ đã được tải từ cơ sở dữ liệu. Chỉnh sửa và nhấn Lưu để cập nhật.'
        : 'Điền thông tin và nhấn Lưu để tạo hồ sơ. Tải PDF lên để AI embedding tự động.',
      toolsTitle: 'Công cụ',
      cvTemplate: 'Mẫu CV',
      cvTemplateValue: 'Modern Basic',
      language: 'Ngôn ngữ',
      color: 'Màu sắc',
      font: 'Cỡ chữ',
      profileTitle: 'Thông tin cơ bản',
      photoTitle: 'Ảnh chân dung',
      photoHint: 'Ảnh sẽ được cắt vuông và thu nhỏ tự động. Bỏ trống nếu không muốn hiện ảnh.',
      photoChoose: 'Tải ảnh lên',
      photoReplace: 'Đổi ảnh khác',
      photoRemove: 'Bỏ ảnh',
      cvContentTitle: 'Nội dung CV',
      skillsTitle: 'Kỹ năng',
      importTitle: 'Import CV PDF (tạo AI Embedding)',
      importSubtitle: 'Upload PDF để hệ thống AI đọc và tạo vector cho tính năng matching.',
      noPdf: 'Chưa import file PDF.',
      processingHint: 'AI đang đọc file PDF và bóc tách nội dung. Việc này thường mất dưới một phút.',
      imported: 'Đã import',
      objective: 'Mục tiêu nghề nghiệp',
      experience: 'Kinh nghiệm',
      education: 'Học vấn',
      certifications: 'Chứng chỉ',
      languages: 'Ngôn ngữ',
      contact: 'Liên hệ',
      preview: 'Bản xem trước CV',
      fullName: 'Họ và tên',
      fullNamePlaceholder: 'Nguyễn Văn A',
      headline: 'Vị trí / Tiêu đề',
      headlinePlaceholder: 'Full Stack Developer',
      email: 'Email',
      phone: 'Số điện thoại',
      phonePlaceholder: '+84 901 234 567',
      location: 'Địa điểm',
      locationPlaceholder: 'Đà Nẵng, Việt Nam',
      dateOfBirth: 'Ngày sinh',
      address: 'Địa chỉ',
      addressPlaceholder: 'Quận 7, Đà Nẵng',
      website: 'Website / LinkedIn',
      objectivePlaceholder: 'Mục tiêu nghề nghiệp của bạn...',
      experiencePlaceholder: 'Mô tả kinh nghiệm làm việc...',
      educationPlaceholder: 'Trường học, chuyên ngành...',
      certificationsPlaceholder: 'Chứng chỉ, giải thưởng...',
      skillsPlaceholder: 'Thêm kỹ năng mới...',
      add: 'Thêm',
      loadingText: 'Đang tải hồ sơ...',
      importButton: 'Import CV (PDF)',
      processing: 'Đang xử lý...',
    },
    en: {
      pageTitle: 'CV Builder',
      pageSubtitle: cvId
        ? 'Profile loaded from database. Edit and click Save to update.'
        : 'Fill in your profile and click Save. Upload a PDF for AI embedding.',
      toolsTitle: 'Tools',
      cvTemplate: 'CV template',
      cvTemplateValue: 'Modern Basic',
      language: 'Language',
      color: 'Color theme',
      font: 'Font size',
      profileTitle: 'Basic profile',
      photoTitle: 'Profile photo',
      photoHint: 'The image is cropped square and resized automatically. Leave empty for no photo.',
      photoChoose: 'Upload photo',
      photoReplace: 'Replace photo',
      photoRemove: 'Remove photo',
      cvContentTitle: 'CV content',
      skillsTitle: 'Skills',
      importTitle: 'Import CV PDF (AI Embedding)',
      importSubtitle: 'Upload PDF so AI can read and generate a matching vector.',
      noPdf: 'No PDF imported yet.',
      processingHint: 'AI is reading the PDF and extracting its content. This usually takes under a minute.',
      imported: 'Imported',
      objective: 'Career Objective',
      experience: 'Experience',
      education: 'Education',
      certifications: 'Certifications',
      languages: 'Languages',
      contact: 'Contact',
      preview: 'CV Live Preview',
      fullName: 'Full Name',
      fullNamePlaceholder: 'John Doe',
      headline: 'Job Title / Headline',
      headlinePlaceholder: 'Full Stack Developer',
      email: 'Email',
      phone: 'Phone Number',
      phonePlaceholder: '+84 901 234 567',
      location: 'Location',
      locationPlaceholder: 'Da Nang, Vietnam',
      dateOfBirth: 'Date of Birth',
      address: 'Address',
      addressPlaceholder: 'District 7, Da Nang',
      website: 'Website / LinkedIn',
      objectivePlaceholder: 'Your career objective...',
      experiencePlaceholder: 'Describe your work experience...',
      educationPlaceholder: 'Schools, majors...',
      certificationsPlaceholder: 'Certifications, awards...',
      skillsPlaceholder: 'Add a new skill...',
      add: 'Add',
      loadingText: 'Loading profile...',
      importButton: 'Import CV (PDF)',
      processing: 'Processing...',
    },
  }[language]

  if (loading) {
    return (
      <CandidateLayout>
        <PageContainer>
          <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-brand-500" />
            {labels.loadingText}
          </div>
        </PageContainer>
      </CandidateLayout>
    )
  }

  return (
    <CandidateLayout>
      <PageContainer>
        <PageHeader
          title={labels.pageTitle}
          description={labels.pageSubtitle}
          actions={
            <Button onClick={handleSave} size="lg" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {cvId ? 'Cập nhật hồ sơ' : 'Lưu hồ sơ'}
            </Button>
          }
        />

        {cvList.length > 0 && (
          <Card className="p-5 border border-border mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Danh sách CV của bạn ({cvList.length})
              </h2>
              <button
                type="button"
                onClick={() => { setCvId(null); setFormData({ ...emptyCv, email: userEmail }); setImportedCvFileName(null) }}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Tạo CV mới
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {cvList.map((cv) => {
                const isEditing = cvId === cv._id
                const isSettingThis = settingPrimary === cv._id
                const isDeletingThis = deletingId === cv._id
                return (
                  <div
                    key={cv._id}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all cursor-pointer ${
                      isEditing
                        ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/20'
                        : 'border-border hover:border-brand-300 hover:bg-muted/50'
                    }`}
                    onClick={() => handleSelectCV(cv)}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isEditing ? 'bg-primary/10' : 'bg-foreground/5'}`}>
                      <FileText className={`w-4 h-4 ${isEditing ? 'text-primary' : 'text-foreground/50'}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate">{cv.name || 'CV chưa đặt tên'}</span>
                        {cv.isPrimary && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning-surface text-warning-foreground border border-transparent">
                            <Star className="w-3 h-3 fill-current stroke-current" /> CV chính
                          </span>
                        )}
                        {isEditing && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                            <CheckCircle className="w-3 h-3" /> Đang chỉnh sửa
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {cv.headline && <span className="text-xs text-foreground/50 truncate">{cv.headline}</span>}

                        {cv.processingStatus === 'queued' && (
                          <span className="text-xs text-info-foreground animate-pulse flex items-center gap-1 font-medium">
                            ⏳ Đang chờ bóc tách AI...
                          </span>
                        )}
                        {cv.processingStatus === 'processing' && (
                          <span className="text-xs text-warning-foreground flex items-center gap-1 font-medium">
                            <Loader2 className="w-3 h-3 animate-spin" /> AI đang xử lý...
                          </span>
                        )}
                        {cv.processingStatus === 'failed' && (
                          <span className="text-xs text-danger-foreground flex items-center gap-1 font-medium" title={cv.processingError}>
                            ⚠️ Lỗi bóc tách AI
                          </span>
                        )}
                        {(cv.processingStatus === 'ready' || !cv.processingStatus) && (
                          cv.hasEmbedding ? (
                            <span className="text-xs text-success-foreground flex items-center gap-0.5">⚡ AI ready</span>
                          ) : (
                            <span className="text-xs text-warning-foreground">Chưa có AI embedding</span>
                          )
                        )}

                        {cv.createdAt && (
                          <span className="text-xs text-foreground/40">
                            {new Date(cv.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {cv.processingStatus === 'failed' && cv._id && (
                        <button
                          type="button"
                          onClick={() => cv._id && handleRetryAi(cv._id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-warning-surface text-warning-foreground hover:brightness-95 transition-colors"
                          title="Thử lại bóc tách AI"
                        >
                          Thử lại AI
                        </button>
                      )}
                      {cv.fileUrl && (
                        <a
                          href={`${getApiBase()}/api/cv/${cv._id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-foreground/40 hover:text-info-foreground hover:bg-info-surface transition-colors"
                          title="Xem PDF"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      )}
                      {!cv.isPrimary && (
                        <button
                          type="button"
                          title="Đặt làm CV chính"
                          disabled={!!settingPrimary}
                          onClick={() => cv._id && handleSetPrimary(cv._id)}
                          className="p-1.5 rounded-lg text-foreground/40 hover:text-warning-foreground hover:bg-warning-surface transition-colors disabled:opacity-50"
                        >
                          {isSettingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                        </button>
                      )}
                      <button
                        type="button"
                        title="Xóa CV này"
                        disabled={!!deletingId}
                        onClick={() => cv._id && handleDeleteCV(cv._id)}
                        className="p-1.5 rounded-lg text-foreground/40 hover:text-danger-foreground hover:bg-danger-surface transition-colors disabled:opacity-50"
                      >
                        {isDeletingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <Card className="p-6 border border-border">
              <h2 className="text-xl font-semibold mb-5">{labels.toolsTitle}</h2>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">{labels.cvTemplate}</p>
                  <div className="rounded-md border border-border px-3 py-2 text-sm text-foreground/80">
                    {labels.cvTemplateValue}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Languages className="w-4 h-4" />
                    {labels.language}
                  </p>
                  <Select value={language} onValueChange={(value: 'vi' | 'en') => handleLanguageChange(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vi">Tiếng Việt</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-5 mt-5">
                <div>
                  <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    {labels.color}
                  </p>
                  <div className="flex items-center gap-2">
                    {themeOptions.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setTheme(item.key)}
                        className={`w-9 h-9 rounded-md border-2 transition ${
                          theme === item.key ? 'border-foreground scale-105' : 'border-border'
                        }`}
                        style={{ backgroundColor: item.color }}
                        title={item.label}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Type className="w-4 h-4" />
                    {labels.font}
                  </p>
                  <div className="flex gap-2">
                    {(['compact', 'default', 'comfortable'] as const).map((size, i) => (
                      <Button
                        key={size}
                        type="button"
                        variant={fontScale === size ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFontScale(size)}
                      >
                        {i === 0 ? 'A-' : i === 2 ? 'A+' : 'A'}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 border border-border">
              <h2 className="text-xl font-semibold mb-5">{labels.profileTitle}</h2>

              <div className="mb-5 border-b border-border pb-5">
                <CvPhotoPicker
                  value={formData.photo}
                  onChange={(photo) => setFormData({ ...formData, photo })}
                  labels={{
                    title: labels.photoTitle,
                    hint: labels.photoHint,
                    choose: labels.photoChoose,
                    replace: labels.photoReplace,
                    remove: labels.photoRemove,
                  }}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.fullName}</label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={labels.fullNamePlaceholder} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.headline}</label>
                  <Input value={formData.headline} onChange={(e) => setFormData({ ...formData, headline: e.target.value })} placeholder={labels.headlinePlaceholder} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.email}</label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.phone}</label>
                  <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder={labels.phonePlaceholder} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.location}</label>
                  <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder={labels.locationPlaceholder} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.dateOfBirth}</label>
                  <Input type="date" value={formData.dateOfBirth} onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.address}</label>
                  <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder={labels.addressPlaceholder} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.website}</label>
                  <Input value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://..." />
                </div>
              </div>
            </Card>

            <Card className="p-6 border border-border">
              <h2 className="text-xl font-semibold mb-5">{labels.cvContentTitle}</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.objective}</label>
                  <Textarea rows={4} value={formData.objective} onChange={(e) => setFormData({ ...formData, objective: e.target.value })} placeholder={labels.objectivePlaceholder} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.experience}</label>
                  <ExperienceEditor
                    value={formData.experience}
                    onChange={(v) => setFormData({ ...formData, experience: v })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.education}</label>
                  <EducationEditor
                    value={formData.education}
                    onChange={(v) => setFormData({ ...formData, education: v })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.languages}</label>
                  <LanguageEditor
                    value={formData.languages}
                    onChange={(v) => setFormData({ ...formData, languages: v })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">{labels.certifications}</label>
                  <Textarea rows={2} value={formData.certifications} onChange={(e) => setFormData({ ...formData, certifications: e.target.value })} placeholder={labels.certificationsPlaceholder} />
                </div>
              </div>
            </Card>

            <Card className="p-6 border border-border">
              <h2 className="text-xl font-semibold mb-5">{labels.skillsTitle}</h2>
              <div className="mb-5">
                <div className="flex flex-wrap gap-2">
                  {formData.skills.map((skill) => (
                    <SkillTag key={skill} skill={skill} removable={true} onRemove={handleRemoveSkill} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder={labels.skillsPlaceholder}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAddSkill() }
                  }}
                />
                <Button type="button" onClick={handleAddSkill} variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" />
                  {labels.add}
                </Button>
              </div>
            </Card>

            <Card className="p-6 border border-border">
              <h2 className="text-xl font-semibold mb-3">{labels.importTitle}</h2>
              <p className="text-sm text-foreground/70 mb-4">{labels.importSubtitle}</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label htmlFor="cv-import" className="inline-flex">
                  <Button asChild variant="outline" className="gap-2" disabled={uploading}>
                    <span>
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                      {uploading ? labels.processing : labels.importButton}
                    </span>
                  </Button>
                </label>
                <input
                  id="cv-import"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleCvImport}
                  className="hidden"
                  disabled={uploading}
                />
                {importedCvFileName ? (
                  <p className="text-sm text-foreground/70">
                    {labels.imported}:{' '}
                    <span className="font-medium text-foreground">{importedCvFileName}</span>
                  </p>
                ) : (
                  <p className="text-sm text-foreground/60">{labels.noPdf}</p>
                )}
              </div>

              {(uploading || processingStatus === 'queued' || processingStatus === 'processing') && (
                <p className="mt-3 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground/70">
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  {labels.processingHint}
                </p>
              )}
            </Card>
          </div>

          <div className="lg:col-span-5">
            <div className="sticky top-6">
              <Card className="p-4 border border-border">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">{labels.preview}</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleExportPDF}
                    disabled={exporting}
                  >
                    {exporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {exporting ? 'Đang xuất...' : 'Export PDF'}
                  </Button>
                </div>
                <div className="border border-border bg-white rounded-md shadow-sm overflow-hidden">
                  <div ref={cvPreviewRef} className={`bg-white ${previewTextSize}`}>
                    {/* ── Đầu trang: tên + vị trí, gạch chân mảnh ─────────────── */}
                    <div className="px-6 pt-6 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3
                            className="text-2xl leading-tight font-bold tracking-wide uppercase"
                            style={{ color: currentTheme.color }}
                          >
                            {formData.name || 'Họ và tên'}
                          </h3>
                          <p className="mt-1 text-slate-500">
                            {formData.headline || 'Vị trí công việc'}
                          </p>
                        </div>
                        <div
                          className="size-16 shrink-0 overflow-hidden rounded-full border-[3px]"
                          style={{ borderColor: `${currentTheme.color}55` }}
                        >
                          {formData.photo && (
                            // Ảnh là data URL nên next/image không giúp được gì ở đây,
                            // và thẻ img thường mới đi theo được vào bản in PDF.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={formData.photo}
                              alt=""
                              className="size-full object-cover"
                            />
                          )}
                        </div>
                      </div>
                      <div
                        className="mt-4 h-px w-full"
                        style={{ backgroundColor: `${currentTheme.color}33` }}
                      />
                    </div>

                    {/* ── Thân CV: 2 cột như mẫu ──────────────────────────────── */}
                    <div className="grid grid-cols-[38%_1fr] gap-5 px-6 pb-6">
                      {/* Cột trái */}
                      <div className="space-y-5">
                        <PreviewSection title={labels.contact} color={currentTheme.color}>
                          <div className="space-y-1 text-slate-700">
                            {formData.phone && <p>{formData.phone}</p>}
                            {formData.email && <p className="break-all">{formData.email}</p>}
                            {formData.address && <p>{formData.address}</p>}
                            {formData.location && <p>{formData.location}</p>}
                            {formData.website && <p className="break-all">{formData.website}</p>}
                          </div>
                        </PreviewSection>

                        {formData.skills.length > 0 && (
                          <PreviewSection title={labels.skillsTitle} color={currentTheme.color}>
                            <div className="flex flex-wrap gap-1.5">
                              {formData.skills.map((skill, idx) => (
                                <span
                                  key={`${skill}-${idx}`}
                                  className="rounded px-1.5 py-0.5 text-[0.9em] leading-snug"
                                  style={{
                                    backgroundColor: `${currentTheme.color}14`,
                                    color: currentTheme.color,
                                  }}
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </PreviewSection>
                        )}

                        {formData.certifications && (
                          <PreviewSection title={labels.certifications} color={currentTheme.color}>
                            <p className="whitespace-pre-wrap text-slate-700">
                              {formData.certifications}
                            </p>
                          </PreviewSection>
                        )}

                        {formData.languages.length > 0 && (
                          <PreviewSection title={labels.languages} color={currentTheme.color}>
                            <ul className="space-y-1 text-slate-700">
                              {formData.languages.map((l, i) => (
                                <li key={i}>
                                  {l.name}
                                  {l.level && <span className="text-slate-500"> — {l.level}</span>}
                                </li>
                              ))}
                            </ul>
                          </PreviewSection>
                        )}
                      </div>

                      {/* Cột phải */}
                      <div className="space-y-5">
                        {formData.objective && (
                          <PreviewSection title={labels.objective} color={currentTheme.color}>
                            <p className="whitespace-pre-wrap text-slate-700">
                              {formData.objective}
                            </p>
                          </PreviewSection>
                        )}

                        {formData.experience.length > 0 && (
                          <PreviewSection title={labels.experience} color={currentTheme.color}>
                            <div className="space-y-3">
                              {formData.experience.map((exp, i) => (
                                <TimelineItem key={i} color={currentTheme.color}>
                                  <p className="font-semibold text-slate-800">
                                    {exp.position || 'Vị trí'}
                                    {exp.company && (
                                      <span className="font-normal text-slate-600">
                                        {' '}
                                        — {exp.company}
                                      </span>
                                    )}
                                  </p>
                                  {formatPeriod(exp.startDate, exp.endDate, exp.current) && (
                                    <p className="text-[0.9em] text-slate-500">
                                      {formatPeriod(exp.startDate, exp.endDate, exp.current)}
                                    </p>
                                  )}
                                  {exp.description && (
                                    <p className="mt-0.5 whitespace-pre-wrap text-slate-700">
                                      {exp.description}
                                    </p>
                                  )}
                                </TimelineItem>
                              ))}
                            </div>
                          </PreviewSection>
                        )}

                        {formData.education.length > 0 && (
                          <PreviewSection title={labels.education} color={currentTheme.color}>
                            <div className="space-y-3">
                              {formData.education.map((edu, i) => (
                                <TimelineItem key={i} color={currentTheme.color}>
                                  <p className="font-semibold text-slate-800">
                                    {edu.school || 'Trường'}
                                  </p>
                                  {(edu.degree || edu.major) && (
                                    <p className="text-slate-700">
                                      {[edu.degree, edu.major].filter(Boolean).join(' — ')}
                                    </p>
                                  )}
                                  {[
                                    formatPeriod(edu.startDate, edu.endDate, edu.current),
                                    edu.gpa && `GPA: ${edu.gpa}`,
                                  ].filter(Boolean).length > 0 && (
                                    <p className="text-[0.9em] text-slate-500">
                                      {[
                                        formatPeriod(edu.startDate, edu.endDate, edu.current),
                                        edu.gpa && `GPA: ${edu.gpa}`,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </p>
                                  )}
                                </TimelineItem>
                              ))}
                            </div>
                          </PreviewSection>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </PageContainer>
    </CandidateLayout>
  )
}
