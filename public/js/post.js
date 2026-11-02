// 文章页：打赏弹层 + 评论提交
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // 打赏弹层
  var rewardBtn = $('rewardBtn'), rewardModal = $('rewardModal');
  if (rewardBtn && rewardModal) {
    rewardBtn.addEventListener('click', function () { rewardModal.hidden = false; });
    $('rewardClose').addEventListener('click', function () { rewardModal.hidden = true; });
    rewardModal.addEventListener('click', function (e) { if (e.target === rewardModal) rewardModal.hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') rewardModal.hidden = true; });
  }

  // 评论提交
  var form = $('commentForm');
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var errEl = $('commentError');
      errEl.hidden = true;
      var data = {
        nickname: form.nickname.value.trim(),
        email: form.email.value.trim(),
        site: form.site.value.trim(),
        content: form.content.value.trim(),
      };
      if (!data.nickname || !data.content) {
        errEl.textContent = '昵称与评论内容为必填';
        errEl.hidden = false;
        return;
      }
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        var resp = await fetch('/api/posts/' + form.dataset.slug + '/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        var result = await resp.json();
        if (!resp.ok) {
          errEl.textContent = result.error || '提交失败';
          errEl.hidden = false;
          return;
        }
        window.blogToast(result.message || '评论已发布');
        // 发布即展示：追加到列表末尾（避免整页刷新）
        if (result.ok) {
          var list = document.querySelector('.comment-list');
          var emptyNote = list.querySelector('.empty-note');
          if (emptyNote) emptyNote.remove();
          var li = document.createElement('li');
          li.className = 'comment-item';
          var now = new Date();
          li.innerHTML = '<div class="comment-head"><strong></strong><time></time></div><p class="comment-body"></p>';
          li.querySelector('strong').textContent = data.nickname;
          li.querySelector('time').textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日';
          li.querySelector('.comment-body').textContent = data.content;
          list.appendChild(li);
          var countEl = document.querySelector('.comments-section .card-title');
          if (countEl) {
            var n = list.querySelectorAll('.comment-item').length;
            countEl.textContent = '评论（' + n + '）';
          }
          form.content.value = '';
        }
      } catch (err) {
        errEl.textContent = '网络异常，请重试';
        errEl.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // TOC 滚动高亮（scroll-spy）：右侧目录随文章滚动定位
  var tocLinks = document.querySelectorAll('.toc a');
  if (tocLinks.length) {
    var headings = [];
    tocLinks.forEach(function (a) {
      var id = decodeURIComponent((a.getAttribute('href') || '').slice(1));
      var h = document.getElementById(id);
      if (h) headings.push({ id: id, el: h, link: a });
    });
    if (headings.length) {
      var current = -1;
      var onScroll = function () {
        var line = window.scrollY + 120;
        var idx = 0;
        for (var i = 0; i < headings.length; i++) {
          if (headings[i].el.getBoundingClientRect().top + window.scrollY <= line) idx = i;
        }
        if (idx !== current) {
          current = idx;
          headings.forEach(function (h, i) {
            h.link.classList.toggle('active', i === current);
          });
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  // 文章图片灯箱：单击放大查看，多图可左右切换浏览本文全部图片
  var contentImgs = Array.prototype.slice.call(document.querySelectorAll('.post-content img'));
  if (contentImgs.length) {
    var galleryImgs = contentImgs.map(function (img) {
      return { src: img.currentSrc || img.src, caption: img.getAttribute('alt') || '' };
    });
    var lb = document.createElement('div');
    lb.className = 'lightbox post-lightbox';
    lb.hidden = true;
    lb.innerHTML =
      '<button class="lightbox-close" type="button" aria-label="关闭">×</button>' +
      '<button class="lightbox-nav lightbox-prev" type="button" aria-label="上一张">‹</button>' +
      '<img id="postLbImg" alt="">' +
      '<button class="lightbox-nav lightbox-next" type="button" aria-label="下一张">›</button>' +
      '<p class="lightbox-caption"><span id="postLbCounter"></span><span id="postLbCaption"></span></p>';
    document.body.appendChild(lb);

    var lbImg = lb.querySelector('#postLbImg');
    var lbCaption = lb.querySelector('#postLbCaption');
    var lbCounter = lb.querySelector('#postLbCounter');
    var lbIndex = 0;

    function lbShow(i) {
      var n = galleryImgs.length;
      lbIndex = ((i % n) + n) % n;
      var item = galleryImgs[lbIndex];
      lbImg.src = item.src;
      lbCaption.textContent = item.caption;
      lbCounter.textContent = n > 1 ? (lbIndex + 1) + ' / ' + n + ' · ' : '';
    }
    function lbOpen(i) {
      lbShow(i);
      lb.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function lbCloseFn() {
      lb.hidden = true;
      lbImg.src = '';
      document.body.style.overflow = '';
    }

    contentImgs.forEach(function (img, i) {
      img.classList.add('zoomable');
      img.addEventListener('click', function () { lbOpen(i); });
    });
    lb.querySelector('.lightbox-close').addEventListener('click', lbCloseFn);
    lb.querySelector('.lightbox-prev').addEventListener('click', function (e) { e.stopPropagation(); lbShow(lbIndex - 1); });
    lb.querySelector('.lightbox-next').addEventListener('click', function (e) { e.stopPropagation(); lbShow(lbIndex + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lbCloseFn(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') lbCloseFn();
      else if (e.key === 'ArrowLeft') lbShow(lbIndex - 1);
      else if (e.key === 'ArrowRight') lbShow(lbIndex + 1);
    });
  }
})();
