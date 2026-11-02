// 前台：首页（搜索条 + 文章卡片列表 + 分页 + 个人信息侧栏）/ 标签页 / 友链页 / 关于页 / 搜索结果页
import { frontLayout, profileCard, esc, fmtDate } from './front-layout.js';

function postCard(p, tags) {
  const cover = p.cover_url ? `<a class="post-card-cover" href="/post/${esc(p.slug)}"><img src="${esc(p.cover_url)}" alt="${esc(p.title)}" loading="lazy"></a>` : '';
  const tagHtml = (tags || []).map((t) => `<a class="post-tag" href="/tag/${encodeURIComponent(t.name)}"># ${esc(t.name)}</a>`).join('');
  return `<article class="card post-card${p.pinned ? ' pinned' : ''}">
    ${cover}
    <div class="post-card-body">
      ${p.pinned ? '<span class="pinned-flag">置顶</span>' : ''}
      <h2 class="post-card-title"><a href="/post/${esc(p.slug)}">${esc(p.title)}</a></h2>
      <p class="post-card-summary">${esc(p.summary || '')}</p>
      <div class="post-card-meta">
        <time>${esc(fmtDate(p.published_at || p.created_at))}</time>
        <span>${p.view_count} 阅读</span>
        ${tagHtml}
      </div>
    </div>
  </article>`;
}

export function homePage({ cfg, nav, posts, tagsOf, page, totalPages, total, stats }) {
  const cards = posts.map((p) => postCard(p, tagsOf(p.id))).join('\n      ');
  const pager = pagination(page, totalPages, '/');
  const content = `
  <div class="home-grid">
    <section class="home-list">
      ${cards || '<p class="empty-note">还没有文章，去后台发布第一篇吧</p>'}
      ${pager}
    </section>
    <aside class="home-sidebar">
      ${profileCard(cfg, stats)}
      <div class="card tag-cloud">
        <p class="card-title">标签</p>
        <div class="tag-cloud-list">${(stats?.tagList || []).map((t) => `<a class="post-tag" href="/tag/${encodeURIComponent(t.name)}">${esc(t.name)}<span>${t.count}</span></a>`).join('') || '<span class="empty-note">暂无</span>'}</div>
      </div>
    </aside>
  </div>`;
  return frontLayout({
    cfg, nav,
    title: page > 1 ? `第 ${page} 页` : '',
    description: cfg.siteDesc,
    path: '/',
    content,
    search: true,
    searchQ: '',
  });
}

export function tagPage({ cfg, nav, tag, posts, tagsOf, stats }) {
  const cards = posts.map((p) => postCard(p, tagsOf(p.id))).join('\n      ');
  const content = `
  <div class="home-grid">
    <section class="home-list">
      <h1 class="page-title">标签：${esc(tag)}</h1>
      ${cards || '<p class="empty-note">该标签下暂无文章</p>'}
    </section>
    <aside class="home-sidebar">${profileCard(cfg, stats)}</aside>
  </div>`;
  return frontLayout({ cfg, nav, title: `标签：${tag}`, description: `标签 ${tag} 下的全部文章`, path: '/', content });
}

export function friendsPage({ cfg, nav, friends, stats }) {
  const items = friends.map((f) => `
    <a class="card friend-card" href="${esc(f.url)}" target="_blank" rel="noopener nofollow">
      <span class="friend-avatar">${f.avatar ? `<img src="${esc(f.avatar)}" alt="${esc(f.name)}" loading="lazy">` : esc(f.name[0])}</span>
      <span class="friend-info">
        <strong>${esc(f.name)}</strong>
        <span>${esc(f.description)}</span>
      </span>
    </a>`).join('\n      ');
  const content = `
  <div class="home-grid">
    <section class="home-list">
      <h1 class="page-title">友情链接</h1>
      <div class="friend-grid">
        ${items || '<p class="empty-note">暂无友链</p>'}
      </div>
    </section>
    <aside class="home-sidebar">${profileCard(cfg, stats)}</aside>
  </div>`;
  return frontLayout({ cfg, nav, title: '友情链接', description: '朋友们的站点', path: '/friends', content });
}

export function aboutPage({ cfg, nav, html, stats }) {
  const content = `
  <div class="home-grid">
    <section class="home-list">
      <article class="card post-detail-card">
        <h1 class="page-title">关于</h1>
        <div class="post-content">${html}</div>
      </article>
    </section>
    <aside class="home-sidebar">${profileCard(cfg, stats)}</aside>
  </div>`;
  return frontLayout({ cfg, nav, title: '关于', description: '关于博主', path: '/about', content });
}

/** 搜索结果页（按标题与全文匹配） */
export function searchPage({ cfg, nav, q, posts, tagsOf, stats }) {
  const cards = posts.map((p) => postCard(p, tagsOf(p.id))).join('\n      ');
  const content = `
  <div class="home-grid">
    <section class="home-list">
      <h1 class="page-title">搜索“${esc(q)}”的结果（${posts.length}）</h1>
      ${cards || `<p class="empty-note">没有找到与「${esc(q)}」相关的文章，换个关键词试试</p>`}
    </section>
    <aside class="home-sidebar">${profileCard(cfg, stats)}</aside>
  </div>`;
  return frontLayout({ cfg, nav, title: `搜索：${q}`, description: `搜索 ${q} 的结果`, path: '/search', content, search: true, searchQ: q });
}

/** 感谢页：打赏者名单（最近 50 条，华丽排版表示感谢） */
export function thanksPage({ cfg, nav, donations, totalAmount, total, reward }) {
  const rewardModal = reward && reward.enabled ? `
  <div class="reward-modal" id="rewardModal" hidden>
    <div class="reward-modal-panel">
      <button class="reward-close" id="rewardClose" type="button" aria-label="关闭">×</button>
      <p class="reward-modal-title">感谢你的支持 🎉</p>
      <div class="reward-qr-list">
        ${reward.wechat ? `<figure><img src="${esc(reward.wechat)}" alt="微信收款码"><figcaption>微信</figcaption></figure>` : ''}
        ${reward.alipay ? `<figure><img src="${esc(reward.alipay)}" alt="支付宝收款码"><figcaption>支付宝</figcaption></figure>` : ''}
        ${!reward.wechat && !reward.alipay ? '<p class="empty-note">站长尚未配置收款码，可在后台「站点设置」上传</p>' : ''}
      </div>
    </div>
  </div>` : '';
  const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="rank-no">${i + 1}</span>`);
  const items = donations.map((d, i) => `
    <div class="card thank-card">
      <div class="thank-rank">${medal(i)}</div>
      <div class="thank-main">
        <p class="thank-name">${esc(d.nickname)}<span class="thank-amount">¥${Number(d.amount).toFixed(2)}</span></p>
        ${d.message ? `<p class="thank-message">“${esc(d.message)}”</p>` : ''}
        <p class="thank-meta">
          <time>${esc(fmtDate(d.donated_at))}</time>
          ${d.post_title && d.post_slug ? `<span>·</span><a href="/post/${esc(d.post_slug)}">${esc(d.post_title)}</a>` : '<span>·</span><span>全站支持</span>'}
        </p>
      </div>
    </div>`).join('\n      ');

  const content = `
  <section class="thanks-hero">
    ${reward.enabled ? `<div class="thanks-cta">
      <button class="btn btn-reward" id="thanksRewardBtn" type="button">☕ 打赏支持</button>
    </div>` : ''}
    <h1>🎉 感谢名单</h1>
    <p>每一位支持都是继续写作的动力 —— 累计 <strong>${Number(totalAmount).toFixed(2)}</strong> 元 · 共 <strong>${total}</strong> 位（笔）支持</p>
    <p class="thanks-sub">名单按打赏时间倒序，仅展示最近 50 条</p>
  </section>
  <div class="thank-list">
      ${items || '<p class="empty-note" style="text-align:center">还没有打赏记录，点击上方「打赏支持」成为第一位吧</p>'}
  </div>
  ${rewardModal}`;
  return frontLayout({ cfg, nav, title: '感谢名单', description: '打赏者名单，感谢每一位支持', path: '/thanks', content, scripts: ['/js/thanks.js'] });
}

function pagination(page, totalPages, basePath) {
  if (totalPages <= 1) return '';
  let html = '<nav class="pager">';
  if (page > 1) html += `<a class="pager-link" href="${basePath}${page - 1 === 1 ? '' : '?page=' + (page - 1)}">← 上一页</a>`;
  html += `<span class="pager-info">${page} / ${totalPages}</span>`;
  if (page < totalPages) html += `<a class="pager-link" href="${basePath}?page=${page + 1}">下一页 →</a>`;
  return html + '</nav>';
}
