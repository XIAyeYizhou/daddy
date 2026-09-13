/* ============================================================
   字卡 · 玻璃信使 — 路由（move in / move out 页面切换）
   ============================================================ */
(function () {
  var app = null;
  var pages = {};
  var stack = [];          // [{id, args}]
  var cur = null, prev = null;   // {id,args,el}
  // 单联系人：首页直接进入聊天对话界面（无主页面/无悬浮导航）
  var MAIN = [];
  var TRANS_MS = 380;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function isMain(id) { return MAIN.indexOf(id) !== -1; }

  function register(id, render, opts) {
    pages[id] = { render: render, nav: !!(opts && opts.nav) };
  }

  function navEl() { return document.getElementById('tabnav'); }

  function setNav(show) {
    var n = navEl();
    if (!n) return;
    // 已取消悬浮导航栏，始终隐藏
    n.classList.add('hide');
    n.classList.remove('show');
  }

  function renderPage(entry, animate) {
    var pg = pages[entry.id];
    if (!pg) return null;
    var el = document.createElement('div');
    el.className = 'page';
    app.appendChild(el);
    try {
      pg.render(el, entry.args || {});
    } catch (e) {
      console.error('page render error', entry.id, e);
      el.innerHTML = '<div style="padding:120px 24px;text-align:center;color:#999">页面渲染出错<br>' + (e && e.message ? esc(e.message) : e) + '</div>';
    }
    if (animate) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.classList.add('page-move-in'); });
      });
    }
    setNav(isMain(entry.id));
    Bus.emit('route', entry.id);
    return { id: entry.id, args: entry.args || {}, el: el };
  }

  function go(id, args, opts) {
    opts = opts || {};
    if (cur && cur.id === id && !opts.force) {
      cur.args = args || {};
      pages[id].render(cur.el, cur.args);
      return cur;
    }
    // 顶层切换主页面（标签栏）
    if (isMain(id)) {
      stack = [{ id: id, args: args || {} }];
      if (cur) {
        var old = cur;
        cur = null; prev = null;
        old.el.classList.add('page-fade-out');
        setTimeout(function () { old.el.remove(); }, 300);
      }
      cur = renderPage({ id: id, args: args || {} }, false);
      return cur;
    }
    // push 新页面
    stack.push({ id: id, args: args || {} });
    if (prev && prev.el && prev.el.parentNode) prev.el.remove();
    if (cur) { prev = cur; prev.el.classList.add('page-behind'); }
    cur = renderPage({ id: id, args: args || {} }, true);
    return cur;
  }

  function back() {
    if (!cur) return;
    if (isMain(cur.id)) return;      // 主页面不响应返回手势
    if (stack.length <= 1) return;
    stack.pop();
    var target = stack[stack.length - 1];
    var out = cur;
    cur = null;
    // 恢复底层
    if (prev) {
      var under = prev;
      prev = null;
      under.el.classList.remove('page-behind');
      requestAnimationFrame(function () { under.el.classList.add('page-move-out-under'); });
      cur = under;
    } else {
      cur = renderPage(target, false);
    }
    out.el.classList.add('page-move-out');
    setNav(isMain(cur.id));
    Bus.emit('route', cur.id);
    setTimeout(function () { out.el.remove(); }, TRANS_MS + 60);
  }

  /* 用新页面替换当前页面（不增加栈深度）：如新建联系人后直接进入聊天，返回时回到联系人页 */
  function replace(id, args) {
    stack[stack.length - 1] = { id: id, args: args || {} };
    var out = cur;
    cur = null;
    if (out) {
      out.el.classList.add('page-fade-out');
      setTimeout(function () { out.el.remove(); }, 300);
    }
    // 丢弃旧的底层页，按栈重建真正的底层页
    if (prev) { prev.el.remove(); prev = null; }
    if (stack.length >= 2) {
      var under = stack[stack.length - 2];
      prev = renderPage(under, false);
      prev.el.classList.add('page-behind');
    }
    cur = renderPage({ id: id, args: args || {} }, true);
  }

  function currentId() { return cur ? cur.id : null; }
  function currentArgs() { return cur ? (cur.args || {}) : null; }

  function boot() {
    app = document.getElementById('app');
    // 打开网址直接进入与唯一联系人的聊天对话
    var cid = Store.state.contacts[0] ? Store.state.contacts[0].id : 'c1';
    go('chat', { cid: cid });
  }

  function buildNav() {
    var defs = [
      { id: 'messages', label: '信息', icon: 'chat' },
      { id: 'contacts', label: '联系人', icon: 'person' },
      { id: 'explore', label: '探索', icon: 'compass' },
      { id: 'profile', label: '我的', icon: 'me' }
    ];
    var n = navEl();
    n.innerHTML = defs.map(function (d, i) {
      return '<button class="tab ' + (i === 0 ? 'active' : '') + '" data-id="' + d.id + '"><span class="tab-ic">' + Icon(d.icon, 22) + '</span><span class="tab-lb">' + d.label + '</span></button>';
    }).join('');
    n.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        if (currentId() === t.dataset.id) return;
        n.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        go(t.dataset.id);
      });
    });
  }

  window.Router = {
    register: register, go: go, back: back, replace: replace,
    currentId: currentId, currentArgs: currentArgs,
    boot: boot, buildNav: buildNav, isMain: isMain
  };
})();
