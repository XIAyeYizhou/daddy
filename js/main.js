/* ============================================================
   微聊 — 启动入口
   ============================================================ */
(function () {
  /* 后台新消息弹窗（新消息 / 评论 / 信件 / 一起听） */
  var Notify = {
    ok: false,
    init: function () {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') { this.ok = true; return; }
      if (Notification.permission === 'denied') return;
      try {
        Notification.requestPermission().then(function (p) { Notify.ok = p === 'granted'; });
      } catch (e) { }
    },
    push: function (title, body) {
      if (!this.ok || !document.hidden) return;
      try {
        var icon = document.querySelector('link[rel="icon"]');
        new Notification(title, { body: body || '', icon: icon ? icon.href : undefined, tag: 'zchat-' + Date.now() });
      } catch (e) { }
    }
  };
  window.Notify = Notify;

  /* 全局返回委托：任何页面里的 [data-back]（含 .back-btn）都返回上一页 */
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-back]') : null;
    if (b) { e.preventDefault(); Router.back(); }
  });

  function boot() {
    Store.load();
    applyTheme();
    Router.boot();
    AI.start();
    window.addEventListener('beforeunload', function () { Store.save(); });
    window.addEventListener('pagehide', function () { Store.save(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) Store.save(); });
    // 每 5 分钟自动保存一次（数据安全兜底）
    setInterval(function () { Store.save(); }, 5 * 60 * 1000);
    // 通知权限：启动时申请；若被忽略则在首次点击时再次申请
    Notify.init();
    document.addEventListener('pointerdown', function once() {
      if (!Notify.ok && 'Notification' in window && Notification.permission === 'default') {
        try { Notification.requestPermission().then(function (p) { Notify.ok = p === 'granted'; }); } catch (e) { }
      }
      document.removeEventListener('pointerdown', once);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
