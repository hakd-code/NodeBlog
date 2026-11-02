// hexo front-matter 解析与迁移逻辑单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontMatter } from '../src/lib/frontmatter.js';
import { hexoOldPaths } from '../src/migrate-hexo.js';

test('旧 URL 反推：abbrlink 与日期型 permalink 全覆盖', () => {
  const paths = hexoOldPaths({ abbrlink: '5a17f2c1', date: '2024-03-15 10:30:00' }, 'post.md');
  assert.ok(paths.includes('/2024/03/15/5a17f2c1/'));
  assert.ok(paths.includes('/24/03/15/5a17f2c1/'));
  assert.ok(paths.includes('/posts/5a17f2c1/'));
  assert.ok(paths.includes('/posts/5a17f2c1.html'));
  const paths2 = hexoOldPaths({ title: '我的文章' }, '我的文章.md');
  assert.ok(paths2.includes('/我的文章/'));
  assert.ok(paths2.includes('/posts/我的文章/'));
});

test('front-matter：标准 hexo 文章（title/date/tags/categories/abbrlink）', () => {
  const raw = `---
title: "你好，Hexo"
date: 2024-03-15 10:30:00
tags:
  - 前端
  - 随笔
categories:
  - 技术笔记
abbrlink: 5a17f2c1
cover: /images/cover.png
---

正文内容

## 标题

一段文字。`;
  const { data, body } = parseFrontMatter(raw);
  assert.equal(data.title, '你好，Hexo');
  assert.equal(data.date, '2024-03-15 10:30:00');
  assert.deepEqual(data.tags, ['前端', '随笔']);
  assert.deepEqual(data.categories, ['技术笔记']);
  assert.equal(data.abbrlink, '5a17f2c1');
  assert.equal(data.cover, '/images/cover.png');
  assert.match(body, /正文内容/);
  assert.ok(!body.startsWith('---'));
});

test('front-matter：行内数组写法', () => {
  const { data } = parseFrontMatter('---\ntitle: X\ntags: [a, b, c]\n---\nbody');
  assert.deepEqual(data.tags, ['a', 'b', 'c']);
});

test('front-matter：无 front-matter 时原样返回', () => {
  const { data, body } = parseFrontMatter('# 纯内容\n\n没有头部');
  assert.deepEqual(data, {});
  assert.match(body, /纯内容/);
});

test('front-matter：draft / published 标记可读（布尔自动转换）', () => {
  assert.equal(parseFrontMatter('---\ntitle: A\ndraft: true\n---\nx').data.draft, true);
  assert.equal(parseFrontMatter('---\ntitle: B\npublished: false\n---\nx').data.published, false);
  assert.equal(parseFrontMatter('---\ntitle: C\npublished: true\n---\nx').data.published, true);
});

test('front-matter：引号与特殊字符', () => {
  const { data } = parseFrontMatter('---\ntitle: "带: 冒号的标题"\nslug: \'quoted\'\n---\nx');
  assert.equal(data.title, '带: 冒号的标题');
  assert.equal(data.slug, 'quoted');
});
