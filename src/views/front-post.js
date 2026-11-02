// 前台：文章详情页（AnZhiYu 风格全宽封面模糊头部 + 波浪分隔 / TOC 滚动高亮 / 打赏增强 / 评论）
import { frontLayout, profileCard, esc, fmtDate } from './front-layout.js';

export function postPage({ cfg, nav, post, tags, comments, commentEnabled, reward, stats }) {
  // 字数（去 Markdown 标记的近似正文字数）与阅读时长（按 400 字/分钟）
  const wordCount = (post.content_md || '').replace(/\s/g, '').length;
  const readMinutes = Math.max(1, Math.round(wordCount / 400));
  const updatedShown = post.updated_at && post.published_at &&
    (new Date(post.updated_at).getTime() - new Date(post.published_at).getTime() > 60_000);

  const rewardHtml = reward.enabled ? `
    <div class="reward-author">
      <span class="reward-avatar">${cfg.avatar ? `<img src="${esc(cfg.avatar)}" alt="站主头像">` : esc((cfg.nickname || 'B')[0])}</span>
      <div class="reward-author-info">
        <p class="reward-nickname">${esc(cfg.nickname)}<span class="reward-site">· ${esc(cfg.siteName)}</span></p>
        <p class="reward-declare">本博客所有文章除特别声明外，均采用 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh" target="_blank" rel="noopener nofollow">CC BY-NC-SA 4.0</a> 许可协议。转载请注明来自 <strong>${esc(cfg.siteName)}</strong>！</p>
      </div>
    </div>
    <div class="reward-actions">
      <button class="btn btn-reward" id="rewardBtn" type="button">☕ 打赏支持</button>
      <a class="btn btn-ghost" href="/thanks" id="thanksBtn">🙏 打赏名单</a>
    </div>
    <p class="reward-text">${esc(reward.text)}</p>
    <div class="reward-modal" id="rewardModal" hidden>
      <div class="reward-modal-panel">
        <button class="reward-close" id="rewardClose" type="button" aria-label="关闭">×</button>
        <p class="reward-modal-title">感谢你的支持 🎉</p>
        <div class="reward-qr-list">
          ${reward.wechat ? `<figure><img src="${esc(reward.wechat)}" alt="微信收款码"><figcaption>微信</figcaption></figure>` : ''}
          ${reward.alipay ? `<figure><img src="${esc(reward.alipay)}" alt="支付宝收款码"><figcaption>支付宝</figcaption></figure>` : ''}
          ${!reward.wechat && !reward.alipay ? '<p class="empty-note">站长尚未配置收款码</p>' : ''}
        </div>
      </div>
    </div>` : '';

  const tagsHtml = tags.map((t) => `<a class="post-tag on-hero" href="/tag/${encodeURIComponent(t.name)}"># ${esc(t.name)}</a>`).join('');
  const commentsHtml = comments.map((c) => `
    <li class="comment-item">
      <div class="comment-head">
        <strong>${esc(c.nickname)}</strong>
        ${c.site ? `<a href="${esc(c.site)}" target="_blank" rel="noopener nofollow" class="comment-site">主页</a>` : ''}
        <time>${esc(fmtDate(c.created_at))}</time>
      </div>
      <p class="comment-body">${esc(c.content)}</p>
    </li>`).join('\n');

  const commentForm = commentEnabled ? `
    <div class="card comment-form-card">
      <p class="card-title">发表评论</p>
      <form id="commentForm" data-slug="${esc(post.slug)}">
        <div class="comment-form-row">
          <input class="input" name="nickname" placeholder="昵称 *" required maxlength="30">
          <input class="input" name="email" type="email" placeholder="邮箱（不公开）" maxlength="60">
          <input class="input" name="site" placeholder="主页（选填）" maxlength="100">
        </div>
        <textarea class="input textarea" name="content" rows="3" placeholder="说点什么… *" required maxlength="500"></textarea>
        <p class="form-error" id="commentError" hidden></p>
        <button class="btn btn-primary" type="submit">提交评论</button>
      </form>
    </div>` : '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.summary,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: { '@type': 'Person', name: cfg.nickname },
  };

  const content = `
  <header class="post-hero${post.cover_url ? ' has-cover' : ''}" ${post.cover_url ? `style="--hero-img:url('${esc(post.cover_url)}')"` : ''}>
    <div class="post-hero-inner">
      <div class="hero-top-row">
        ${tagsHtml || '<span class="hero-chip">文章</span>'}
      </div>
      <h1 class="post-hero-title">${esc(post.title)}</h1>
      <div class="hero-meta-row">
        <span class="bm-item"><svg viewBox="0 0 24 24"><path d="M7 2h2v3H7zM15 2h2v3h-2zM4 6h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 5v9h16v-9z"/></svg>发表于 ${esc(fmtDate(post.published_at || post.created_at))}</span>
        ${updatedShown ? `<span class="bm-item"><svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 1 0 8.95 10h-2.02A7 7 0 1 1 13 5a6.96 6.96 0 0 1 4.95 2.05L15 10h7V3l-2.64 2.64A8.96 8.96 0 0 0 13 3zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8z"/></svg>更新于 ${esc(fmtDate(post.updated_at))}</span>` : ''}
      </div>
      <div class="hero-meta-row">
        <span class="bm-item"><svg viewBox="0 0 24 24"><path d="M4 5h16v3H4zm0 5.5h16v3H4zm0 5.5h10v3H4z"/></svg>字数总计：${wordCount >= 1000 ? (wordCount / 1000).toFixed(1) + 'k' : wordCount}</span>
        <span class="bm-item"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm1 9.4V7h-2v6.4l4.5 2.7 1-1.7z"/></svg>阅读时长：约 ${readMinutes} 分钟</span>
        <span class="bm-item"><svg viewBox="0 0 24 24"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>阅读量：${post.view_count}</span>
      </div>
    </div>
    <svg class="hero-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0,50 C180,95 360,5 560,35 C760,65 940,15 1140,45 C1290,68 1380,45 1440,55 L1440,90 L0,90 Z" fill="var(--bg)"></path>
      <path d="M0,62 C200,98 420,28 640,52 C860,76 1080,34 1260,58 C1350,70 1410,60 1440,64 L1440,90 L0,90 Z" fill="var(--bg)" opacity=".55"></path>
    </svg>
  </header>
  <div class="home-grid post-body-grid">
    <article class="home-list post-detail">
      <div class="card post-detail-card">
        <div class="post-content">${post.content_html}</div>
        ${rewardHtml}
      </div>
      <section class="comments-section card">
        <p class="card-title">评论（${comments.length}）</p>
        <ul class="comment-list">${commentsHtml || '<li class="empty-note">还没有评论，来说两句吧</li>'}</ul>
        ${commentForm}
      </section>
    </article>
    <aside class="home-sidebar">
      ${profileCard(cfg, stats)}
      ${post.toc_html ? `<div class="card toc-card">${post.toc_html}</div>` : ''}
    </aside>
  </div>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  return frontLayout({
    cfg, nav,
    title: post.title,
    description: post.summary || cfg.siteDesc,
    path: `/post/${post.slug}`,
    content,
    scripts: ['/js/post.js'],
  });
}
