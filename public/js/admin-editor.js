// 文章编辑器：Markdown 编辑 + Ctrl+V 粘贴贴图 + 视频/附件上传 + 媒体库（按文章过滤）
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  // 关键：直接从 URL 读取编辑目标 id（此前依赖后注入的全局变量导致编辑时内容不回显）
  var editId = new URLSearchParams(location.search).get('id');
  var selectedCover = null;
  var uploadBusy = 0;

  window.bindLogout();

  /* ---------- 编辑器工具栏 ---------- */
  var content = $('postContent');
  document.querySelectorAll('[data-md]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.md;
      var start = content.selectionStart, end = content.selectionEnd;
      var sel = content.value.slice(start, end);
      var insert = '';
      if (action === 'bold') insert = '**' + (sel || '粗体') + '**';
      else if (action === 'italic') insert = '*' + (sel || '斜体') + '*';
      else if (action === 'h2') insert = '\n## ' + (sel || '标题') + '\n';
      else if (action === 'quote') insert = '\n> ' + (sel || '引用') + '\n';
      else if (action === 'code') insert = '\n```js\n' + (sel || 'console.log("hi")') + '\n```\n';
      else if (action === 'link') insert = '[' + (sel || '链接文字') + '](https://)';
      else if (action === 'image') { $('editorFile').dataset.kind = 'image'; $('editorFile').click(); return; }
      else if (action === 'video') { $('editorFile').dataset.kind = 'video'; $('editorFile').accept = 'video/mp4'; $('editorFile').click(); return; }
      else if (action === 'attach') { $('editorFile').dataset.kind = 'file'; $('editorFile').accept = '.zip,.rar,.7z'; $('editorFile').click(); return; }
      content.setRangeText(insert, start, end, 'end');
      content.focus();
    });
  });

  /* ---------- 上传（图片直传 / 视频·附件分块续传），完成后插入光标处 ---------- */
  // 编辑已有文章时，把新上传的媒体挂到该文章（?postId= 透传给上传接口）
  function postQuery() {
    return editId ? '?postId=' + encodeURIComponent(editId) : '';
  }

  function uploadFile(file) {
    if (!file) return;
    var kind = file.type.startsWith('image/') ? 'image' : file.type === 'video/mp4' ? 'video' : 'file';
    if (kind === 'image' && file.size >= 8 * 1024 * 1024) kind = 'chunk'; // 大图也走分块
    var label = '上传中: ' + file.name;
    $('uploadHint').textContent = label;
    uploadBusy++;
    doUpload(file, kind).then(function (media) {
      if (kind === 'image') insertText('\n![' + (media.origin_name || '图片') + '](/media/' + media.storage_key + ')\n');
      else if (kind === 'video') insertText('\n[点击播放视频](/media/' + media.storage_key + ')\n');
      else insertText('\n[' + (media.origin_name || file.name) + '](/media/' + media.storage_key + ')\n');
      // 新建文章：会话媒体入列即时回显（保存时统一关联）；编辑文章：服务端已挂到本文，重新拉取
      if (!editId) sessionMedia.push(media);
      window.showToast('上传完成');
      loadMedia();
    }).catch(function (err) {
      $('editorError').textContent = '上传失败: ' + err.message;
      $('editorError').hidden = false;
    }).finally(function () {
      uploadBusy--;
      if (uploadBusy === 0) $('uploadHint').textContent = '';
    });
  }

  async function doUpload(file, kind) {
    // 第一步：算指纹（纯 JS SHA-256，兼容 http://IP 等非安全上下文——crypto.subtle 在此类环境不可用）
    var hash = null;
    if (kind === 'chunk') {
      var up = new window.BlogUploader(file, {});
      hash = await up.computeHash();
    } else {
      var buf = new Uint8Array(await file.arrayBuffer());
      hash = window.sha256Hex(buf);
    }
    // 预检秒传
    var init = await window.api('/api/upload/init', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, size: file.size, hash }),
    });
    if (init.exists) return window.api('/api/media/' + init.assetId);

    if (kind === 'chunk') {
      // 分块断点续传
      var up2 = new window.BlogUploader(file, {});
      up2.hash = hash;
      up2.uploadId = init.uploadId;
      up2.chunkSize = init.chunkSize;
      up2.totalChunks = init.totalChunks;
      up2.uploaded = new Set(init.uploadedChunks);
      var missing = [];
      for (var i = 0; i < init.totalChunks; i++) if (!up2.uploaded.has(i)) missing.push(i);
      var queue = missing.slice();
      var workers = [];
      for (var w = 0; w < Math.min(3, queue.length); w++) workers.push(up2._worker(queue));
      await Promise.all(workers);
      var done = await window.api('/api/upload/complete/' + init.uploadId + postQuery(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hash }),
      });
      return window.api('/api/media/' + done.assetId);
    }

    // 小文件直传
    var result = await window.api('/api/upload/direct' + postQuery(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-filename': encodeURIComponent(file.name),
        'x-hash': hash,
      },
      body: file,
    });
    return window.api('/api/media/' + result.assetId);
  }

  function insertText(text) {
    var start = content.selectionStart, end = content.selectionEnd;
    content.setRangeText(text, start, end, 'end');
    content.focus();
  }

  // Ctrl+V 粘贴图片 / 拖拽
  content.addEventListener('paste', function (e) {
    var files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) {
      e.preventDefault();
      for (var i = 0; i < files.length; i++) uploadFile(files[i]);
    }
  });
  content.addEventListener('dragover', function (e) { e.preventDefault(); });
  content.addEventListener('drop', function (e) {
    e.preventDefault();
    var files = e.dataTransfer && e.dataTransfer.files;
    for (var i = 0; i < (files ? files.length : 0); i++) uploadFile(files[i]);
  });
  $('editorFile').addEventListener('change', function () {
    for (var i = 0; i < this.files.length; i++) uploadFile(this.files[i]);
    this.value = '';
  });
  $('mediaMoreBtn').addEventListener('click', function () {
    $('editorFile').dataset.kind = 'image';
    $('editorFile').accept = 'image/*';
    $('editorFile').click();
  });

  /* ---------- 发布 / 草稿 ---------- */
  function collect(status) {
    return {
      title: $('postTitle').value.trim(),
      summary: $('postSummary').value.trim(),
      contentMd: content.value,
      tags: $('postTags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
      coverMediaId: selectedCover ? Number(selectedCover) : null,
      pinned: $('postPinned').checked ? 1 : 0,
      status,
    };
  }

  async function save(status) {
    var data = collect(status);
    if (!data.title) { $('editorError').textContent = '请填写标题'; $('editorError').hidden = false; return; }
    try {
      var resp = editId
        ? await window.api('/api/admin/posts/' + editId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        : await window.api('/api/admin/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      // 新建文章：把本次会话上传的媒体关联到新文章
      if (!editId) {
        for (var i = 0; i < sessionMedia.length; i++) {
          try {
            await window.api('/api/admin/media/' + sessionMedia[i].id + '/attach', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ postId: resp.id }),
            });
          } catch (_) { /* 单个关联失败不阻塞 */ }
        }
      }
      window.showToast(status === 'published' ? '已发布，返回文章列表' : '已存草稿，返回文章列表');
      setTimeout(function () { location.href = '/admin/posts'; }, 700);
    } catch (err) {
      $('editorError').textContent = '保存失败: ' + err.message;
      $('editorError').hidden = false;
    }
  }
  $('publishBtn').addEventListener('click', function () { save('published'); });
  $('draftBtn').addEventListener('click', function () { save('draft'); });

  /* ---------- 封面 ---------- */
  $('coverPickBtn').addEventListener('click', function () { selectCover($('postCover').value.trim()); });
  function selectCover(mediaId) {
    if (!mediaId) { selectedCover = null; $('coverPreview').innerHTML = ''; return; }
    window.api('/api/media/' + mediaId).then(function (m) {
      selectedCover = mediaId;
      $('coverPreview').innerHTML = '';
      var img = document.createElement('img');
      img.src = '/media/' + (m.thumb_key || m.storage_key);
      $('coverPreview').appendChild(img);
    }).catch(function () { window.showToast('媒体不存在'); });
  }

  /* ---------- 媒体库 ----------
     编辑已有文章：显示 本文关联 ∪ 正文引用（服务端合并查询）；
     新建文章：渲染本次会话上传的媒体（sessionMedia），保存时统一关联到新文章 */
  var sessionMedia = [];

  function renderMediaGrid(list) {
    var grid = $('mediaGrid');
    grid.innerHTML = '';
    if (!list || list.length === 0) {
      grid.innerHTML = '<p class="empty-note" style="grid-column:1/-1;text-align:center">' +
        (editId ? '本文暂无媒体，点下方按钮上传' : '新文章保存后，上传的媒体会关联到本文') + '</p>';
      return;
    }
    for (var i = 0; i < list.length; i++) {
      (function (m) {
        var item = document.createElement('div');
        item.className = 'media-item' + (String(m.id) === String(selectedCover) ? ' selected' : '');
        if (m.kind === 'image' && m.thumb_key) {
          var img = document.createElement('img');
          img.src = '/media/' + m.thumb_key;
          img.loading = 'lazy';
          item.appendChild(img);
        } else {
          var label = document.createElement('span');
          label.style.cssText = 'font-size:11px;display:flex;align-items:center;justify-content:center;height:74px;color:var(--text-3);padding:4px;text-align:center';
          label.textContent = m.kind === 'video' ? '▶ ' : '📎 ';
          label.textContent += (m.origin_name || m.storage_key).slice(0, 14);
          item.appendChild(label);
        }
        var kind = document.createElement('span');
        kind.className = 'media-kind';
        kind.textContent = m.id;
        item.appendChild(kind);
        item.addEventListener('click', function () {
          grid.querySelectorAll('.media-item').forEach(function (x) { x.classList.remove('selected'); });
          item.classList.add('selected');
          selectedCover = m.id;
          $('postCover').value = m.id;
          if (m.kind === 'image') {
            $('coverPreview').innerHTML = '';
            var img = document.createElement('img');
            img.src = '/media/' + (m.thumb_key || m.storage_key);
            $('coverPreview').appendChild(img);
          }
        });
        grid.appendChild(item);
      })(list[i]);
    }
  }

  function loadMedia() {
    if (!editId) {
      renderMediaGrid(sessionMedia);
      return;
    }
    window.api('/api/admin/media?postId=' + encodeURIComponent(editId)).then(function (data) {
      renderMediaGrid(data.media);
    });
  }

  /* ---------- 编辑回填 ---------- */
  if (editId) {
    window.api('/api/admin/posts/' + editId).then(function (p) {
      $('postTitle').value = p.title;
      $('postSummary').value = p.summary || '';
      $('postTags').value = (p.tags || []).map(function (t) { return t.name; }).join(', ');
      content.value = p.content_md;
      $('postPinned').checked = !!p.pinned;
      if (p.cover_media_id) selectCover(String(p.cover_media_id));
    }).catch(function (err) { window.showToast('加载失败: ' + err.message); });
    loadMedia();
  } else {
    loadMedia();
  }
})();
