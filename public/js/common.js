// 前台公共脚本：主题切换 + Toast + 代码复制（极小体积，前台唯一 JS）
(function () {
  'use strict';
  var toastEl = document.getElementById('toast');
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }
  window.blogToast = toast;

  var toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var root = document.documentElement;
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      localStorage.setItem('theme', next);
    });
  }

  // 代码块复制
  document.addEventListener('click', async function (e) {
    var btn = e.target.closest('.code-copy');
    if (!btn) return;
    var code = decodeURIComponent(btn.dataset.code || '');
    try {
      await navigator.clipboard.writeText(code);
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = '复制代码'; }, 1500);
    } catch (_) {
      toast('复制失败');
    }
  });

  // 回到顶部 / 去往底部 浮动按钮
  var toTop = document.getElementById('toTopBtn');
  var toBottom = document.getElementById('toBottomBtn');
  if (toTop && toBottom) {
    var toggleFloat = function () {
      var show = window.scrollY > 200;
      document.getElementById('floatBtns').classList.toggle('show', show);
    };
    window.addEventListener('scroll', toggleFloat, { passive: true });
    toggleFloat();
    toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    toBottom.addEventListener('click', function () {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });
  }

  // 站内搜索：导航条下方搜索框回车跳转
  var searchInput = document.getElementById('siteSearch');
  if (searchInput) {
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        location.href = '/search?q=' + encodeURIComponent(searchInput.value.trim());
      }
    });
  }

  // 打赏二维码单击放大（事件委托，文章页与感谢页通用）
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('.reward-qr-list img');
    if (!img) return;
    e.preventDefault();
    var overlay = document.createElement('div');
    overlay.className = 'qr-zoom';
    var big = document.createElement('img');
    big.src = img.src;
    big.alt = img.alt || '';
    overlay.appendChild(big);
    overlay.addEventListener('click', function () { overlay.remove(); });
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(overlay);
  });
})();
