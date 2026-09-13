/* ============================================================
   微聊 — 字卡库（交流 / 拍一拍 / 状态 / 日常 / emoji / 颜文字 分区管理）
   ============================================================ */
(function () {
  var S = Store, UI = window.UI, esc = S.esc;
  var active = '交流';

  var TIPS = {
    '交流': '对方聊天回复时，从「交流」里挑字卡',
    '拍一拍': '戳一戳时使用，如「拍了拍你的头」',
    '状态': '对方的在线状态会从这里随机出现',
    '日常': '对方的打卡与日常动态使用',
    'emoji': '短句回复，偶尔会单独发一条',
    '颜文字': '颜文字回复，偶尔会单独发一条'
  };

  Router.register('card-editor', function (el, args) {
    var c = S.getContact(args && args.cid) || S.state.contacts[0];
    if (!c) return;
    if (args && args.tab && S.CARD_SECTIONS.indexOf(args.tab) !== -1) active = args.tab;

    function section(name) {
      return (c.cards || []).filter(function (g) { return g.g === name; })[0];
    }

    function draw() {
      var sec = section(active) || c.cards[0];
      if (!sec) return;
      active = sec.g;
      el.innerHTML =
        '<div class="page-head"><button class="back-btn" data-back>' + Icon('back', 22) + '</button>' +
        '<div class="ph-title">字卡库</div></div>' +
        '<div class="ce-tabs">' + S.CARD_SECTIONS.map(function (n) {
          var s = section(n);
          return '<button class="ce-tab' + (n === active ? ' on' : '') + '" data-sec="' + esc(n) + '">' +
            esc(n) + ' ' + ((s && s.items.length) || 0) + '</button>';
        }).join('') + '</div>' +
        '<div class="ce-body">' +
        '<div class="ce-tip">' + esc(TIPS[active] || '') + '</div>' +
        '<div class="ce-items">' + (sec.items.length ? sec.items.map(function (t, i) {
          return '<span class="ce-item"><span class="ce-item-t">' + esc(t) + '</span>' +
            '<span class="ce-item-x" data-i="' + i + '">' + Icon('close', 13) + '</span></span>';
        }).join('') : '<div class="empty"><div class="empty-ic">' + Icon('card', 34) + '</div><div class="empty-t">这个分区还没有字卡</div></div>') + '</div>' +
        '<div class="ce-addrow">' +
        '<input class="ce-add" id="ce-input" placeholder="输入一条字卡，回车添加" maxlength="60" autocomplete="off">' +
        '<button class="glass-btn primary sm" id="ce-add">' + Icon('plus', 15) + ' 添加</button></div>' +
        '<div class="ce-tools">' +
        '<button class="glass-btn sm" id="ce-batch">' + Icon('list', 15) + ' 批量添加</button>' +
        '<button class="glass-btn sm" id="ce-reset">' + Icon('refresh', 15) + ' 恢复默认</button>' +
        '<button class="glass-btn sm danger" id="ce-clear">' + Icon('trash', 15) + ' 清空本分区</button>' +
        '</div></div>';

      el.querySelectorAll('.ce-tab').forEach(function (b) {
        b.addEventListener('click', function () { active = b.dataset.sec; draw(); });
      });

      function add(text) {
        var v = String(text == null ? '' : text).trim();
        if (!v) return false;
        if (sec.items.indexOf(v) !== -1) return false;
        sec.items.push(v);
        return true;
      }

      var input = el.querySelector('#ce-input');
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        if (add(input.value)) { S.saveDebounced(); draw(); }
        else UI.toast('输入内容或不要重复', 'info');
      });
      el.querySelector('#ce-add').addEventListener('click', function () {
        if (add(input.value)) { S.saveDebounced(); draw(); UI.toast('已添加', 'check'); }
        else UI.toast('输入内容或不要重复', 'info');
      });

      el.querySelectorAll('.ce-item-x').forEach(function (x) {
        x.addEventListener('click', function () {
          sec.items.splice(+x.dataset.i, 1);
          S.saveDebounced(); draw();
        });
      });

      el.querySelector('#ce-batch').addEventListener('click', function () {
        UI.popup({
          title: '批量添加 · ' + active,
          body: '<div class="rp-field"><label>每行一条，重复的会自动跳过</label>' +
            '<textarea class="pop-input" id="ce-batch-text" rows="8" style="min-height:150px"></textarea></div>',
          actions: [
            { label: '取消' },
            { label: '添加', primary: true, onClick: function () {
              var v = document.getElementById('ce-batch-text').value || '';
              var lines = v.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
              var n = 0;
              lines.forEach(function (t) { if (add(t)) n++; });
              S.saveDebounced(); draw();
              UI.toast('已添加 ' + n + ' 条', 'check');
            } }
          ]
        });
      });

      el.querySelector('#ce-reset').addEventListener('click', async function () {
        var ok = await UI.confirm('恢复默认', '把「' + active + '」分区恢复为默认字卡吗？（现有内容会被替换）', { okText: '恢复' });
        if (!ok) return;
        var d = (S.DEFAULT_CARDS || []).filter(function (g) { return g.g === active; })[0];
        sec.items = d ? d.items.slice() : [];
        S.saveDebounced(); draw();
        UI.toast('已恢复默认', 'check');
      });

      el.querySelector('#ce-clear').addEventListener('click', async function () {
        var ok = await UI.confirm('清空分区', '确定清空「' + active + '」分区的全部字卡吗？', { danger: true, okText: '清空' });
        if (!ok) return;
        sec.items = [];
        S.saveDebounced(); draw();
      });
    }
    draw();
  });
})();
