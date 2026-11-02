// SQLite 数据访问层（node:sqlite）
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashPassword } from './lib/auth.js';
import { generateSlug, isValidSlug } from './lib/slug.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  content_md     TEXT NOT NULL DEFAULT '',
  content_html   TEXT NOT NULL DEFAULT '',
  toc_html       TEXT NOT NULL DEFAULT '',
  cover_media_id INTEGER,
  status         TEXT NOT NULL DEFAULT 'draft',
  pinned         INTEGER NOT NULL DEFAULT 0,
  view_count     INTEGER NOT NULL DEFAULT 0,
  published_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts (status, published_at);
CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
CREATE TABLE IF NOT EXISTS friends (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  avatar      TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  visible     INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS nav_items (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  label   TEXT NOT NULL,
  url     TEXT NOT NULL,
  sort    INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS configs (
  key   TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hash        TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL,
  thumb_key   TEXT,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  origin_name TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'image',
  width       INTEGER,
  height      INTEGER,
  post_id     INTEGER,
  created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS donations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname   TEXT NOT NULL,
  amount     REAL NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  post_id    INTEGER,
  donated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  nickname   TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  site       TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  ip         TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS url_maps (
  old_path TEXT PRIMARY KEY,
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS upload_sessions (
  id           TEXT PRIMARY KEY,
  filename     TEXT NOT NULL,
  size         INTEGER NOT NULL,
  hash         TEXT NOT NULL,
  chunk_size   INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  received     TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_hash ON upload_sessions (hash, updated_at);
`;

export function openDb(dbPath, { adminUser, adminPassword } = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(SCHEMA);

  const now = () => new Date().toISOString();

  const hasUser = sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
  if (!hasUser && adminUser) {
    sqlite.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(adminUser, hashPassword(adminPassword));
    console.log(`[blog] 已创建管理员账号: ${adminUser}`);
  }
  if (!sqlite.prepare("SELECT value FROM configs WHERE key = 'jwt_secret'").get()) {
    sqlite.prepare("INSERT INTO configs (key, value) VALUES ('jwt_secret', ?)")
      .run(randomBytes(32).toString('hex'));
  }

  // ---- 存量库迁移（非破坏性）----
  try { sqlite.exec('ALTER TABLE media ADD COLUMN post_id INTEGER'); } catch { /* 列已存在 */ }
  // 确保导航含"感谢"（打赏名单页），位置在"关于"之前
  const hasThanksNav = sqlite.prepare("SELECT 1 FROM nav_items WHERE url = '/thanks'").get();
  if (!hasThanksNav) {
    const aboutNav = sqlite.prepare("SELECT id, sort FROM nav_items WHERE url = '/about'").get();
    const sort = aboutNav ? aboutNav.sort : 4;
    if (aboutNav) sqlite.prepare('UPDATE nav_items SET sort = sort + 1 WHERE id = ?').run(aboutNav.id);
    sqlite.prepare('INSERT INTO nav_items (label, url, sort, visible) VALUES (?, ?, ?, 1)')
      .run('感谢', '/thanks', sort);
  }

  return {
    sqlite,
    now,

    /* ---- 用户 / 配置 ---- */
    findUserByUsername(username) {
      return sqlite.prepare('SELECT * FROM users WHERE username = ?').get(username);
    },
    getConfig(key) {
      const row = sqlite.prepare('SELECT value FROM configs WHERE key = ?').get(key);
      return row ? row.value : null;
    },
    setConfig(key, value) {
      sqlite.prepare(
        'INSERT INTO configs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run(key, value);
    },
    getAllConfigs() {
      const rows = sqlite.prepare('SELECT key, value FROM configs').all();
      const map = {};
      for (const r of rows) map[r.key] = r.value;
      return map;
    },

    /* ---- 文章 ---- */
    insertPost(p) {
      const t = now();
      const r = sqlite.prepare(
        `INSERT INTO posts (slug, title, summary, content_md, content_html, toc_html, cover_media_id, status, pinned, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(p.slug, p.title, p.summary ?? '', p.content_md ?? '', p.content_html ?? '', p.toc_html ?? '',
        p.cover_media_id ?? null, p.status ?? 'draft', p.pinned ?? 0,
        p.status === 'published' ? (p.published_at ?? t) : null, t, t);
      return r.lastInsertRowid;
    },
    getPost(id) {
      return sqlite.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    },
    getPostBySlug(slug) {
      return sqlite.prepare('SELECT * FROM posts WHERE slug = ?').get(slug);
    },
    updatePost(id, p) {
      const cur = sqlite.prepare('SELECT * FROM posts WHERE id = ?').get(id);
      if (!cur) return null;
      const next = {
        slug: p.slug ?? cur.slug,
        title: p.title ?? cur.title,
        summary: p.summary ?? cur.summary,
        content_md: p.content_md ?? cur.content_md,
        content_html: p.content_html ?? cur.content_html,
        toc_html: p.toc_html ?? cur.toc_html,
        cover_media_id: p.cover_media_id !== undefined ? p.cover_media_id : cur.cover_media_id,
        status: p.status ?? cur.status,
        pinned: p.pinned !== undefined ? p.pinned : cur.pinned,
      };
      let publishedAt = cur.published_at;
      if (p.status && p.status === 'published' && !publishedAt) publishedAt = now();
      if (p.published_at !== undefined) publishedAt = p.published_at;
      sqlite.prepare(
        `UPDATE posts SET slug = ?, title = ?, summary = ?, content_md = ?, content_html = ?, toc_html = ?,
         cover_media_id = ?, status = ?, pinned = ?, published_at = ?, updated_at = ? WHERE id = ?`
      ).run(next.slug, next.title, next.summary, next.content_md, next.content_html, next.toc_html,
        next.cover_media_id, next.status, next.pinned, publishedAt, now(), id);
      return this.getPost(id);
    },
    deletePost(id) {
      sqlite.prepare('DELETE FROM post_tags WHERE post_id = ?').run(id);
      sqlite.prepare('DELETE FROM url_maps WHERE post_id = ?').run(id);
      sqlite.prepare('DELETE FROM comments WHERE post_id = ?').run(id);
      sqlite.prepare('DELETE FROM posts WHERE id = ?').run(id);
    },
    listPosts({ status, tag, page = 1, pageSize = 8 } = {}) {
      const conds = [];
      const params = [];
      if (status) { conds.push('p.status = ?'); params.push(status); }
      if (tag) {
        conds.push('p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = ?)');
        params.push(tag);
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const total = sqlite.prepare(
        `SELECT COUNT(*) AS n FROM posts p ${where}`
      ).get(...params).n;
      const rows = sqlite.prepare(
        `SELECT p.* FROM posts p ${where}
         ORDER BY p.pinned DESC, COALESCE(p.published_at, p.created_at) DESC
         LIMIT ? OFFSET ?`
      ).all(...params, pageSize, (page - 1) * pageSize);
      return { rows, total };
    },
    listAllPostsForAdmin() {
      return sqlite.prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM post_tags pt WHERE pt.post_id = p.id) AS tag_count
         FROM posts p ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT 500`
      ).all();
    },
    /** 后台文章分页列表（q：按标题模糊搜索） */
    listPostsPaged({ page = 1, pageSize = 10, q } = {}) {
      const p = Math.max(1, Number(page) || 1);
      const size = Math.min(50, Math.max(1, Number(pageSize) || 10));
      const where = q ? 'WHERE title LIKE ?' : '';
      const like = `%${String(q).trim()}%`;
      const total = sqlite.prepare(`SELECT COUNT(*) AS n FROM posts ${where}`).get(...(q ? [like] : [])).n;
      const rows = sqlite.prepare(
        `SELECT p.* FROM posts p ${where} ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT ? OFFSET ?`
      ).all(...(q ? [like] : []), size, (p - 1) * size);
      return { rows, total, page: p, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
    },
    incrementView(id) {
      sqlite.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(id);
    },
    getPostTags(postId) {
      return sqlite.prepare(
        'SELECT t.id, t.name FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ?'
      ).all(postId);
    },
    setPostTags(postId, names) {
      sqlite.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);
      const insTag = sqlite.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
      const findTag = sqlite.prepare('SELECT id FROM tags WHERE name = ?');
      const ins = sqlite.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)');
      for (const name of names) {
        const n = name.trim();
        if (!n) continue;
        insTag.run(n);
        ins.run(postId, findTag.get(n).id);
      }
    },
    listTagsWithCount() {
      return sqlite.prepare(
        `SELECT t.name, COUNT(pt.post_id) AS count FROM tags t
         JOIN post_tags pt ON pt.tag_id = t.id
         JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
         GROUP BY t.name ORDER BY count DESC, t.name`
      ).all();
    },

    /* ---- 友链 / 导航 ---- */
    listFriends(visibleOnly = false) {
      const where = visibleOnly ? 'WHERE visible = 1' : '';
      return sqlite.prepare(`SELECT * FROM friends ${where} ORDER BY sort, id`).all();
    },
    upsertFriend(f) {
      if (f.id) {
        sqlite.prepare('UPDATE friends SET name = ?, url = ?, avatar = ?, description = ?, sort = ?, visible = ? WHERE id = ?')
          .run(f.name, f.url, f.avatar ?? '', f.description ?? '', f.sort ?? 0, f.visible ?? 1, f.id);
        return f.id;
      }
      const r = sqlite.prepare('INSERT INTO friends (name, url, avatar, description, sort, visible) VALUES (?, ?, ?, ?, ?, ?)')
        .run(f.name, f.url, f.avatar ?? '', f.description ?? '', f.sort ?? 0, f.visible ?? 1);
      return r.lastInsertRowid;
    },
    deleteFriend(id) {
      sqlite.prepare('DELETE FROM friends WHERE id = ?').run(id);
    },
    listNav(visibleOnly = false) {
      const where = visibleOnly ? 'WHERE visible = 1' : '';
      return sqlite.prepare(`SELECT * FROM nav_items ${where} ORDER BY sort, id`).all();
    },
    upsertNav(n) {
      if (n.id) {
        sqlite.prepare('UPDATE nav_items SET label = ?, url = ?, sort = ?, visible = ? WHERE id = ?')
          .run(n.label, n.url, n.sort ?? 0, n.visible ?? 1, n.id);
        return n.id;
      }
      const r = sqlite.prepare('INSERT INTO nav_items (label, url, sort, visible) VALUES (?, ?, ?, ?)')
        .run(n.label, n.url, n.sort ?? 0, n.visible ?? 1);
      return r.lastInsertRowid;
    },
    deleteNav(id) {
      sqlite.prepare('DELETE FROM nav_items WHERE id = ?').run(id);
    },

    /* ---- 媒体 ---- */
    findMediaByHash(hash) {
      return sqlite.prepare('SELECT * FROM media WHERE hash = ?').get(hash);
    },
    // 分块上传组件（跨站共享）期望的统一接口名
    findAssetByHash(hash) {
      return this.findMediaByHash(hash);
    },
    getMedia(id) {
      return sqlite.prepare('SELECT * FROM media WHERE id = ?').get(id);
    },
    insertMedia(m) {
      const r = sqlite.prepare(
        `INSERT INTO media (hash, storage_key, thumb_key, mime, size, origin_name, kind, width, height, post_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(m.hash, m.storage_key, m.thumb_key ?? null, m.mime, m.size, m.origin_name ?? '', m.kind ?? 'image',
        m.width ?? null, m.height ?? null, m.post_id ?? null, now());
      return r.lastInsertRowid;
    },
    listMedia({ limit = 200, postId } = {}) {
      if (postId !== undefined && postId !== null && postId !== '') {
        return sqlite.prepare('SELECT * FROM media WHERE post_id = ? ORDER BY id DESC LIMIT ?').all(Number(postId), limit);
      }
      return sqlite.prepare('SELECT * FROM media ORDER BY id DESC LIMIT ?').all(limit);
    },
    /**
     * 编辑器的"本文媒体库"：显式关联（post_id）∪ 正文引用过的媒体。
     * 存量文章中粘贴过的旧图（无 post_id）也能自动带出。
     */
    listMediaForPost(postId, limit = 200) {
      return sqlite.prepare(
        `SELECT DISTINCT me.* FROM media me
         WHERE me.post_id = ?
            OR EXISTS (
              SELECT 1 FROM posts p
              WHERE p.id = ? AND instr(p.content_md, '/media/' || me.storage_key) > 0
            )
         ORDER BY me.id DESC LIMIT ?`
      ).all(Number(postId), Number(postId), limit);
    },
    attachMediaToPost(mediaId, postId) {
      sqlite.prepare('UPDATE media SET post_id = ? WHERE id = ?').run(postId ?? null, Number(mediaId));
    },
    deleteMedia(id) {
      sqlite.prepare('DELETE FROM media WHERE id = ?').run(id);
    },

    /* ---- 打赏名单 ---- */
    insertDonation(d) {
      const r = sqlite.prepare(
        'INSERT INTO donations (nickname, amount, message, post_id, donated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(d.nickname, Number(d.amount), d.message ?? '', d.post_id ?? null,
        d.donated_at || now(), now());
      return r.lastInsertRowid;
    },
    getDonation(id) {
      return sqlite.prepare('SELECT * FROM donations WHERE id = ?').get(id);
    },
    updateDonation(id, d) {
      const cur = sqlite.prepare('SELECT * FROM donations WHERE id = ?').get(id);
      if (!cur) return null;
      sqlite.prepare('UPDATE donations SET nickname = ?, amount = ?, message = ?, post_id = ?, donated_at = ? WHERE id = ?')
        .run(d.nickname ?? cur.nickname, d.amount !== undefined ? Number(d.amount) : cur.amount,
          d.message ?? cur.message, d.post_id !== undefined ? d.post_id : cur.post_id,
          d.donated_at ?? cur.donated_at, id);
      return this.getDonation(id);
    },
    deleteDonation(id) {
      sqlite.prepare('DELETE FROM donations WHERE id = ?').run(id);
    },
    listDonationsPaged({ page = 1, pageSize = 10 } = {}) {
      const p = Math.max(1, Number(page) || 1);
      const size = Math.min(50, Math.max(1, Number(pageSize) || 10));
      const total = sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n;
      const rows = sqlite.prepare(
        `SELECT d.*, p.title AS post_title, p.slug AS post_slug
         FROM donations d LEFT JOIN posts p ON p.id = d.post_id
         ORDER BY d.donated_at DESC, d.id DESC LIMIT ? OFFSET ?`
      ).all(size, (p - 1) * size);
      return { rows, total, page: p, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
    },
    listRecentDonations(limit = 50) {
      return sqlite.prepare(
        `SELECT d.*, p.title AS post_title, p.slug AS post_slug
         FROM donations d LEFT JOIN posts p ON p.id = d.post_id
         ORDER BY d.donated_at DESC, d.id DESC LIMIT ?`
      ).all(limit);
    },
    donationTotal() {
      return sqlite.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM donations').get().n;
    },

    /* ---- 评论（发布即自动通过，管理员可下架/恢复/删除） ---- */
    insertComment(c) {
      const r = sqlite.prepare(
        'INSERT INTO comments (post_id, nickname, email, site, content, status, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(c.post_id, c.nickname, c.email ?? '', c.site ?? '', c.content, c.status ?? 'approved', c.ip ?? '', now());
      return r.lastInsertRowid;
    },
    listApprovedComments(postId) {
      return sqlite.prepare(
        "SELECT id, nickname, site, content, created_at FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at"
      ).all(postId);
    },
    /** 后台评论分页列表（q：按评论内容或昵称模糊搜索） */
    listCommentsForAdmin({ status, q, page = 1, pageSize = 10 } = {}) {
      const p = Math.max(1, Number(page) || 1);
      const size = Math.min(50, Math.max(1, Number(pageSize) || 10));
      const conds = [];
      const params = [];
      if (status) { conds.push('c.status = ?'); params.push(status); }
      if (q) {
        const like = `%${String(q).trim()}%`;
        conds.push('(c.content LIKE ? OR c.nickname LIKE ?)');
        params.push(like, like);
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const total = sqlite.prepare(`SELECT COUNT(*) AS n FROM comments c ${where}`).get(...params).n;
      const rows = sqlite.prepare(
        `SELECT c.*, p.title AS post_title, p.slug AS post_slug FROM comments c
         JOIN posts p ON p.id = c.post_id ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
      ).all(...params, size, (p - 1) * size);
      return { rows, total, page: p, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
    },
    setCommentStatus(id, status) {
      sqlite.prepare('UPDATE comments SET status = ? WHERE id = ?').run(status, id);
    },
    deleteComment(id) {
      sqlite.prepare('DELETE FROM comments WHERE id = ?').run(id);
    },
    countComments(status) {
      return status
        ? sqlite.prepare('SELECT COUNT(*) AS n FROM comments WHERE status = ?').get(status).n
        : sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n;
    },

    /* ---- 站内搜索（标题 + 正文） ---- */
    searchPosts(keyword, limit = 20) {
      const kw = `%${String(keyword).trim()}%`;
      return sqlite.prepare(
        `SELECT * FROM posts WHERE status = 'published' AND (title LIKE ? OR content_md LIKE ?)
         ORDER BY pinned DESC, published_at DESC LIMIT ?`
      ).all(kw, kw, limit);
    },

    /** 近 N 个月的月度统计（图表用）：发布文章数 / 新评论数 / 阅读量（按文章发布月归集） */
    monthlyStats(months = 6) {
      const out = [];
      const base = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const start = new Date(y, m, 1).toISOString();
        const end = new Date(y, m + 1, 1).toISOString();
        const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
        const posts = sqlite.prepare(
          "SELECT COUNT(*) AS n FROM posts WHERE status = 'published' AND published_at >= ? AND published_at < ?"
        ).get(start, end).n;
        const comments = sqlite.prepare(
          'SELECT COUNT(*) AS n FROM comments WHERE created_at >= ? AND created_at < ?'
        ).get(start, end).n;
        const views = sqlite.prepare(
          `SELECT COALESCE(SUM(view_count), 0) AS n FROM posts
           WHERE status = 'published' AND substr(published_at, 1, 7) = ?`
        ).get(ym).n;
        out.push({ month: ym, posts, comments, views });
      }
      return out;
    },

    updateUserPassword(id, passwordHash) {
      sqlite.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
    },

    /* ---- 上传会话（分块断点续传组件共用接口） ---- */
    insertUploadSession(s) {
      const t = now();
      sqlite.prepare(
        `INSERT INTO upload_sessions (id, filename, size, hash, chunk_size, total_chunks, received, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(s.id, s.filename, s.size, s.hash, s.chunkSize, s.totalChunks, s.received, t, t);
    },
    getUploadSession(id) {
      return sqlite.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(id);
    },
    findActiveSessionByHash(hash, notBeforeEpochMs) {
      return sqlite.prepare(
        'SELECT * FROM upload_sessions WHERE hash = ? AND updated_at >= ? ORDER BY updated_at DESC LIMIT 1'
      ).get(hash, new Date(notBeforeEpochMs).toISOString());
    },
    updateSessionReceived(id, received) {
      sqlite.prepare('UPDATE upload_sessions SET received = ?, updated_at = ? WHERE id = ?').run(received, now(), id);
    },
    deleteUploadSession(id) {
      sqlite.prepare('DELETE FROM upload_sessions WHERE id = ?').run(id);
    },
    listExpiredSessions(cutoffEpochMs) {
      return sqlite.prepare('SELECT * FROM upload_sessions WHERE updated_at < ?')
        .all(new Date(cutoffEpochMs).toISOString());
    },

    /* ---- 旧链映射 ---- */
    addUrlMap(oldPath, postId) {
      sqlite.prepare('INSERT INTO url_maps (old_path, post_id) VALUES (?, ?) ON CONFLICT(old_path) DO NOTHING')
        .run(oldPath.replace(/\/+$/, '') || '/', postId);
    },
    findUrlMap(oldPath) {
      return sqlite.prepare('SELECT * FROM url_maps WHERE old_path = ?').get(oldPath.replace(/\/+$/, ''));
    },

    /* ---- slug ---- */
    slugTaken(slug) {
      if (!isValidSlug(slug)) return true;
      return !!sqlite.prepare('SELECT 1 FROM posts WHERE slug = ?').get(slug);
    },
    newSlug() {
      return generateSlug((s) => !!sqlite.prepare('SELECT 1 FROM posts WHERE slug = ?').get(s));
    },
    addSlugRedirect(oldSlug, postId) {
      if (!oldSlug || oldSlug === postId) return;
      this.addUrlMap('/post/' + oldSlug, postId);
    },

    /* ---- 统计 ---- */
    stats() {
      return {
        published: sqlite.prepare("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'").get().n,
        drafts: sqlite.prepare("SELECT COUNT(*) AS n FROM posts WHERE status = 'draft'").get().n,
        media: sqlite.prepare('SELECT COUNT(*) AS n FROM media').get().n,
        commentsHidden: sqlite.prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'hidden'").get().n,
        commentsApproved: sqlite.prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'approved'").get().n,
        views: sqlite.prepare('SELECT COALESCE(SUM(view_count), 0) AS n FROM posts').get().n,
        donationTotal: sqlite.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM donations').get().n,
        donationCount: sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n,
      };
    },

    close() {
      sqlite.close();
    },
  };
}
