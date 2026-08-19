/**
 * Danh mục nghề nghiệp 2 cấp, tham khảo cách phân loại của TopCV.
 *
 *   Ngành nghề (category)  ->  Vị trí chuyên môn (position)
 *
 * Giá trị lưu xuống DB là `value` (slug), không phải nhãn tiếng Việt — đổi chữ
 * hiển thị về sau không làm hỏng dữ liệu cũ. Dùng `categoryLabel()` /
 * `positionLabel()` khi cần hiện ra màn hình.
 *
 * `Job.industry` giữ slug ngành, `Job.specialization` giữ slug vị trí.
 * Lưu ý: đây là danh mục của TIN TUYỂN DỤNG, khác với `CompanyProfile.industry`
 * (enum 9 giá trị mô tả lĩnh vực của công ty) — hai thứ độc lập nhau.
 */

export type JobPosition = { value: string; label: string }
export type JobCategory = { value: string; label: string; positions: JobPosition[] }

const p = (value: string, label: string): JobPosition => ({ value, label })

export const JOB_CATEGORIES: JobCategory[] = [
  {
    value: 'it-software',
    label: 'IT — Phần mềm',
    positions: [
      p('backend-dev', 'Lập trình viên Backend'),
      p('frontend-dev', 'Lập trình viên Frontend'),
      p('fullstack-dev', 'Lập trình viên Full-stack'),
      p('mobile-dev', 'Lập trình viên Mobile (iOS/Android)'),
      p('game-dev', 'Lập trình viên Game'),
      p('embedded-dev', 'Lập trình viên Nhúng'),
      p('blockchain-dev', 'Lập trình viên Blockchain'),
      p('devops', 'DevOps / SRE'),
      p('qa-tester', 'Kiểm thử phần mềm (QA/QC/Tester)'),
      p('data-engineer', 'Kỹ sư dữ liệu (Data Engineer)'),
      p('data-scientist', 'Nhà khoa học dữ liệu (Data Scientist)'),
      p('data-analyst', 'Chuyên viên phân tích dữ liệu'),
      p('ai-ml-engineer', 'Kỹ sư AI / Machine Learning'),
      p('business-analyst-it', 'Business Analyst (IT)'),
      p('product-owner', 'Product Owner / Product Manager'),
      p('scrum-master', 'Scrum Master / Project Manager (IT)'),
      p('solution-architect', 'Kiến trúc sư giải pháp'),
      p('erp-specialist', 'Chuyên viên ERP'),
      p('ui-ux-designer', 'Thiết kế UI/UX'),
      p('tech-lead', 'Trưởng nhóm kỹ thuật (Tech Lead)'),
      p('cto', 'Giám đốc công nghệ (CTO)'),
    ],
  },
  {
    value: 'it-hardware-network',
    label: 'IT — Phần cứng / Mạng',
    positions: [
      p('system-admin', 'Quản trị hệ thống'),
      p('network-engineer', 'Kỹ sư mạng'),
      p('security-engineer', 'Kỹ sư an ninh mạng'),
      p('cloud-engineer', 'Kỹ sư Cloud'),
      p('database-admin', 'Quản trị cơ sở dữ liệu (DBA)'),
      p('it-support', 'IT Helpdesk / IT Support'),
      p('hardware-engineer', 'Kỹ sư phần cứng'),
      p('it-manager', 'Trưởng phòng IT'),
    ],
  },
  {
    value: 'sales',
    label: 'Kinh doanh / Bán hàng',
    positions: [
      p('sales-executive', 'Nhân viên kinh doanh'),
      p('sales-b2b', 'Kinh doanh B2B / Doanh nghiệp'),
      p('sales-online', 'Kinh doanh Online / Sàn TMĐT'),
      p('telesales', 'Telesales / Bán hàng qua điện thoại'),
      p('account-executive', 'Account Executive'),
      p('business-development', 'Phát triển kinh doanh (BD)'),
      p('key-account', 'Quản lý khách hàng trọng điểm (KAM)'),
      p('sales-supervisor', 'Giám sát bán hàng'),
      p('sales-manager', 'Trưởng phòng kinh doanh'),
      p('sales-director', 'Giám đốc kinh doanh'),
      p('store-staff', 'Nhân viên bán hàng tại cửa hàng'),
      p('store-manager', 'Quản lý cửa hàng'),
    ],
  },
  {
    value: 'marketing',
    label: 'Marketing / PR / Quảng cáo',
    positions: [
      p('marketing-executive', 'Nhân viên Marketing'),
      p('digital-marketing', 'Digital Marketing'),
      p('seo-specialist', 'Chuyên viên SEO'),
      p('ads-specialist', 'Chuyên viên chạy quảng cáo (Ads)'),
      p('content-marketing', 'Content Marketing'),
      p('social-media', 'Quản trị mạng xã hội'),
      p('brand-executive', 'Chuyên viên thương hiệu'),
      p('pr-executive', 'Chuyên viên PR / Quan hệ công chúng'),
      p('trade-marketing', 'Trade Marketing'),
      p('event-executive', 'Tổ chức sự kiện'),
      p('market-research', 'Nghiên cứu thị trường'),
      p('marketing-manager', 'Trưởng phòng Marketing'),
      p('cmo', 'Giám đốc Marketing (CMO)'),
    ],
  },
  {
    value: 'design',
    label: 'Thiết kế / Mỹ thuật',
    positions: [
      p('graphic-designer', 'Thiết kế đồ họa'),
      p('motion-designer', 'Thiết kế chuyển động (Motion)'),
      p('video-editor', 'Dựng phim / Video Editor'),
      p('photographer', 'Nhiếp ảnh'),
      p('3d-artist', 'Hoạ sĩ 3D'),
      p('game-artist', 'Hoạ sĩ Game / 2D Artist'),
      p('illustrator', 'Minh hoạ (Illustrator)'),
      p('art-director', 'Giám đốc mỹ thuật'),
    ],
  },
  {
    value: 'content-media',
    label: 'Nội dung / Báo chí / Truyền hình',
    positions: [
      p('content-writer', 'Biên tập nội dung / Copywriter'),
      p('journalist', 'Phóng viên / Nhà báo'),
      p('editor', 'Biên tập viên'),
      p('translator', 'Biên dịch / Phiên dịch'),
      p('mc-host', 'MC / Dẫn chương trình'),
      p('producer', 'Sản xuất chương trình'),
      p('kol-manager', 'Quản lý KOL / Influencer'),
    ],
  },
  {
    value: 'accounting-audit',
    label: 'Kế toán / Kiểm toán',
    positions: [
      p('general-accountant', 'Kế toán tổng hợp'),
      p('accountant', 'Kế toán viên'),
      p('tax-accountant', 'Kế toán thuế'),
      p('cost-accountant', 'Kế toán chi phí / Giá thành'),
      p('payable-receivable', 'Kế toán công nợ'),
      p('internal-auditor', 'Kiểm toán nội bộ'),
      p('external-auditor', 'Kiểm toán độc lập'),
      p('chief-accountant', 'Kế toán trưởng'),
      p('cfo', 'Giám đốc tài chính (CFO)'),
    ],
  },
  {
    value: 'finance-investment',
    label: 'Tài chính / Đầu tư',
    positions: [
      p('financial-analyst', 'Chuyên viên phân tích tài chính'),
      p('investment-analyst', 'Chuyên viên phân tích đầu tư'),
      p('securities-broker', 'Môi giới chứng khoán'),
      p('fund-management', 'Quản lý quỹ'),
      p('risk-management', 'Quản trị rủi ro'),
      p('corporate-finance', 'Tài chính doanh nghiệp'),
      p('finance-manager', 'Trưởng phòng tài chính'),
    ],
  },
  {
    value: 'banking',
    label: 'Ngân hàng',
    positions: [
      p('teller', 'Giao dịch viên'),
      p('credit-officer', 'Chuyên viên tín dụng'),
      p('relationship-manager', 'Chuyên viên quan hệ khách hàng'),
      p('appraisal-officer', 'Chuyên viên thẩm định'),
      p('debt-collection', 'Chuyên viên xử lý nợ'),
      p('bank-branch-manager', 'Giám đốc chi nhánh'),
    ],
  },
  {
    value: 'insurance',
    label: 'Bảo hiểm',
    positions: [
      p('insurance-agent', 'Tư vấn bảo hiểm'),
      p('claims-officer', 'Chuyên viên bồi thường'),
      p('underwriter', 'Chuyên viên thẩm định bảo hiểm'),
      p('actuary', 'Chuyên viên định phí (Actuary)'),
    ],
  },
  {
    value: 'hr',
    label: 'Nhân sự',
    positions: [
      p('hr-executive', 'Nhân viên nhân sự'),
      p('recruiter', 'Chuyên viên tuyển dụng'),
      p('cb-specialist', 'Chuyên viên C&B (Lương thưởng)'),
      p('training-specialist', 'Chuyên viên đào tạo'),
      p('hr-business-partner', 'HR Business Partner'),
      p('hr-manager', 'Trưởng phòng nhân sự'),
      p('hr-director', 'Giám đốc nhân sự'),
    ],
  },
  {
    value: 'admin-office',
    label: 'Hành chính / Thư ký / Trợ lý',
    positions: [
      p('admin-staff', 'Nhân viên hành chính'),
      p('receptionist', 'Lễ tân'),
      p('secretary', 'Thư ký'),
      p('executive-assistant', 'Trợ lý giám đốc'),
      p('data-entry', 'Nhân viên nhập liệu'),
      p('office-manager', 'Trưởng phòng hành chính'),
    ],
  },
  {
    value: 'customer-service',
    label: 'Dịch vụ khách hàng',
    positions: [
      p('customer-service-staff', 'Nhân viên chăm sóc khách hàng'),
      p('call-center', 'Tổng đài viên'),
      p('customer-success', 'Customer Success'),
      p('complaint-handling', 'Xử lý khiếu nại'),
      p('cs-manager', 'Trưởng nhóm CSKH'),
    ],
  },
  {
    value: 'logistics',
    label: 'Vận tải / Kho vận / Logistics',
    positions: [
      p('logistics-staff', 'Nhân viên logistics'),
      p('warehouse-staff', 'Nhân viên kho'),
      p('warehouse-manager', 'Quản lý kho'),
      p('shipping-coordinator', 'Điều phối vận tải'),
      p('driver', 'Lái xe'),
      p('delivery-staff', 'Nhân viên giao hàng'),
      p('supply-chain', 'Chuỗi cung ứng (Supply Chain)'),
      p('purchasing', 'Thu mua'),
    ],
  },
  {
    value: 'import-export',
    label: 'Xuất nhập khẩu',
    positions: [
      p('import-export-staff', 'Nhân viên xuất nhập khẩu'),
      p('customs-declaration', 'Khai báo hải quan'),
      p('sales-logistics', 'Sales Logistics / Forwarder'),
      p('documentation', 'Chứng từ (Docs)'),
    ],
  },
  {
    value: 'manufacturing',
    label: 'Sản xuất / Vận hành nhà máy',
    positions: [
      p('production-staff', 'Công nhân sản xuất'),
      p('production-supervisor', 'Giám sát sản xuất'),
      p('production-manager', 'Quản đốc / Trưởng ca'),
      p('qa-qc-production', 'Nhân viên QA/QC'),
      p('rd-staff', 'Nhân viên R&D'),
      p('maintenance', 'Bảo trì / Bảo dưỡng'),
      p('ie-engineer', 'Kỹ sư IE / Cải tiến sản xuất'),
      p('planning-staff', 'Kế hoạch sản xuất'),
      p('hse-officer', 'An toàn lao động (HSE)'),
    ],
  },
  {
    value: 'mechanical-automotive',
    label: 'Cơ khí / Ô tô / Tự động hóa',
    positions: [
      p('mechanical-engineer', 'Kỹ sư cơ khí'),
      p('automation-engineer', 'Kỹ sư tự động hóa'),
      p('cad-cam', 'Kỹ sư thiết kế CAD/CAM'),
      p('cnc-operator', 'Vận hành máy CNC'),
      p('welder', 'Thợ hàn'),
      p('auto-technician', 'Kỹ thuật viên ô tô'),
      p('mechatronics', 'Kỹ sư cơ điện tử'),
    ],
  },
  {
    value: 'electrical-electronics',
    label: 'Điện / Điện tử / Điện lạnh',
    positions: [
      p('electrical-engineer', 'Kỹ sư điện'),
      p('electronics-engineer', 'Kỹ sư điện tử'),
      p('hvac-engineer', 'Kỹ sư điện lạnh / HVAC'),
      p('pcb-engineer', 'Kỹ sư mạch (PCB)'),
      p('electrician', 'Thợ điện'),
      p('me-engineer', 'Kỹ sư M&E'),
    ],
  },
  {
    value: 'construction',
    label: 'Xây dựng',
    positions: [
      p('civil-engineer', 'Kỹ sư xây dựng'),
      p('site-supervisor', 'Giám sát công trình'),
      p('site-manager', 'Chỉ huy trưởng công trình'),
      p('qs-engineer', 'Kỹ sư dự toán (QS)'),
      p('structural-engineer', 'Kỹ sư kết cấu'),
      p('project-engineer', 'Kỹ sư dự án'),
      p('construction-worker', 'Công nhân xây dựng'),
    ],
  },
  {
    value: 'architecture-interior',
    label: 'Kiến trúc / Thiết kế nội thất',
    positions: [
      p('architect', 'Kiến trúc sư'),
      p('interior-designer', 'Thiết kế nội thất'),
      p('landscape-architect', 'Kiến trúc sư cảnh quan'),
      p('3d-visualizer', 'Diễn hoạ 3D kiến trúc'),
      p('bim-engineer', 'Kỹ sư BIM'),
    ],
  },
  {
    value: 'real-estate',
    label: 'Bất động sản',
    positions: [
      p('re-broker', 'Chuyên viên môi giới BĐS'),
      p('re-investment', 'Chuyên viên đầu tư BĐS'),
      p('re-appraisal', 'Chuyên viên thẩm định giá'),
      p('property-management', 'Quản lý toà nhà'),
      p('re-sales-manager', 'Trưởng phòng kinh doanh BĐS'),
    ],
  },
  {
    value: 'healthcare',
    label: 'Y tế / Chăm sóc sức khỏe',
    positions: [
      p('doctor', 'Bác sĩ'),
      p('nurse', 'Điều dưỡng / Y tá'),
      p('pharmacist-hospital', 'Dược sĩ lâm sàng'),
      p('lab-technician', 'Kỹ thuật viên xét nghiệm'),
      p('imaging-technician', 'Kỹ thuật viên chẩn đoán hình ảnh'),
      p('dentist', 'Bác sĩ nha khoa'),
      p('nutritionist', 'Chuyên viên dinh dưỡng'),
      p('physiotherapist', 'Kỹ thuật viên vật lý trị liệu'),
      p('medical-representative', 'Trình dược viên'),
    ],
  },
  {
    value: 'pharma-biotech',
    label: 'Dược / Công nghệ sinh học',
    positions: [
      p('pharmacist', 'Dược sĩ'),
      p('qa-pharma', 'QA/QC Dược'),
      p('rd-pharma', 'Nghiên cứu phát triển (R&D) Dược'),
      p('regulatory-affairs', 'Đăng ký thuốc (RA)'),
      p('biotech-engineer', 'Kỹ sư công nghệ sinh học'),
    ],
  },
  {
    value: 'education',
    label: 'Giáo dục / Đào tạo',
    positions: [
      p('teacher', 'Giáo viên'),
      p('english-teacher', 'Giáo viên tiếng Anh'),
      p('lecturer', 'Giảng viên'),
      p('teaching-assistant', 'Trợ giảng'),
      p('academic-staff', 'Nhân viên học vụ'),
      p('education-consultant', 'Tư vấn tuyển sinh'),
      p('curriculum-developer', 'Phát triển chương trình'),
      p('training-manager', 'Quản lý đào tạo'),
    ],
  },
  {
    value: 'legal',
    label: 'Luật / Pháp lý',
    positions: [
      p('lawyer', 'Luật sư'),
      p('legal-executive', 'Chuyên viên pháp chế'),
      p('paralegal', 'Trợ lý luật sư'),
      p('compliance-officer', 'Chuyên viên tuân thủ'),
      p('notary', 'Công chứng viên'),
    ],
  },
  {
    value: 'hospitality',
    label: 'Nhà hàng / Khách sạn',
    positions: [
      p('waiter', 'Nhân viên phục vụ'),
      p('chef', 'Đầu bếp'),
      p('kitchen-assistant', 'Phụ bếp'),
      p('bartender', 'Pha chế (Bartender/Barista)'),
      p('hotel-receptionist', 'Lễ tân khách sạn'),
      p('housekeeping', 'Buồng phòng'),
      p('restaurant-manager', 'Quản lý nhà hàng'),
      p('hotel-manager', 'Quản lý khách sạn'),
    ],
  },
  {
    value: 'tourism',
    label: 'Du lịch',
    positions: [
      p('tour-guide', 'Hướng dẫn viên du lịch'),
      p('tour-operator', 'Điều hành tour'),
      p('travel-consultant', 'Tư vấn du lịch'),
      p('ticketing', 'Đặt vé / Ticketing'),
    ],
  },
  {
    value: 'food-beverage',
    label: 'Thực phẩm / Đồ uống',
    positions: [
      p('food-qa', 'QA/QC thực phẩm'),
      p('food-rd', 'R&D thực phẩm'),
      p('food-technologist', 'Kỹ sư công nghệ thực phẩm'),
      p('food-safety', 'An toàn thực phẩm'),
    ],
  },
  {
    value: 'textile-footwear',
    label: 'Dệt may / Da giày',
    positions: [
      p('merchandiser', 'Merchandiser'),
      p('fashion-designer', 'Thiết kế thời trang'),
      p('pattern-maker', 'Thiết kế rập'),
      p('textile-qa', 'QA/QC may mặc'),
      p('production-textile', 'Công nhân may'),
    ],
  },
  {
    value: 'chemistry',
    label: 'Hóa học / Hóa chất',
    positions: [
      p('chemical-engineer', 'Kỹ sư hóa'),
      p('lab-chemist', 'Nhân viên phòng thí nghiệm'),
      p('chemical-sales', 'Kinh doanh hóa chất'),
    ],
  },
  {
    value: 'agriculture',
    label: 'Nông / Lâm / Ngư nghiệp',
    positions: [
      p('agricultural-engineer', 'Kỹ sư nông nghiệp'),
      p('veterinarian', 'Bác sĩ thú y'),
      p('aquaculture', 'Kỹ sư thủy sản'),
      p('farm-manager', 'Quản lý trang trại'),
    ],
  },
  {
    value: 'energy-mining',
    label: 'Dầu khí / Khoáng sản / Năng lượng',
    positions: [
      p('petroleum-engineer', 'Kỹ sư dầu khí'),
      p('mining-engineer', 'Kỹ sư mỏ'),
      p('geologist', 'Kỹ sư địa chất'),
      p('renewable-energy', 'Kỹ sư năng lượng tái tạo'),
    ],
  },
  {
    value: 'environment',
    label: 'Môi trường / Xử lý chất thải',
    positions: [
      p('environmental-engineer', 'Kỹ sư môi trường'),
      p('waste-treatment', 'Vận hành xử lý nước thải'),
      p('esg-specialist', 'Chuyên viên ESG'),
    ],
  },
  {
    value: 'telecom',
    label: 'Viễn thông',
    positions: [
      p('telecom-engineer', 'Kỹ sư viễn thông'),
      p('bts-technician', 'Kỹ thuật viên trạm BTS'),
      p('telecom-sales', 'Kinh doanh viễn thông'),
    ],
  },
  {
    value: 'security',
    label: 'An ninh / Bảo vệ',
    positions: [
      p('security-guard', 'Nhân viên bảo vệ'),
      p('security-supervisor', 'Giám sát an ninh'),
    ],
  },
  {
    value: 'general-labor',
    label: 'Lao động phổ thông',
    positions: [
      p('general-worker', 'Lao động phổ thông'),
      p('cleaner', 'Tạp vụ / Vệ sinh'),
      p('packer', 'Nhân viên đóng gói'),
      p('loader', 'Bốc xếp'),
    ],
  },
  {
    value: 'other',
    label: 'Ngành nghề khác',
    positions: [p('other-position', 'Vị trí khác')],
  },
]

/** Tra nhanh theo slug, dựng một lần lúc nạp module. */
const CATEGORY_BY_VALUE = new Map(JOB_CATEGORIES.map((c) => [c.value, c]))
const POSITION_BY_VALUE = new Map(
  JOB_CATEGORIES.flatMap((c) => c.positions.map((pos) => [pos.value, pos] as const)),
)

export function categoryLabel(value?: string | null): string {
  if (!value) return ''
  return CATEGORY_BY_VALUE.get(value)?.label ?? value
}

export function positionLabel(value?: string | null): string {
  if (!value) return ''
  return POSITION_BY_VALUE.get(value)?.label ?? value
}

export function positionsOf(categoryValue?: string | null): JobPosition[] {
  if (!categoryValue) return []
  return CATEGORY_BY_VALUE.get(categoryValue)?.positions ?? []
}

/** Vị trí này có thuộc ngành đang chọn không — dùng để reset khi đổi ngành. */
export function positionBelongsTo(categoryValue: string, positionValue: string): boolean {
  return positionsOf(categoryValue).some((pos) => pos.value === positionValue)
}

/* ────────────────────────────────────────────────────────────────────────────
 * LĨNH VỰC CÔNG TY (CompanyProfile.industry)
 *
 * Khác với danh mục nghề ở trên: đây là lĩnh vực hoạt động của DOANH NGHIỆP,
 * còn JOB_CATEGORIES là ngành nghề của TIN TUYỂN DỤNG. Một công ty công nghệ
 * vẫn tuyển kế toán, nên hai thứ không gộp làm một được.
 *
 * Danh sách phải khớp đúng enum trong backend/src/models/CompanyProfile.js.
 * Trước đây map này bị chép lại ở 4 file với 3 cách gọi tên khác nhau cho cùng
 * một slug (consulting = "Tư vấn" / "Tư vấn / Dịch vụ"), khiến cùng một công ty
 * hiện tên lĩnh vực khác nhau tuỳ trang. Nay chỉ còn định nghĩa ở đây.
 * ──────────────────────────────────────────────────────────────────────────── */

export type CompanySector = { value: string; label: string }

export const COMPANY_SECTORS: CompanySector[] = [
  { value: 'technology', label: 'Công nghệ thông tin' },
  { value: 'finance', label: 'Tài chính / Ngân hàng' },
  { value: 'healthcare', label: 'Y tế / Dược phẩm' },
  { value: 'consulting', label: 'Tư vấn / Dịch vụ' },
  { value: 'logistics', label: 'Logistics / Vận tải' },
  { value: 'education', label: 'Giáo dục / Đào tạo' },
  { value: 'marketing', label: 'Marketing / Truyền thông' },
  { value: 'manufacturing', label: 'Sản xuất / Chế tạo' },
  { value: 'other', label: 'Lĩnh vực khác' },
]

const SECTOR_BY_VALUE = new Map(COMPANY_SECTORS.map((s) => [s.value, s]))

export function companySectorLabel(value?: string | null): string {
  if (!value) return ''
  return SECTOR_BY_VALUE.get(value)?.label ?? value
}

/** Dạng Record để chỗ nào đang dùng `map[value]` không phải sửa nhiều. */
export const COMPANY_SECTOR_LABEL: Record<string, string> = Object.fromEntries(
  COMPANY_SECTORS.map((s) => [s.value, s.label]),
)

/* ────────────────────────────────────────────────────────────────────────────
 * MỨC KINH NGHIỆM (Job.experience)
 * Để chung ở đây để trang đăng tin và trang sửa tin gọi cùng một tên.
 * ──────────────────────────────────────────────────────────────────────────── */

export const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Mới tốt nghiệp / dưới 1 năm' },
  { value: 'mid', label: 'Từ 1 – 3 năm' },
  { value: 'senior', label: 'Từ 3 – 5 năm' },
  { value: 'expert', label: 'Trên 5 năm' },
]

const EXPERIENCE_BY_VALUE = new Map(EXPERIENCE_LEVELS.map((e) => [e.value, e]))

export function experienceLabel(value?: string | null): string {
  if (!value) return ''
  return EXPERIENCE_BY_VALUE.get(value)?.label ?? value
}
