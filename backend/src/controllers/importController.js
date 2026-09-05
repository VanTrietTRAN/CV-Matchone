const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Job = require('../models/Job');
const excel = require('../services/excelImport');
const emailService = require('../services/emailService');
const { frontendOrigin } = require('../utils/frontendUrl');
const { logAdminAction } = require('../services/auditLogService');

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

const MIN_PASSWORD_LENGTH = 9;

/**
 * Mật khẩu tạm ngẫu nhiên, dễ đọc để chép từ email.
 * Bỏ các ký tự dễ nhìn nhầm: 0/O, 1/l/I.
 */
const generatePassword = () => {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < MIN_PASSWORD_LENGTH; i += 1) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
    // Chèn gạch nối cho dễ đọc, không tính vào độ dài yêu cầu
    if (i === 3) out += '-';
  }
  return out;
};

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

// ─── Import tài khoản sinh viên ──────────────────────────────────────────────

const importUsers = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel (.xlsx) hoặc .csv.' });
    }

    // Mặc định là chạy thử. Phải gửi apply=true mới thật sự tạo tài khoản.
    const apply = String(req.body?.apply) === 'true';

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
    if (!parsed.rows.length) {
      return res.status(400).json({ message: 'File không có dòng dữ liệu nào.' });
    }

    const created = [];
    const skipped = [];
    const failed = [];
    const seenInFile = new Set();

    for (const row of parsed.rows) {
      const email = String(row.email || '').toLowerCase().trim();
      const label = `Dòng ${row.__row}`;

      if (!row.fullName) {
        failed.push({ row: row.__row, email, reason: 'Thiếu họ tên' });
        continue;
      }
      if (!isValidEmail(email)) {
        failed.push({ row: row.__row, email: row.email, reason: 'Email không hợp lệ' });
        continue;
      }
      // Trùng ngay trong file — Excel dán từ nhiều nguồn rất hay bị
      if (seenInFile.has(email)) {
        skipped.push({ row: row.__row, email, reason: 'Trùng email với dòng phía trên' });
        continue;
      }
      seenInFile.add(email);

      const exists = await User.findOne({ email });
      if (exists) {
        skipped.push({ row: row.__row, email, reason: 'Email đã có tài khoản' });
        continue;
      }

      if (!apply) {
        created.push({ row: row.__row, email, fullName: row.fullName });
        continue;
      }

      try {
        const password = generatePassword();
        const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));

        const user = await User.create({
          email,
          password: hashed,
          role: 'candidate',
          fullName: row.fullName,
          major: row.major || '',
          phone: row.phone || '',
          note: row.note || '',
          // Admin tạo hộ nên coi như email đã được nhà trường xác nhận; nếu bắt
          // xác thực nữa thì sinh viên phải làm hai bước cho cùng một việc.
          emailVerified: true,
          mustChangePassword: true,
          importedAt: new Date(),
        });

        const sendResult = await emailService.sendAccountCreatedEmail({
          user,
          password,
        });

        created.push({
          row: row.__row,
          email,
          fullName: row.fullName,
          emailSent: sendResult?.sent === true,
          emailError: sendResult?.sent === false ? sendResult.error : undefined,
        });
      } catch (e) {
        failed.push({ row: row.__row, email, reason: e.message });
      }
    }

    if (apply) {
      await logAdminAction({
        req,
        action: 'IMPORT_USERS',
        targetModel: 'User',
        targetId: null,
        details: { created: created.length, skipped: skipped.length, failed: failed.length },
      });
    }

    const emailFailures = created.filter((c) => c.emailSent === false).length;
    return res.json({
      message: apply
        ? `Đã tạo ${created.length} tài khoản` +
          (emailFailures ? `, trong đó ${emailFailures} tài khoản chưa gửi được email` : '') +
          `. Bỏ qua ${skipped.length}, lỗi ${failed.length}.`
        : `Xem trước: sẽ tạo ${created.length} tài khoản, bỏ qua ${skipped.length}, lỗi ${failed.length}.`,
      data: {
        applied: apply,
        totalRows: parsed.rows.length,
        truncated: parsed.truncated,
        created,
        skipped,
        failed,
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

/** Ô "Yêu cầu" và "Quyền lợi" cho phép nhiều dòng hoặc ngăn bằng dấu ; */
const parseList = (value) =>
  String(value || '')
    .split(/\r?\n|;/)
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
        const requirements = parseList(row.requirements);
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
        major: 'Công nghệ Thông tin',
        email: 'nguyenvana@sv.edu.vn',
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
        requirements: 'Biết Node.js;Có kiến thức cơ sở dữ liệu',
        location: 'Đà Nẵng',
        salary: '5 - 8 triệu',
        jobType: 'internship',
        experience: 'Không yêu cầu',
        level: 'Thực tập sinh',
        industry: 'technology',
        education: 'Đại học',
        benefits: 'Hỗ trợ ăn trưa;Xét tuyển chính thức sau thực tập',
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

module.exports = { importUsers, importJobs, downloadTemplate, generatePassword };
