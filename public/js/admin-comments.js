// 评论管理：发布即展示，管理员可下架 / 恢复 / 删除；分页
(function () {
  'use strict';
  var tbody = document.querySelector('#commentsTable tbody');
  var pager = document.getElementById('commentsPager');
  var filter = '', q = '', page = 1, totalPages = 1;
  window.bindLogout();

  document.querySelectorAll('#commentFilter .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#commentFilter .seg-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      filter = btn.dataset.status;
      page = 1;
      load();
    });
  });

  function load() {
    var url = '/api/admin/comments?page=' + page + '&pageSize=10' + (filter ? '&status=' + filter : '') + (q ? '&q=' + encodeURIComponent(q) : '');
    window.api(url).then(function (data) {
      tbody.innerHTML = '';
      totalPages = data.totalPages || 1;
      if (data.comments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-note">暂无评论</td></tr>';
      } else {
        for (var i = 0; i < data.comments.length; i++) tbody.appendChild(row(data.comments[i]));
      }
      renderPager();
    });
  }

  function row(c) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><div class="comment-body ell w-lg" title=""></div></td>' +
      '<td></td><td></td><td><span class="status-tag"></span></td>' +
      '<td class="mono"></td>' +
      '<td><div class="ops">' +
      (c.status === 'approved'
        ? '<button class="btn btn-mini" data-act="hide">下架</button>'
        : '<button class="btn btn-mini" data-act="show">恢复</button>') +
      '<button class="btn btn-mini btn-danger" data-act="del">删除</button>' +
      '</div></td>';
    var bodyEl = tr.querySelector('.comment-body');
    bodyEl.textContent = c.content;
    bodyEl.title = c.content;
    // 昵称一行、邮箱换行小字显示
    var nickWrap = tr.children[1];
    nickWrap.innerHTML = '<div class="ell w-sm"></div>' + (c.email ? '<div class="comment-email"></div>' : '');
    nickWrap.querySelector('.ell').textContent = c.nickname;
    if (c.email) nickWrap.querySelector('.comment-email').textContent = c.email;
    tr.children[2].innerHTML = '<span class="ell w-md"></span>';
    tr.children[2].firstChild.textContent = c.post_title || '';
    tr.children[2].firstChild.title = c.post_title || '';
    var tag = tr.querySelector('.status-tag');
    tag.textContent = c.status === 'approved' ? '已展示' : '已下架';
    tag.className = 'status-tag ' + c.status;
    tr.children[4].textContent = (c.created_at || '').slice(0, 16).replace('T', ' ');

    var actionBtn = tr.querySelector('[data-act=hide],[data-act=show]');
    actionBtn.addEventListener('click', async function () {
      var next = c.status === 'approved' ? 'hidden' : 'approved';
      await window.api('/api/admin/comments/' + c.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      window.showToast(next === 'hidden' ? '已下架' : '已恢复展示');
      load();
    });
    tr.querySelector('[data-act=del]').addEventListener('click', async function () {
      if (!confirm('确认删除该评论？')) return;
      await window.api('/api/admin/comments/' + c.id, { method: 'DELETE' });
      window.showToast('已删除');
      load();
    });
    return tr;
  }

  // 搜索：内容 / 昵称（300ms 防抖），搜索时回到第 1 页
  var searchTimer = null;
  document.getElementById('commentSearchInput').addEventListener('input', function () {
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
