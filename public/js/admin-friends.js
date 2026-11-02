// 友链管理
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tbody = document.querySelector('#friendsTable tbody');
  window.bindLogout();

  function load() {
    window.api('/api/admin/friends').then(function (data) {
      tbody.innerHTML = '';
      for (var i = 0; i < data.friends.length; i++) tbody.appendChild(row(data.friends[i]));
    });
  }

  function row(f) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td></td><td class="mono"><span class="ell w-md"></span></td><td><span class="ell w-md"></span></td>' +
      '<td><span class="status-tag"></span></td>' +
      '<td><div class="ops">' +
      '<button class="btn btn-mini" data-act="edit">编辑</button>' +
      '<button class="btn btn-mini btn-danger" data-act="del">删除</button>' +
      '</div></td>';
    tr.children[0].textContent = f.name;
    tr.children[1].firstChild.textContent = f.url;
    tr.children[1].firstChild.title = f.url;
    tr.children[2].firstChild.textContent = f.description;
    tr.children[2].firstChild.title = f.description;
    var tag = tr.querySelector('.status-tag');
    tag.textContent = f.visible ? '显示' : '隐藏';
    tag.className = 'status-tag ' + (f.visible ? 'approved' : 'draft');
    tr.querySelector('[data-act=edit]').addEventListener('click', function () {
      $('friendId').value = f.id;
      $('friendName').value = f.name;
      $('friendUrl').value = f.url;
      $('friendAvatar').value = f.avatar;
      $('friendDesc').value = f.description;
      $('friendVisible').checked = !!f.visible;
    });
    tr.querySelector('[data-act=del]').addEventListener('click', async function () {
      if (!confirm('确认删除友链「' + f.name + '」？')) return;
      await window.api('/api/admin/friends/' + f.id, { method: 'DELETE' });
      window.showToast('已删除');
      load();
    });
    return tr;
  }

  $('friendForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var payload = {
      id: $('friendId').value ? Number($('friendId').value) : undefined,
      name: $('friendName').value.trim(),
      url: $('friendUrl').value.trim(),
      avatar: $('friendAvatar').value.trim(),
      description: $('friendDesc').value.trim(),
      visible: $('friendVisible').checked ? 1 : 0,
    };
    if (!payload.name || !payload.url) { window.showToast('名称与 URL 必填'); return; }
    await window.api('/api/admin/friends', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    window.showToast('已保存');
    resetForm();
    load();
  });
  $('friendReset').addEventListener('click', resetForm);
  function resetForm() {
    $('friendForm').reset();
    $('friendId').value = '';
    $('friendVisible').checked = true;
  }

  load();
})();
