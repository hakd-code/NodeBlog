// 文章管理列表：分页 + 编辑 / 删除 / 重新生成 slug / 上下架
(function () {
  'use strict';
  var tbody = document.querySelector('#postsTable tbody');
  var pager = document.getElementById('postsPager');
  var page = 1, totalPages = 1, q = '';
  window.bindLogout();

  function load() {
    var url = '/api/admin/posts?page=' + page + '&pageSize=10' + (q ? '&q=' + encodeURIComponent(q) : '');
    window.api(url).then(function (data) {
      tbody.innerHTML = '';
      totalPages = data.totalPages || 1;
      for (var i = 0; i < data.posts.length; i++) tbody.appendChild(row(data.posts[i]));
      renderPager();
    });
  }

  function row(p) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><div class="t-title ell w-md" title=""></div></td>' +
      '<td><span class="status-tag"></span></td>' +
      '<td class="mono"></td><td></td><td class="mono"></td>' +
      '<td><div class="ops">' +
      '<a class="btn btn-mini" href="/admin/editor?id=' + p.id + '">编辑</a>' +
      '<button class="btn btn-mini" data-act="toggle"></button>' +
      '<button class="btn btn-mini" data-act="slug">重新生成 slug</button>' +
      '<button class="btn btn-mini btn-danger" data-act="del">删除</button>' +
      '</div></td>';
    var titleEl = tr.querySelector('.t-title');
    var titleText = p.title + (p.pinned ? '（置顶）' : '');
    titleEl.textContent = titleText;
    titleEl.title = titleText;
    var tag = tr.querySelector('.status-tag');
    tag.textContent = p.status === 'published' ? '已发布' : '草稿';
    tag.className = 'status-tag ' + p.status;
    tr.children[2].innerHTML = '<span class="ell w-sm mono" title="' + p.slug + '"></span>';
    tr.children[2].firstChild.textContent = p.slug;
    tr.children[3].textContent = p.view_count;
    tr.children[4].textContent = (p.published_at || p.created_at || '').slice(0, 10);

    var toggleBtn = tr.querySelector('[data-act=toggle]');
    toggleBtn.textContent = p.status === 'published' ? '下架' : '发布';
    toggleBtn.addEventListener('click', async function () {
      await window.api('/api/admin/posts/' + p.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: p.status === 'published' ? 'draft' : 'published' }),
      });
      window.showToast('已' + (p.status === 'published' ? '下架' : '发布'));
      load();
    });
    tr.querySelector('[data-act=slug]').addEventListener('click', async function () {
      if (!confirm('重新生成 slug 后，旧 slug 将自动 301 跳转到新 slug，确认？')) return;
      var r = await window.api('/api/admin/posts/' + p.id + '/regenerate-slug', { method: 'POST' });
      window.showToast('新 slug: ' + r.slug + '（旧 slug 已 301）');
      load();
    });
    tr.querySelector('[data-act=del]').addEventListener('click', async function () {
      if (!confirm('确认删除「' + p.title + '」？其评论与旧链映射将一并删除。')) return;
      await window.api('/api/admin/posts/' + p.id, { method: 'DELETE' });
      window.showToast('已删除');
      load();
    });
    return tr;
  }

  // 标题搜索：输入即查（300ms 防抖），搜索时回到第 1 页
  var searchTimer = null;
  document.getElementById('postSearchInput').addEventListener('input', function () {
    var self = this;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      q = self.value.trim();
      page = 1;
      load();
    }, 300);
  });

  function renderPager() {
    pager.innerHTML = '';
    if (totalPages <= 1) return;
    if (page > 1) {
      var prev = document.createElement('button');
      prev.className = 'btn btn-mini';
      prev.textContent = '← 上一页';
      prev.addEventListener('click', function () { page--; load(); });
      pager.appendChild(prev);
    }
    var info = document.createElement('span');
    info.className = 'pager-info';
    info.textContent = page + ' / ' + totalPages;
    pager.appendChild(info);
    if (page < totalPages) {
      var next = document.createElement('button');
      next.className = 'btn btn-mini';
      next.textContent = '下一页 →';
      next.addEventListener('click', function () { page++; load(); });
      pager.appendChild(next);
    }
  }

  load();
})();
