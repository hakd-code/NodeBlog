// Markdown 渲染单测：XSS 防护 / 代码高亮 / TOC / 视频·附件扩展 / 摘要
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, renderMarkdown } from '../src/lib/markdown.js';

const md = createRenderer();

test('安全：禁用内联 HTML，脚本被转义', () => {
  const { html } = renderMarkdown(md, '正文 <script>alert(1)</script> <img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script>'), '不应存在可执行 script 标签');
  assert.ok(!html.includes('<img'), '不应存在原生 img 标签');
  assert.ok(html.includes('&lt;script&gt;'), 'HTML 已转义');
});

test('代码高亮：服务端生成 hljs 类名，语言标签与复制按钮齐全', () => {
  const src = '```js\nconst x = 1;\nconsole.log(x);\n```';
  const { html } = renderMarkdown(md, src);
  assert.match(html, /hljs-keyword/);
  assert.match(html, /class="code-lang">js</);
  assert.match(html, /code-copy/);
  assert.match(html, /data-code="const%20x/); // 原始代码以 URI 编码携带，供复制按钮使用
});

test('TOC：h2~h4 提取并注入锚点 id', () => {
  const src = '## 一、开始\n\n内容\n\n### 1.1 细节\n\n## 二、结束';
  const { html, tocHtml } = renderMarkdown(md, src);
  assert.match(html, /<h2 id="h-1">/);
  assert.match(html, /<h3 id="h-2">/);
  assert.match(tocHtml, /一、开始/);
  assert.match(tocHtml, /1\.1 细节/);
  assert.match(tocHtml, /二、结束/);
  // 嵌套层级：h3 在 h2 内
  assert.ok(tocHtml.indexOf('一、开始') < tocHtml.indexOf('1.1 细节'));
});

test('图片：懒加载与图注（alt）', () => {
  const { html } = renderMarkdown(md, '![这是图注](/media/a.png)');
  assert.match(html, /loading="lazy"/);
  assert.match(html, /这是图注/);
});

test('视频链接渲染为内置播放器', () => {
  const { html } = renderMarkdown(md, '[点我播放](/media/abc.mp4)');
  assert.match(html, /<video controls[^>]*src="\/media\/abc\.mp4"/);
  assert.ok(!html.includes('.mp4"></a>'), '不应是普通链接结尾');
});

test('附件链接渲染为下载卡片（带文件名与大小）', () => {
  const mediaLookup = () => ({ origin_name: '素材包.zip', size: 5 * 1024 * 1024 });
  const md2 = createRenderer({ mediaLookup });
  const { html } = renderMarkdown(md2, '[下载](/media/xyz.zip)');
  assert.match(html, /attach-card/);
  assert.match(html, /素材包\.zip/);
  assert.match(html, /5\.0 MB/);
  assert.match(html, /download/);
});

test('链接默认行为保留（http 外链）', () => {
  const { html } = renderMarkdown(md, '[GitHub](https://github.com)');
  assert.match(html, /href="https:\/\/github\.com"/);
  assert.match(html, /<\/a>/);
});

test('摘要：去标记取前 120 字', () => {
  const { summary } = renderMarkdown(md, '# 标题\n\n这是**正文**第一段，含[链接](https://x.com)。\n\n```js\ncode()\n```');
  assert.ok(!summary.includes('#'));
  assert.ok(!summary.includes('**'));
  assert.ok(!summary.includes('code()'));
  assert.ok(summary.includes('正文第一段'));
});

test('中文与 emoji 正常渲染', () => {
  const { html } = renderMarkdown(md, '你好，世界 🎉 **加粗中文**');
  assert.match(html, /你好，世界 🎉 <strong>加粗中文<\/strong>/);
});
