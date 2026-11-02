// slug 与配置单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomSlug, generateSlug, isValidSlug } from '../src/lib/slug.js';
import { CONFIG_DEFAULTS, loadConfigs, saveConfigs } from '../src/lib/configs.js';

test('slug：格式为 8 位安全字符，无 0/1/i/l/o', () => {
  for (let i = 0; i < 200; i++) {
    const s = randomSlug();
    assert.ok(isValidSlug(s), `非法 slug: ${s}`);
    assert.ok(!/[01ilo]/.test(s), `含易混字符: ${s}`);
  }
});

test('slug：唯一性生成（isTaken 冲突重试）', () => {
  const taken = new Set();
  for (let i = 0; i < 500; i++) {
    const s = generateSlug((x) => taken.has(x));
    assert.ok(!taken.has(s));
    taken.add(s);
  }
  // 全部占用时抛错
  assert.throws(() => generateSlug(() => true), /冲突/);
});

test('slug：isValidSlug 拒绝非法格式', () => {
  assert.equal(isValidSlug('abcd2345'), true);
  assert.equal(isValidSlug('abcd234'), false);     // 7 位
  assert.equal(isValidSlug('abcd23456'), false);   // 9 位
  assert.equal(isValidSlug('abcd234i'), false);    // 含 i
  assert.equal(isValidSlug('abcd2340'), false);    // 含 0
  assert.equal(isValidSlug(null), false);
});

test('配置：读取合并默认值，白名单外不落库', () => {
  const store = {};
  const fakeDb = {
    getAllConfigs: () => store,
    setConfig: (k, v) => { store[k] = v; },
  };
  let cfg = loadConfigs(fakeDb);
  assert.equal(cfg.siteName, CONFIG_DEFAULTS.siteName);
  assert.equal(cfg.icp, '');
  saveConfigs(fakeDb, { siteName: '测试站', icp: '京ICP备0001号', hacker_key: 'x' });
  cfg = loadConfigs(fakeDb);
  assert.equal(cfg.siteName, '测试站');
  assert.equal(cfg.icp, '京ICP备0001号');
  assert.equal('hacker_key' in store, false, '白名单外配置不应写入');
});
