const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Job = require('../models/Job');
const excel = require('../services/excelImport');
const emailService = require('../services/emailService');
const { frontendOrigin } = require('../utils/frontendUrl');
const { logAdminAction } = require('../services/auditLogService');
const { generatePassword } = require('../utils/passwordGenerator');
const hygiene = require('../services/mail/hygiene');
const governor = require('../services/mail/governor');
const { INVITE_MAX_SENDS, INVITE_RESEND_GAP_MS } = require('../services/mail/policy');
const {
  parseMoney,
  parseSalaryRange,
  normalizeCurrency,
  restoreThousands,
  formatSalary,
} = require('../utils/salary');
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
 * Lọc danh sách trước khi import (Pre-Flight Hygiene) — danh sách import là danh
 * sách lạnh, mỗi địa chỉ hỏng là một hard bounce kéo uy tín tên miền xuống:
 *   1. cú pháp + tên miền gõ nhầm (gmial.com, gmai.com...) → loại;
 *   2. tên miền không có bản ghi MX → loại (DNS chập chờn thì chỉ cảnh báo);
 *   3. địa chỉ đã nằm trong danh sách chặn (từng hard bounce/báo spam) → bỏ qua.
 * Kiểm tra MX và danh sách chặn làm MỘT lượt cho cả file trước vòng lặp.
 */
const preflight = async (rows) => {
  const emails = rows.map((r) => hygiene.normalizeEmail(r.email)).filter((e) => !hygiene.syntaxProblem(e));
  const [domains, blocked] = await Promise.all([
    hygiene.checkDomains(emails),
    governor.suppressedAmong(emails),
  ]);
  return {
    /** @returns {{fail?: string, skip?: string, warn?: string}} */
    check(email) {
      const syntax = hygiene.syntaxProblem(email);
      if (syntax) return { fail: syntax };
      const mx = domains.get(hygiene.domainOf(email));
      if (mx && !mx.ok) return { fail: mx.reason };
      if (blocked.has(email)) {
        return { skip: `Địa chỉ nằm trong danh sách chặn (${blocked.get(email)}) — gửi tiếp sẽ hại uy tín tên miền` };
      }
      if (mx?.uncertain) return { warn: mx.reason };
      return {};
    },
  };
};

/** Đã gửi bao nhiêu thư mời (tài khoản gửi trước khi có bộ đếm thì tính từ trạng thái). */
const invitesSent = (user) =>
  Math.max(user.welcomeEmailSendCount || 0, user.welcomeEmailSentAt || user.welcomeEmailStatus === 'sent' ? 1 : 0);

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
  if (invitesSent(user) >= INVITE_MAX_SENDS) {
    return { skip: `Đã gửi đủ ${INVITE_MAX_SENDS} thư (1 thư mời + 1 thư nhắc) — không gửi thêm` };
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
    const hygieneCheck = await preflight(parsed.rows);
    // Mỗi file một mã lô: breaker dừng riêng lô sinh nhiều hard bounce
    const importBatchId = apply ? hygiene.newImportBatchId('stu') : null;

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
      const hy = hygieneCheck.check(email);
      if (hy.fail) {
        failed.push({ row: row.__row, email, reason: hy.fail });
        continue;
      }
      if (hy.skip) {
        skipped.push({ row: row.__row, email, reason: hy.skip });
        continue;
      }
      if (hy.warn) warnings.push({ row: row.__row, email, reason: hy.warn });
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
        // Email đang thuộc tài khoản doanh nghiệp/admin: tuyệt đối không gắn MSSV
        // và hàng đợi thư mời sinh viên lên đó (trước đây ghi đè thẳng).
        if (existing.role !== 'candidate') {
          const roleLabel = existing.role === 'admin' ? 'quản trị viên' : 'doanh nghiệp';
          failed.push({ row: row.__row, email, reason: `Email này đang là tài khoản ${roleLabel}` });
          continue;
        }
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
                  importBatchId,
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
          importBatchId,
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
          importBatchId,
        },
      });
    }

    const { getQueueStats } = require('../services/welcomeEmailWorker');
    const queue = apply ? await getQueueStats() : null;

    const resendText = sendSchoolEmail ? `, gửi bù ${requeued.length} thư tới email trường` : '';
    return res.json({
      message: apply
        ? `Đã tạo ${created.length} tài khoản${resendText}. Bỏ qua ${skipped.length}, lỗi ${failed.length}. ` +
          `Thư mời gửi dần ở nền (tối đa ${queue.hourlyCap} thư/giờ, ${queue.dailyCap} lượt hôm nay). Mã lô: ${importBatchId}.`
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
        importBatchId,
      },
    });
  } catch (error) {
    console.error('[Import Users]', error);
    res.status(500).json({ message: error.message });
  }
};

// ─── Import tài khoản doanh nghiệp ───────────────────────────────────────────

/**
 * Doanh nghiệp đã có trong hệ thống: gửi lại thư mời hay bỏ qua?
 *
 * Cùng tinh thần với `decideSchoolResend` của sinh viên — chỉ gửi lại khi chắc
 * chắn không đè lên mật khẩu mà người ta đang dùng:
 *   - Tự đăng ký: mật khẩu do chính họ đặt, tuyệt đối không cấp mật khẩu tạm.
 *   - Đã đổi mật khẩu lần đầu: đang dùng bình thường, không cần thư nữa.
 *   - Đang chờ trong hàng đợi: thư sắp gửi rồi, xếp lại chỉ tổ gửi hai lần.
 *   - Còn lại (gửi hỏng, hoặc đã gửi mà chưa ai đăng nhập): xếp lại hàng đợi,
 *     worker sinh mật khẩu mới ngay lúc gửi nên mật khẩu trong thư cũ hết hiệu lực.
 */
const decideEmployerResend = (user) => {
  if (!user.importedAt) {
    return { skip: 'Doanh nghiệp tự đăng ký — không cấp lại mật khẩu tạm' };
  }
  if (user.mustChangePassword !== true) {
    return { skip: 'Doanh nghiệp đã đổi mật khẩu, tài khoản đang hoạt động' };
  }
  if (user.welcomeEmailStatus === 'pending') {
    return { skip: 'Thư mời đang chờ gửi trong hàng đợi' };
  }
  if (user.welcomeEmailStatus === 'failed') {
    return { label: 'Thư mời gửi hỏng — xếp lại hàng đợi' };
  }
  // Tối đa 1 thư mời + 1 thư nhắc, thư nhắc cách thư trước ít nhất 7 ngày:
  // người không mở thư mời thì gửi dồn thêm chỉ tổ bị bấm "Báo cáo spam".
  if (invitesSent(user) >= INVITE_MAX_SENDS) {
    return { skip: `Đã gửi đủ ${INVITE_MAX_SENDS} thư (1 thư mời + 1 thư nhắc) — không gửi thêm` };
  }
  if (user.welcomeEmailSentAt && Date.now() - new Date(user.welcomeEmailSentAt) < INVITE_RESEND_GAP_MS) {
    return { skip: 'Thư mời vừa gửi chưa đủ 7 ngày — chờ rồi mới gửi thư nhắc' };
  }
  return { label: 'Đã gửi thư mời nhưng chưa đăng nhập lần nào — gửi thư nhắc' };
};

/**
 * Chỉ điền vào những ô hồ sơ công ty đang trống.
 *
 * File Excel của admin là dữ liệu ban đầu; nếu doanh nghiệp đã tự sửa tên, số
 * điện thoại hay địa chỉ trong trang hồ sơ của họ thì lần import sau không được
 * ghi đè lên — đó là dữ liệu của họ, mới hơn dữ liệu trong file.
 */
const fillEmptyProfileFields = (profile, row) => {
  const patch = {};
  if (!profile.companyName && row.companyName) patch.companyName = row.companyName;
  if (!profile.phone && row.phone) patch.phone = row.phone;
  if (!profile.address && row.address) patch.address = row.address;
  return patch;
};

const importEmployers = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel (.xlsx) hoặc .csv.' });
    }

    const apply = String(req.body?.apply) === 'true';

    let parsed;
    try {
      parsed = excel.parseSheet(req.file.buffer, excel.COMPANY_COLUMNS);
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

    const CompanyProfile = require('../models/CompanyProfile');
    const created = [];
    const requeued = [];
    const skipped = [];
    const failed = [];
    const warnings = [];
    const seenEmails = new Set();
    const hygieneCheck = await preflight(parsed.rows);
    const importBatchId = apply ? hygiene.newImportBatchId('emp') : null;

    for (const row of parsed.rows) {
      const email = String(row.email || '').toLowerCase().trim();
      const companyName = String(row.companyName || '').trim();

      if (!companyName) {
        failed.push({ row: row.__row, email, reason: 'Thiếu tên doanh nghiệp' });
        continue;
      }
      if (!isValidEmail(email)) {
        failed.push({ row: row.__row, email: row.email, reason: 'Email không hợp lệ' });
        continue;
      }
      const hy = hygieneCheck.check(email);
      if (hy.fail) {
        failed.push({ row: row.__row, email, reason: hy.fail });
        continue;
      }
      if (hy.skip) {
        skipped.push({ row: row.__row, email, reason: hy.skip });
        continue;
      }
      if (hy.warn) warnings.push({ row: row.__row, email, reason: hy.warn });
      // Email vừa là khoá chính vừa là tên đăng nhập: trùng trong cùng một file
      // thì dòng sau không tạo thêm được gì, chỉ làm tưởng đã tạo hai tài khoản.
      if (seenEmails.has(email)) {
        skipped.push({ row: row.__row, email, reason: 'Trùng email với dòng phía trên' });
        continue;
      }
      seenEmails.add(email);

      const existing = await User.findOne({ email });

      if (existing) {
        if (existing.role !== 'employer') {
          const roleLabel = existing.role === 'admin' ? 'quản trị viên' : 'ứng viên';
          failed.push({
            row: row.__row,
            email,
            reason: `Email này đang là tài khoản ${roleLabel}, không chuyển thành doanh nghiệp được`,
          });
          continue;
        }

        const decision = decideEmployerResend(existing);
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
                  welcomeEmailStatus: 'pending',
                  welcomeEmailTo: 'personal',
                  welcomeEmailAttempts: 0,
                  importBatchId,
                },
                $unset: { welcomeEmailError: '' },
              },
            );

            const profile = await CompanyProfile.findOne({ userId: existing._id });
            if (!profile) {
              await CompanyProfile.create({
                userId: existing._id,
                companyName,
                phone: row.phone || '',
                address: row.address || '',
              });
            } else {
              const patch = fillEmptyProfileFields(profile, { ...row, companyName });
              if (Object.keys(patch).length) {
                await CompanyProfile.updateOne({ _id: profile._id }, { $set: patch });
              }
            }
          }
          requeued.push({
            row: row.__row,
            email,
            fullName: companyName,
            sendTo: 'personal',
            reason: decision.label,
          });
        } catch (e) {
          failed.push({ row: row.__row, email, reason: e.message });
        }
        continue;
      }

      // ── Doanh nghiệp mới ──
      if (!apply) {
        created.push({ row: row.__row, email, fullName: companyName, sendTo: 'personal' });
        continue;
      }

      try {
        // Như import sinh viên: mật khẩu ở đây chỉ để giữ chỗ và không gửi cho ai.
        // Worker sinh mật khẩu thật ngay lúc gửi thư, nên giữa hai bước không tồn
        // tại mật khẩu dạng rõ nào trong database.
        const placeholder = await bcrypt.hash(generatePassword(), await bcrypt.genSalt(10));

        const user = await User.create({
          email,
          password: placeholder,
          role: 'employer',
          fullName: companyName,
          phone: row.phone || '',
          // Admin nhập hộ nên coi như địa chỉ đã được xác nhận; bắt doanh nghiệp
          // xác thực thêm một lần nữa là làm hai bước cho cùng một việc.
          emailVerified: true,
          mustChangePassword: true,
          importedAt: new Date(),
          welcomeEmailStatus: 'pending',
          welcomeEmailTo: 'personal',
          welcomeEmailAttempts: 0,
          importBatchId,
        });

        // Hồ sơ công ty phải có ngay: tên công ty hiện trên mọi tin tuyển dụng và
        // trong chính thư mời gửi đi. Tạo hồ sơ hỏng thì xoá luôn tài khoản vừa
        // tạo — không để lại User mồ côi đang chờ gửi thư mời.
        try {
          await CompanyProfile.create({
            userId: user._id,
            companyName,
            phone: row.phone || '',
            address: row.address || '',
          });
        } catch (e) {
          await User.deleteOne({ _id: user._id });
          throw e;
        }

        created.push({ row: row.__row, email, fullName: companyName, sendTo: 'personal' });
      } catch (e) {
        failed.push({ row: row.__row, email, reason: e.message });
      }
    }

    if (apply) {
      await logAdminAction({
        req,
        action: 'IMPORT_EMPLOYERS',
        targetModel: 'User',
        targetId: null,
        details: {
          created: created.length,
          requeued: requeued.length,
          skipped: skipped.length,
          failed: failed.length,
          importBatchId,
        },
      });
    }

    const { getQueueStats } = require('../services/welcomeEmailWorker');
    const queue = apply ? await getQueueStats({ role: 'employer' }) : null;

    return res.json({
      message: apply
        ? `Đã tạo ${created.length} tài khoản doanh nghiệp` +
          (requeued.length ? `, gửi lại thư mời cho ${requeued.length} doanh nghiệp` : '') +
          `. Bỏ qua ${skipped.length}, lỗi ${failed.length}. ` +
          `Thư mời gửi dần ở nền (tối đa ${queue.hourlyCap} thư/giờ, ${queue.dailyCap} lượt hôm nay). Mã lô: ${importBatchId}.`
        : `Xem trước: sẽ tạo ${created.length} tài khoản doanh nghiệp` +
          (requeued.length ? `, gửi lại ${requeued.length} thư mời` : '') +
          `, bỏ qua ${skipped.length}, lỗi ${failed.length}.`,
      data: {
        applied: apply,
        totalRows: parsed.rows.length,
        truncated: parsed.truncated,
        created,
        requeued,
        skipped,
        failed,
        warnings,
        // Thư mời doanh nghiệp chỉ gửi tới một địa chỉ nên mỗi tài khoản tốn 1 lượt
        quotaUnits: created.length + requeued.length,
        queue,
        importBatchId,
      },
    });
  } catch (error) {
    console.error('[Import Employers]', error);
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

/**
 * Ba cột lương của một dòng -> { fields: salaryMin / salaryMax / currency / salary, warning }.
 *
 * Ô "178.000" là 178 nghìn theo cách viết Việt Nam; Number() của JavaScript lại
 * đọc thành 178, nên phải qua parseMoney. Excel để định dạng Mỹ còn lưu sẵn ô đó
 * thành con số 178, nên lương đồng / yên dưới 1.000 được hiểu lại là hàng nghìn
 * và báo thành một dòng "Lưu ý" để người import kiểm tra.
 * Chỉ điền cột "Mức lương" dạng chữ ("5 - 8 triệu") thì bóc ra số, để thẻ tin
 * trong danh sách và trang chi tiết hiện cùng một mức lương.
 */
// Số gốc trong câu lưu ý, ghi theo lối Việt: 179.667 (kiểu Mỹ) -> "179,667"
const VI_RAW = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });

const readSalary = (row) => {
  let min = parseMoney(row.salaryMin);
  let max = parseMoney(row.salaryMax);
  let currency = normalizeCurrency(row.currency);

  if (min == null && max == null && row.salary) {
    const parsed = parseSalaryRange(row.salary);
    min = parsed.min;
    max = parsed.max;
    currency = currency || parsed.currency;
  }
  currency = currency || 'VND';

  const fixedMin = restoreThousands(min, currency);
  const fixedMax = restoreThousands(max, currency);
  const restored = (v, fixed) => typeof v === 'number' && fixed !== Math.round(v);
  const warning =
    restored(min, fixedMin) || restored(max, fixedMax)
      ? `Lương ghi ${[...new Set([min, max].filter((v) => v > 0))].map((v) => VI_RAW.format(v)).join(' - ')} ${currency} quá thấp, ` +
        `đã hiểu là ${formatSalary(fixedMin, fixedMax, currency)}. ` +
        'Ghi số đủ, dấu chấm ngăn hàng nghìn: 176.000.'
      : null;
  min = fixedMin;
  max = fixedMax;

  const hasNumbers = (min || 0) > 0 || (max || 0) > 0;
  return {
    fields: {
      salaryMin: min > 0 ? min : undefined,
      salaryMax: max > 0 ? max : undefined,
      currency,
      // Có số thì dựng lại chuỗi cho khớp; không có (vd "Thoả thuận") thì giữ chữ gốc
      salary: hasNumbers ? formatSalary(min, max, currency) : row.salary || '',
    },
    warning,
  };
};

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
    const warnings = [];

    for (const row of parsed.rows) {
      if (!row.title || !row.description) {
        failed.push({
          row: row.__row,
          title: row.title || '(trống)',
          reason: 'Thiếu tiêu đề hoặc mô tả công việc',
        });
        continue;
      }

      // Đọc lương cả ở bước xem trước để lưu ý hiện ra trước khi bấm xác nhận
      const pay = readSalary(row);
      if (pay.warning) {
        warnings.push({ row: row.__row, title: row.title, reason: pay.warning });
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
          ...pay.fields,
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
        warnings,
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
    employers: {
      columns: excel.COMPANY_COLUMNS,
      example: {
        companyName: 'Công ty TNHH Công nghệ Mẫu',
        phone: '0236 123 4567',
        email: 'tuyendung@congtymau.vn',
        address: '54 Nguyễn Lương Bằng, Liên Chiểu, Đà Nẵng',
      },
      filename: 'mau-import-doanh-nghiep.xlsx',
    },
    jobs: {
      columns: excel.JOB_COLUMNS,
      example: {
        title: 'Thực tập sinh Lập trình Backend',
        description: 'Tham gia phát triển API cho hệ thống nội bộ.',
        requiredSkills: 'Node.js, MongoDB',
        niceToHaveSkills: 'Docker, AWS',
        location: 'Đà Nẵng',
        // Số tiền ghi theo lối Việt Nam: dấu chấm ngăn hàng nghìn
        salaryMin: '5.000.000',
        salaryMax: '8.000.000',
        currency: 'VND',
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

module.exports = { importUsers, importEmployers, importJobs, downloadTemplate };
