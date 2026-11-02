// 打赏名单管理：手工录入 / 编辑 / 删除，按打赏时间倒序，分页
// 文章关联使用可搜索组合框（文章多时输入关键词即可定位）
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tbody = document.querySelector('#donationsTable tbody');
  var pager = document.getElementById('donationsPager');
  var posts = [];        // 全量文章（id + title）
  var page = 1, totalPages = 1;
  window.bindLogout();

  /* ---------- 可搜索文章组合框 ---------- */
  var searchInput = $('donationPostSearch');
  var hiddenInput = $('donationPost');
  var listBox = $('donationPostList');

  function renderComboList() {
    var q = (searchInput.value || '').trim().toLowerCase();
    listBox.innerHTML = '';
    // 「全站支持」清除项始终在最上（选择统一走列表上的事件委托）
    var clearItem = document.createElement('div');
    clearItem.className = 'combo-item combo-clear';
    clearItem.dataset.postId = '';
    clearItem.textContent = '全站支持（不关联文章）';
    listBox.appendChild(clearItem);

    var matches = posts.filter(function (p) {
      return !q || p.title.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 10);
    if (matches.length === 0 && q) {
      var none = document.createElement('div');
      none.className = 'combo-item';
      none.style.color = 'var(--text-3)';
      none.textContent = '没有匹配的文章';
      listBox.appendChild(none);
    }
    matches.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'combo-item';
      item.dataset.postId = p.id;
      item.dataset.title = p.title;
      item.textContent = p.title;
      item.title = p.title;
      listBox.appendChild(item);
    });
    listBox.hidden = false;
    comboActive = -1;
  }

  // 事件委托：无论列表怎么重渲染，点击都由列表容器统一处理。
  // pointerdown 保证在输入框失焦前完成选择；click 作为兜底（两者幂等）。
  function comboPick(e) {
    var item = e.target.closest('.combo-item');
    if (!item || item.dataset.postId === undefined) return;
    e.preventDefault();
    hiddenInput.value = item.dataset.postId;
    searchInput.value = item.dataset.postId ? (item.dataset.title || '') : '';
    hideList();
  }
  listBox.addEventListener('pointerdown', comboPick);
  listBox.addEventListener('click', comboPick);

  function hideList() { listBox.hidden = true; }

  searchInput.addEventListener('focus', renderComboList);
  searchInput.addEventListener('input', renderComboList);
  searchInput.addEventListener('blur', function () { setTimeout(hideList, 150); });
  // 键盘支持：↑↓ 导航选项，Enter 选中，Esc 关闭
  var comboActive = -1;
  searchInput.addEventListener('keydown', function (e) {
    var items = [...listBox.querySelectorAll('.combo-item')].filter(function (i) { return i.dataset.postId !== undefined; });
    if (listBox.hidden || items.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      comboActive += e.key === 'ArrowDown' ? 1 : -1;
      if (comboActive < 0) comboActive = items.length - 1;
      if (comboActive >= items.length) comboActive = 0;
      items.forEach(function (el, i) { el.classList.toggle('active', i === comboActive); });
    } else if (e.key === 'Enter') {
      e.preventDefault(); // 阻止表单提交
      var el = items[Math.max(0, Math.min(comboActive, items.length - 1))];
      hiddenInput.value = el.dataset.postId;
      searchInput.value = el.dataset.postId ? (el.dataset.title || '') : '';
      hideList();
      comboActive = -1;
    } else if (e.key === 'Escape') {
      hideList();
      comboActive = -1;
    }
  });

  function setPostSelection(postId) {
    hiddenInput.value = postId ? String(postId) : '';
    var p = posts.find(function (x) { return String(x.id) === String(postId); });
    searchInput.value = p ? p.title : '';
  }

  /* ---------- 列表 ---------- */
  function load() {
    Promise.all([
      window.api('/api/admin/donations?page=' + page + '&pageSize=10'),
      window.api('/api/admin/posts?page=1&pageSize=100'),
    ]).then(function (results) {
      var data = results[0];
      posts = results[1].posts.map(function (p) { return { id: p.id, title: p.title }; });

      tbody.innerHTML = '';
      totalPages = data.totalPages || 1;
      if (data.donations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-note">暂无打赏记录</td></tr>';
      } else {
        for (var j = 0; j < data.donations.length; j++) tbody.appendChild(row(data.donations[j]));
      }
      renderPager();
    });
  }

  function row(d) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="ell w-sm"></span></td><td class="mono thank-amount-cell"></td><td><span class="ell w-md"></span></td><td><span class="ell w-md"></span></td><td class="mono"></td>' +
      '<td><div class="ops">' +
      '<button class="btn btn-mini" data-act="edit">编辑</button>' +
      '<button class="btn btn-mini btn-danger" data-act="del">删除</button>' +
      '</div></td>';
    tr.children[0].firstChild.textContent = d.nickname;
    tr.children[0].firstChild.title = d.nickname;
    tr.children[1].textContent = '¥' + Number(d.amount).toFixed(2);
    tr.children[2].firstChild.textContent = d.message || '';
    tr.children[2].firstChild.title = d.message || '';
    var postText = d.post_title || '全站支持';
    tr.children[3].firstChild.textContent = postText;
    tr.children[3].firstChild.title = postText;
    tr.children[4].textContent = (d.donated_at || '').slice(0, 16).replace('T', ' ');
    tr.querySelector('[data-act=edit]').addEventListener('click', function () {
      $('donationId').value = d.id;
      $('donationNickname').value = d.nickname;
      $('donationAmount').value = d.amount;
      $('donationMessage').value = d.message || '';
      setPostSelection(d.post_id || '');
      $('donationTime').value = (d.donated_at || '').slice(0, 16);
    });
    tr.querySelector('[data-act=del]').addEventListener('click', async function () {
      if (!confirm('确认删除「' + d.nickname + '」的打赏记录？')) return;
      await window.api('/api/admin/donations/' + d.id, { method: 'DELETE' });
      window.showToast('已删除');
      load();
    });
    return tr;
  }

  $('donationForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var id = $('donationId').value;
    var payload = {
      nickname: $('donationNickname').value.trim(),
      amount: Number($('donationAmount').value),
      message: $('donationMessage').value,
      postId: hiddenInput.value ? Number(hiddenInput.value) : null,
      donatedAt: $('donationTime').value ? new Date($('donationTime').value).toISOString() : undefined,
    };
    if (!payload.nickname || !payload.amount) { window.showToast('昵称与金额必填'); return; }
    if (id) await window.api('/api/admin/donations/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    else await window.api('/api/admin/donations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    window.showToast('已保存');
    resetForm();
    load();
  });
  $('donationReset').addEventListener('click', resetForm);
  function resetForm() {
    $('donationForm').reset();
    $('donationId').value = '';
    $('donationTime').value = '';
    setPostSelection('');
    hideList();
  }

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
