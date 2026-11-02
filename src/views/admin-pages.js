// 后台视图：登录 / 布局 / 仪表盘（统计+图表）/ 文章 / 编辑器 / 评论 / 友链 / 打赏 / 设置
import { esc, buildFooterLine } from './front-layout.js';

/** 服务端 SVG 柱状图（零客户端依赖） */
function barChart(data, { color = 'var(--primary)', label = '' } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 280, H = 120, pad = 6;
  const n = data.length;
  const bw = (W - pad * 2) / n;
  const bars = data.map((d, i) => {
    const h = Math.max(2, (d.value / max) * (H - 34));
    const x = pad + i * bw + bw * 0.14;
    const y = H - 22 - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}" opacity="${d.value ? 0.9 : 0.25}"><title>${d.month}：${d.value}</title></rect>
    <text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="var(--text-3)">${d.month.slice(5)}</text>
    <text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="var(--text-2)" font-weight="600">${d.value}</text>`;
  }).join('');
  return `<div class="chart-card-inner"><p class="chart-label">${esc(label)}</p><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${bars}</svg></div>`;
}

export function adminLayout({ title, active, content, scripts = [], cfg = null }) {
  const items = [
    ['/admin/', '仪表盘'],
    ['/admin/posts', '文章'],
    ['/admin/comments', '评论'],
    ['/admin/donations', '打赏名单'],
    ['/admin/friends', '友链'],
    ['/admin/settings', '设置'],
  ];
  const nav = items.map(([url, label]) =>
    `<a class="admin-nav-link${active === url ? ' active' : ''}" href="${url}">${label}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} · 博客后台</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/css/app.css?v=2.5">
  <script>document.documentElement.dataset.theme = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');</script>
</head>
<body class="admin-body">
  <header class="admin-header">
    <div class="admin-header-inner">
      <a class="site-brand" href="/">← 返回博客</a>
      <nav class="admin-nav">${nav}</nav>
      <button class="icon-btn" id="logoutBtn" type="button" title="退出登录" aria-label="退出登录"><svg viewBox="0 0 24 24"><path d="M10 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8v-2h8V5h-8V3zm-1.6 5.6L5.8 11H14v2H5.8l2.6 2.4L7 16.8 2.2 12 7 7.2l1.4 1.4z"/></svg></button>
    </div>
  </header>
  <main class="admin-main">${content}</main>
  <footer class="site-footer"><p>${cfg ? buildFooterLine(cfg) : ''}</p></footer>
  <div class="toast" id="toast" role="status"></div>
  <script src="/js/common.js"></script>
  ${scripts.map((s) => typeof s === 'string'
    ? `<script src="${esc(s)}?v=2.5"></script>`
    : `<script type="module" src="${esc(s.src)}?v=2.5"></script>`).join('\n  ')}
</body>
</html>`;
}

export function loginPage(cfg = null) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录 · 博客后台</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/css/app.css?v=2.5">
  <script>document.documentElement.dataset.theme = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');</script>
</head>
<body class="admin-body">
  <div class="auth-wrap">
    <div class="card auth-card">
      <h1 class="auth-title">博客后台登录</h1>
      <form id="loginForm">
        <div class="field"><label class="field-label" for="username">用户名</label><input class="input" id="username" autocomplete="username" required></div>
        <div class="field"><label class="field-label" for="password">密码</label><input class="input" id="password" type="password" autocomplete="current-password" required></div>
        <p class="form-error" id="loginError" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">登 录</button>
      </form>
      <p class="auth-back"><a href="/">← 返回博客</a></p>
    </div>
  </div>
  <footer class="site-footer"><p>${cfg ? buildFooterLine(cfg) : ''}</p></footer>
  <script src="/js/common.js"></script>
  <script src="/js/login.js"></script>
</body>
</html>`;
}

export function dashboardPage({ stats, monthly }, cfg = null) {
  const cards = [
    ['已发布文章', `${stats.published}`, '篇'],
    ['草稿箱', `${stats.drafts}`, '篇'],
    ['累计阅读量', `${stats.views}`, '次'],
    ['已展示评论', `${stats.commentsApproved}`, '条'],
    ['已下架评论', `${stats.commentsHidden}`, '条'],
    ['累计打赏', Number(stats.donationTotal).toFixed(2), `元 / ${stats.donationCount} 笔`],
  ].map(([label, value, unit]) =>
    `<div class="card stat-card"><strong>${esc(String(value))}<span class="stat-unit">${esc(unit)}</span></strong><span>${esc(label)}</span></div>`).join('');
  const charts = [
    { key: 'posts', label: '近 6 个月 · 发布文章数', color: '#4c6ef5' },
    { key: 'comments', label: '近 6 个月 · 新增评论数', color: '#2f9e44' },
    { key: 'views', label: '近 6 个月 · 阅读量（按文章发布月）', color: '#f47c66' },
  ].map(({ key, label, color }) => barChart(monthly.map((m) => ({ month: m.month, value: m[key] })), { label, color })).join('');
  const content = `
  <h1 class="page-title">仪表盘</h1>
  <div class="stat-grid">${cards}</div>
  <div class="chart-grid">${charts}</div>`;
  return adminLayout({ title: '仪表盘', active: '/admin/', content, scripts: ['/js/admin-common.js'], cfg });
}

export function postsPage(cfg = null) {
  const content = `
  <div class="page-head">
    <h1 class="page-title">文章管理</h1>
    <a class="btn btn-primary" href="/admin/editor">＋ 新建文章</a>
  </div>
  <div class="card table-card">
    <div class="search-row">
      <svg class="search-row-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
      <input class="input" id="postSearchInput" placeholder="按文章标题搜索…（输入即查）" autocomplete="off">
    </div>
    <table class="admin-table" id="postsTable">
      <thead><tr><th>标题</th><th>状态</th><th>slug</th><th>阅读</th><th>日期</th><th>操作</th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="pager" id="postsPager"></div>
  </div>`;
  return adminLayout({ title: '文章管理', active: '/admin/posts', content, scripts: ['/js/admin-common.js', '/js/admin-posts.js'], cfg });
}

export function editorPage(cfg = null) {
  const content = `
  <div class="editor-grid">
    <section class="editor-main">
      <input class="input editor-title" id="postTitle" placeholder="文章标题" maxlength="120">
      <div class="card editor-card">
        <div class="editor-toolbar">
          <button type="button" class="btn btn-mini" data-md="bold" title="加粗">B</button>
          <button type="button" class="btn btn-mini" data-md="italic" title="斜体">I</button>
          <button type="button" class="btn btn-mini" data-md="h2" title="标题">H2</button>
          <button type="button" class="btn btn-mini" data-md="quote" title="引用">"</button>
          <button type="button" class="btn btn-mini" data-md="code" title="代码块">&lt;/&gt;</button>
          <button type="button" class="btn btn-mini" data-md="link" title="链接">🔗</button>
          <button type="button" class="btn btn-mini" data-md="image" title="插入图片">🖼</button>
          <button type="button" class="btn btn-mini" data-md="video" title="插入视频（mp4）">▶</button>
          <button type="button" class="btn btn-mini" data-md="attach" title="插入附件（zip/rar/7z）">📎</button>
          <span class="editor-hint">支持 Ctrl+V 直接粘贴图片 · 大文件自动分块续传</span>
        </div>
        <textarea class="input textarea editor-textarea mono" id="postContent" placeholder="用 Markdown 书写…（可 Ctrl+V 粘贴图片）"></textarea>
        <input type="file" id="editorFile" hidden multiple>
      </div>
      <p class="form-error" id="editorError" hidden></p>
      <div class="btn-row">
        <button class="btn btn-primary" id="publishBtn">发布</button>
        <button class="btn btn-ghost" id="draftBtn">存草稿</button>
        <a class="btn btn-ghost" href="/admin/posts">返回列表</a>
        <span class="hint" id="uploadHint"></span>
      </div>
    </section>
    <aside class="editor-side">
      <div class="card side-card">
        <p class="card-title">发布设置</p>
        <div class="field"><label class="field-label" for="postSummary">摘要（留空自动截取）</label><textarea class="input textarea" id="postSummary" rows="3" maxlength="200"></textarea></div>
        <div class="field"><label class="field-label" for="postTags">标签（英文逗号分隔）</label><input class="input" id="postTags" placeholder="例如: 前端, 随笔"></div>
        <div class="field"><label class="field-label" for="postCover">封面（从媒体库选择）</label>
          <div class="cover-pick">
            <input class="input" id="postCover" placeholder="媒体 ID 或留空" inputmode="numeric">
            <button class="btn btn-mini" id="coverPickBtn" type="button">选择</button>
          </div>
          <div class="cover-preview" id="coverPreview"></div>
        </div>
        <label class="check"><input type="checkbox" id="postPinned"> 置顶</label>
      </div>
      <div class="card side-card">
        <p class="card-title">本文媒体库 <span class="hint">（仅显示本文上传的文件）</span></p>
        <div class="media-grid" id="mediaGrid"></div>
        <button class="btn btn-mini btn-block" id="mediaMoreBtn" type="button">上传媒体</button>
      </div>
    </aside>
  </div>`;
  const l = adminLayout({ title: '编辑器', active: '/admin/posts', content, scripts: ['/js/admin-common.js', { src: '/js/uploader-bundle.js' }, '/js/admin-editor.js'], cfg });
  return l;
}

export function commentsPage(cfg = null) {
  const content = `
  <h1 class="page-title">评论管理 <span class="hint">（评论发布后自动展示，可在此下架或删除）</span></h1>
  <div class="seg-toggle" id="commentFilter">
    <button class="seg-btn active" data-status="" type="button">全部</button>
    <button class="seg-btn" data-status="approved" type="button">已展示</button>
    <button class="seg-btn" data-status="hidden" type="button">已下架</button>
  </div>
  <div class="card table-card">
    <div class="search-row">
      <svg class="search-row-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
      <input class="input" id="commentSearchInput" placeholder="按评论内容或昵称搜索…（输入即查）" autocomplete="off">
    </div>
    <table class="admin-table" id="commentsTable">
      <thead><tr><th>内容</th><th>昵称</th><th>文章</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="pager" id="commentsPager"></div>
  </div>`;
  return adminLayout({ title: '评论管理', active: '/admin/comments', content, scripts: ['/js/admin-common.js', '/js/admin-comments.js'], cfg });
}

export function donationsPage(cfg = null) {
  const content = `
  <h1 class="page-title">打赏名单管理 <span class="hint">（手工录入，按打赏时间倒序展示）</span></h1>
  <div class="card table-card">
    <p class="card-title">新增 / 编辑打赏记录</p>
    <form id="donationForm" class="inline-form">
      <input type="hidden" id="donationId">
      <input class="input" id="donationNickname" placeholder="打赏者昵称 *" required>
      <input class="input" id="donationAmount" type="number" step="0.01" min="0.01" placeholder="金额（元）*" required>
      <input class="input" id="donationTime" type="datetime-local" required>
      <div class="combo-wrap">
        <input class="input" id="donationPostSearch" placeholder="搜索文章标题（留空 = 全站支持）" autocomplete="off">
        <input type="hidden" id="donationPost">
        <div class="combo-list" id="donationPostList" hidden></div>
      </div>
      <input class="input" id="donationMessage" placeholder="留言（选填）">
      <button class="btn btn-primary btn-mini" type="submit">保存</button>
      <button class="btn btn-ghost btn-mini" type="button" id="donationReset">重置</button>
    </form>
  </div>
  <div class="card table-card">
    <table class="admin-table" id="donationsTable">
      <thead><tr><th>打赏者</th><th>金额</th><th>留言</th><th>文章</th><th>打赏时间</th><th>操作</th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="pager" id="donationsPager"></div>
  </div>`;
  return adminLayout({ title: '打赏名单管理', active: '/admin/donations', content, scripts: ['/js/admin-common.js', '/js/admin-donations.js'], cfg });
}

export function friendsAdminPage(cfg = null) {
  const content = `
  <h1 class="page-title">友链管理</h1>
  <div class="card table-card">
    <p class="card-title">新增 / 编辑</p>
    <form id="friendForm" class="inline-form">
      <input type="hidden" id="friendId">
      <input class="input" id="friendName" placeholder="站点名称 *" required>
      <input class="input" id="friendUrl" placeholder="https://… *" required>
      <input class="input" id="friendAvatar" placeholder="头像 URL">
      <input class="input" id="friendDesc" placeholder="一句话描述">
      <label class="check"><input type="checkbox" id="friendVisible" checked> 显示</label>
      <button class="btn btn-primary btn-mini" type="submit">保存</button>
      <button class="btn btn-ghost btn-mini" type="button" id="friendReset">重置</button>
    </form>
  </div>
  <div class="card table-card">
    <table class="admin-table" id="friendsTable">
      <thead><tr><th>名称</th><th>URL</th><th>描述</th><th>显示</th><th>操作</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>`;
  return adminLayout({ title: '友链管理', active: '/admin/friends', content, scripts: ['/js/admin-common.js', '/js/admin-friends.js'], cfg });
}

export function settingsPage(cfg = null) {
  const content = `
  <h1 class="page-title">站点设置 <span class="hint">（保存后前台即时生效）</span></h1>
  <form id="settingsForm">
    <div class="settings-grid">
      <div class="card side-card">
        <p class="card-title">基本信息</p>
        <div class="field"><label class="field-label">站名</label><input class="input" name="siteName"></div>
        <div class="field">
          <label class="field-label">站点描述（悬停头像时展示，支持换行）</label>
          <textarea class="input textarea" name="siteDesc" rows="6" placeholder="第一行…&#10;第二行…"></textarea>
        </div>
        <div class="field"><label class="field-label">昵称</label><input class="input" name="nickname"></div>
        <div class="field"><label class="field-label">格言</label><input class="input" name="motto"></div>
        <div class="field">
          <label class="field-label">头像 URL</label>
          <div class="cover-pick">
            <input class="input" name="avatar" placeholder="/media/… 或 https://…">
            <button class="btn btn-mini" type="button" id="avatarUploadBtn">上传</button>
          </div>
        </div>
      </div>
      <div class="card side-card">
        <p class="card-title">社交与页脚</p>
        <div class="field"><label class="field-label">GitHub</label><input class="input" name="socialGithub" placeholder="https://github.com/…"></div>
        <div class="field"><label class="field-label">邮箱</label><input class="input" name="socialEmail"></div>
        <div class="field"><label class="field-label">哔哩哔哩</label><input class="input" name="socialBilibili"></div>
        <label class="check"><input type="checkbox" name="socialRss" value="1"> 显示 RSS 图标</label>
        <div class="field"><label class="field-label">页脚附加文字（显示在 © 行之后，同一行）</label><input class="input" name="footerText"></div>
        <div class="field"><label class="field-label">ICP 备案号（留空不显示，与页脚同行）</label><input class="input" name="icp" placeholder="京ICP备XXXXXXXX号"></div>
      </div>
      <div class="card side-card">
        <p class="card-title">打赏</p>
        <label class="check"><input type="checkbox" name="rewardEnabled" value="1"> 启用打赏按钮与感谢名单页</label>
        <div class="field"><label class="field-label">打赏文案</label><input class="input" name="rewardText"></div>
        <div class="field">
          <label class="field-label">微信收款码</label>
          <div class="cover-pick">
            <input class="input" name="rewardWechat" placeholder="/media/…">
            <button class="btn btn-mini" type="button" id="wechatUploadBtn">上传</button>
          </div>
        </div>
        <div class="field">
          <label class="field-label">支付宝收款码</label>
          <div class="cover-pick">
            <input class="input" name="rewardAlipay" placeholder="/media/…">
            <button class="btn btn-mini" type="button" id="alipayUploadBtn">上传</button>
          </div>
        </div>
        <p class="form-hint">上传按钮直接传图并自动填入 URL</p>
      </div>
      <div class="card side-card">
        <p class="card-title">评论</p>
        <label class="check"><input type="checkbox" name="commentEnabled" value="1"> 启用评论（发布后自动展示）</label>
        <div class="field"><label class="field-label">关于页（Markdown）</label><textarea class="input textarea" name="aboutMd" rows="8"></textarea></div>
        <p class="card-title" style="margin-top:16px">管理员密码</p>
        <div class="field"><input class="input" id="oldPassword" type="password" placeholder="当前密码" autocomplete="current-password"></div>
        <div class="field"><input class="input" id="newPassword" type="password" placeholder="新密码（≥6 位）" autocomplete="new-password"></div>
        <button class="btn btn-ghost" type="button" id="changePwBtn">修改密码</button>
        <p class="form-error" id="passwordError" hidden></p>
      </div>
    </div>
    <button class="btn btn-primary" type="submit">保存全部设置</button>
  </form>`;
  return adminLayout({ title: '站点设置', active: '/admin/settings', content, scripts: ['/js/admin-common.js', { src: '/js/uploader-bundle.js' }, '/js/admin-settings.js'], cfg });
}
