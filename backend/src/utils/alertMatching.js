/** Soft scores / hard filters for JobAlert matching. Soft miss = 0 (not reject). */

const { parseSalaryRange } = require('./salary');

const normalizeText = (str = '') =>
  String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

const matchKeyword = (alertKeyword, job) => {
  const kw = normalizeText(alertKeyword);
  if (!kw) return true;

  const haystack = normalizeText(
    [job.title, job.description, ...(job.requirements || [])].join(' ')
  );

  return kw.split(' ').every((token) => token && haystack.includes(token));
};

// Empty location = all provinces
const matchLocation = (alertLocation, job) => {
  const loc = normalizeText(alertLocation);
  if (!loc) return true;

  const jobLoc = normalizeText(job.location);
  if (!jobLoc) return false;

  return jobLoc.includes(loc) || loc.includes(jobLoc);
};

/** Highest salary found in a salary text ("15 - 25 triệu", "15.000.000đ"), in triệu VND; null if unknown. */
const extractSalaryMillions = (text = '') => {
  const { min, max, currency } = parseSalaryRange(text);
  const top = Math.max(min || 0, max || 0);
  return currency === 'VND' && top > 0 ? top / 1e6 : null;
};

/**
 * Highest salary of a job, in triệu VND. Prefers the numeric columns; falls back
 * to the salary text. Does not scan the description — phone numbers there used
 * to be read as salaries.
 */
const jobSalaryMillions = (job) => {
  if ((job.currency || 'VND') === 'VND') {
    const top = Math.max(job.salaryMin || 0, job.salaryMax || 0);
    if (top > 0) return top / 1e6;
  }
  return extractSalaryMillions(job.salary || '');
};

const scoreSalary = (minSalary, job) => {
  if (!minSalary || minSalary <= 0) return 0;
  const jobSalary = jobSalaryMillions(job);
  if (jobSalary == null) return 0;
  return jobSalary >= minSalary ? 1 : 0;
};

const scoreExperience = (experience, job) => {
  if (!experience) return 0;
  const want = normalizeText(experience);
  const hay = normalizeText(`${job.experience || ''} ${job.level || ''} ${job.description || ''}`);
  return hay.includes(want) ? 1 : 0;
};

const scoreJobType = (jobType, job) => {
  if (!jobType) return 0;
  const want = normalizeText(jobType);
  const hay = normalizeText(`${job.jobType || ''} ${job.description || ''}`);
  return hay.includes(want) ? 1 : 0;
};

const BONUS_PER_CRITERIA = 8;

const matchJobToAlert = (alert, job, aiScore = 0) => {
  if (!matchKeyword(alert.keyword, job)) return null;
  if (!matchLocation(alert.location, job)) return null;

  const matchedBy = [];
  let bonus = 0;

  if (scoreSalary(alert.minSalary, job)) {
    bonus += BONUS_PER_CRITERIA;
    matchedBy.push('Mức lương');
  }
  if (scoreExperience(alert.experience, job)) {
    bonus += BONUS_PER_CRITERIA;
    matchedBy.push('Kinh nghiệm');
  }
  if (scoreJobType(alert.jobType, job)) {
    bonus += BONUS_PER_CRITERIA;
    matchedBy.push('Loại hình');
  }

  matchedBy.unshift('Từ khoá');
  if (alert.location) matchedBy.splice(1, 0, 'Địa điểm');

  const finalScore = Math.min(100, Math.round(aiScore) + bonus);

  return { aiScore: Math.round(aiScore), finalScore, matchedBy };
};

const frequencyIntervalMs = (frequency) =>
  frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

const isAlertDue = (alert) => {
  if (!alert.lastNotifiedAt) return true;
  const elapsed = Date.now() - new Date(alert.lastNotifiedAt).getTime();
  return elapsed >= frequencyIntervalMs(alert.frequency);
};

module.exports = {
  normalizeText,
  matchKeyword,
  matchLocation,
  extractSalaryMillions,
  jobSalaryMillions,
  scoreSalary,
  scoreExperience,
  scoreJobType,
  matchJobToAlert,
  isAlertDue,
  frequencyIntervalMs,
};
