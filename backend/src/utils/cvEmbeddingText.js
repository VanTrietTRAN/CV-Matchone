/**
 * Dựng đoạn text đại diện cho một CV để đưa vào Gemini Embedding.
 *
 * Trước đây logic này bị chép ở 2 chỗ trong cvController (lúc tạo và lúc sửa),
 * mỗi bản lại bỏ sót vài trường khác nhau — ví dụ cả hai đều bỏ qua tên công ty
 * và bậc học, nên CV mất bớt tín hiệu khi so khớp với tin tuyển dụng.
 *
 * Gom về một hàm để hai đường đi luôn sinh ra cùng một đoạn text.
 */

const MAX_CHARS = 3000;

/** Ngưỡng tối thiểu để đáng gọi API — dưới mức này embedding gần như vô nghĩa. */
const MIN_CHARS = 20;

const buildCvEmbeddingText = (profile = {}) => {
  const parts = [];

  if (profile.headline) parts.push(profile.headline);
  if (profile.summary) parts.push(profile.summary);
  if (Array.isArray(profile.skills) && profile.skills.length) {
    parts.push(profile.skills.join(', '));
  }
  if (profile.certifications) parts.push(profile.certifications);

  for (const e of profile.experience || []) {
    const line = [e.position, e.company, e.description].filter(Boolean).join(' - ');
    if (line) parts.push(line);
  }

  for (const e of profile.education || []) {
    const line = [e.degree, e.major, e.school].filter(Boolean).join(' - ');
    if (line) parts.push(line);
  }

  for (const l of profile.languages || []) {
    const line = [l.name, l.level].filter(Boolean).join(' ');
    if (line) parts.push(line);
  }

  return parts.join('. ').trim().substring(0, MAX_CHARS);
};

/** Text có đủ dài để đáng tạo embedding không. */
const isEmbeddable = (text) => Boolean(text) && text.trim().length >= MIN_CHARS;

module.exports = { buildCvEmbeddingText, isEmbeddable, MIN_CHARS, MAX_CHARS };
