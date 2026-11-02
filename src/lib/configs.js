// 配置中心：全部配置项入 configs 键值表，后台表单化编辑，前台实时渲染
export const CONFIG_DEFAULTS = {
  siteName: 'Yu 的博客',
  siteDesc: '记录、思考与分享',
  nickname: 'Yu',
  motto: '代码写诗意，生活有光。',
  avatar: '',            // 头像 URL 或 /media/xxx
  footerText: '',        // 页脚附加文字
  icp: '',               // ICP 备案号（留空不显示）
  socialGithub: '',
  socialEmail: '',
  socialBilibili: '',
  socialRss: '1',        // 是否显示 RSS 图标
  aboutMd: '## 关于\n\n在这里写下关于页内容（支持 Markdown）。',
  rewardEnabled: '0',   // 初始默认关闭；开启后才会出现打赏按钮 / 感谢名单入口
  rewardText: '如果这篇文章对你有帮助，欢迎请作者喝一杯咖啡 ☕',
  rewardWechat: '',      // 微信收款码 URL
  rewardAlipay: '',      // 支付宝收款码 URL
  commentEnabled: '1',
};

/** 读取全部配置（合并默认值），JSON 值自动解析 */
export function loadConfigs(db) {
  const raw = db.getAllConfigs();
  const out = { ...CONFIG_DEFAULTS };
  for (const [k, v] of Object.entries(raw)) {
    if (k in out) out[k] = v;
  }
  return out;
}

export function saveConfigs(db, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in CONFIG_DEFAULTS)) continue; // 白名单外不落库
    db.setConfig(k, String(v ?? ''));
  }
}
