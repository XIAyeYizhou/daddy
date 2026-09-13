/* ============================================================
   微聊 — 对方行为调度（自动回复 / 状态 / 朋友圈 / 信箱 / 打卡 / 一起听音乐）
   ============================================================ */
(function () {
  var S = Store;

  function notify(title, body) {
    if (window.Notify) window.Notify.push(title, body);
  }

  /* 全部可用回复语料 */
  function flatChat(c) {
    var arr = [];
    (c.cards || []).forEach(function (g) { (g.items || []).forEach(function (t) { if (t) arr.push(t); }); });
    return arr;
  }

  /* 指定分区字卡 */
  function part(c, name) {
    var g = (c.cards || []).filter(function (x) { return x.g === name; })[0];
    return g ? (g.items || []).slice() : [];
  }
  /* 交流分区（缺失时退回全部） */
  function talk(c) {
    var a = part(c, '交流');
    return a.length ? a : flatChat(c);
  }

  /* 一起听音乐的评论语料 */
  var MUSIC_LINES = [
    '这首歌好听', '旋律好舒服', '一起听真不错', '这首我也想收藏', '刚好在循环这首',
    '这歌上次循环了好久', '安静地听完这首吧', '这个歌手我最近很喜欢', '一起听歌真好呀'
  ];

  /* ---------- 回复用户消息 ---------- */
  function setTyping(cid, on) {
    var c = S.getContact(cid);
    if (c) c.typing = on;
    Bus.emit('typing', cid);
  }

  function replyTo(cid) {
    var c = S.getContact(cid);
    if (!c) return;
    var cards = talk(c);
    var n = S.clamp(c.settings.replyCount || 2, 1, 6);
    var texts = [];
    for (var i = 0; i < n; i++) {
      var t = S.pick(cards);
      if (t && texts.indexOf(t) === -1) texts.push(t);
    }
    if (!texts.length) return;
    // 偶尔补一条 emoji / 颜文字 短句
    var extra = Math.random() < 0.28 ? S.pick(part(c, 'emoji')) : (Math.random() < 0.22 ? S.pick(part(c, '颜文字')) : null);
    if (extra && texts.indexOf(extra) === -1) texts.push(extra);
    // 表情包回复频率（默认 15%）
    var freq = c.settings.stickerFreq != null ? c.settings.stickerFreq : 15;
    if (c.stickers && c.stickers.length && Math.random() < freq / 100) {
      S.pushMsg(cid, { from: 'them', type: 'sticker', content: '', meta: { sticker: true, image: S.pick(c.stickers) }, read: false });
      try { AudioX.receiveSound(); } catch (e) { }
      return;
    }
    if (c.settings.merge) {
      S.pushMsg(cid, { from: 'them', type: 'text', content: texts.join('；'), read: false });
    } else {
      texts.forEach(function (t) { S.pushMsg(cid, { from: 'them', type: 'text', content: t, read: false }); });
    }
    try { AudioX.receiveSound(); } catch (e) { }
  }

  /* 用户发消息后：安排回复 */
  function onUserMsg(cid) {
    var c = S.getContact(cid);
    if (!c) return;
    var gap = c.settings.gapSec || 8;
    S.state.pendingReplies[cid] = { at: Date.now() + gap * 1000 };
    setTyping(cid, true);
  }

  /* ---------- 状态 ---------- */
  var STATUS_POOL = ['在听歌', '学习中', '发呆中', '散步中', '休息中', '忙碌中', '看剧', '刚睡醒', '在加班'];
  function statusTick(c) {
    var t = S.simNow();
    if (t < (c.timers.nextStatusAt || 0)) return;
    c.timers.nextStatusAt = t + S.rand(2, 30) * 86400e3;
    var pool = part(c, '状态');
    c.status = { text: S.pick(pool.length ? pool : STATUS_POOL), image: null };
    Bus.emit('status', c.id);
    Bus.emit('conv', c.id);
  }

  /* ---------- 戳一戳 ---------- */
  function pokeFrom(c) {
    var pat = S.pick(part(c, '拍一拍')) || '拍了拍你';
    S.pushMsg(c.id, { from: 'sys', type: 'sys', content: c.name + ' ' + pat });
    Bus.emit('poke', c.id);
    notify(c.name + ' 戳了戳你', pat);
  }
  function pokeTick(c) {
    var t = S.simNow();
    if (t < (c.timers.nextPokeAt || 0)) return;
    c.timers.nextPokeAt = t + S.rand(2, 10) * 3600e3;
    pokeFrom(c);
  }

  /* ---------- 红包 ---------- */
  var RP_NOTES = ['恭喜发财，大吉大利', '今天也要开心', '请你喝奶茶', '周末愉快', '收下吧'];
  function redPacketTick(c) {
    var t = S.simNow();
    if (t < (c.timers.nextRedPacketAt || 0)) return;
    c.timers.nextRedPacketAt = t + S.rand(6, 72) * 3600e3;
    var note = Math.random() < 0.6 ? (S.pick(talk(c)) || S.pick(RP_NOTES)) : S.pick(RP_NOTES);
    S.pushMsg(c.id, {
      from: 'them', type: 'redpacket', content: '',
      meta: { amount: S.randInt(1, 88), note: note, status: 'unopened' },
      read: false
    });
    notify(c.name + ' 发来一个红包', note);
    try { UI.toast(c.name + ' 给你发了一个红包', 'redpacket'); } catch (e) { }
  }

  /* 我发出的红包：对方领取 / 24 小时退还 */
  function packetTick() {
    var st = S.state;
    var now = Date.now();
    function findMsg(cid, id) {
      return (st.convs[cid] || []).filter(function (x) { return x.id === id; })[0];
    }
    Object.keys(st.pendingPackets || {}).forEach(function (msgId) {
      var p = st.pendingPackets[msgId];
      var m = findMsg(p.cid, msgId);
      if (!m) { delete st.pendingPackets[msgId]; return; }
      if (m.meta.status === 'opened' || m.meta.status === 'refunded') { delete st.pendingPackets[msgId]; return; }
      var c = S.getContact(p.cid);
      if (now - m.time >= 24 * 3600e3) {
        m.meta.status = 'refunded';
        S.pushMsg(p.cid, { from: 'sys', type: 'sys', content: '红包已退还（24 小时未领取）' });
        delete st.pendingPackets[msgId];
        return;
      }
      if (!p.never && now >= p.openAt) {
        m.meta.status = 'opened';
        S.pushMsg(p.cid, { from: 'sys', type: 'sys', content: (c ? c.name : '对方') + ' 领取了你的红包' });
        delete st.pendingPackets[msgId];
      }
    });
  }

  /* ---------- 朋友圈动态 ---------- */
  function postTick(c) {
    var t = S.simNow();
    if (t < (c.timers.nextPostAt || 0)) return;
    c.timers.nextPostAt = t + S.rand(6, 72) * 3600e3;
    var txt = S.pick(talk(c));
    if (!txt) return;
    var images = [];
    if (c.stickers && c.stickers.length && Math.random() < 0.4) images.push(S.pick(c.stickers));
    S.state.moments.unshift({ id: S.uid('mo'), author: c.id, text: txt, images: images, time: Date.now(), likes: [], dislikes: [], comments: [] });
    Bus.emit('moments');
    notify(c.name + ' 发布了新动态', txt.slice(0, 40));
  }

  /* 我评论了对方的动态 → 对方回一条；对方回评了我的评论 */
  function momentCommented(momentId) {
    var m = S.state.moments.find(function (x) { return x.id === momentId; });
    if (!m) return;
    var c = S.getContact(m.author);
    if (!c) return;
    S.state.pendingComments[S.uid('pc')] = { at: Date.now() + S.rand(5, 22) * 1000, who: c.id, mid: m.id };
  }
  function momentCommentedReply(momentId, whoId) {
    var m = S.state.moments.find(function (x) { return x.id === momentId; });
    if (!m) return;
    var c = S.getContact(whoId);
    if (!c) return;
    S.state.pendingComments[S.uid('pc')] = { at: Date.now() + S.rand(5, 22) * 1000, who: c.id, mid: m.id };
  }

  /* ---------- 信箱 ---------- */
  function letterTick(c) {
    var t = S.simNow();
    var st = S.state;
    // 回信
    st.letters.forEach(function (l) {
      if (l.from === 'me' && !l.replied && t >= (l.replyAt || 0)) {
        l.replied = true;
        var cards = flatChat(c);
        var parts = [];
        var n = S.randInt(6, 18);
        for (var i = 0; i < n; i++) { var x = S.pick(cards); if (x && parts.length < 20) parts.push(x); }
        st.letters.unshift({ id: S.uid('l'), from: c.id, to: 'me', content: parts.join('，'), time: Date.now(), read: false, replied: true });
        c.timers.nextLetterAt = t + S.rand(1, 30) * 86400e3;
        Bus.emit('letters');
        notify(c.name + ' 回信了', parts.join('，').slice(0, 40));
      }
    });
    // 主动来信
    if (t >= (c.timers.nextLetterAt || 0)) {
      c.timers.nextLetterAt = t + S.rand(1, 30) * 86400e3;
      var cards2 = flatChat(c);
      var parts2 = [];
      var n2 = S.randInt(6, 18);
      for (var i2 = 0; i2 < n2; i2++) { var x2 = S.pick(cards2); if (x2 && parts2.length < 20) parts2.push(x2); }
      st.letters.unshift({ id: S.uid('l'), from: c.id, to: 'me', content: parts2.join('，'), time: Date.now(), read: false, replied: true });
      Bus.emit('letters');
      notify(c.name + ' 给你写了一封信', parts2.join('，').slice(0, 40));
    }
  }

  /* ---------- 打卡 ---------- */
  function checkinTick(c) {
    var t = S.simNow();
    if (t < (c.timers.nextCheckinAt || 0)) return;
    c.timers.nextCheckinAt = t + S.rand(2, 8) * 3600e3;
    var content = S.pick(part(c, '日常')) || S.pick(talk(c)) || '打卡';
    var st = S.state;
    st.checkins.timeline.unshift({ who: c.id, time: Date.now(), content: content, avatar: c.avatar });
    var k = S.dayKey();
    if (!st.checkins.calendar[k]) st.checkins.calendar[k] = [];
    if (!st.checkins.calendar[k].some(function (e) { return e.who === c.id; })) {
      st.checkins.calendar[k].push({ who: c.id, text: content });
    }
    Bus.emit('checkin');
  }

  /* ---------- 一起听音乐：对方互动 ---------- */
  function musicLiveTick() {
    var ms = S.state.musicState;
    if (!ms || !ms.live) return;
    var now = Date.now();
    if (now < (S.state.musicNextPartnerAt || 0)) return;
    S.state.musicNextPartnerAt = now + S.rand(45, 150) * 1000;
    var c = S.state.contacts[0];
    if (!c) return;
    var list = S.state.music || [];
    // 有概率切歌
    if (ms.playing && list.length > 1 && Math.random() < 0.3) {
      try {
        if (window.AudioX && AudioX.Music && typeof AudioX.Music.next === 'function') AudioX.Music.next();
      } catch (e) { }
      var song = list[ms.idx] || {};
      S.pushMsg(c.id, { from: 'sys', type: 'sys', content: c.name + ' 切到了《' + (song.name || '下一首') + '》' });
      return;
    }
    S.pushMsg(c.id, { from: 'them', type: 'text', content: S.pick(MUSIC_LINES), read: false });
    try { AudioX.receiveSound(); } catch (e) { }
  }

  /* 开始/结束一起听 → 系统提示 */
  Bus.on('music-live', function (ev) {
    var c = S.state.contacts[0];
    if (!c) return;
    if (ev && ev.on) {
      S.pushMsg(c.id, { from: 'sys', type: 'sys', content: '你和 ' + c.name + ' 开始一起听音乐' });
      S.state.musicNextPartnerAt = Date.now() + S.rand(20, 60) * 1000;
    } else {
      S.pushMsg(c.id, { from: 'sys', type: 'sys', content: '一起听音乐已结束' });
    }
  });

  /* ---------- 主循环 ---------- */
  function tick() {
    var st = S.state;
    var now = Date.now();

    // 回复用户消息
    Object.keys(st.pendingReplies || {}).forEach(function (cid) {
      var p = st.pendingReplies[cid];
      if (now >= p.at) {
        setTyping(cid, false);
        delete st.pendingReplies[cid];
        replyTo(cid);
      }
    });

    // 动态评论回复
    Object.keys(st.pendingComments || {}).forEach(function (key) {
      var p = st.pendingComments[key];
      if (now < p.at) return;
      delete st.pendingComments[key];
      var m = st.moments.find(function (x) { return x.id === p.mid; });
      if (!m) return;
      var c = S.getContact(p.who);
      if (!c) return;
      if (Math.random() < 0.75) {
        var t = S.pick(flatChat(c));
        if (t) {
          m.comments.push({ who: c.id, text: t, replyTo: '我', time: Date.now() });
          notify(c.name + ' 回复了你', t);
          Bus.emit('moments');
        }
      }
    });

    // 对方回戳
    Object.keys(st.pokeBack || {}).forEach(function (k) {
      var p = st.pokeBack[k];
      if (now < p.at) return;
      delete st.pokeBack[k];
      var c2 = S.getContact(p.cid);
      if (c2) pokeFrom(c2);
    });

    st.contacts.forEach(function (c) {
      statusTick(c);
      postTick(c);
      letterTick(c);
      checkinTick(c);
      pokeTick(c);
      redPacketTick(c);
    });

    packetTick();
    musicLiveTick();
  }

  function start() { setInterval(tick, 1000); }

  window.AI = {
    start: start, tick: tick, onUserMsg: onUserMsg, setTyping: setTyping,
    flatChat: flatChat, part: part, talk: talk,
    pokeFrom: pokeFrom, momentCommented: momentCommented, momentCommentedReply: momentCommentedReply
  };
})();
