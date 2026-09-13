/* ============================================================
   微聊 — 数据层（单联系人 + 本地音乐 + localStorage 持久化）
   ============================================================ */
(function () {
  var KEY = 'wechat_chat_v1';
  var SIM_SPEED = 1;            // 真实时间：1 真实秒 = 1 真实秒
  var state = null;

  function uid(p) { return (p || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function simNow() { return state.simBase + (Date.now() - state.simStart) * SIM_SPEED; }
  function dayKey(ms) { var d = new Date(ms || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function genAvatar(label, hue) {
    if (hue == null) hue = randInt(0, 360);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="hsl(' + hue + ',72%,72%)"/>' +
      '<stop offset="1" stop-color="hsl(' + ((hue + 42) % 360) + ',72%,54%)"/>' +
      '</linearGradient></defs>' +
      '<rect width="200" height="200" fill="url(#g)"/>' +
      '<circle cx="100" cy="76" r="38" fill="rgba(255,255,255,.88)"/>' +
      '<path d="M42 192c5-50 32-74 58-74s53 24 58 74z" fill="rgba(255,255,255,.88)"/>' +
      '<text x="100" y="120" font-size="44" text-anchor="middle" fill="hsl(' + hue + ',46%,36%)" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="600">' + label + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function genSticker(text, hue) {
    if (hue == null) hue = randInt(0, 360);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="hsl(' + hue + ',78%,78%)"/>' +
      '<stop offset="1" stop-color="hsl(' + ((hue + 40) % 360) + ',70%,60%)"/>' +
      '</linearGradient></defs>' +
      '<rect width="240" height="240" rx="46" fill="url(#g)"/>' +
      '<circle cx="92" cy="100" r="14" fill="rgba(255,255,255,.9)"/><circle cx="148" cy="100" r="14" fill="rgba(255,255,255,.9)"/>' +
      '<path d="M88 138c14 20 50 20 64 0" stroke="rgba(255,255,255,.9)" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '<text x="120" y="202" font-size="34" text-anchor="middle" fill="rgba(255,255,255,.96)" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="600">' + text + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  /* 微信默认主题 */
  var DEFAULT_THEME = { ui: '#07C160', page: '#EDEDED', name: '#111111', bubble: '#95EC69', bubbleText: '#111111', id: '#999999', font: '#16161D' };

  /* 字卡分区（各类字卡分开管理，供对方回复、状态、打卡、戳一戳等使用） */
  var CARD_SECTIONS = ['交流', '拍一拍', '状态', '日常', 'emoji', '颜文字'];
  var DEFAULT_CARDS = [
    { g: '交流', items: ['在的', '刚看到消息', '嗯嗯', '哈哈哈哈', '好呀', '我也是', '真的吗', '好啊', '对呀', '我看看'] },
    { g: '拍一拍', items: ['拍了拍你的头', '戳了戳你', '拍了拍你的肩膀', '轻轻拍了拍你', '捏了捏你的脸'] },
    { g: '状态', items: ['在听歌', '学习中', '发呆中', '散步中', '休息中', '忙碌中', '看剧', '刚睡醒', '在加班'] },
    { g: '日常', items: ['午休时间', '在整理笔记', '喝了一杯咖啡', '散步十分钟', '刚下班', '准备做饭'] },
    { g: 'emoji', items: ['好', '嗯嗯', '哈哈', '好的呢', '嗯哪', '收到'] },
    { g: '颜文字', items: ['(^-^)', '(・ω・)', '(￣▽￣)', '(*^▽^*)', '(๑•̀ㅂ•́)'] }
  ];
  function freshCards() {
    return DEFAULT_CARDS.map(function (g) { return { g: g.g, items: g.items.slice() }; });
  }

  function contactSeed(id, name, hue) {
    return {
      id: id, name: name, account: 'wx_' + id, signature: '',
      avatar: genAvatar(name.charAt(0), hue),
      status: { text: '', image: null },
      stickers: [],                       // 联系人的表情包（对方回复时可能发）
      cards: freshCards(),
      conv: { deleted: false, lastAt: 0 },
      settings: { replyCount: 2, gapSec: 8, merge: false, chatBg: null, stickerFreq: 15 },
      timers: { nextStatusAt: 0, nextPostAt: 0, nextLetterAt: 0, nextCheckinAt: 0, nextPokeAt: 0, nextRedPacketAt: 0 },
      created: Date.now()
    };
  }

  /* ---------- 初始状态（无演示内容；首页直接进入与该联系人的聊天） ---------- */
  function seed() {
    var now = Date.now();
    var me = {
      id: 'me', name: '我', account: 'wx_' + Math.random().toString(36).slice(2, 8),
      signature: '', avatar: genAvatar('我', 232),
      stickers: [],                       // 我的表情包（聊天里添加/发送）
      theme: JSON.parse(JSON.stringify(DEFAULT_THEME)),
      nightMode: false,
      momentsBg: null
    };
    var c1 = contactSeed('c1', '联系人', 200);
    c1.timers.nextStatusAt = now + rand(20, 90) * 1000;
    c1.timers.nextPostAt = now + rand(2, 8) * 3600e3;
    c1.timers.nextLetterAt = now + rand(1, 3) * 86400e3;
    c1.timers.nextCheckinAt = now + rand(2, 8) * 3600e3;
    c1.timers.nextPokeAt = now + rand(2, 10) * 3600e3;
    c1.timers.nextRedPacketAt = now + rand(6, 30) * 3600e3;
    return {
      me: me,
      contacts: [c1],
      convs: {},
      moments: [],
      letters: [],
      checkins: { calendar: {}, timeline: [] },
      draftLetter: null,
      music: [],                          // [{id,name,artist,size,src(运行时)}]
      musicState: { idx: 0, playing: false, mode: 'order', live: false, liveStartedAt: 0 },
      simBase: Date.now(), simStart: Date.now(),
      pendingReplies: {},                 // cid -> {at} 待回复
      pendingComments: {},                // 动态评论回复
      pendingPackets: {},                 // 我发出的红包 -> {cid, msgId, openAt, never}
      pokeBack: {},                       // cid -> {at} 对方回戳
      musicNextPartnerAt: 0               // 一起听时对方下次互动时间
    };
  }

  /* ---------- 存取 ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        state = JSON.parse(raw);
        if (!state.contacts || !state.contacts.length) throw new Error('bad');
        if (state.contacts.length > 1) {
          var keep = state.contacts[0];
          state.contacts = [keep];
          Object.keys(state.convs || {}).forEach(function (cid) { if (cid !== keep.id) delete state.convs[cid]; });
        }
        heal();
        return;
      }
    } catch (e) { /* 损坏则重建 */ }
    state = seed();
    save();
  }

  /* 自愈：补齐缺失字段，并把事件计时器错开到未来（点进页面保持安静） */
  function heal() {
    var now = Date.now();
    if (!state.me) state.me = seed().me;
    if (!state.me.theme) state.me.theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
    if (!state.me.stickers) state.me.stickers = [];
    if (!state.convs) state.convs = {};
    if (!state.moments) state.moments = [];
    if (!state.letters) state.letters = [];
    if (!state.checkins) state.checkins = { calendar: {}, timeline: [] };
    if (!state.checkins.calendar) state.checkins.calendar = {};
    if (!state.checkins.timeline) state.checkins.timeline = [];
    if (!state.music) state.music = [];
    if (!state.musicState) state.musicState = { idx: 0, playing: false, mode: 'order', live: false, liveStartedAt: 0 };
    if (!state.pendingReplies) state.pendingReplies = {};
    if (!state.pendingComments) state.pendingComments = {};
    if (!state.pendingPackets) state.pendingPackets = {};
    if (!state.pokeBack) state.pokeBack = {};
    if (state.musicNextPartnerAt == null) state.musicNextPartnerAt = 0;
    (state.contacts || []).forEach(function (c) {
      if (!c.timers) c.timers = {};
      if (!c.cards) c.cards = freshCards();
      // 迁移：把旧的自由分区（如「心情」「关心」）合并进对应分区，并补齐所有分区
      if (!Array.isArray(c.cards)) c.cards = freshCards();
      var legacy = c.cards.filter(function (g) { return CARD_SECTIONS.indexOf(g.g) === -1; });
      if (legacy.length) {
        var talk = c.cards.filter(function (g) { return g.g === '交流'; })[0];
        if (!talk) { talk = { g: '交流', items: [] }; c.cards.unshift(talk); }
        legacy.forEach(function (g) {
          (g.items || []).forEach(function (t) { if (t && talk.items.indexOf(t) === -1) talk.items.push(t); });
        });
        c.cards = c.cards.filter(function (g) { return CARD_SECTIONS.indexOf(g.g) !== -1; });
      }
      CARD_SECTIONS.forEach(function (name) {
        if (!c.cards.some(function (g) { return g.g === name; })) {
          var d = DEFAULT_CARDS.filter(function (g) { return g.g === name; })[0];
          c.cards.push({ g: name, items: d ? d.items.slice() : [] });
        }
      });
      if (!c.cards[0].items || !c.cards[0].items.length) c.cards[0].items = DEFAULT_CARDS[0].items.slice();
      if (!c.stickers) c.stickers = [];
      if (!c.settings) c.settings = { replyCount: 2, gapSec: 8, merge: false, chatBg: null, stickerFreq: 15 };
      if (c.settings.stickerFreq == null) c.settings.stickerFreq = 15;
      if (!c.conv) c.conv = { deleted: false, lastAt: 0 };
      if (!c.status) c.status = { text: '', image: null };
      ['nextPostAt', 'nextLetterAt', 'nextCheckinAt'].forEach(function (k) {
        if (!c.timers[k]) c.timers[k] = now + rand(2, 12) * 3600e3;
      });
      if (!c.timers.nextStatusAt) c.timers.nextStatusAt = now + rand(20, 90) * 1000;
      if (!c.timers.nextPokeAt) c.timers.nextPokeAt = now + rand(2, 10) * 3600e3;
      if (!c.timers.nextRedPacketAt) c.timers.nextRedPacketAt = now + rand(6, 30) * 3600e3;
      delete c.timers.nextMusicAt;
    });
    saveDebounced();
  }

  var PH = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#e5e5ea"/></svg>');
  var quotaWarned = false;
  function warnQuota() {
    if (quotaWarned) return;
    quotaWarned = true;
    try { UI.toast('浏览器存储空间不足，超大图片未能保存（文字记录已保留）', 'info'); } catch (e) { }
  }
  /* 剔除超大图片字符串，保住文字数据 */
  function liteClone() {
    var lite = JSON.parse(JSON.stringify(state));
    function stripImg(v) { return (typeof v === 'string' && v.length > 40000) ? PH : v; }
    function stripArr(arr) { if (!Array.isArray(arr)) return; for (var i = 0; i < arr.length; i++) arr[i] = stripImg(arr[i]); }
    (lite.moments || []).forEach(function (m) { if (Array.isArray(m.images)) m.images = m.images.map(stripImg); });
    (lite.contacts || []).forEach(function (c) {
      if (!c) return;
      stripArr(c.stickers);
      if (c.avatar) c.avatar = stripImg(c.avatar);
      if (c.status && c.status.image) c.status.image = stripImg(c.status.image);
    });
    if (lite.me) {
      stripArr(lite.me.stickers);
      if (lite.me.avatar) lite.me.avatar = stripImg(lite.me.avatar);
      if (lite.me.momentsBg) lite.me.momentsBg = stripImg(lite.me.momentsBg);
    }
    Object.keys(lite.convs || {}).forEach(function (cid) {
      (lite.convs[cid] || []).forEach(function (m) {
        if (m && m.meta) {
          if (typeof m.meta.image === 'string') m.meta.image = stripImg(m.meta.image);
          if (typeof m.meta.src === 'string') m.meta.src = stripImg(m.meta.src);
        }
      });
    });
    return lite;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      try {
        localStorage.setItem(KEY, JSON.stringify(liteClone()));
        warnQuota();
        return true;
      } catch (e2) {
        warnQuota();
        return false;
      }
    }
  }
  var _t = null;
  function saveDebounced() { clearTimeout(_t); _t = setTimeout(save, 250); }
  function reset() { localStorage.removeItem(KEY); state = seed(); save(); }

  function getContact(id) { return state.contacts.find(function (c) { return c.id === id; }); }
  function conv(id) { if (!state.convs[id]) state.convs[id] = []; return state.convs[id]; }

  function pushMsg(cid, msg) {
    msg.id = msg.id || uid('m');
    msg.time = msg.time || Date.now();
    msg.read = msg.read !== false;
    conv(cid).push(msg);
    var c = getContact(cid);
    if (c) { c.conv.deleted = false; c.conv.lastAt = msg.time; }
    saveDebounced();
    Bus.emit('conv', cid);
    return msg;
  }

  function unread(cid) {
    var n = 0;
    (state.convs[cid] || []).forEach(function (m) { if (m.from !== 'me' && m.from !== 'sys' && !m.read) n++; });
    return n;
  }
  function markRead(cid) {
    (state.convs[cid] || []).forEach(function (m) { if (m.from !== 'me') m.read = true; });
    saveDebounced();
    Bus.emit('conv', cid);
  }

  function msgPreview(m) {
    if (!m) return '';
    switch (m.type) {
      case 'text': return m.content;
      case 'image': return '[图片]';
      case 'sticker': return '[表情]';
      case 'redpacket': return '[红包]' + (m.meta && m.meta.note ? '：' + m.meta.note : '');
      case 'music': return m.content || '[一起听]';
      case 'sys': return m.content;
      default: return '[消息]';
    }
  }

  function convInfo(cid) {
    var c = getContact(cid);
    return { name: c ? c.name : '未知', avatar: c ? c.avatar : '', obj: c };
  }

  window.Store = {
    get state() { return state; },
    load: load, save: save, saveDebounced: saveDebounced, reset: reset, heal: heal,
    uid: uid, rand: rand, randInt: randInt, pick: pick, clamp: clamp, esc: esc,
    simNow: simNow, dayKey: dayKey, SIM_SPEED: SIM_SPEED,
    getContact: getContact, conv: conv, pushMsg: pushMsg,
    unread: unread, markRead: markRead, msgPreview: msgPreview, convInfo: convInfo,
    genAvatar: genAvatar, genSticker: genSticker, DEFAULT_THEME: DEFAULT_THEME,
    CARD_SECTIONS: CARD_SECTIONS, DEFAULT_CARDS: DEFAULT_CARDS, freshCards: freshCards
  };
})();

/* 极简事件总线 */
var Bus = (function () {
  var m = {};
  return {
    on: function (ev, fn) { (m[ev] = m[ev] || []).push(fn); },
    emit: function (ev, data) { (m[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { } }); }
  };
})();
