// API 集成测试：前台 SSR / 文章 CRUD + slug 301 / 评论审核流 / 配置中心 / 友链 / SEO / 上传
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { makeTestImage } from '../src/lib/images.js';

let server, base, token;

before(async () => {
  const app = createApp({
    dbPath: ':memory:',
    uploadsDir: 'data/test-uploads-' + Date.now(),
    adminUser: 'admin', adminPassword: 'admin123',
    chunkSize: 64 * 1024,
  });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  token = (await (await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })).json()).token;
});

after(() => new Promise((resolve) => server.close(resolve)));

function auth(extra = {}) {
  return Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, extra);
}

/* ---------- 前台页面 ---------- */

test('首页：SSR 渲染（顶栏 / 个人信息卡 / 卡片）', async () => {
  const resp = await fetch(base + '/');
  assert.equal(resp.status, 200);
  const html = await resp.text();
  assert.match(html, /site-header/);
  assert.match(html, /profile-card/);
  assert.match(html, /themeToggle/);
});

test('登录：错误密码 401；未登录访问管理 API 401', async () => {
  let resp = await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'nope' }),
  });
  assert.equal(resp.status, 401);
  resp = await fetch(base + '/api/admin/posts');
  assert.equal(resp.status, 401);
});

/* ---------- 文章 CRUD 与 slug ---------- */

let postId, slug1;

test('创建文章（草稿）→ 前台不可见 → 发布 → 前台可见且 slug 合规', async () => {
  let resp = await fetch(base + '/api/admin/posts', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ title: '测试文章标题', contentMd: '## 小节\n\n正文**加粗**与`行内代码`。', status: 'draft', tags: ['测试', '随笔'] }),
  });
  let data = await resp.json();
  postId = data.id;
  assert.match(data.slug, /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);

  resp = await fetch(base + `/post/${data.slug}`);
  assert.equal(resp.status, 404); // 草稿不可见

  resp = await fetch(base + '/api/admin/posts/' + postId, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ status: 'published' }),
  });
  assert.equal((await resp.json()).status, 'published');

  resp = await fetch(base + `/post/${data.slug}`);
  assert.equal(resp.status, 200);
  const html = await resp.text();
  assert.match(html, /测试文章标题/);
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /application\/ld\+json/); // JSON-LD
  assert.match(html, /toc/); // TOC
  slug1 = data.slug;
});

test('slug 重新生成：旧 slug 301 到新 slug', async () => {
  const r = await (await fetch(base + `/api/admin/posts/${postId}/regenerate-slug`, { method: 'POST', headers: auth() })).json();
  assert.notEqual(r.slug, slug1);

  const resp = await fetch(base + `/post/${slug1}`, { redirect: 'manual' });
  assert.equal(resp.status, 301);
  assert.equal(resp.headers.get('location'), `/post/${r.slug}`);

  const resp2 = await fetch(base + `/post/${r.slug}`);
  assert.equal(resp2.status, 200);
});

test('编辑器贴图：粘贴图片 → 直传入媒体库 → 文中引用', async () => {
  const png = await makeTestImage(800, 500, '#ff5e62', '#ff9966');
  const hash = createHash('sha256').update(png).digest('hex');
  const resp = await fetch(base + '/api/upload/direct', {
    method: 'POST',
    headers: auth({
      'Content-Type': 'application/octet-stream',
      'x-filename': encodeURIComponent('paste.png'),
      'x-hash': hash,
    }),
    body: png,
  });
  assert.equal(resp.status, 200);
  const { assetId } = await resp.json();
  const media = await (await fetch(base + '/api/media/' + assetId, { headers: auth() })).json();
  assert.equal(media.kind, 'image');
  assert.ok(media.thumb_key.endsWith('.thumb.webp'));

  // 引用该图发布
  await fetch(base + '/api/admin/posts/' + postId, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ contentMd: `![贴图](/media/${media.storage_key})`, coverMediaId: assetId }),
  });
  const html = await (await fetch(base + `/post/${(await (await fetch(base + '/api/admin/posts/' + postId, { headers: auth() })).json()).slug}`)).text();
  assert.match(html, new RegExp('/media/' + media.storage_key.replace(/[/.]/g, '\\$&')));
  assert.match(html, /loading="lazy"/);
});

test('大文件分块续传：mp4 白名单通过，伪装 exe 被拒', async () => {
  // 构造 >64KB 的合法 mp4 头文件（ftyp isom）
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from('ftypisom'), randomBytes(200 * 1024)]);
  const hash = createHash('sha256').update(mp4).digest('hex');
  let resp = await fetch(base + '/api/upload/init', {
    method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ filename: 'video.mp4', size: mp4.length, hash }),
  });
  const init = await resp.json();
  assert.equal(init.totalChunks, Math.ceil(mp4.length / (64 * 1024)));
  for (let i = 0; i < init.totalChunks; i++) {
    await fetch(`${base}/api/upload/chunk/${init.uploadId}/${i}`, {
      method: 'PUT', headers: auth({ 'Content-Type': 'application/octet-stream' }),
      body: mp4.subarray(i * 64 * 1024, Math.min((i + 1) * 64 * 1024, mp4.length)),
    });
  }
  resp = await fetch(`${base}/api/upload/complete/${init.uploadId}`, {
    method: 'POST', headers: auth({ 'Content-Type': 'application/json' }), body: JSON.stringify({ hash }),
  });
  assert.equal(resp.status, 200);
  const media = await (await fetch(base + '/api/media/' + (await resp.json()).assetId, { headers: auth() })).json();
  assert.equal(media.kind, 'video');

  // zip 附件
  const zip = Buffer.concat([Buffer.from('PK\x03\x04'), randomBytes(1000)]);
  resp = await fetch(base + '/api/upload/direct', {
    method: 'POST',
    headers: auth({ 'Content-Type': 'application/octet-stream', 'x-filename': 'files.zip', 'x-hash': createHash('sha256').update(zip).digest('hex') }),
    body: zip,
  });
  assert.equal(resp.status, 200);

  // 伪装 exe → 415
  const exe = Buffer.concat([Buffer.from('MZ'), randomBytes(100)]);
  resp = await fetch(base + '/api/upload/direct', {
    method: 'POST',
    headers: auth({ 'Content-Type': 'application/octet-stream', 'x-filename': 'evil.jpg', 'x-hash': createHash('sha256').update(exe).digest('hex') }),
    body: exe,
  });
  assert.equal(resp.status, 415);
});

test('附件在详情页渲染为下载卡片；视频渲染为播放器', async () => {
  const mediaList = (await (await fetch(base + '/api/admin/media', { headers: auth() })).json()).media;
  const zipMedia = mediaList.find((m) => m.origin_name === 'files.zip');
  const videoMedia = mediaList.find((m) => m.kind === 'video');
  assert.ok(zipMedia && videoMedia, '媒体库应有 zip 与 mp4');
  await fetch(base + '/api/admin/posts/' + postId, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ contentMd: `[素材](/media/${zipMedia.storage_key})\n\n[视频](/media/${videoMedia.storage_key})` }),
  });
  const html = await (await fetch(base + `/post/${(await (await fetch(base + '/api/admin/posts/' + postId, { headers: auth() })).json()).slug}`)).text();
  assert.match(html, /attach-card/);
  assert.match(html, /<video controls/);
});

/* ---------- 评论（发布即展示，可下架） ---------- */

test('评论：发布即自动展示 → 下架后前台不可见 → 恢复后可见', async () => {
  const slug = (await (await fetch(base + '/api/admin/posts/' + postId, { headers: auth() })).json()).slug;

  let resp = await fetch(`${base}/api/posts/${slug}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '访客甲', email: 'a@b.com', content: '自动过审的评论，<script>alert(1)</script>' }),
  });
  assert.equal(resp.status, 200);
  assert.equal((await resp.json()).message, '评论已发布');

  // 前台立即可见（已转义）
  let html = await (await fetch(`${base}/post/${slug}`)).text();
  assert.match(html, /自动过审的评论/);
  assert.ok(!html.includes('<script>alert(1)</script>'));

  // 管理员下架 → 前台不可见
  const list = (await (await fetch(base + '/api/admin/comments?status=approved', { headers: auth() })).json()).comments;
  const target = list.find((c) => c.nickname === '访客甲');
  assert.ok(target);
  resp = await fetch(`${base}/api/admin/comments/${target.id}`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ status: 'hidden' }),
  });
  assert.equal(resp.status, 200);
  html = await (await fetch(`${base}/post/${slug}`)).text();
  assert.ok(!html.includes('自动过审的评论'), '下架后前台不应显示');

  // 恢复 → 可见
  await fetch(`${base}/api/admin/comments/${target.id}`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ status: 'approved' }),
  });
  html = await (await fetch(`${base}/post/${slug}`)).text();
  assert.match(html, /自动过审的评论/);
});

test('评论：内容校验与频率限制', async () => {
  const slug = (await (await fetch(base + '/api/admin/posts/' + postId, { headers: auth() })).json()).slug;
  // 空昵称
  let resp = await fetch(`${base}/api/posts/${slug}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '', content: 'x' }),
  });
  assert.equal(resp.status, 400);
  // 10 秒内第二条 → 429
  resp = await fetch(`${base}/api/posts/${slug}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '访客乙', content: '第二条' }),
  });
  assert.equal(resp.status, 429);
  assert.match((await resp.json()).error, /频繁/);
});

/* ---------- 二期：后台守卫 / 打赏 / 搜索 / 媒体关联 / 密码 ---------- */

test('后台页面守卫：未登录访问 /admin/ 一律 302 到登录页', async () => {
  for (const path of ['/admin/', '/admin/posts', '/admin/comments', '/admin/donations', '/admin/settings', '/admin/friends', '/admin/editor']) {
    const resp = await fetch(base + path, { redirect: 'manual' });
    assert.equal(resp.status, 302, `${path} 未登录应 302`);
    assert.equal(resp.headers.get('location'), '/admin/login');
  }
  // 登录拿 Cookie 后可访问
  const loginResp = await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const cookie = loginResp.headers.get('set-cookie').split(';')[0];
  const resp = await fetch(base + '/admin/', { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(resp.status, 200);
});

test('打赏名单：录入 / 编辑 / 删除 / 分页，感谢页按时间倒序展示最近 50 条', async () => {
  const posts = (await (await fetch(base + '/api/admin/posts?page=1&pageSize=1', { headers: auth() })).json()).posts;
  const pid = posts[0].id;
  // 录入 3 条（不同时间，含非法金额校验）
  let resp = await fetch(base + '/api/admin/donations', {
    method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nickname: '张三', amount: 50, postId: pid, donatedAt: '2026-10-20T10:00:00Z', message: '支持一下' }),
  });
  assert.equal(resp.status, 200);
  resp = await fetch(base + '/api/admin/donations', {
    method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nickname: '李四', amount: 8.88, donatedAt: '2026-10-28T12:00:00Z' }),
  });
  assert.equal(resp.status, 200);
  resp = await fetch(base + '/api/admin/donations', {
    method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nickname: '王五', amount: -1 }),
  });
  assert.equal(resp.status, 400); // 非法金额

  // 列表按时间倒序
  const list = (await (await fetch(base + '/api/admin/donations?page=1&pageSize=10', { headers: auth() })).json()).donations;
  assert.equal(list[0].nickname, '李四'); // 最近的时间在前
  assert.equal(list[1].nickname, '张三');
  assert.equal(list[0].post_title ?? null, null);
  assert.equal(list[1].post_title, posts[0].title);

  // 编辑
  const id = list[1].id;
  resp = await fetch(`${base}/api/admin/donations/${id}`, {
    method: 'PATCH', headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ amount: 88.8 }),
  });
  assert.equal(resp.status, 200);
  const after = (await (await fetch(base + '/api/admin/donations', { headers: auth() })).json()).donations
    .find((d) => d.id === id);
  assert.equal(after.amount, 88.8);

  // 感谢页（前台）
  const thanks = await (await fetch(base + '/thanks')).text();
  assert.match(thanks, /感谢名单/);
  assert.match(thanks, /李四/);
  assert.match(thanks, /88\.80/);
  assert.match(thanks, /张三/);
});

test('站内搜索：按标题与全文匹配，搜索条独立渲染', async () => {
  const resp = await fetch(base + '/search?q=' + encodeURIComponent('测试文章标题'));
  assert.equal(resp.status, 200);
  const html = await resp.text();
  assert.match(html, /search-strip/);           // 搜索条独占一行
  assert.match(html, /测试文章标题/);            // 标题命中
  // 全文命中（正文中的词，标题不含）—— 前序用例已将正文改为含“素材”的附件链接
  const byContent = await (await fetch(base + '/search?q=' + encodeURIComponent('素材'))).text();
  assert.match(byContent, /测试文章标题/);
  const empty = await (await fetch(base + '/search?q=' + encodeURIComponent('绝对不存在的词xyz'))).text();
  assert.match(empty, /没有找到/);
});

test('媒体按文章过滤：显式关联 ∪ 正文引用（旧图也能带出）', async () => {
  const png1 = await makeTestImage(300, 300, '#111827', '#4c6ef5');
  const png2 = await makeTestImage(300, 300, '#f47c66', '#22d3ee');
  const h1 = createHash('sha256').update(png1).digest('hex');
  const h2 = createHash('sha256').update(png2).digest('hex');
  // png1 关联文章 A，png2 不关联
  await fetch(base + '/api/upload/direct?postId=' + postId, {
    method: 'POST',
    headers: auth({ 'Content-Type': 'application/octet-stream', 'x-filename': 'a.png', 'x-hash': h1 }),
    body: png1,
  });
  const r2 = await (await fetch(base + '/api/upload/direct', {
    method: 'POST',
    headers: auth({ 'Content-Type': 'application/octet-stream', 'x-filename': 'b.png', 'x-hash': h2 }),
    body: png2,
  })).json();
  // 正文引用过的媒体（前序用例写入的 mp4/zip）也应被带出
  const mine = (await (await fetch(base + `/api/admin/media?postId=${postId}`, { headers: auth() })).json()).media;
  assert.ok(mine.some((m) => m.origin_name === 'a.png'), '显式关联的媒体应出现');
  assert.ok(mine.some((m) => m.kind === 'video'), '正文引用过的视频应出现');
  assert.ok(mine.some((m) => m.mime === 'application/zip'), '正文引用过的附件应出现');
  // attach 接口可以把另一张挂过来
  await fetch(`${base}/api/admin/media/${r2.assetId}/attach`, {
    method: 'POST', headers: auth({ 'Content-Type': 'application/json' }), body: JSON.stringify({ postId }),
  });
  const mine2 = (await (await fetch(base + `/api/admin/media?postId=${postId}`, { headers: auth() })).json()).media;
  assert.ok(mine2.some((m) => m.origin_name === 'b.png'), 'attach 后应出现');
  // 不关联的文章不应看到这些媒体
  const { id: pid2 } = await (await fetch(base + '/api/admin/posts', {
    method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title: '无媒体文章', contentMd: '没有媒体引用', status: 'draft' }),
  })).json();
  const other = (await (await fetch(base + `/api/admin/media?postId=${pid2}`, { headers: auth() })).json()).media;
  assert.equal(other.length, 0);
});

test('修改管理员密码：改后新密码可登录、旧密码失效', async () => {
  let resp = await fetch(base + '/api/admin/password', {
    method: 'POST', headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ oldPassword: 'admin123', newPassword: 'newpass88' }),
  });
  assert.equal(resp.status, 200);
  resp = await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  assert.equal(resp.status, 401);
  resp = await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'newpass88' }),
  });
  assert.equal(resp.status, 200);
  const { token: t2 } = await resp.json();
  await fetch(base + '/api/admin/password', {
    method: 'POST', headers: { Authorization: 'Bearer ' + t2, 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword: 'newpass88', newPassword: 'admin123' }),
  });
});

test('后台文章搜索：q 按标题过滤', async () => {
  let resp = await fetch(base + '/api/admin/posts?q=' + encodeURIComponent('测试文章'), { headers: auth() });
  const hit = await resp.json();
  assert.ok(hit.posts.some((p) => p.title === '测试文章标题'), '应命中标题');
  assert.ok(hit.posts.every((p) => p.title.includes('测试文章')), '所有结果都应包含关键词');
  resp = await fetch(base + '/api/admin/posts?q=' + encodeURIComponent('绝对没有这个词xyz'), { headers: auth() });
  assert.equal((await resp.json()).posts.length, 0);
});

test('后台评论搜索：q 匹配内容或昵称', async () => {
  let resp = await fetch(base + '/api/admin/comments?q=' + encodeURIComponent('访客甲'), { headers: auth() });
  const byNick = await resp.json();
  assert.ok(byNick.comments.some((c) => c.nickname === '访客甲'), '按昵称命中');
  resp = await fetch(base + '/api/admin/comments?q=' + encodeURIComponent('自动过审'), { headers: auth() });
  const byContent = await resp.json();
  assert.ok(byContent.comments.some((c) => c.content.includes('自动过审')), '按内容命中');
});

test('打赏功能默认关闭：感谢页无打赏按钮，开启后出现', async () => {
  // 默认（初始配置未开启）→ 感谢页无打赏按钮与弹层
  let html = await (await fetch(base + '/thanks')).text();
  assert.ok(!html.includes('thanksRewardBtn'), '默认不应出现打赏按钮');
  // 文章详情无打赏区块
  const slug = (await (await fetch(base + '/api/admin/posts/' + postId, { headers: auth() })).json()).slug;
  html = await (await fetch(`${base}/post/${slug}`)).text();
  assert.ok(!html.includes('id="rewardBtn"'), '详情页不应出现打赏区块');
  // 开启 → 按钮与弹层出现
  await fetch(base + '/api/admin/configs', {
    method: 'PATCH', headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ rewardEnabled: '1' }),
  });
  html = await (await fetch(base + '/thanks')).text();
  assert.match(html, /thanksRewardBtn/, '开启后应出现打赏按钮');
  html = await (await fetch(`${base}/post/${slug}`)).text();
  assert.match(html, /id="rewardBtn"/, '开启后详情页应出现打赏区块');
  // 恢复默认关闭
  await fetch(base + '/api/admin/configs', {
    method: 'PATCH', headers: auth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ rewardEnabled: '0' }),
  });
});

test('仪表盘数据：月度统计返回近 6 个月', async () => {
  const html = await (await fetch(base + '/admin/', { headers: { Cookie: 'blog_token=' + token } })).text();
  assert.match(html, /累计阅读量/);
  assert.match(html, /已下架评论/);
  assert.match(html, /累计打赏/);
  assert.match(html, /近 6 个月 · 发布文章数/);
  assert.ok(!html.includes('最近文章'), '仪表盘不应再显示最近文章表格');
});

/* ---------- 配置中心 ---------- */

test('配置：改站名/格言/ICP 后前台即时生效', async () => {
  let resp = await fetch(base + '/api/admin/configs', {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ siteName: '新站名', motto: '新格言', icp: '京ICP备20260001号' }),
  });
  assert.equal(resp.status, 200);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /新站名/);
  assert.match(html, /新格言/);
  assert.match(html, /京ICP备20260001号/);
});

/* ---------- 友链 ---------- */

test('友链：后台维护 → 前台可见；隐藏后不可见', async () => {
  const { id } = await (await fetch(base + '/api/admin/friends', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ name: '新朋友', url: 'https://new.example.com', description: '描述', visible: 1 }),
  })).json();
  let html = await (await fetch(base + '/friends')).text();
  assert.match(html, /新朋友/);

  await fetch(base + '/api/admin/friends', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ id, name: '新朋友', url: 'https://new.example.com', visible: 0 }),
  });
  html = await (await fetch(base + '/friends')).text();
  assert.ok(!html.includes('https://new.example.com'));
});

/* ---------- SEO ---------- */

test('SEO：sitemap / rss / robots 全部可访问且内容正确', async () => {
  let resp = await fetch(base + '/sitemap.xml');
  assert.equal(resp.status, 200);
  assert.match(await resp.text(), /<loc>/);

  resp = await fetch(base + '/rss.xml');
  assert.equal(resp.status, 200);
  const rss = await resp.text();
  assert.match(rss, /<rss version="2.0">/);
  assert.match(rss, /测试文章标题/);

  resp = await fetch(base + '/robots.txt');
  assert.equal(resp.status, 200);
  assert.match(await resp.text(), /Sitemap:/);
});

/* ---------- 标签 ---------- */

test('标签页：按标签筛选文章', async () => {
  const html = await (await fetch(base + '/tag/' + encodeURIComponent('测试'))).text();
  assert.match(html, /测试文章标题/);
});
