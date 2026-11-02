// 演示数据：3 篇原创文章（含代码块/标签）+ 友链 + 评论样例（仅空库时执行）
import { openDb } from './db.js';
import { renderMarkdown, createRenderer } from './lib/markdown.js';
import { makeTestImage } from './lib/images.js';
import { createHash } from 'node:crypto';
import { LocalStorage } from './lib/storage.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, '..', 'data', 'blog.db');
const uploadsDir = process.env.UPLOADS_DIR || join(__dirname, '..', 'data', 'uploads');

const db = openDb(dbPath, { adminUser: process.env.ADMIN_USER || 'admin', adminPassword: process.env.ADMIN_PASSWORD || 'admin123' });
if (db.stats().published > 0) {
  console.log('[blog] 已有数据，跳过种子');
  process.exit(0);
}
const storage = new LocalStorage(uploadsDir);
const md = createRenderer();

// 封面图
async function addCover(a, b) {
  const buffer = await makeTestImage(1200, 630, a, b);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const key = storage.assetKey(hash, '.png');
  storage.saveBuffer(key, buffer);
  return db.insertMedia({
    hash, storage_key: key, thumb_key: null, mime: 'image/png', size: buffer.length,
    origin_name: 'cover.png', kind: 'image', width: 1200, height: 630,
  });
}

const posts = [
  {
    title: '自研博客系统的性能设计：把客户端 JS 压到最少',
    cover: await addCover('#4c6ef5', '#22d3ee'),
    tags: ['前端', '性能'],
    pinned: 1,
    md: `这个博客是自研的：服务端渲染 + 全页缓存 + 客户端 JS 压到最少，效果等于"动态 CMS 的后台 + 静态站的速度"。

## 为什么静态生成器还不够

Hexo 这类静态生成器本身不慢，慢的是主题：音乐播放器、气泡特效、第三方评论脚本……首屏请求数动辄几十个。

## 自研策略

- **服务端渲染**：Markdown 在构建/请求时于服务端完成渲染，代码高亮也在服务端做好，浏览器拿到的是纯 HTML；
- **零框架前台**：前台只有 1 个 CSS 和 1 个几 KB 的 JS（主题切换 + 评论提交）；
- **CSS 变量做暗色模式**：跟随系统 + 手动切换，不闪屏。

\`\`\`js
// 服务端代码高亮示例：markdown-it + highlight.js
const html = md.render(source); // 客户端不加载任何高亮库
\`\`\`

## 性能预算

首页 HTML < 100KB、CSS < 60KB、JS < 50KB（gzip 后），LCP < 1.5s。少即是多。`,
  },
  {
    title: '数字 + 字母的短链设计：8 位 slug 的取舍',
    cover: await addCover('#11998e', '#38ef7d'),
    tags: ['后端', '设计'],
    pinned: 0,
    md: `文章链接不用标题拼音，而是 **8 位随机字母数字**（剔除 0/1/i/l/o 等易混字符），约 10¹² 种组合，冲突概率可忽略。

## 为什么不用自增 ID

自增 ID 会暴露文章总量，也不利于迁移；随机 slug 无语义但短、可大声念给别人听。

## 冲突处理

唯一约束兜底 + 重试：

\`\`\`python
def new_slug(is_taken):
    for _ in range(50):
        s = ''.join(random.choice(CHARS) for _ in range(8))
        if not is_taken(s):
            return s
\`\`\`

## 换 slug 不断链

后台可以"重新生成 slug"，旧 slug 会写入映射表并 **301 跳转**到新地址，搜索引擎与老读者都不受影响。`,
  },
  {
    title: '从 Hexo 迁移到自研系统的完整清单',
    cover: await addCover('#ee0979', '#ff6a00'),
    tags: ['随笔', '工具'],
    pinned: 0,
    md: `迁移最怕两件事：图片丢、链接断。这次迁移做了三件事：

1. **front-matter 解析**：title / date / tags / categories / cover / abbrlink 全部读取；
2. **本地图资源入库**：文中相对路径图片自动拷入媒体库并替换链接；
3. **旧 URL 全量 301**：按 permalink 规则反推旧地址，写入映射表。

迁移完成后向搜索引擎重新提交 sitemap 即可。旧链接访问会自动 301 到新 slug，收录波动降到最低。

> 数据无价，迁移前记得先备份数据库。`,
  },
];

for (const p of posts) {
  const rendered = renderMarkdown(md, p.md);
  const id = db.insertPost({
    slug: db.newSlug(),
    title: p.title,
    summary: rendered.summary,
    content_md: p.md,
    content_html: rendered.html,
    toc_html: rendered.tocHtml,
    cover_media_id: p.cover,
    status: 'published',
    pinned: p.pinned,
  });
  db.setPostTags(id, p.tags);
}

// 友链
for (const f of [
  { name: '云原生手记', url: 'https://example.com/a', description: '容器与分布式笔记', sort: 1 },
  { name: '像素与代码', url: 'https://example.com/b', description: '前端可视化实践', sort: 2 },
  { name: '深夜自习室', url: 'https://example.com/c', description: '读书与思考', sort: 3 },
]) db.upsertFriend(f);

// 评论样例（发布即展示）
const first = db.listAllPostsForAdmin()[0];
if (first) {
  db.insertComment({ post_id: first.id, nickname: '老王', content: '写得很清楚，学到了！', status: 'approved', ip: '127.0.0.1' });
  db.insertComment({ post_id: first.id, nickname: '访客', content: '请问评论是不是直接就显示？', status: 'approved', ip: '127.0.0.1' });
}

// 打赏样例（感谢名单页展示用）
const postList = db.listAllPostsForAdmin();
for (const d of [
  { nickname: '阿哲', amount: 66, message: '干货满满，感谢！', post_id: postList[0]?.id ?? null, donated_at: new Date(Date.now() - 86400_000 * 12).toISOString() },
  { nickname: 'Momo', amount: 20, message: '', post_id: postList[1]?.id ?? null, donated_at: new Date(Date.now() - 86400_000 * 5).toISOString() },
  { nickname: '匿名朋友', amount: 9.9, message: '继续写下去', post_id: null, donated_at: new Date(Date.now() - 86400_000).toISOString() },
]) db.insertDonation(d);

// 导航
for (const n of [
  { label: '首页', url: '/', sort: 1 },
  { label: '友链', url: '/friends', sort: 2 },
  { label: '关于', url: '/about', sort: 3 },
]) db.upsertNav(n);

console.log('[blog] 种子完成：3 篇文章（1 置顶）、3 个友链、2 条评论、默认导航');
db.close();
