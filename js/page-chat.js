/* ============================================================
   微聊 — 聊天对话页（文本/图片/表情包/引用/更多菜单）
   ============================================================ */
(function () {
  var S = Store, UI = window.UI, esc = S.esc;
  var chatCid = null, pageEl = null;
  var drawMsgsRef = null;      // 当前聊天页的重绘函数（供模块级刷新调用）

  function isOpen(cid) { return Router.currentId() === 'chat' && chatCid === cid; }

  /* ---------- 顶部栏（头像 + 名称 + 状态） ---------- */
  function titleHTML(c) {
    return '<div class="chat-ava" id="chat-ava">' + UI.avatarEl(c.avatar, 44) + '</div>' +
      '<div class="chat-name" id="chat-name">' + esc(c.name) + '</div>' +
      (c.status && c.status.text ? '<div class="chat-status" id="chat-status">' + esc(c.status.text) + '</div>' : '');
  }

  function bindTitle(titleEl) {
    var c = S.getContact(chatCid);
    if (!c) return;
    var st = titleEl.querySelector('#chat-status');
    if (st) st.addEventListener('click', function (e) { e.stopPropagation(); UI.statusPop(c.status); });

    // 点击头像：更换头像
    var ava = titleEl.querySelector('#chat-ava');
    if (ava) ava.addEventListener('click', function () {
      UI.sheetList({
        title: '联系人头像',
        items: [
          { icon: 'image', label: '从本地选取', onClick: function (ap) { ap.close(); pick(false); } },
          { icon: 'camera', label: '拍照', onClick: function (ap) { ap.close(); pick(true); } }
        ]
      });
      async function pick(camera) {
        var imgs = await UI.pickImage({ camera: camera });
        if (!imgs.length) return;
        c.avatar = imgs[0];
        S.saveDebounced();
        redrawHead();
        UI.toast('头像已更新', 'check');
      }
    });

    // 点击名称：改名
    var nm = titleEl.querySelector('#chat-name');
    if (nm) nm.addEventListener('click', function () {
      UI.popup({
        center: true,
        title: '修改联系人名称',
        body: '<input class="pop-input" id="chat-rename" maxlength="16" value="' + esc(c.name) + '">',
        actions: [
          { label: '取消' },
          { label: '保存', primary: true, onClick: function () {
            var v = (document.getElementById('chat-rename').value || '').trim();
            if (v) { c.name = v; S.saveDebounced(); redrawHead(); UI.toast('名称已更新', 'check'); }
          } }
        ]
      });
    });
  }

  function redrawHead() {
    if (!pageEl || !pageEl.parentNode) return;
    var c = S.getContact(chatCid);
    var title = pageEl.querySelector('.chat-title');
    if (c && title) { title.innerHTML = titleHTML(c); bindTitle(title); }
  }

  /* ---------- 红包气泡 ---------- */
  function redPacketHTML(m) {
    var meta = m.meta || {};
    var status = meta.status || 'unopened';
    var refund = status === 'refunded';
    var opened = status === 'opened';
    var note = meta.note ? esc(meta.note) : '恭喜发财，大吉大利';
    var sub = refund ? '已退还' : (opened ? '已领取' : '微信红包');
    var amt = (status === 'unopened') ? '' : '<div class="rp-amt">¥ ' + (Number(meta.amount) || 0).toFixed(2) + '</div>';
    return '<div class="bubble-rp' + (refund ? ' rp-refund' : '') + '" data-rp="' + m.id + '">' +
      '<span class="rp-knot"></span>' +
      '<div class="rp-title">' + note + '</div>' +
      amt +
      '<div class="rp-status">' + sub + '</div></div>';
  }

  /* ---------- 消息渲染 ---------- */
  function msgHTML(m, c) {
    if (m.type === 'sys') return '<div class="msg-sys">' + esc(m.content) + '</div>';
    var mine = m.from === 'me';
    var ava = mine ? S.state.me.avatar : c.avatar;
    var body = '';
    var meta = m.meta || {};
    if (m.type === 'text') {
      var quote = meta.quote ? '<div class="bq">' + esc(meta.quote) + '</div>' : '';
      body = '<div class="bubble">' + quote + '<span class="b-text">' + esc(m.content) + '</span></div>';
    } else if (m.type === 'sticker') {
      body = '<img class="stk-sent" src="' + (meta.image || '') + '" alt="表情">';
    } else if (m.type === 'image') {
      body = '<div class="bubble bubble-img"><img src="' + (meta.image || '') + '" alt=""></div>';
    } else if (m.type === 'redpacket') {
      body = redPacketHTML(m);
    } else {
      body = '<div class="bubble"><span class="b-text">' + esc(m.content || '') + '</span></div>';
    }
    return '<div class="msg-row ' + (mine ? 'mine' : 'theirs') + '" data-id="' + m.id + '" data-type="' + m.type + '">' +
      '<div class="msg-ava">' + UI.avatarEl(ava, 36) + '</div>' +
      '<div class="msg-col">' + (mine ? '' : '<div class="msg-who">' + esc(c.name) + '</div>') + body + '</div></div>';
  }

  /* ---------- 聊天页 ---------- */
  Router.register('chat', function (el, args) {
    var c = S.getContact(args.cid) || S.state.contacts[0];
    if (!c) {
      el.className = 'page chat-page';
      el.innerHTML = '<div class="empty"><div class="empty-ic">' + Icon('chat', 34) + '</div><div class="empty-t">还没有联系人</div></div>';
      return;
    }
    var cid = c.id;
    chatCid = cid;
    pageEl = el;
    S.markRead(cid);
    el.className = 'page chat-page';
    el.innerHTML = '';

    // 聊天背景
    var bgEl = document.createElement('div');
    bgEl.className = 'chat-bg';
    if (c.settings.chatBg) bgEl.style.backgroundImage = 'url(' + c.settings.chatBg + ')';
    el.appendChild(bgEl);

    // 顶部栏
    var head = document.createElement('div');
    head.className = 'chat-head';
    head.innerHTML = '<div class="chat-title">' + titleHTML(c) + '</div>' +
      '<div class="chat-right"><button class="chat-more" id="chat-more">' + Icon('more', 22) + '</button></div>';
    el.appendChild(head);
    bindTitle(head.querySelector('.chat-title'));
    head.querySelector('#chat-more').addEventListener('click', openMore);

    // 消息区
    var msgsEl = document.createElement('div');
    msgsEl.className = 'chat-msgs';
    msgsEl.id = 'chat-msgs';
    el.appendChild(msgsEl);

    // 正在输入
    var typingEl = document.createElement('div');
    typingEl.className = 'chat-typing';
    typingEl.id = 'chat-typing';
    typingEl.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-t">对方正在输入…</span>';
    el.appendChild(typingEl);

    // 输入区
    var foot = document.createElement('div');
    foot.className = 'chat-foot glass';
    foot.innerHTML =
      '<div class="ci-row1">' +
      '<input id="chat-text" class="ci-input" placeholder="输入消息…" autocomplete="off">' +
      '<button class="ci-img" id="chat-img" title="发送图片">' + Icon('image', 21) + '</button>' +
      '</div>' +
      '<div class="ci-row2">' +
      '<button data-f="sticker" title="表情包">' + Icon('sticker', 20) + '</button>' +
      '<button data-f="poke" title="戳一戳">' + Icon('poke', 20) + '</button>' +
      '<button data-f="redpacket" title="红包">' + Icon('redpacket', 20) + '</button>' +
      '</div>';
    el.appendChild(foot);

    var input = foot.querySelector('#chat-text');
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendText(); });
    foot.querySelector('#chat-img').addEventListener('click', async function () {
      var imgs = await UI.pickImage({ multiple: false });
      imgs.forEach(function (im) { sendMsg('image', '', { image: im }); });
    });
    foot.querySelectorAll('.ci-row2 button').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.dataset.f;
        if (f === 'sticker') openStickers();
        else if (f === 'poke') doPoke();
        else if (f === 'redpacket') openRedPacketSend();
      });
    });

    drawMsgs();
    drawMsgsRef = drawMsgs;

    function drawMsgs() {
      var arr = S.conv(cid);
      var nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 140;
      var h = '', lastDay = '';
      arr.forEach(function (m) {
        var dk = new Date(m.time).toDateString();
        if (dk !== lastDay) {
          lastDay = dk;
          h += '<div class="msg-date">' + UI.fmtChatTime(m.time).slice(0, -5) + '</div>';
        }
        h += msgHTML(m, c);
      });
      msgsEl.innerHTML = h || '<div class="empty"><div class="empty-ic">' + Icon('chat', 34) + '</div><div class="empty-t">开始和 ' + esc(c.name) + ' 聊天吧</div></div>';
      bindBubbles();
      if (nearBottom || !h) msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function sendText() {
      var v = (input.value || '').trim();
      if (!v) return;
      var quote = input._quote;
      input._quote = null;
      input.placeholder = '输入消息…';
      input.value = '';
      sendMsg('text', v, quote ? { quote: S.msgPreview(quote).slice(0, 60) } : null);
    }

    function sendMsg(type, content, meta) {
      S.pushMsg(cid, { from: 'me', type: type, content: content, meta: meta || {} });
      try { AudioX.sendSound(); } catch (e) { }
      AI.onUserMsg(cid);
      drawMsgs();
    }
    window.__chatSend = sendMsg;

    /* 长按消息：引用 / 复制 / 删除 */
    function bindBubbles() {
      msgsEl.querySelectorAll('.msg-row').forEach(function (row) {
        var timer = null, moved = false;
        row.addEventListener('pointerdown', function () { moved = false; timer = setTimeout(function () { if (!moved) showMenu(row, c); }, 480); });
        row.addEventListener('pointermove', function () { moved = true; clearTimeout(timer); });
        row.addEventListener('pointerup', function () { clearTimeout(timer); });
        row.addEventListener('pointercancel', function () { clearTimeout(timer); });
        row.addEventListener('contextmenu', function (e) { e.preventDefault(); showMenu(row, c); });
      });
      // 红包：点击领取 / 查看
      msgsEl.querySelectorAll('[data-rp]').forEach(function (rp) {
        rp.addEventListener('click', function () { openRedPacketView(rp.dataset.rp); });
      });
    }

    function showMenu(row, c) {
      var id = row.dataset.id;
      var m = S.conv(cid).find(function (x) { return x.id === id; });
      if (!m || m.type === 'sys') return;
      var items = [
        { icon: 'reply', label: '引用', onClick: function () {
          input._quote = m;
          input.placeholder = '引用：' + S.msgPreview(m).slice(0, 20);
          input.focus();
        } },
        { icon: 'card', label: '复制', onClick: function () {
          var txt = m.type === 'text' ? m.content : S.msgPreview(m);
          try {
            if (navigator.clipboard) navigator.clipboard.writeText(txt);
            else { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
            UI.toast('已复制', 'check');
          } catch (e) { UI.toast('复制失败', 'info'); }
        } },
        { icon: 'trash', label: '删除', danger: true, onClick: function () {
          S.state.convs[cid] = S.conv(cid).filter(function (x) { return x.id !== id; });
          S.saveDebounced();
          drawMsgs();
        } }
      ];
      UI.sheetList({ title: '消息', items: items });
    }

    /* 我的表情包（点击发送 / 长按删除） */
    function openStickers() {
      var me = S.state.me;
      if (!me.stickers) me.stickers = [];
      function grid() {
        return me.stickers.length ? me.stickers.map(function (s, i) {
          return '<img class="stk-cell" data-i="' + i + '" src="' + s + '" alt="表情">';
        }).join('') : '<div class="empty"><div class="empty-ic">' + Icon('sticker', 34) + '</div><div class="empty-t">还没有表情包，点上方添加</div></div>';
      }
      var api = UI.popup({
        title: '表情包',
        body: '<div class="stk-tools"><button class="glass-btn sm primary" id="stk-add">' + Icon('plus', 15) + ' 添加表情包</button>' +
          '<span class="stk-hint">点击发送 · 长按删除 · 自动压缩至 20KB 内</span></div>' +
          '<div class="stk-grid" id="stk-grid">' + grid() + '</div>'
      });
      api.body.querySelector('#stk-add').addEventListener('click', async function () {
        var imgs = await UI.pickImage({ multiple: true });
        if (!imgs.length) return;
        imgs.forEach(function (im) { me.stickers.push(im); });
        S.saveDebounced();
        api.body.querySelector('#stk-grid').innerHTML = grid();
        bindCells();
        UI.toast('已添加 ' + imgs.length + ' 张', 'check');
      });
      function bindCells() {
        api.body.querySelectorAll('.stk-cell').forEach(function (img) {
          var timer = null, moved = false;
          img.addEventListener('pointerdown', function () { moved = false; timer = setTimeout(function () { if (!moved) del(img); }, 500); });
          img.addEventListener('pointermove', function () { moved = true; clearTimeout(timer); });
          img.addEventListener('pointerup', function () { clearTimeout(timer); });
          img.addEventListener('click', function () {
            var s = me.stickers[+img.dataset.i];
            if (!s) return;
            sendSticker(s);
            api.close();
          });
        });
      }
      async function del(img) {
        var i = +img.dataset.i;
        var ok = await UI.confirm('删除表情包', '确定删除这张表情包吗？', { danger: true, okText: '删除' });
        if (!ok) return;
        me.stickers.splice(i, 1);
        S.saveDebounced();
        api.body.querySelector('#stk-grid').innerHTML = grid();
        bindCells();
      }
      bindCells();
    }

    function sendSticker(src) {
      S.pushMsg(cid, { from: 'me', type: 'sticker', content: '', meta: { sticker: true, image: src } });
      try { AudioX.sendSound(); } catch (e) { }
      AI.onUserMsg(cid);
      drawMsgs();
    }

    /* ---------- 戳一戳 ---------- */
    function doPoke() {
      S.pushMsg(cid, { from: 'sys', type: 'sys', content: '你拍了拍「' + c.name + '」' });
      try { AudioX.pokeSound(); } catch (e) { }
      drawMsgs();
      // 对方有概率回戳
      if (Math.random() < 0.55) {
        var st = S.state;
        if (!st.pokeBack) st.pokeBack = {};
        st.pokeBack[c.id] = { at: Date.now() + 2500 + Math.random() * 8000, cid: c.id };
        S.saveDebounced();
      }
    }

    /* ---------- 发红包（无自定义封面） ---------- */
    function openRedPacketSend() {
      var api = UI.popup({
        title: '发红包',
        body: '<div class="rp-send">' +
          '<div class="rp-field"><label>金额</label><input id="rp-amt" type="number" min="0.01" step="0.01" placeholder="0.00"></div>' +
          '<div class="rp-field"><label>备注</label><input id="rp-note" maxlength="40" placeholder="恭喜发财，大吉大利"></div>' +
          '</div>',
        actions: [
          { label: '取消' },
          { label: '塞钱进红包', primary: true, onClick: function () {
            var amt = parseFloat(document.getElementById('rp-amt').value);
            if (!amt || amt <= 0) { UI.toast('请输入金额', 'info'); return false; }
            var note = (document.getElementById('rp-note').value || '').trim();
            var msg = {
              from: 'me', type: 'redpacket', content: '',
              meta: { amount: Math.round(amt * 100) / 100, note: note, status: 'unopened', fromMe: true }
            };
            S.pushMsg(cid, msg);
            var st = S.state;
            if (!st.pendingPackets) st.pendingPackets = {};
            st.pendingPackets[msg.id] = {
              cid: cid, openAt: Date.now() + 6000 + Math.random() * 34000,
              never: Math.random() < 0.1     // 小概率对方不领，24 小时后退还
            };
            S.saveDebounced();
            try { AudioX.sendSound(); } catch (e) { }
            drawMsgs();
          } }
        ]
      });
    }

    /* ---------- 点红包：领取 / 查看 ---------- */
    function openRedPacketView(msgId) {
      var m = S.conv(cid).filter(function (x) { return x.id === msgId; })[0];
      if (!m) return;
      var meta = m.meta || {};
      var mine = m.from === 'me';
      if (meta.status === 'refunded') {
        UI.popup({ center: true, title: '红包已退还', body: '<div class="rp-open rp-refund"><div class="rp-open-amt">¥ ' + (Number(meta.amount) || 0).toFixed(2) + '</div><div class="rp-open-txt">24 小时内未被领取，已退还给你</div></div>' });
        return;
      }
      if (!mine && meta.status !== 'opened') {
        // 领取对方红包
        meta.status = 'opened';
        S.pushMsg(cid, { from: 'sys', type: 'sys', content: '你领取了 ' + c.name + ' 的红包' });
        S.saveDebounced();
        drawMsgs();
        UI.popup({
          center: true,
          title: '红包',
          body: '<div class="rp-open"><div class="rp-open-amt">¥ ' + (Number(meta.amount) || 0).toFixed(2) + '</div>' +
            '<div class="rp-open-txt">' + (meta.note ? esc(meta.note) : '恭喜发财，大吉大利') + '</div>' +
            '<div class="rp-open-by">来自 ' + esc(c.name) + '</div></div>'
        });
        try { AudioX.openPacket(); } catch (e) { }
        return;
      }
      UI.popup({
        center: true,
        title: mine ? '我的红包' : '红包详情',
        body: '<div class="rp-open"><div class="rp-open-amt">¥ ' + (Number(meta.amount) || 0).toFixed(2) + '</div>' +
          '<div class="rp-open-txt">' + (meta.note ? esc(meta.note) : '恭喜发财，大吉大利') + '</div>' +
          '<div class="rp-open-by">' + (meta.status === 'opened' ? '已被领取' : '待领取') + '</div></div>'
      });
    }
  });

  /* ---------- 更多菜单 ---------- */
  function openMore() {
    UI.sheetList({
      title: '更多',
      items: [
        { icon: 'compass', label: '探索', onClick: function () { Router.go('explore'); } },
        { icon: 'music', label: '一起听音乐', onClick: function () { Router.go('music'); } },
        { icon: 'card', label: '字卡库', onClick: function () { Router.go('card-editor', { cid: chatCid }); } },
        { icon: 'me', label: '我的', onClick: function () { Router.go('profile'); } },
        { icon: 'gear', label: '聊天设置', onClick: function () { openSettings(); return false; } }
      ]
    });
  }

  /* ---------- 聊天设置 ---------- */
  function openSettings() {
    var c = S.getContact(chatCid);
    if (!c) return;
    UI.sheetList({
      title: '聊天设置',
      items: [
        { icon: 'palette', label: '设置聊天背景', onClick: function () { setBg(); return false; } },
        { icon: 'chat', label: '回复条数', onClick: function () { sliderPop('回复条数', 1, 6, 1, ' 条', c.settings.replyCount, function (v) { c.settings.replyCount = v; }); return false; } },
        { icon: 'clock', label: '回复间隔', onClick: function () { sliderPop('回复间隔', 2, 120, 1, ' 秒', c.settings.gapSec, function (v) { c.settings.gapSec = v; }); return false; } },
        { icon: 'sticker', label: '表情包回复频率', onClick: function () { sliderPop('表情包回复频率', 0, 100, 1, '%', c.settings.stickerFreq, function (v) { c.settings.stickerFreq = v; }); return false; } },
        { icon: 'check', label: '合并回复', onClick: function () { switchPop('合并回复', c.settings.merge, function (v) { c.settings.merge = v; }); return false; } },
        { icon: 'card', label: '编辑字卡', onClick: function () { Router.go('card-editor', { cid: chatCid }); } },
        { icon: 'trash', label: '清空聊天记录', danger: true, onClick: function () { clearChat(); } }
      ]
    });
  }

  function setBg() {
    UI.sheetList({
      title: '聊天背景',
      items: [
        { icon: 'image', label: '从本地选取', onClick: function (api) { api.close(); pick(false); } },
        { icon: 'camera', label: '拍照', onClick: function (api) { api.close(); pick(true); } },
        { icon: 'close', label: '移除背景', onClick: function () {
          var c = S.getContact(chatCid);
          if (c) { c.settings.chatBg = null; S.saveDebounced(); }
          var bg = pageEl && pageEl.querySelector('.chat-bg');
          if (bg) bg.style.backgroundImage = '';
        } }
      ]
    });
    async function pick(camera) {
      var imgs = await UI.pickImage({ camera: camera });
      if (!imgs.length) return;
      var c = S.getContact(chatCid);
      if (c) { c.settings.chatBg = imgs[0]; S.saveDebounced(); }
      var bg = pageEl && pageEl.querySelector('.chat-bg');
      if (bg) bg.style.backgroundImage = 'url(' + imgs[0] + ')';
      UI.toast('聊天背景已更新', 'check');
    }
  }

  function sliderPop(title, min, max, step, unit, value, onInput) {
    UI.popup({ title: title, body: '', actions: [{ label: '完成', primary: true }] }).body.appendChild(
      UI.slider({ min: min, max: max, step: step, value: value != null ? value : min, unit: unit, onInput: function (v) { onInput(v); S.saveDebounced(); } })
    );
  }
  function switchPop(title, value, onToggle) {
    UI.popup({ title: title, body: '', actions: [{ label: '完成', primary: true }] }).body.appendChild(
      UI.switchEl(!!value, function (v) { onToggle(v); S.saveDebounced(); })
    );
  }

  async function clearChat() {
    var ok = await UI.confirm('清空聊天记录', '确定清空与联系人的全部聊天记录吗？', { danger: true, okText: '清空' });
    if (!ok) return;
    S.state.convs[chatCid] = [];
    S.saveDebounced();
    var msgs = document.getElementById('chat-msgs');
    if (msgs) msgs.innerHTML = '';
    redrawCurrent();
  }

  function redrawCurrent() {
    if (!pageEl || !pageEl.parentNode) return;
    if (Router.currentId() !== 'chat' || !isOpen(chatCid)) return;
    if (drawMsgsRef) { drawMsgsRef(); return; }
    var c = S.getContact(chatCid);
    if (!c) return;
    var msgsEl = document.getElementById('chat-msgs');
    if (!msgsEl) return;
    var arr = S.conv(chatCid);
    var h = '', lastDay = '';
    arr.forEach(function (m) {
      var dk = new Date(m.time).toDateString();
      if (dk !== lastDay) { lastDay = dk; h += '<div class="msg-date">' + UI.fmtChatTime(m.time).slice(0, -5) + '</div>'; }
      h += msgHTML(m, c);
    });
    msgsEl.innerHTML = h;
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  /* ---------- 实时刷新 ---------- */
  Bus.on('conv', function (cid) {
    if (!isOpen(cid)) return;
    if (S.unread(cid) > 0) S.markRead(cid);
    redrawCurrent();
    var t = document.getElementById('chat-typing');
    if (t) t.classList.remove('show');
  });
  Bus.on('status', function (cid) { if (isOpen(cid)) redrawHead(); });
  Bus.on('typing', function (cid) {
    if (!isOpen(cid)) return;
    var el = document.getElementById('chat-typing');
    if (!el) return;
    var c = S.getContact(cid);
    el.classList.toggle('show', !!(c && c.typing));
  });
})();
