// 前台视图工具 + AnZhiYu 风格页面骨架（毛玻璃顶栏 / 回顶回底浮钮 / 单行页脚）

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}


/** 页脚一行：© 2021-今年 站名 · 附加文字 · ICP（前后台共用，保证一致） */
export function buildFooterLine(cfg) {
  if (!cfg) return '';
  return [
    `© 2021-${new Date().getFullYear()} ${esc(cfg.siteName)}`,
    cfg.footerText ? esc(cfg.footerText) : '',
    cfg.icp ? `<a class="icp-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener nofollow">${esc(cfg.icp)}</a>` : '',
  ].filter(Boolean).join(' · ');
}

function socialIcons(cfg) {
  const icons = [];
  if (cfg.socialGithub) {
    icons.push(`<a href="${esc(cfg.socialGithub)}" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg></a>`);
  }
  if (cfg.socialBilibili) {
    icons.push(`<a href="${esc(cfg.socialBilibili)}" target="_blank" rel="noopener" title="哔哩哔哩" aria-label="哔哩哔哩"><svg viewBox="0 0 24 24"><path d="M17.8 4.6 19.4 3l1.3 1.3-1.5 1.5H21a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7.8a2 2 0 0 1 2-2h1.8L3.3 4.3 4.6 3l1.6 1.6L7.8 3 9 4.3 7.6 5.8h8.8L15 4.3 16.2 3l1.6 1.6zM21 9.5H3V19h18V9.5zM7.5 12.5a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1zm9 0a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1z"/></svg></a>`);
  }
  if (cfg.socialEmail) {
    icons.push(`<a href="mailto:${esc(cfg.socialEmail)}" title="邮箱" aria-label="邮箱"><svg viewBox="0 0 24 24"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2v.5l8 5 8-5V7l-8 5-8-5z"/></svg></a>`);
  }
  if (cfg.socialRss === '1') {
    icons.push(`<a href="/rss.xml" title="RSS 订阅" aria-label="RSS"><svg viewBox="0 0 24 24"><path d="M5 19a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM4 4c8.8 0 16 7.2 16 16h-3A13 13 0 0 0 4 7V4zm0 6a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7v-3z"/></svg></a>`);
  }
  return icons.join('');
}

/**
 * 前台骨架
 * @param {object} opts { cfg, nav, title, description, path, content, scripts, bodyClass, search, searchQ }
 *   search: 传 true 时在导航下方渲染独占一行的全站搜索框；searchQ 为回填的搜索词
 */
export function frontLayout({ cfg, nav, title, description, path = '/', content, scripts = [], bodyClass = '', search = false, searchQ = '' }) {
  const navHtml = (nav || [])
    .map((n) => `<a class="nav-link${n.url === path ? ' active' : ''}" href="${esc(n.url)}">${esc(n.label)}</a>`)
    .join('');
  // 页脚：© 2021-今年 站名 · 附加文字 · ICP 全部一行
  const footerLine = buildFooterLine(cfg);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title ? title + ' · ' : '')}${esc(cfg.siteName)}</title>
  <meta name="description" content="${esc(description || cfg.siteDesc)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/rss+xml" title="${esc(cfg.siteName)}" href="/rss.xml">
  <link rel="stylesheet" href="/css/app.css?v=2.7">
  <script>document.documentElement.dataset.theme = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');</script>
</head>
<body class="blog-body ${esc(bodyClass)}">
  <header class="site-header">
    <div class="site-header-inner">
      <a class="site-brand" href="/">${esc(cfg.siteName)}</a>
      <nav class="site-nav">${navHtml}</nav>
      <div class="site-actions">
        <button class="icon-btn" id="themeToggle" type="button" title="切换深色 / 浅色模式" aria-label="切换主题">
          <svg class="icon-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19"/></g></svg>
          <svg class="icon-moon" viewBox="0 0 24 24"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" fill="currentColor"/></svg>
        </button>
        <a class="icon-btn" href="/admin/" title="管理" aria-label="管理"><svg viewBox="0 0 24 24"><path d="M12 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 12c4.4 0 8 2.2 8 5v1H4v-1c0-2.8 3.6-5 8-5z"/></svg></a>
      </div>
    </div>
  </header>
  ${search ? `<div class="search-strip">
    <div class="search-strip-inner">
      <svg viewBox="0 0 24 24" class="search-strip-icon" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
      <input type="search" class="input search-strip-input" id="siteSearch" placeholder="搜索文章：支持标题与全文…"
             aria-label="搜索文章" value="${esc(searchQ)}">
    </div>
  </div>` : ''}
  <main class="site-main">
${content}
  </main>
  <footer class="site-footer">
    <p>${footerLine}</p>
  </footer>
  <div class="float-btns" id="floatBtns">
    <button class="float-btn" id="toTopBtn" type="button" title="回到顶部" aria-label="回到顶部"><svg viewBox="0 0 24 24"><path d="M12 5l7 7-1.6 1.6L13 9.2V20h-2V9.2l-4.4 4.4L5 12z"/></svg></button>
    <button class="float-btn" id="toBottomBtn" type="button" title="去往底部" aria-label="去往底部"><svg viewBox="0 0 24 24"><path d="M12 19l-7-7 1.6-1.6L11 14.8V4h2v10.8l4.4-4.4L19 12z"/></svg></button>
  </div>
  <script src="/js/common.js"></script>
  ${scripts.map((s) => `<script src="${esc(s)}?v=2.7"></script>`).join('\n  ')}
</body>
</html>`;
}

/** 右侧个人信息卡（头像悬停显示站点描述） */
export function profileCard(cfg, stats) {
  return `<aside class="card profile-card">
    <div class="profile-avatar">
      ${cfg.avatar ? `<img src="${esc(cfg.avatar)}" alt="头像">` : `<span class="profile-avatar-fallback">${esc((cfg.nickname || 'B')[0])}</span>`}
      ${cfg.siteDesc ? `<span class="avatar-pop">${esc(cfg.siteDesc)}</span>` : ''}
    </div>
    <p class="profile-name">${esc(cfg.nickname)}</p>
    <p class="profile-motto">${esc(cfg.motto)}</p>
    <div class="profile-social">${socialIcons(cfg)}</div>
    <div class="profile-stats">
      <div><strong>${stats?.posts ?? 0}</strong><span>文章</span></div>
      <div><strong>${stats?.tags ?? 0}</strong><span>标签</span></div>
      <div><strong>${stats?.views ?? 0}</strong><span>阅读</span></div>
    </div>
  </aside>`;
}
