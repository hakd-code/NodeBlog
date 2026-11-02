// slug 生成：8 位 Crockford Base32 风格字符表（剔除 0/1/i/l/o 等易混字符），约 10^12 组合
import { randomInt } from 'node:crypto';

export const SLUG_CHARS = '23456789abcdefghjkmnpqrstuvwxyz'; // 32 个安全字符

export function randomSlug(length = 8) {
  let slug = '';
  for (let i = 0; i < length; i++) slug += SLUG_CHARS[randomInt(SLUG_CHARS.length)];
  return slug;
}

/** 生成不与 existing(Set 或 查询函数) 冲突的 slug，冲突自动重试 */
export function generateSlug(isTaken) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = randomSlug(8);
    if (!isTaken(slug)) return slug;
  }
  throw new Error('slug 生成失败：冲突过多');
}

export function isValidSlug(slug) {
  return /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/.test(String(slug));
}
