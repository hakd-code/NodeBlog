// 感谢名单页：打赏支持弹层
(function () {
  'use strict';
  var btn = document.getElementById('thanksRewardBtn');
  var modal = document.getElementById('rewardModal');
  if (!btn || !modal) return;
  btn.addEventListener('click', function () { modal.hidden = false; });
  var close = document.getElementById('rewardClose');
  if (close) close.addEventListener('click', function () { modal.hidden = true; });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') modal.hidden = true; });
})();
