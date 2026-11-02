// hexo → 本博客 一次性迁移脚本
// 用法：npm run migrate:hexo -- <hexo根目录> [--draft]
// 1. 读取 source/_posts/*.md 解析 front-matter（title/date/tags/categories/cover/abbrlink）
// 2. 文章入库为 published，保留原发布日期；本地图资源拷入媒体库并替换文中链接
// 3. 由 permalink 规则反推旧 URL，写入 url_maps → 上线后旧链接 301 到新 slug
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { openDb } from './db.js';
import { renderMarkdown, createRenderer } from './lib/markdown.js';
import { parseFrontMatter } from './lib/frontmatter.js';
import { LocalStorage } from './lib/storage.js';
import { processImage } from './lib/images.js';
import { sniff } from './lib/magic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const hexoRoot = args.find((a) => !a.startsWith('--'));
const includeDrafts = args.includes('--draft');

/* ---------- CLI 主流程（被直接执行时才运行；import 该模块做测试不会触发） ---------- */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  runMigration().catch((err) => {
    console.error('[blog] 迁移失败:', err.message);
    process.exit(1);
  });
}

async function runMigration() {
  if (!hexoRoot || !existsSync(hexoRoot)) {
    console.error('用法: npm run migrate:hexo -- <hexo根目录>');
    process.exit(1);
  }
  const db = openDb(process.env.DB_PATH || join(__dirname, '..', 'data', 'blog.db'), {
    adminUser: process.env.ADMIN_USER || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  });
  const storage = new LocalStorage(process.env.UPLOADS_DIR || join(__dirname, '..', 'data', 'uploads'));
  const md = createRenderer();
  const result = await migrate({ hexoRoot, includeDrafts, db, storage, md, log: console.log });
  console.log('[blog] 旧 hexo 链接已写入 url_maps，上线后自动 301 到新 slug');
  db.close();
  return result;
}

/** 迁移核心（可测试） */
export async function migrate({ hexoRoot: root, includeDrafts: drafts, db: database, storage: store, md: renderer, log = () => {} }) {
  const postsDir = join(root, 'source', '_posts');
  if (!existsSync(postsDir)) throw new Error(`未找到 ${postsDir}`);

  const files = readdirSync(postsDir).filter((f) => extname(f).toLowerCase() === '.md');
  log(`[blog] 发现 ${files.length} 篇 hexo 文章`);

  const mediaCache = new Map();

  async function importLocalImage(absPath) {
    if (mediaCache.has(absPath)) return mediaCache.get(absPath);
    if (!existsSync(absPath)) return null;
    const buffer = readFileSync(absPath);
    const info = sniff(buffer);
    if (!info || info.kind !== 'image') return null;
    const hash = createHash('sha256').update(buffer).digest('hex');
    const existing = database.findMediaByHash(hash);
    if (existing) { mediaCache.set(absPath, existing); return existing; }
    const processed = await processImage(buffer);
    const storageKey = store.assetKey(hash, info.ext);
    const thumbKey = storageKey.replace(/(\.[^.]+)$/, '.thumb.webp');
    store.saveBuffer(storageKey, buffer);
    store.saveBuffer(thumbKey, processed.thumb);
    const id = database.insertMedia({
      hash, storage_key: storageKey, thumb_key: thumbKey, mime: info.mime,
      size: buffer.length, origin_name: basename(absPath), kind: 'image',
      width: processed.width, height: processed.height,
    });
    const media = database.getMedia(id);
    mediaCache.set(absPath, media);
    return media;
  }

  async function rewriteLocalImages(mdBody, mdFileDir) {
    const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = [...mdBody.matchAll(imgRe)];
    let out = mdBody;
    for (const match of matches) {
      const alt = match[1];
      const rawUrl = match[2].trim().split(/\s+/)[0];
      if (/^https?:\/\//.test(rawUrl) || rawUrl.startsWith('/media/') || rawUrl.startsWith('data:')) continue;
      const rel = rawUrl.replace(/^\.\//, '').replace(/^\//, '');
      const absPath = join(mdFileDir, rel);
      const media = await importLocalImage(absPath);
      if (media) {
        out = out.replace(match[0], `![${alt}](/media/${media.storage_key})`);
      }
    }
    return out;
  }

  let imported = 0, skipped = 0;
  for (const file of files) {
    const full = join(postsDir, file);
    if (!statSync(full).isFile()) continue;
    const raw = readFileSync(full, 'utf8');
    const { data, body } = parseFrontMatter(raw);
    if (data.published === false && !drafts) { skipped++; continue; }
    if (String(data.draft) === 'true' && !drafts) { skipped++; continue; }

    const mdBody = await rewriteLocalImages(body, dirname(full));
    const rendered = renderMarkdown(renderer, mdBody);
    const publishedAt = data.date ? new Date(data.date).toISOString() : undefined;
    const slug = database.newSlug();
    const postId = database.insertPost({
      slug,
      title: String(data.title || file.replace(/\.md$/i, '')),
      summary: String(data.excerpt || rendered.summary),
      content_md: mdBody,
      content_html: rendered.html,
      toc_html: rendered.tocHtml,
      status: 'published',
      published_at: publishedAt,
    });
    database.setPostTags(postId, [
      ...(Array.isArray(data.tags) ? data.tags : []),
      ...(Array.isArray(data.categories) ? data.categories : []),
    ]);

    for (const oldPath of hexoOldPaths(data, file)) database.addUrlMap(oldPath, postId);

    imported++;
    log(`  ✓ ${data.title || file} → /post/${slug}`);
  }

  log(`[blog] 迁移完成：导入 ${imported} 篇，跳过 ${skipped} 篇；本地图入库 ${mediaCache.size} 张`);
  return { imported, skipped };
}

/** 由 hexo permalink 规则反推旧 URL（常见约定全覆盖） */
export function hexoOldPaths(data, fileName) {
  const date = data.date ? new Date(data.date) : new Date();
  const yy = String(date.getFullYear()).slice(-2); // 两位年，如 24
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const title = String(data.abbrlink || fileName.replace(/\.md$/i, ''));
  const paths = new Set();
  paths.add(`/${yyyy}/${mm}/${dd}/${title}/`);
  paths.add(`/${yy}/${mm}/${dd}/${title}/`);
  paths.add(`/posts/${title}/`);
  paths.add(`/${title}/`);
  if (data.abbrlink) paths.add(`/posts/${data.abbrlink}.html`);
  return [...paths];
}
