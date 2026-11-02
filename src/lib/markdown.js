// Markdown 渲染：markdown-it + highlight.js（服务端高亮，零客户端 JS）
// 链接渲染扩展：.mp4 → 内置播放器；.zip/.rar/.7z → 附件下载卡片
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes > 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

export function createRenderer({ mediaLookup } = {}) {
  const md = new MarkdownIt({
    html: false,        // 禁用内联 HTML，天然防 XSS
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch { /* fallthrough */ }
      }
      return ''; // markdown-it 默认 escape
    },
  });

  // 代码块：语言标签 + 复制按钮（复制由页面内联小脚本完成）
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = (token.info || '').trim().split(/\s+/)[0] || 'text';
    const inner = defaultFence ? defaultFence(tokens, idx, options, env, self) : `<pre><code>${md.utils.escapeHtml(token.content)}</code></pre>`;
    return `<div class="code-block"><div class="code-head"><span class="code-lang">${md.utils.escapeHtml(lang)}</span><button type="button" class="code-copy" data-code="${md.utils.escapeHtml(encodeURIComponent(token.content))}">复制代码</button></div>${inner}</div>`;
  };

  // 图片：懒加载 + figure 图注（alt 作为图注）
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const alt = token.content || '';
    const src = token.attrGet('src') || '';
    const html = defaultImage
      ? defaultImage(tokens, idx, options, env, self)
      : `<img src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(alt)}">`;
    return `<span class="md-figure">${html.replace('<img ', '<img loading="lazy" ')}${alt ? `<span class="md-figcaption">${md.utils.escapeHtml(alt)}</span>` : ''}</span>`;
  };

  // 链接扩展：视频 / 附件
  const defaultLink = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href') || '';
    const text = tokens[idx + 1]?.content || href;
    const lower = href.toLowerCase();
    if (lower.endsWith('.mp4')) {
      tokens[idx].attrSet('data-video', '1');
    } else if (lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z')) {
      const media = mediaLookup ? mediaLookup(href) : null;
      const name = media?.origin_name || text || href.split('/').pop();
      const size = media ? fmtSize(media.size) : '';
      tokens[idx].attrSet('data-attachment', JSON.stringify({ name, size, href }));
    }
    return defaultLink(tokens, idx, options, env, self);
  };

  const defaultLinkClose = md.renderer.rules.link_close || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_close = (tokens, idx, options, env, self) => {
    const open = tokens[idx - 1]; // link_open 不一定紧邻，向前找
    let attrs = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (tokens[i].type === 'link_open') { attrs = tokens[i].attrs; break; }
    }
    void open;
    if (attrs) {
      const video = attrs.find((a) => a[0] === 'data-video');
      if (video) {
        const href = attrs.find((a) => a[0] === 'href')?.[1] || '';
        return `</a><span class="video-embed"><video controls preload="metadata" src="${md.utils.escapeHtml(href)}"></video></span>`;
      }
      const att = attrs.find((a) => a[0] === 'data-attachment');
      if (att) {
        const info = JSON.parse(att[1]);
        return `</a><span class="attach-embed"><a class="attach-card" href="${md.utils.escapeHtml(info.href)}" download><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 2h8l6 6v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" opacity=".85"/><path d="M14 2v6h6" fill="none" stroke="#fff" stroke-width="1.6"/></svg><span class="attach-name">${md.utils.escapeHtml(info.name)}</span><span class="attach-size">${md.utils.escapeHtml(info.size)}</span><span class="attach-dl">下载</span></a></span>`;
      }
    }
    return defaultLinkClose(tokens, idx, options, env, self);
  };

  return md;
}

/** 渲染 MD → { html, tocHtml, summary } */
export function renderMarkdown(md, source) {
  const html = md.render(source || '');

  // 提取 h2~h4 构建 TOC，并注入锚点 id
  const headings = [];
  let counter = 0;
  const html2 = html.replace(/<h([2-4])>(.*?)<\/h\1>/gs, (m, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    const id = 'h-' + (++counter);
    headings.push({ level: Number(level), text, id });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });

  let tocHtml = '';
  if (headings.length) {
    tocHtml = '<nav class="toc"><p class="toc-title">目录</p><ul>';
    let depth = 2;
    for (const h of headings) {
      while (depth < h.level) { tocHtml += '<ul>'; depth++; }
      while (depth > h.level) { tocHtml += '</ul>'; depth--; }
      tocHtml += `<li><a href="#${h.id}">${escapeHtml2(h.text)}</a></li>`;
    }
    while (depth > 2) { tocHtml += '</ul>'; depth--; }
    tocHtml += '</ul></nav>';
  }

  // 摘要：去 MD 标记取前 120 字
  const summary = (source || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`~\-|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return { html: html2, tocHtml, summary };
}

function escapeHtml2(s) {
  return String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
