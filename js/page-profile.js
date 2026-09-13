/* ============================================================
   MARINE LINK — 「我的」页面（个人资料 / 主题颜色自定义）
   · 路由 id：profile
   · 全局导出：window.applyTheme()（main.js 启动时调用）
   ============================================================ */
(function () {
  var S = Store, UI = window.UI, esc = S.esc;

  /* ---------- 微信默认主题（7 个 CSS 变量） ---------- */
  var DEFAULTS = {
    ui: '#07C160',        // 主题色
    page: '#EDEDED',      // 页面底色
    name: '#111111',      // 联系人姓名色
    bubble: '#95EC69',    // 我的气泡色
    bubbleText: '#111111',// 气泡文字色
    id: '#999999',        // ID 灰色
    font: '#16161D'       // 正文字体色
  };

  /* ---------- 预设色卡（点击即应用并保存） ---------- */
  var PRESETS = [
    {
      key: 'wechat', label: '微信绿',
      theme: { ui: '#07C160', page: '#EDEDED', name: '#111111', bubble: '#95EC69', bubbleText: '#111111', id: '#999999', font: '#16161D' }
    },
    {
      key: 'qq', label: 'QQ蓝',
      theme: { ui: '#12B7F5', page: '#F2F3F5', name: '#111111', bubble: '#C6E7FF', bubbleText: '#111111', id: '#999999', font: '#16161D' }
    },
    {
      key: 'ios', label: 'iOS绿',
      theme: { ui: '#34C759', page: '#F7F7F7', name: '#111111', bubble: '#D6F5DC', bubbleText: '#111111', id: '#8E8E93', font: '#1C1C1E' }
    },
    {
      key: 'mono', label: '黑白灰',
      theme: { ui: '#2C2C2E', page: '#F2F2F7', name: '#111111', bubble: '#E5E5EA', bubbleText: '#111111', id: '#8E8E93', font: '#1C1C1E' }
    }
  ];

  /* ---------- 自定义取色项（4 项） ---------- */
  var COLORS = [
    { k: 'ui', label: '主题色', hint: '按钮 / 强调色' },
    { k: 'page', label: '页面底色', hint: '聊天与页面背景' },
    { k: 'bubble', label: '我的气泡', hint: '我发出的消息底色' },
    { k: 'bubbleText', label: '气泡文字', hint: '我的气泡内文字' }
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 读取当前主题，缺项用微信默认值补齐（兼容旧数据） */
  function themeOf() {
    var me = S.state.me;
    me.theme = me.theme || {};
    var t = {};
    Object.keys(DEFAULTS).forEach(function (k) { t[k] = me.theme[k] || DEFAULTS[k]; });
    return t;
  }

  /* 命中哪个预设（7 个颜色全部一致才算选中，否则返回 null） */
  function presetOf(t) {
    var hit = null;
    PRESETS.forEach(function (p) {
      var same = true;
      Object.keys(DEFAULTS).forEach(function (k) { if (t[k] !== p.theme[k]) same = false; });
      if (same) hit = p.key;
    });
    return hit;
  }

  /* 写入整套主题 -> 立即应用 -> 落盘 */
  function useTheme(next) {
    S.state.me.theme = clone(next);
    applyTheme();
    S.saveDebounced();
  }

  /* ============================================================
     主题应用（全局）：依次设置 7 个 CSS 变量 + 深色模式
     ============================================================ */
  function applyTheme() {
    var me = Store.state.me, t = me.theme || {};
    var phone = document.getElementById('phone');
    if (!phone) return;
    phone.style.setProperty('--c-ui', t.ui || '#07C160');
    phone.style.setProperty('--c-page', t.page || '#EDEDED');
    phone.style.setProperty('--c-name', t.name || '#111111');
    phone.style.setProperty('--c-bubble', t.bubble || '#95EC69');
    phone.style.setProperty('--c-bubble-text', t.bubbleText || '#111111');
    phone.style.setProperty('--c-id', t.id || '#999999');
    phone.style.setProperty('--c-font', t.font || '#16161D');
    phone.classList.toggle('dark', !!me.nightMode);   // 深色模式
    // 浏览器地址栏 / 状态栏跟随页面底色
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.page || '#EDEDED');
  }
  window.applyTheme = applyTheme;

  /* ============================================================
     我的页面
     ============================================================ */
  Router.register('profile', function (el) {
    function draw() {
      var me = S.state.me;
      var t = themeOf();
      var cur = presetOf(t);
      var sig = me.signature || '';

      el.innerHTML =
        '<div class="page-head light pf-head">' +
          '<button class="back-btn" data-back>' + Icon('back', 22) + '</button>' +
          '<div class="ph-title">我的</div>' +
        '</div>' +
        '<div class="pf-body">' +

          /* ---------- 个人信息卡 ---------- */
          '<div class="pf-card pf-card-me">' +
            '<button class="pf-ava-btn" id="pf-avatar">' + UI.avatarEl(me.avatar, 84) +
              '<span class="pf-ava-edit">' + Icon('camera', 15) + '</span></button>' +
            '<div class="pf-rows">' +
              '<button class="pf-row pf-row-tap" id="pf-name-row">' +
                '<span class="pf-row-k">昵称</span>' +
                '<span class="pf-row-v" id="pf-name-val">' + esc(me.name) + '</span>' +
                '<span class="pf-row-ar">' + Icon('chevronR', 16) + '</span>' +
              '</button>' +
              '<button class="pf-row pf-row-tap" id="pf-sign-row">' +
                '<span class="pf-row-k">个性签名</span>' +
                '<span class="pf-row-v' + (sig ? '' : ' pf-row-empty') + '" id="pf-sign-val">' + (sig ? esc(sig) : '未填写') + '</span>' +
                '<span class="pf-row-ar">' + Icon('chevronR', 16) + '</span>' +
              '</button>' +
              '<div class="pf-row">' +
                '<span class="pf-row-k">账号</span>' +
                '<span class="pf-row-v pf-row-acc">' + esc(me.account || '') + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +

          /* ---------- 主题颜色 ---------- */
          '<div class="pf-sec">主题颜色</div>' +
          '<div class="pf-card">' +
            '<div class="pf-hint">预设配色</div>' +
            '<div class="th-sws">' +
              PRESETS.map(function (p) {
                return '<button class="th-sw' + (cur === p.key ? ' on' : '') + '" data-p="' + p.key + '">' +
                  '<span class="th-sw-ok">' + Icon('check', 11) + '</span>' +
                  '<span class="th-sw-dots">' +
                    '<i style="background:' + p.theme.ui + '"></i>' +
                    '<i style="background:' + p.theme.bubble + '"></i>' +
                    '<i style="background:' + p.theme.page + '"></i>' +
                  '</span>' +
                  '<span class="th-sw-lb">' + p.label + '</span>' +
                '</button>';
              }).join('') +
            '</div>' +
            '<div class="pf-hint pf-hint-gap">自定义颜色</div>' +
            '<div class="th-colors">' +
              COLORS.map(function (c) {
                return '<label class="th-color">' +
                  '<span class="th-color-k">' + c.label + '</span>' +
                  '<span class="th-color-hint">' + c.hint + '</span>' +
                  '<input type="color" class="th-color-inp" data-k="' + c.k + '" value="' + t[c.k] + '">' +
                  '<span class="th-color-v" data-k="' + c.k + '">' + t[c.k].toUpperCase() + '</span>' +
                '</label>';
              }).join('') +
            '</div>' +
          '</div>' +

          /* ---------- 深色模式 ---------- */
          '<div class="pf-card">' +
            '<div class="pf-row pf-row-dark" id="pf-dark-row">' +
              '<span class="pf-row-k">深色模式</span>' +
              '<span class="pf-row-hint">夜间使用深色界面</span>' +
            '</div>' +
          '</div>' +

          /* ---------- 恢复默认 ---------- */
          '<button class="glass-btn big pf-reset" id="pf-reset">' + Icon('refresh', 16) + ' 恢复默认主题</button>' +
        '</div>';

      /* 色卡选中态只切 class，避免拖动取色器时重建 DOM */
      function syncSws() {
        var key = presetOf(themeOf());
        el.querySelectorAll('.th-sw').forEach(function (b) {
          b.classList.toggle('on', b.dataset.p === key);
        });
      }
      function syncColor(k, v) {
        var inp = el.querySelector('.th-color-inp[data-k="' + k + '"]');
        if (inp) inp.value = v;
        var lab = el.querySelector('.th-color-v[data-k="' + k + '"]');
        if (lab) lab.textContent = String(v).toUpperCase();
      }

      /* ---- 头像：本地选取 / 拍照 ---- */
      el.querySelector('#pf-avatar').addEventListener('click', function () {
        var api = UI.sheetList({
          title: '我的头像',
          items: [
            { icon: 'image', label: '从本地选取', sub: '相册 / 文件', onClick: function () { api.close(); pick(false); } },
            { icon: 'camera', label: '拍照', sub: '调用相机', onClick: function () { api.close(); pick(true); } }
          ]
        });
        async function pick(camera) {
          var imgs = await UI.pickImage({ camera: camera });
          if (!imgs || !imgs.length) return;
          S.state.me.avatar = imgs[0];
          S.saveDebounced();
          draw();
          UI.toast('头像已更新', 'check');
        }
      });

      /* ---- 昵称 ---- */
      el.querySelector('#pf-name-row').addEventListener('click', function () {
        var api = UI.popup({
          title: '修改昵称',
          body: '<input class="pop-input" id="pf-name" maxlength="16" placeholder="输入昵称" value="' + esc(me.name) + '">',
          actions: [
            { label: '取消' },
            { label: '保存', primary: true, onClick: function () {
              var v = (api.body.querySelector('#pf-name').value || '').trim();
              if (!v) { UI.toast('昵称不能为空', 'info'); return false; }
              S.state.me.name = v.slice(0, 16);
              S.saveDebounced();
              draw();
              UI.toast('昵称已更新', 'check');
            } }
          ]
        });
        var inp = api.body.querySelector('#pf-name');
        if (inp) { inp.focus(); inp.select(); }
      });

      /* ---- 个性签名 ---- */
      el.querySelector('#pf-sign-row').addEventListener('click', function () {
        var api = UI.popup({
          title: '修改个性签名',
          body: '<input class="pop-input" id="pf-sign" maxlength="40" placeholder="说一句话介绍自己" value="' + esc(sig) + '">',
          actions: [
            { label: '取消' },
            { label: '保存', primary: true, onClick: function () {
              S.state.me.signature = (api.body.querySelector('#pf-sign').value || '').trim().slice(0, 40);
              S.saveDebounced();
              draw();
              UI.toast('签名已更新', 'check');
            } }
          ]
        });
        var inp = api.body.querySelector('#pf-sign');
        if (inp) { inp.focus(); inp.select(); }
      });

      /* ---- 预设色卡：点击即应用并保存 ---- */
      el.querySelectorAll('.th-sw').forEach(function (b) {
        b.addEventListener('click', function () {
          var p = null;
          PRESETS.forEach(function (x) { if (x.key === b.dataset.p) p = x; });
          if (!p) return;
          useTheme(p.theme);
          syncSws();
          COLORS.forEach(function (c) { syncColor(c.k, S.state.me.theme[c.k]); });
          UI.toast('已应用「' + p.label + '」', 'check');
        });
      });

      /* ---- 自定义颜色：即时生效 ---- */
      el.querySelectorAll('.th-color-inp').forEach(function (inp) {
        inp.addEventListener('input', function () {
          var k = inp.dataset.k;
          var me2 = S.state.me;
          me2.theme = me2.theme || {};
          me2.theme[k] = inp.value;
          applyTheme();
          S.saveDebounced();
          syncColor(k, inp.value);
          syncSws();
        });
      });

      /* ---- 深色模式 ---- */
      el.querySelector('#pf-dark-row').appendChild(UI.switchEl(!!me.nightMode, function (v) {
        S.state.me.nightMode = v;
        applyTheme();
        S.saveDebounced();
      }));

      /* ---- 恢复默认主题 ---- */
      el.querySelector('#pf-reset').addEventListener('click', function () {
        UI.confirm('恢复默认主题', '主题色、页面底色与气泡颜色将恢复为微信默认配色。', { okText: '恢复' }).then(function (ok) {
          if (!ok) return;
          useTheme(DEFAULTS);
          draw();
          UI.toast('已恢复默认主题', 'check');
        });
      });

      /* ---- 返回：全站若有 [data-back] 委托则由其接管，这里只做兜底 ---- */
      var backBtn = el.querySelector('.back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', function () {
          Promise.resolve().then(function () {
            if (Router.currentId() === 'profile') Router.back();
          });
        });
      }
    }

    draw();
  });
})();
