// Express 应用装配（博客）
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { openDb } from './db.js';
import { hashPassword, verifyPassword, signJWT, verifyJWT, requireAdmin } from './lib/auth.js';
import { LocalStorage } from './lib/storage.js';
import { UploadManager, UploadError } from './lib/uploader.js';
import { processImage } from './lib/images.js';
import { sniff } from './lib/magic.js';
import { createRenderer, renderMarkdown } from './lib/markdown.js';
import { loadConfigs, saveConfigs, CONFIG_DEFAULTS } from './lib/configs.js';
import { frontLayout } from './views/front-layout.js';
import { homePage, tagPage, friendsPage, aboutPage } from './views/front-pages.js';
import { postPage } from './views/front-post.js';
import {
  loginPage, dashboardPage, postsPage, editorPage, commentsPage, friendsAdminPage, settingsPage, donationsPage,
} from './views/admin-pages.js';
import { thanksPage, searchPage } from './views/front-pages.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp({
  dbPath = join(__dirname, '..', 'data', 'blog.db'),
  uploadsDir = join(__dirname, '..', 'data', 'uploads'),
  adminUser = process.env.ADMIN_USER || 'admin',
  adminPassword = process.env.ADMIN_PASSWORD || 'admin123',
  chunkSize,
} = {}) {
  const db = openDb(dbPath, { adminUser, adminPassword });
  const storage = new LocalStorage(uploadsDir);
  const md = createRenderer({
    mediaLookup: (href) => {
      const m = /\/media\/([a-z0-9./_-]+)/i.exec(href);
      if (!m) return null;
      return db.listMedia(500).find((x) => x.storage_key === m[1]) || null;
    },
  });
  const app = express();
  app.disable('x-powered-by');
  // 简易 Cookie 解析（免依赖，后台页面会话用）
  app.use((req, res, next) => {
    req.cookies = {};
    const raw = req.headers.cookie;
    if (raw) {
      for (const pair of raw.split(';')) {
        const idx = pair.indexOf('=');
        if (idx > 0) req.cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
      }
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const uploadManager = new UploadManager(db, storage, createMediaFromBuffer, {
    chunkSize: chunkSize ?? Number(process.env.UPLOAD_CHUNK_SIZE || 4 * 1024 * 1024),
  });

  /** 入库回调：媒体库（图片/视频/附件统一），图片走 sharp 流水线 */
  async function createMediaFromBuffer(buffer, filename, declaredHash) {
    const info = sniff(buffer);
    if (!info) throw new UploadError('不支持的文件类型（白名单：jpg/png/webp/gif/avif/mp4/zip/rar/7z）', 415);
    const existing = db.findMediaByHash(declaredHash);
    if (existing) return { assetId: existing.id, deduped: true };

    let storageKey;
    let thumbKey = null;
    let width = null, height = null;
    if (info.kind === 'image') {
      const processed = await processImage(buffer);
      storageKey = storage.assetKey(declaredHash, info.ext);
      thumbKey = storageKey.replace(/(\.[^.]+)$/, '.thumb.webp');
      storage.saveBuffer(storageKey, buffer);
      storage.saveBuffer(thumbKey, processed.thumb);
      width = processed.width;
      height = processed.height;
    } else {
      const ym = new Date().toISOString().slice(0, 7).replace('-', '');
      storageKey = `assets/${ym}/${declaredHash}${info.ext}`;
      storage.saveBuffer(storageKey, buffer);
    }
    const id = db.insertMedia({
      hash: declaredHash, storage_key: storageKey, thumb_key: thumbKey, mime: info.mime,
      size: buffer.length, origin_name: filename || declaredHash, kind: info.kind,
      width, height,
    });
    return { assetId: id, deduped: false };
  }

  /* ---------- 媒体文件 ---------- */
  app.get('/media/*', (req, res) => {
    const key = decodeURIComponent(req.params[0] || '');
    if (key.includes('..') || key.includes('\\') || key.startsWith('/')) {
      return res.status(400).json({ error: '非法路径' });
    }
    const full = resolve(storage.fullPath(key));
    if (!full.startsWith(resolve(uploadsDir) + sep)) return res.status(400).json({ error: '非法路径' });
    if (!storage.exists(key)) return res.status(404).json({ error: '文件不存在' });
    const extMap = {
      '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
      '.avif': 'image/avif', '.mp4': 'video/mp4', '.zip': 'application/zip',
      '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed',
    };
    res.setHeader('Content-Type', extMap[key.slice(key.lastIndexOf('.')).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(full);
  });

  app.use(express.static(join(__dirname, '..', 'public'), { maxAge: '1h' }));

  /* ---------- 公共数据 ---------- */
  function getStats() {
    const tagList = db.listTagsWithCount();
    return {
      posts: db.stats().published,
      tags: tagList.length,
      views: db.stats().views,
      tagList,
    };
  }
  function cfg() { return loadConfigs(db); }
  /** 前台导航（统一出口）：打赏功能关闭时隐藏「感谢」入口 */
  function frontNav(c) {
    const nav = db.listNav(true);
    return c.rewardEnabled === '1' ? nav : nav.filter((n) => n.url !== '/thanks');
  }
  function tagsOf(postId) { return db.getPostTags(postId); }
  function withCover(post) {
    if (post.cover_media_id) {
      const media = db.getMedia(post.cover_media_id);
      if (media) post.cover_url = '/media/' + (media.thumb_key || media.storage_key);
    }
    return post;
  }

  /* ---------- 前台页面 ---------- */
  const PAGE_SIZE = 8;

  app.get('/', (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const { rows, total } = db.listPosts({ status: 'published', page, pageSize: PAGE_SIZE });
    rows.forEach(withCover);
    res.send(homePage({
      cfg: cfg(), nav: frontNav(cfg()), posts: rows, tagsOf,
      page, totalPages: Math.ceil(total / PAGE_SIZE), total, stats: getStats(),
    }));
  });

  app.get('/post/:slug', (req, res) => {
    const post = db.getPostBySlug(req.params.slug);
    if (!post) {
      // 旧链接（hexo 迁移 / slug 重新生成）→ 301 不断链
      const map = db.findUrlMap('/post/' + req.params.slug);
      if (map) {
        const target = db.getPost(map.post_id);
        if (target && target.status === 'published') return res.redirect(301, '/post/' + target.slug);
      }
      return res.status(404).send(notFoundPage(cfg()));
    }
    if (post.status !== 'published') return res.status(404).send(notFoundPage(cfg()));
    db.incrementView(post.id);
    post.view_count += 1;
    const comments = db.listApprovedComments(post.id);
    const c = cfg();
    res.send(postPage({
      cfg: c, nav: frontNav(cfg()), post: withCover(post),
      tags: tagsOf(post.id), comments,
      commentEnabled: c.commentEnabled === '1',
      reward: {
        enabled: c.rewardEnabled === '1',
        text: c.rewardText,
        wechat: c.rewardWechat,
        alipay: c.rewardAlipay,
      },
      stats: getStats(),
    }));
  });

  app.get('/tag/:name', (req, res) => {
    const { rows } = db.listPosts({ status: 'published', tag: req.params.name, page: 1, pageSize: 50 });
    rows.forEach(withCover);
    res.send(tagPage({
      cfg: cfg(), nav: frontNav(cfg()), tag: req.params.name,
      posts: rows, tagsOf, stats: getStats(),
    }));
  });

  app.get('/friends', (req, res) => {
    res.send(friendsPage({
      cfg: cfg(), nav: frontNav(cfg()), friends: db.listFriends(true), stats: getStats(),
    }));
  });

  app.get('/about', (req, res) => {
    const c = cfg();
    res.send(aboutPage({
      cfg: c, nav: frontNav(cfg()), html: md.render(c.aboutMd || ''), stats: getStats(),
    }));
  });

  // 感谢页：打赏者名单（最近 50 条）+ 打赏支持弹层
  // 打赏功能关闭时，「感谢」导航项同步隐藏（名单页仍可通过直链查看）
  app.get('/thanks', (req, res) => {
    const c = cfg();
    const donations = db.listRecentDonations(50);
    res.send(thanksPage({
      cfg: c, nav: frontNav(c), donations,
      totalAmount: db.donationTotal(), total: db.listDonationsPaged({ page: 1, pageSize: 1 }).total,
      reward: {
        enabled: c.rewardEnabled === '1',
        wechat: c.rewardWechat,
        alipay: c.rewardAlipay,
      },
    }));
  });

  // 站内搜索（标题 + 全文）
  app.get('/search', (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 50);
    const posts = q ? db.searchPosts(q).map(withCover) : [];
    res.send(searchPage({
      cfg: cfg(), nav: frontNav(cfg()), q, posts, tagsOf, stats: getStats(),
    }));
  });

  /* ---------- SEO ---------- */
  app.get('/sitemap.xml', (req, res) => {
    const base = baseUrl(req);
    const urls = ['/', '/friends', '/about'];
    for (const p of db.listPosts({ status: 'published', page: 1, pageSize: 1000 }).rows) {
      urls.push('/post/' + p.slug);
    }
    for (const t of db.listTagsWithCount()) urls.push('/tag/' + encodeURIComponent(t.name));
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n')}
</urlset>`;
    res.type('application/xml').send(body);
  });

  app.get('/rss.xml', (req, res) => {
    const base = baseUrl(req);
    const c = cfg();
    const posts = db.listPosts({ status: 'published', page: 1, pageSize: 20 }).rows;
    const items = posts.map((p) => `    <item>
      <title>${xmlEsc(p.title)}</title>
      <link>${base}/post/${p.slug}</link>
      <guid isPermaLink="true">${base}/post/${p.slug}</guid>
      <description>${xmlEsc(p.summary)}</description>
      <pubDate>${new Date(p.published_at || p.created_at).toUTCString()}</pubDate>
    </item>`).join('\n');
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
    <title>${xmlEsc(c.siteName)}</title>
    <link>${base}/</link>
    <description>${xmlEsc(c.siteDesc)}</description>
${items}
  </channel></rss>`;
    res.type('application/rss+xml').send(body);
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ' + baseUrl(req) + '/sitemap.xml\n');
  });

  /* ---------- 评论 API（先审后显 + 限流防灌水） ---------- */
  const commentHits = new Map(); // ip -> [timestamps]
  app.post('/api/posts/:slug/comments', (req, res) => {
    const post = db.getPostBySlug(req.params.slug);
    if (!post || post.status !== 'published') return res.status(404).json({ error: '文章不存在' });
    const c = cfg();
    if (c.commentEnabled !== '1') return res.status(403).json({ error: '评论已关闭' });

    const { nickname, email, site, content } = req.body ?? {};
    if (typeof nickname !== 'string' || !nickname.trim()) return res.status(400).json({ error: '请填写昵称' });
    if (typeof content !== 'string' || !content.trim() || content.length > 500) return res.status(400).json({ error: '评论内容需为 1~500 字' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
    if (site && !/^https?:\/\//.test(site)) return res.status(400).json({ error: '主页需为 http(s) 链接' });

    // 频率限制：同 IP 10 秒 1 条、每小时 20 条（防灌水；发布后自动展示）
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const hits = (commentHits.get(ip) || []).filter((t) => now - t < 3600_000);
    if (hits.length && now - hits[hits.length - 1] < 10_000) {
      return res.status(429).json({ error: '评论太频繁，请稍后再试' });
    }
    if (hits.length >= 20) return res.status(429).json({ error: '评论过于频繁（每小时上限 20 条）' });
    hits.push(now);
    commentHits.set(ip, hits);

    db.insertComment({
      post_id: post.id,
      nickname: nickname.trim().slice(0, 30),
      email: (email || '').trim().slice(0, 60),
      site: (site || '').trim().slice(0, 100),
      content: content.trim(),
      status: 'approved', // 发布即自动通过；管理员可在后台下架
      ip,
    });
    res.json({ ok: true, message: '评论已发布' });
  });

  /* ---------- 认证 ---------- */
  const secret = () => db.getConfig('jwt_secret');
  const admin = requireAdmin(secret);

  app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body ?? {};
    const user = typeof username === 'string' ? db.findUserByUsername(username) : null;
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = signJWT({ role: 'admin', username: user.username, uid: user.id }, secret(), 7 * 24 * 3600);
    // Cookie 会话供后台页面守卫使用（API 仍用 Bearer，两者并存）
    res.setHeader('Set-Cookie', `blog_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
    res.json({ token, username: user.username });
  });

  app.post('/api/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'blog_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  });

  app.post('/api/admin/password', admin, (req, res) => {
    const { oldPassword, newPassword } = req.body ?? {};
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少 6 位' });
    }
    const user = db.findUserByUsername(req.admin.username);
    if (!user || !verifyPassword(String(oldPassword ?? ''), user.password_hash)) {
      return res.status(400).json({ error: '当前密码不正确' });
    }
    db.updateUserPassword(user.id, hashPassword(newPassword));
    res.json({ ok: true });
  });

  /** 后台页面守卫：校验 Cookie 会话，未登录一律跳转登录页 */
  function adminPage(handler) {
    return (req, res) => {
      const payload = verifyJWT(req.cookies?.blog_token, secret());
      if (!payload || payload.role !== 'admin') return res.redirect('/admin/login');
      req.admin = payload;
      handler(req, res);
    };
  }

  /* ---------- 后台页面（全部需要登录，未登录跳转登录页） ---------- */
  app.get('/admin/login', (req, res) => res.send(loginPage(cfg())));
  app.get('/admin/', adminPage((req, res) => res.send(dashboardPage({
    stats: db.stats(), monthly: db.monthlyStats(6), cfg: cfg(),
  }))));
  app.get('/admin/posts', adminPage((req, res) => res.send(postsPage(cfg()))));
  app.get('/admin/editor', adminPage((req, res) => res.send(editorPage(cfg()))));
  app.get('/admin/comments', adminPage((req, res) => res.send(commentsPage(cfg()))));
  app.get('/admin/donations', adminPage((req, res) => res.send(donationsPage(cfg()))));
  app.get('/admin/friends', adminPage((req, res) => res.send(friendsAdminPage(cfg()))));
  app.get('/admin/settings', adminPage((req, res) => res.send(settingsPage(cfg()))));

  /* ---------- 后台 API：文章 ---------- */
  app.get('/api/admin/posts', admin, (req, res) => {
    // 分页：page 从 1 起
    const paged = db.listPostsPaged({ page: req.query.page, pageSize: req.query.pageSize, q: req.query.q });
    res.json({ ...paged, rows: undefined, posts: paged.rows });
  });

  app.get('/api/admin/posts/:id', admin, (req, res) => {
    const post = db.getPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: '文章不存在' });
    res.json({ ...post, tags: db.getPostTags(post.id) });
  });

  app.post('/api/admin/posts', admin, (req, res) => {
    const { title, contentMd, summary, tags, coverMediaId, pinned, status } = req.body ?? {};
    if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: '标题不能为空' });
    if (status && !['draft', 'published'].includes(status)) return res.status(400).json({ error: 'status 仅支持 draft / published' });
    const rendered = renderMarkdown(md, contentMd || '');
    const slug = db.newSlug();
    const id = db.insertPost({
      slug, title: title.trim(), summary: summary || rendered.summary,
      content_md: contentMd || '', content_html: rendered.html, toc_html: rendered.tocHtml,
      cover_media_id: coverMediaId || null, status: status || 'draft', pinned: pinned ? 1 : 0,
    });
    db.setPostTags(id, Array.isArray(tags) ? tags : []);
    res.json({ id, slug, status: status || 'draft' });
  });

  app.patch('/api/admin/posts/:id', admin, (req, res) => {
    const id = Number(req.params.id);
    const post = db.getPost(id);
    if (!post) return res.status(404).json({ error: '文章不存在' });
    const { title, contentMd, summary, tags, coverMediaId, pinned, status } = req.body ?? {};
    if (status && !['draft', 'published'].includes(status)) return res.status(400).json({ error: 'status 仅支持 draft / published' });
    let rendered = null;
    if (contentMd !== undefined) rendered = renderMarkdown(md, contentMd);
    const updated = db.updatePost(id, {
      title: title !== undefined ? title.trim() : undefined,
      summary: summary !== undefined ? summary : (rendered ? rendered.summary : undefined),
      content_md: contentMd,
      content_html: rendered ? rendered.html : undefined,
      toc_html: rendered ? rendered.tocHtml : undefined,
      cover_media_id: coverMediaId !== undefined ? (coverMediaId || null) : undefined,
      status, pinned: pinned !== undefined ? (pinned ? 1 : 0) : undefined,
    });
    if (Array.isArray(tags)) db.setPostTags(id, tags);
    res.json({ id, slug: updated.slug, status: updated.status });
  });

  app.post('/api/admin/posts/:id/regenerate-slug', admin, (req, res) => {
    const id = Number(req.params.id);
    const post = db.getPost(id);
    if (!post) return res.status(404).json({ error: '文章不存在' });
    const oldSlug = post.slug;
    const newSlug = db.newSlug();
    db.updatePost(id, { slug: newSlug });
    // 旧 slug 301 到新 slug，不断链
    db.addSlugRedirect(oldSlug, id);
    res.json({ slug: newSlug, oldSlug });
  });

  app.delete('/api/admin/posts/:id', admin, (req, res) => {
    const post = db.getPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: '文章不存在' });
    db.deletePost(post.id);
    res.json({ ok: true });
  });

  /* ---------- 后台 API：评论（自动过审后的下架 / 恢复 / 删除） ---------- */
  app.get('/api/admin/comments', admin, (req, res) => {
    const paged = db.listCommentsForAdmin({ status: req.query.status || null, q: req.query.q, page: req.query.page, pageSize: req.query.pageSize });
    res.json({ ...paged, rows: undefined, comments: paged.rows });
  });
  app.patch('/api/admin/comments/:id', admin, (req, res) => {
    const { status } = req.body ?? {};
    if (!['approved', 'hidden'].includes(status)) return res.status(400).json({ error: 'status 仅支持 approved / hidden' });
    db.setCommentStatus(Number(req.params.id), status);
    res.json({ ok: true });
  });
  app.delete('/api/admin/comments/:id', admin, (req, res) => {
    db.deleteComment(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/admin/friends', admin, (req, res) => res.json({ friends: db.listFriends(false) }));
  app.post('/api/admin/friends', admin, (req, res) => {
    const f = req.body ?? {};
    if (typeof f.name !== 'string' || !f.name.trim() || typeof f.url !== 'string' || !f.url.trim()) {
      return res.status(400).json({ error: '名称与 URL 必填' });
    }
    const id = db.upsertFriend({ ...f, name: f.name.trim(), url: f.url.trim() });
    res.json({ id });
  });
  app.delete('/api/admin/friends/:id', admin, (req, res) => {
    db.deleteFriend(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/admin/configs', admin, (req, res) => {
    const all = { ...CONFIG_DEFAULTS, ...db.getAllConfigs() };
    res.json({ configs: all });
  });
  app.patch('/api/admin/configs', admin, (req, res) => {
    saveConfigs(db, req.body ?? {});
    res.json({ ok: true });
  });

  /* ---------- 打赏名单管理（手工录入，分页） ---------- */
  app.get('/api/admin/donations', admin, (req, res) => {
    const paged = db.listDonationsPaged({ page: req.query.page, pageSize: req.query.pageSize });
    res.json({ ...paged, rows: undefined, donations: paged.rows });
  });

  app.post('/api/admin/donations', admin, (req, res) => {
    const { nickname, amount, message, postId, donatedAt } = req.body ?? {};
    if (typeof nickname !== 'string' || !nickname.trim()) return res.status(400).json({ error: '请填写打赏者昵称' });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: '金额需为正数' });
    if (donatedAt && Number.isNaN(new Date(donatedAt).getTime())) return res.status(400).json({ error: '打赏时间格式不正确' });
    const id = db.insertDonation({
      nickname: nickname.trim().slice(0, 30),
      amount: amt,
      message: String(message ?? '').slice(0, 200),
      post_id: postId ? Number(postId) : null,
      donated_at: donatedAt ? new Date(donatedAt).toISOString() : undefined,
    });
    res.json({ id });
  });

  app.patch('/api/admin/donations/:id', admin, (req, res) => {
    const { nickname, amount, message, postId, donatedAt } = req.body ?? {};
    if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) {
      return res.status(400).json({ error: '金额需为正数' });
    }
    const updated = db.updateDonation(Number(req.params.id), {
      nickname, amount, message,
      post_id: postId !== undefined ? (postId ? Number(postId) : null) : undefined,
      donated_at: donatedAt ? new Date(donatedAt).toISOString() : undefined,
    });
    if (!updated) return res.status(404).json({ error: '记录不存在' });
    res.json({ ok: true });
  });

  app.delete('/api/admin/donations/:id', admin, (req, res) => {
    db.deleteDonation(Number(req.params.id));
    res.json({ ok: true });
  });

  /* ---------- 媒体（可按文章过滤：显式关联 ∪ 正文引用；可挂到文章） ---------- */
  app.get('/api/admin/media', admin, (req, res) => {
    let media;
    if (req.query.postId !== undefined && req.query.postId !== '') {
      media = db.listMediaForPost(req.query.postId);
    } else {
      media = db.listMedia({ limit: 200 });
    }
    res.json({ media });
  });
  app.post('/api/admin/media/:id/attach', admin, (req, res) => {
    const { postId } = req.body ?? {};
    db.attachMediaToPost(Number(req.params.id), postId ? Number(postId) : null);
    res.json({ ok: true });
  });

  app.get('/api/media/:id', admin, (req, res) => {
    const m = db.getMedia(Number(req.params.id));
    if (!m) return res.status(404).json({ error: '媒体不存在' });
    res.json(m);
  });
  app.delete('/api/admin/media/:id', admin, (req, res) => {
    const m = db.getMedia(Number(req.params.id));
    if (m) {
      for (const key of [m.storage_key, m.thumb_key]) if (key) storage.delete(key);
      db.deleteMedia(m.id);
    }
    res.json({ ok: true });
  });

  /** 若请求带 postId（编辑已有文章时），把新上传的媒体挂到该文章 */
  function attachIfRequested(req, result) {
    const postId = Number(req.query.postId || req.headers['x-post-id'] || 0);
    if (postId > 0 && result?.assetId) db.attachMediaToPost(result.assetId, postId);
    return result;
  }

  /* ---------- 上传协议（与图片分享系统同一套组件） ---------- */
  app.post('/api/upload/init', admin, (req, res) => {
    try { res.json(uploadManager.init(req.body ?? {})); }
    catch (err) { handleUploadError(err, res); }
  });
  app.put('/api/upload/chunk/:id/:index', admin, express.raw({ type: () => true, limit: '16mb' }), (req, res) => {
    try { res.json(uploadManager.putChunk(req.params.id, req.params.index, req.body)); }
    catch (err) { handleUploadError(err, res); }
  });
  app.get('/api/upload/session/:id', admin, (req, res) => {
    try { res.json(uploadManager.status(req.params.id)); }
    catch (err) { handleUploadError(err, res); }
  });
  app.post('/api/upload/complete/:id', admin, (req, res) => {
    uploadManager.complete(req.params.id, req.body ?? {}).then(
      (r) => res.json(attachIfRequested(req, r)),
      (err) => handleUploadError(err, res)
    );
  });
  app.delete('/api/upload/session/:id', admin, (req, res) => {
    try { res.json(uploadManager.cancel(req.params.id)); }
    catch (err) { handleUploadError(err, res); }
  });
  app.post('/api/upload/direct', admin, express.raw({ type: () => true, limit: '8mb' }), (req, res) => {
    (async () => {
      const filename = req.headers['x-filename'];
      const hash = req.headers['x-hash'];
      if (!filename || !/^[0-9a-f]{64}$/i.test(String(hash))) return res.status(400).json({ error: '缺少文件名或指纹' });
      if (req.body.length === 0) return res.status(400).json({ error: '空文件' });
      const existing = db.findMediaByHash(String(hash).toLowerCase());
      if (existing) return res.json({ assetId: existing.id, deduped: true });
      const r = await createMediaFromBuffer(req.body, decodeURIComponent(String(filename)), String(hash).toLowerCase());
      res.json(attachIfRequested(req, r));
    })().catch((err) => handleUploadError(err, res));
  });

  function handleUploadError(err, res) {
    if (err instanceof UploadError) return res.status(err.status).json({ error: err.message });
    console.error('[blog] error:', err.message);
    res.status(500).json({ error: '服务器内部错误' });
  }

  function baseUrl(req) {
    return process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
  }

  /* ---------- 兜底 ---------- */
  app.use((req, res) => {
    // 全路径旧链映射（hexo permalink 如 /2024/01/01/xxx/）
    const map = db.findUrlMap(req.path);
    if (map) {
      const target = db.getPost(map.post_id);
      if (target && target.status === 'published') return res.redirect(301, '/post/' + target.slug);
    }
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: '接口不存在' });
    res.status(404).send(notFoundPage(cfg()));
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: '请求体过大' });
    console.error('[blog] error:', err.message);
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: '服务器内部错误' });
    res.status(500).send('服务器内部错误');
  });

  app.locals.startTasks = () => {
    uploadManager.startCleanupTimer();
  };

  return app;
}

function xmlEsc(s) {
  return String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function notFoundPage(cfg) {
  return frontLayout({
    cfg, nav: [],
    title: '404',
    content: '<div class="card" style="text-align:center;padding:60px 20px"><h1 style="font-size:56px;margin:0;color:var(--primary)">404</h1><p class="empty-note">页面不存在或已下架</p><p><a class="btn btn-primary" href="/">返回首页</a></p></div>',
  });
}
