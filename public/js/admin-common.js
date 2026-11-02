// 后台公共脚本：API 封装（JWT）+ 登录守卫 + Toast
(function () {
  'use strict';

  var toastEl = document.getElementById('toast');
  window.showToast = function (msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(window.showToast._t);
    window.showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  };

  window.api = async function (path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers);
    var token = localStorage.getItem('blog_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var resp = await fetch(path, Object.assign({}, options, { headers }));
    if (resp.status === 401 && !path.startsWith('/api/admin/login')) {
      localStorage.removeItem('blog_token');
      if (location.pathname.startsWith('/admin/')) location.href = '/admin/login';
      throw new Error('未登录');
    }
    var data = null;
    try { data = await resp.json(); } catch (_) { /* 空响应 */ }
    if (!resp.ok) {
      var err = new Error((data && data.error) || ('HTTP ' + resp.status));
      err.status = resp.status;
      throw err;
    }
    return data;
  };

  window.bindLogout = function () {
    var btn = document.getElementById('logoutBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      localStorage.removeItem('blog_token');
      location.href = '/admin/login';
    });
  };
})();
