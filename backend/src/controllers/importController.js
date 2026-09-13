const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Job = require('../models/Job');
const excel = require('../services/excelImport');
const emailService = require('../services/emailService');
const { frontendOrigin } = require('../utils/frontendUrl');
const { logAdminAction } = require('../services/auditLogService');
const { generatePassword } = require('../utils/passwordGenerator');

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
        // Mật khẩu đặt ở đây chỉ là chỗ giữ chỗ và không gửi cho ai. Worker sẽ
        // sinh mật khẩu thật ngay lúc gửi email, nên không có mật khẩu dạng rõ
        // nào tồn tại giữa hai bước.
        const placeholder = await bcrypt.hash(generatePassword(), await bcrypt.genSalt(10));

        await User.create({
          email,
          password: placeholder,
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
          // Xếp hàng chờ worker gửi thư — xem src/services/welcomeEmailWorker.js
          welcomeEmailStatus: 'pending',
          welcomeEmailAttempts: 0,
        });

        created.push({ row: row.__row, email, fullName: row.fullName });
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

    const { getQueueStats } = require('../services/welcomeEmailWorker');
    const queue = apply ? await getQueueStats() : null;

    return res.json({
      message: apply
        ? `Đã tạo ${created.length} tài khoản. Bỏ qua ${skipped.length}, lỗi ${failed.length}. ` +
          `Email chào mừng đang được gửi dần ở nền (${queue.batchSize} thư mỗi 20 giây).`
        : `Xem trước: sẽ tạo ${created.length} tài khoản, bỏ qua ${skipped.length}, lỗi ${failed.length}.`,
      data: {
        applied: apply,
        totalRows: parsed.rows.length,
        truncated: parsed.truncated,
        created,
        skipped,
        failed,
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
