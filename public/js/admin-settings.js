// 站点设置：全部配置项表单化 + 头像/收款码上传 + 修改管理员密码
(function () {
  'use strict';
  var form = document.getElementById('settingsForm');
  window.bindLogout();

  // 回填
  window.api('/api/admin/configs').then(function (data) {
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      if (!el.name) continue;
      var val = data.configs[el.name];
      if (el.type === 'checkbox') {
        el.checked = String(val) === '1' || val === true;
      } else if (val !== undefined && val !== null) {
        el.value = val;
      }
    }
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var patch = {};
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      if (!el.name) continue;
      patch[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
    }
    await window.api('/api/admin/configs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    window.showToast('设置已保存，前台即时生效');
  });

  /* ---------- 图片上传（头像 / 收款码）：直传并回填 URL ---------- */
  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.hidden = true;
  document.body.appendChild(fileInput);
  var targetInput = null;

  function pickImage(inputEl) {
    targetInput = inputEl;
    fileInput.value = '';
    fileInput.click();
  }

  fileInput.addEventListener('change', async function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file || !targetInput) return;
    window.showToast('上传中…');
    try {
      var buf = new Uint8Array(await file.arrayBuffer());
      // 纯 JS SHA-256（crypto.subtle 在 http://IP 访问时不可用）
      var hash = window.sha256Hex(buf);
      var result = await window.api('/api/upload/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-filename': encodeURIComponent(file.name),
          'x-hash': hash,
        },
        body: file,
      });
      var media = await window.api('/api/media/' + result.assetId);
      targetInput.value = '/media/' + media.storage_key;
      window.showToast('上传完成，记得点「保存全部设置」');
    } catch (err) {
      window.showToast('上传失败: ' + err.message);
    }
  });

  document.getElementById('avatarUploadBtn').addEventListener('click', function () {
    pickImage(form.elements['avatar']);
  });
  document.getElementById('wechatUploadBtn').addEventListener('click', function () {
    pickImage(form.elements['rewardWechat']);
  });
  document.getElementById('alipayUploadBtn').addEventListener('click', function () {
    pickImage(form.elements['rewardAlipay']);
  });

  /* ---------- 修改管理员密码 ---------- */
  document.getElementById('changePwBtn').addEventListener('click', async function () {
    var errEl = document.getElementById('passwordError');
    errEl.hidden = true;
    var oldPw = document.getElementById('oldPassword').value;
    var newPw = document.getElementById('newPassword').value;
    if (!oldPw || !newPw) {
      errEl.textContent = '请填写当前密码与新密码';
      errEl.hidden = false;
      return;
    }
    try {
      await window.api('/api/admin/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      window.showToast('密码已修改，下次登录请使用新密码');
      document.getElementById('oldPassword').value = '';
      document.getElementById('newPassword').value = '';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });
})();
