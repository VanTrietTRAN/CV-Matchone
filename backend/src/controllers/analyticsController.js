const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const CvProfile = require('../models/CvProfile');

/**
 * Đọc khoảng thời gian từ query. Mặc định 30 ngày gần nhất.
 * `to` được đẩy tới cuối ngày để bộ lọc bao trọn ngày người dùng chọn.
 */
const parseRange = (query) => {
  const now = new Date();
  let from;
  let to = new Date(now);

  if (query.from) {
    const d = new Date(query.from);
    if (!Number.isNaN(d.getTime())) from = d;
  }
  if (query.to) {
    const d = new Date(query.to);
    if (!Number.isNaN(d.getTime())) to = d;
  }
  if (!from) {
    const days = Math.min(Math.max(Number(query.days) || 30, 1), 365);
    from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

/**
 * Gom theo ngày, trả về dãy liên tục kể cả ngày không có dữ liệu,
 * để biểu đồ không bị đứt quãng.
 */
const fillDailySeries = (rows, from, to) => {
  const map = new Map(rows.map((r) => [r._id, r.count]));
  const out = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);

  // Chặn trần 400 điểm để khoảng ngày quá rộng không làm phình response
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
};

const dayBucket = (field) => ({
  $dateToString: { format: '%Y-%m-%d', date: '$' + field },
});

/**
 * GET /api/admin/analytics
 * Quy mô hệ thống, lượng phát sinh trong kỳ, và chuỗi theo ngày.
 */
const getAnalyticsOverview = async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const inRange = { $gte: from, $lte: to };
    const alive = { isDeleted: { $ne: true } };

    const [
      totalUsers,
      totalCandidates,
      totalEmployers,
      bannedUsers,
      totalJobs,
      openJobs,
      totalApplications,
      totalCvs,
      newUsers,
      newCandidates,
      newEmployers,
      newJobs,
      newApplications,
      activeEmployerIds,
      usersSeries,
      jobsSeries,
      appsSeries,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'candidate' }),
      User.countDocuments({ role: 'employer' }),
      User.countDocuments({ status: 'banned' }),
      Job.countDocuments(alive),
      Job.countDocuments({ ...alive, status: 'open' }),
      Application.countDocuments(),
      CvProfile.countDocuments(),

      User.countDocuments({ createdAt: inRange }),
      User.countDocuments({ role: 'candidate', createdAt: inRange }),
      User.countDocuments({ role: 'employer', createdAt: inRange }),
      Job.countDocuments({ ...alive, createdAt: inRange }),
      Application.countDocuments({ appliedAt: inRange }),

      // Doanh nghiệp có đăng ít nhất 1 tin trong kỳ
      Job.distinct('employerId', { ...alive, createdAt: inRange }),

      User.aggregate([
        { $match: { createdAt: inRange } },
        { $group: { _id: dayBucket('createdAt'), count: { $sum: 1 } } },
      ]),
      Job.aggregate([
        { $match: { ...alive, createdAt: inRange } },
        { $group: { _id: dayBucket('createdAt'), count: { $sum: 1 } } },
      ]),
      Application.aggregate([
        { $match: { appliedAt: inRange } },
        { $group: { _id: dayBucket('appliedAt'), count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      range: { from, to },
      data: {
        totals: {
          users: totalUsers,
          candidates: totalCandidates,
          employers: totalEmployers,
          banned: bannedUsers,
          jobs: totalJobs,
          openJobs,
          applications: totalApplications,
          cvs: totalCvs,
        },
        period: {
          users: newUsers,
          candidates: newCandidates,
          employers: newEmployers,
          jobs: newJobs,
          applications: newApplications,
          activeEmployers: activeEmployerIds.length,
        },
        series: {
          users: fillDailySeries(usersSeries, from, to),
          jobs: fillDailySeries(jobsSeries, from, to),
          applications: fillDailySeries(appsSeries, from, to),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/admin/analytics/employers
 * Khối lượng sử dụng của từng doanh nghiệp: tin đã đăng, tin đang mở, hồ sơ nhận được.
 * Lọc theo thời gian, từ khoá, ngưỡng số tin, trạng thái tài khoản; có sắp xếp và phân trang.
 */
const getEmployerUsage = async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const sortKey = ['jobs', 'openJobs', 'applications', 'createdAt'].includes(req.query.sortBy)
      ? req.query.sortBy
      : 'jobs';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;

    const userMatch = { role: 'employer' };
    if (req.query.status === 'active' || req.query.status === 'banned') {
      userMatch.status = req.query.status;
    }
    if (req.query.search) {
      // Escape để ký tự regex trong ô tìm kiếm không làm hỏng truy vấn
      const safe = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (safe) userMatch.email = { $regex: safe, $options: 'i' };
    }

    // Tin và hồ sơ đếm trong khoảng đã lọc; còn tài khoản thì tính toàn bộ.
    const rangeFilter = { $gte: from, $lte: to };

    const basePipeline = [
      { $match: userMatch },
      {
        $lookup: {
          from: 'jobs',
          let: { uid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$employerId', '$$uid'] },
                isDeleted: { $ne: true },
                createdAt: rangeFilter,
              },
            },
            { $project: { status: 1 } },
          ],
          as: 'jobDocs',
        },
      },
      {
        $lookup: {
          from: 'companyprofiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'company',
        },
      },
      {
        $addFields: {
          jobs: { $size: '$jobDocs' },
          openJobs: {
            $size: {
              $filter: { input: '$jobDocs', as: 'j', cond: { $eq: ['$$j.status', 'open'] } },
            },
          },
          jobIds: '$jobDocs._id',
          companyName: { $ifNull: [{ $arrayElemAt: ['$company.companyName', 0] }, ''] },
          industry: { $ifNull: [{ $arrayElemAt: ['$company.industry', 0] }, ''] },
        },
      },
      {
        $lookup: {
          from: 'applications',
          let: { ids: '$jobIds' },
          pipeline: [
            {
              $match: {
                $expr: { $in: ['$jobId', { $ifNull: ['$$ids', []] }] },
                appliedAt: rangeFilter,
              },
            },
            { $count: 'n' },
          ],
          as: 'appCount',
        },
      },
      {
        $addFields: {
          applications: { $ifNull: [{ $arrayElemAt: ['$appCount.n', 0] }, 0] },
        },
      },
    ];

    const minJobs = Number(req.query.minJobs);
    if (minJobs > 0) {
      basePipeline.push({ $match: { jobs: { $gte: minJobs } } });
    }

    basePipeline.push({
      $project: {
        email: 1,
        status: 1,
        createdAt: 1,
        companyName: 1,
        industry: 1,
        jobs: 1,
        openJobs: 1,
        applications: 1,
      },
    });

    const [rows, countRes, totalsRes] = await Promise.all([
      User.aggregate([
        ...basePipeline,
        { $sort: { [sortKey]: sortDir, _id: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]),
      User.aggregate([...basePipeline, { $count: 'n' }]),
      User.aggregate([
        ...basePipeline,
        {
          $group: {
            _id: null,
            jobs: { $sum: '$jobs' },
            applications: { $sum: '$applications' },
            employers: { $sum: 1 },
          },
        },
      ]),
    ]);

    const total = countRes[0] ? countRes[0].n : 0;
    const sums = totalsRes[0] || { jobs: 0, applications: 0, employers: 0 };

    res.json({
      range: { from, to },
      data: rows,
      summary: {
        employers: sums.employers,
        jobs: sums.jobs,
        applications: sums.applications,
        avgJobsPerEmployer: sums.employers
          ? Number((sums.jobs / sums.employers).toFixed(1))
          : 0,
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getAnalyticsOverview, getEmployerUsage };
