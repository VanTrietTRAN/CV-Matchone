const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Job = require('../models/Job');
const excel = require('../services/excelImport');
const emailService = require('../services/emailService');
const { frontendOrigin } = require('../utils/frontendUrl');
const { logAdminAction } = require('../services/auditLogService');
const { generatePassword } = require('../utils/passwordGenerator');
const {
  SCHOOL_EMAIL_DOMAIN,
  normalizeStudentId,
  isValidStudentId,
  schoolEmailOf,
} = require('../utils/schoolEmail');

/**
 * Import hàng loạt từ file Excel: tài khoản sinh viên (admin) và tin tuyển dụng
 * (doanh nghiệp hoặc admin).
 *
 * Hai nguyên tắc chung:
 *   1. **Không dừng cả lô vì một dòng hỏng.** Dòng nào lỗi thì ghi lại số dòng
 *      và lý do, các dòng còn lại vẫn chạy. File 200 dòng mà một ô sai định dạng
 *      không được phép làm hỏng 199 dòng kia.
 *   2. **Xem trước trước khi ghi.** `dryRun` trả về đúng những gì sẽ xảy ra mà
 *      không tạo gì — tạo nhầm 200 tài khoản rồi dọn tay là rất mệt.
 */

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

/**
 * Tài khoản đã có trong hệ thống, admin bật gửi tới email trường: gửi bù hay bỏ qua?
 *
 * Các đợt import trước chỉ gửi tới email cá nhân. Nay đối chiếu từng dòng với
 * dữ liệu thật:
 *   - Đã đổi mật khẩu lần đầu = đã vào được hệ thống, không cần thư nữa.
 *   - Chưa đổi, thư cá nhân đã gửi: gửi bù CHỈ tới email trường. Gửi lại cả gmail
 *     vừa tốn thêm một lượt quota, vừa để sinh viên có hai thư với hai mật khẩu.
 *   - Thư cá nhân còn chờ gửi hoặc gửi hỏng: chưa ai nhận được gì, nên gửi cả
 *     hai địa chỉ trong một lá — y như tài khoản mới.
 *
 * @returns {{skip: string} | {target: 'school'|'both', label: string}}
 */
const decideSchoolResend = (user, schoolEmail) => {
  if (!user.importedAt) {
    return { skip: 'Tài khoản tự đăng ký, không phải do import — không gửi mật khẩu tạm' };
  }
  if (user.mustChangePassword !== true) {
    return { skip: 'Sinh viên đã đổi mật khẩu, tài khoản đang hoạt động' };
  }
  if (!schoolEmail) {
    return { skip: 'Không có MSSV nên không gửi được tới email trường' };
  }
  if (schoolEmail === String(user.email || '').toLowerCase()) {
    return { skip: 'Email đăng nhập đã chính là email trường' };
  }
  if (user.welcomeEmailStatus === 'pending') {
    if (user.welcomeEmailTo === 'school' || user.welcomeEmailTo === 'both') {
      return { skip: 'Đang chờ gửi tới email trường' };
    }
    return { target: 'both', label: 'Thư cá nhân chưa gửi — gửi cả hai địa chỉ' };
  }
  if (user.schoolEmailSentAt) {
    return { skip: 'Đã gửi tới email trường trước đó' };
  }
  if (user.welcomeEmailStatus === 'failed') {
    return { target: 'both', label: 'Thư cá nhân gửi hỏng — gửi lại cả hai địa chỉ' };
  }
  return { target: 'school', label: 'Chỉ gửi bù tới email trường' };
};

// ─── Import tài khoản sinh viên ──────────────────────────────────────────────

const importUsers = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel (.xlsx) hoặc .csv.' });
    }

    // Mặc định là chạy thử. Phải gửi apply=true mới thật sự tạo tài khoản.
    const apply = String(req.body?.apply) === 'true';

    // Admin bật trước khi bấm gửi: thư gửi thêm tới <MSSV>@sv1.dut.udn.vn. Bản xem
    // trước chạy với đúng lựa chọn này, nên con số admin thấy là con số sẽ xảy ra.
    const sendSchoolEmail = String(req.body?.sendSchoolEmail) === 'true';

    let parsed;
    try {
      parsed = excel.parseSheet(req.file.buffer, excel.STUDENT_COLUMNS);
    } catch (e) {
      return res.status(400).json({ message: `Không đọc được file: ${e.message}` });
    }

    if (parsed.missingColumns.length) {
      return res.status(400).json({
        message: `File thiếu cột bắt buộc: ${parsed.missingColumns.join(', ')}.`,
        data: { headersFound: parsed.headers },
      });
    }
    if (sendSchoolEmail && parsed.mapping.studentId === undefined) {
      return res.status(400).json({
        message:
          `Đã bật gửi tới email trường nhưng file không có cột MSSV, nên không dựng được ` +
          `địa chỉ @${SCHOOL_EMAIL_DOMAIN}. Thêm cột MSSV hoặc tắt tuỳ chọn này.`,
        data: { headersFound: parsed.headers },
      });
    }
    if (!parsed.rows.length) {
      return res.status(400).json({ message: 'File không có dòng dữ liệu nào.' });
    }

    const created = []; // tài khoản mới
    const requeued = []; // tài khoản đã có, xếp lại hàng đợi để gửi tới email trường
    const skipped = [];
    const failed = [];
    const warnings = [];
    const seenEmails = new Set();
    const seenStudentIds = new Set();

    for (const row of parsed.rows) {
      const email = String(row.email || '').toLowerCase().trim();
      const studentId = normalizeStudentId(row.studentId);
      const schoolEmail = schoolEmailOf(studentId);

      if (!row.fullName) {
        failed.push({ row: row.__row, email, reason: 'Thiếu họ tên' });
        continue;
      }
      if (!isValidEmail(email)) {
        failed.push({ row: row.__row, email: row.email, reason: 'Email không hợp lệ' });
        continue;
      }
      if (studentId && !isValidStudentId(studentId)) {
        failed.push({ row: row.__row, email, reason: `MSSV "${studentId}" chỉ được gồm chữ và số (4–20 ký tự)` });
        continue;
      }
      // Trùng ngay trong file — Excel dán từ nhiều nguồn rất hay bị
      if (seenEmails.has(email)) {
        skipped.push({ row: row.__row, email, reason: 'Trùng email với dòng phía trên' });
        continue;
      }
      if (studentId && seenStudentIds.has(studentId)) {
        skipped.push({ row: row.__row, email, reason: `Trùng MSSV ${studentId} với dòng phía trên` });
        continue;
      }
      seenEmails.add(email);
      if (studentId) seenStudentIds.add(studentId);

      // Một MSSV là một hộp thư trường. Hai tài khoản chung MSSV thì hai mật khẩu
      // tạm cùng đổ về một hộp thư — sinh viên không biết cái nào của tài khoản nào.
      if (studentId) {
        const owner = await User.findOne({ studentId, email: { $ne: email } }).select('email').lean();
        if (owner) {
          failed.push({ row: row.__row, email, reason: `MSSV ${studentId} đã thuộc tài khoản ${owner.email}` });
          continue;
        }
      }

      const existing = await User.findOne({ email });

      // ── Tài khoản đã có: đối chiếu để quyết định gửi bù hay bỏ qua ──
      if (existing) {
        if (!sendSchoolEmail) {
          skipped.push({ row: row.__row, email, reason: 'Email đã có tài khoản' });
          continue;
        }

        const decision = decideSchoolResend(existing, schoolEmail);
        if (decision.skip) {
          skipped.push({ row: row.__row, email, reason: decision.skip });
          continue;
        }

        try {
          if (apply) {
            await User.updateOne(
              { _id: existing._id },
              {
                $set: {
                  studentId,
                  welcomeEmailStatus: 'pending',
                  welcomeEmailTo: decision.target,
                  welcomeEmailAttempts: 0,
                },
                $unset: { welcomeEmailError: '' },
              },
            );
          }
          requeued.push({
            row: row.__row,
            email,
            fullName: existing.fullName || row.fullName,
            sendTo: decision.target,
            reason: decision.label,
          });
        } catch (e) {
          failed.push({ row: row.__row, email, reason: e.message });
        }
        continue;
      }

      // ── Tài khoản mới ──
      const sendTo = sendSchoolEmail && schoolEmail && schoolEmail !== email ? 'both' : 'personal';
      const warning =
        sendSchoolEmail && !schoolEmail
          ? { row: row.__row, email, reason: 'Không có MSSV — chỉ gửi tới email cá nhân' }
          : null;

      if (!apply) {
        created.push({ row: row.__row, email, fullName: row.fullName, sendTo });
        if (warning) warnings.push(warning);
        continue;
      }

      try {
        // Mật khẩu đặt ở đây chỉ là chỗ giữ chỗ và không gửi cho ai. Worker sẽ
        // sinh mật khẩu thật ngay lúc gửi email, nên không có mật khẩu dạng rõ
        // nào tồn tại giữa hai bước.
        const placeholder = await bcrypt.hash(generatePassword(), await bcrypt.genSalt(10));

        await User.create({
          email,
          password: placeholder,
          role: 'candidate',
          fullName: row.fullName,
          studentId: studentId || undefined,
          major: row.major || '',
          phone: row.phone || '',
          note: row.note || '',
          // Admin tạo hộ nên coi như email đã được nhà trường xác nhận; nếu bắt
          // xác thực nữa thì sinh viên phải làm hai bước cho cùng một việc.
          emailVerified: true,
          mustChangePassword: true,
          importedAt: new Date(),
          // Xếp hàng chờ worker gửi thư — xem src/services/welcomeEmailWorker.js
          welcomeEmailStatus: 'pending',
          welcomeEmailTo: sendTo,
          welcomeEmailAttempts: 0,
        });

        created.push({ row: row.__row, email, fullName: row.fullName, sendTo });
        if (warning) warnings.push(warning);
      } catch (e) {
        failed.push({ row: row.__row, email, reason: e.message });
      }
    }

    // Brevo tính hạn mức theo người nhận: thư gửi cả hai địa chỉ tốn 2 lượt
    const quotaUnits = [...created, ...requeued].reduce((sum, r) => sum + (r.sendTo === 'both' ? 2 : 1), 0);

    if (apply) {
      await logAdminAction({
        req,
        action: 'IMPORT_USERS',
        targetModel: 'User',
        targetId: null,
        details: {
          created: created.length,
          requeuedForSchoolEmail: requeued.length,
          skipped: skipped.length,
          failed: failed.length,
          sendSchoolEmail,
        },
      });
    }

    const { getQueueStats } = require('../services/welcomeEmailWorker');
    const queue = apply ? await getQueueStats() : null;

    const resendText = sendSchoolEmail ? `, gửi bù ${requeued.length} thư tới email trường` : '';
    return res.json({
      message: apply
        ? `Đã tạo ${created.length} tài khoản${resendText}. Bỏ qua ${skipped.length}, lỗi ${failed.length}. ` +
          `Email đang được gửi dần ở nền (${queue.batchSize} thư mỗi 20 giây).`
        : `Xem trước: sẽ tạo ${created.length} tài khoản${resendText}, bỏ qua ${skipped.length}, lỗi ${failed.length}.`,
      data: {
        applied: apply,
        sendSchoolEmail,
        schoolDomain: SCHOOL_EMAIL_DOMAIN,
        totalRows: parsed.rows.length,
        truncated: parsed.truncated,
        created,
        requeued,
        skipped,
        failed,
        warnings,
        quotaUnits,
        queue,
      },
    });
  } catch (error) {
    console.error('[Import Users]', error);
    res.status(500).json({ message: error.message });
  }
};

// ─── Import tin tuyển dụng ───────────────────────────────────────────────────

/** "01/09/2026", "2026-09-01" hoặc ô ngày của Excel -> Date. */
const parseDate = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Ô nhiều giá trị (kỹ năng, quyền lợi): ngăn bằng dấu phẩy, chấm phẩy hoặc xuống dòng.
 *
 * Dấu phẩy là bắt buộc phải nhận: form đăng tin và trang sửa tin đều tách bằng
 * dấu phẩy. Trước đây import chỉ tách ; và xuống dòng, nên ô "Node.js, MongoDB"
 * thành MỘT kỹ năng — tin import trông khác hẳn tin đăng tay, và mở ra sửa là lệch.
 */
const parseList = (value) =>
  String(value || '')
    .split(/\r?\n|;|,/)
    .map((x) => x.trim())
    .filter(Boolean);

const importJobs = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel (.xlsx) hoặc .csv.' });
    }

    const apply = String(req.body?.apply) === 'true';

    // Admin import hộ doanh nghiệp nào thì truyền employerId; doanh nghiệp tự
    // import thì tin thuộc về chính họ.
    let employerId = req.user._id;
    if (req.user.role === 'admin' && req.body?.employerId) {
      const target = await User.findById(req.body.employerId).select('role');
      if (!target || target.role !== 'employer') {
        return res.status(400).json({ message: 'employerId không phải tài khoản nhà tuyển dụng.' });
      }
      employerId = target._id;
    } else if (req.user.role === 'admin') {
      return res
        .status(400)
        .json({ message: 'Admin cần chọn nhà tuyển dụng sẽ đứng tên các tin này.' });
    }

    let parsed;
    try {
      parsed = excel.parseSheet(req.file.buffer, excel.JOB_COLUMNS);
    } catch (e) {
      return res.status(400).json({ message: `Không đọc được file: ${e.message}` });
    }

    if (parsed.missingColumns.length) {
      return res.status(400).json({
        message: `File thiếu cột bắt buộc: ${parsed.missingColumns.join(', ')}.`,
        data: { headersFound: parsed.headers },
      });
    }
    if (!parsed.rows.length) {
      return res.status(400).json({ message: 'File không có dòng dữ liệu nào.' });
    }

    const { computeJobEmbedding } = require('./jobController');
    const created = [];
    const failed = [];

    for (const row of parsed.rows) {
      if (!row.title || !row.description) {
        failed.push({
          row: row.__row,
          title: row.title || '(trống)',
          reason: 'Thiếu tiêu đề hoặc mô tả công việc',
        });
        continue;
      }

      if (!apply) {
        created.push({ row: row.__row, title: row.title });
        continue;
      }

      try {
        // Giống form đăng tin: kỹ năng bắt buộc + kỹ năng là lợi thế cùng vào
        // requirements, nên cả hai đều được đưa vào vector AI. Bỏ trùng để một
        // kỹ năng ghi ở cả hai cột không bị tính hai lần.
        const requirements = [
          ...new Set([...parseList(row.requiredSkills), ...parseList(row.niceToHaveSkills)]),
        ];
        const payload = {
          employerId,
          title: row.title,
          description: row.description,
          requirements,
          location: row.location || '',
          salary: row.salary || '',
          salaryMin: Number(row.salaryMin) || undefined,
          salaryMax: Number(row.salaryMax) || undefined,
          currency: row.currency || undefined,
          jobType: row.jobType || undefined,
          experience: row.experience || '',
          level: row.level || '',
          industry: row.industry || '',
          specialization: row.specialization || '',
          education: row.education || '',
          benefits: parseList(row.benefits),
          expiresAt: parseDate(row.expiresAt) || undefined,
          status: 'open',
        };

        // Bỏ các khoá undefined để mongoose dùng giá trị mặc định của schema
        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

        const job = await Job.create(payload);

        // Không có vector thì tin không xuất hiện trong gợi ý AI. Lỗi khi tính
        // vector không được làm hỏng việc đăng tin — ghi nhận rồi đi tiếp.
        try {
          const embedding = await computeJobEmbedding(job.title, job.description, requirements);
          if (embedding?.length) {
            job.embedding = embedding;
            await job.save();
          }
        } catch (e) {
          console.warn(`[Import Jobs] Không tạo được vector cho tin ${job._id}: ${e.message}`);
        }

        created.push({
          row: row.__row,
          id: String(job._id),
          title: job.title,
          hasEmbedding: Boolean(job.embedding?.length),
        });
      } catch (e) {
        failed.push({ row: row.__row, title: row.title, reason: e.message });
      }
    }

    if (apply && req.user.role === 'admin') {
      await logAdminAction({
        req,
        action: 'IMPORT_JOBS',
        targetModel: 'Job',
        targetId: null,
        details: { employerId: String(employerId), created: created.length, failed: failed.length },
      });
    }

    const withoutEmbedding = created.filter((c) => c.hasEmbedding === false).length;
    return res.json({
      message: apply
        ? `Đã đăng ${created.length} tin tuyển dụng` +
          (withoutEmbedding ? `, ${withoutEmbedding} tin chưa tạo được vector AI` : '') +
          `. Lỗi ${failed.length}.`
        : `Xem trước: sẽ đăng ${created.length} tin, lỗi ${failed.length}.`,
      data: {
        applied: apply,
        totalRows: parsed.rows.length,
        truncated: parsed.truncated,
        created,
        failed,
      },
    });
  } catch (error) {
    console.error('[Import Jobs]', error);
    res.status(500).json({ message: error.message });
  }
};

// ─── File Excel mẫu ──────────────────────────────────────────────────────────

const downloadTemplate = (req, res) => {
  const kind = req.params.kind;

  const configs = {
    users: {
      columns: excel.STUDENT_COLUMNS,
      example: {
        fullName: 'Nguyễn Văn A',
        studentId: '102210123',
        major: 'Công nghệ Thông tin',
        email: 'nguyenvana@gmail.com',
        phone: '0901234567',
        note: 'Dự kiến tốt nghiệp 06/2027',
      },
      filename: 'mau-import-sinh-vien.xlsx',
    },
    jobs: {
      columns: excel.JOB_COLUMNS,
      example: {
        title: 'Thực tập sinh Lập trình Backend',
        description: 'Tham gia phát triển API cho hệ thống nội bộ.',
        requiredSkills: 'Node.js, MongoDB',
        niceToHaveSkills: 'Docker, AWS',
        location: 'Đà Nẵng',
        salary: '5 - 8 triệu',
        jobType: 'internship',
        experience: 'Không yêu cầu',
        level: 'Thực tập sinh',
        industry: 'technology',
        education: 'Đại học',
        benefits: 'Hỗ trợ ăn trưa, Xét tuyển chính thức sau thực tập',
        expiresAt: '31/12/2026',
      },
      filename: 'mau-import-tin-tuyen-dung.xlsx',
    },
  };

  const cfg = configs[kind];
  if (!cfg) return res.status(404).json({ message: 'Không có mẫu này.' });

  const buffer = excel.buildTemplate(cfg.columns, cfg.example);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${cfg.filename}"`);
  res.send(buffer);
};

module.exports = { importUsers, importJobs, downloadTemplate };
