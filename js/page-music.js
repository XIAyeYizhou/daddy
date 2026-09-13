/* ============================================================
   字卡 · 玻璃信使 — 音乐页面（一起听音乐）
   仅使用全局：Store / UI / AudioX / Icon / Bus / Router
   音频 Blob 存放于 IndexedDB（zchat_media / songs），避免占用 localStorage
   ============================================================ */
(function () {
  var S = Store, U = window.UI, esc = S.esc;

  var DB_NAME = 'zchat_media';
  var DB_STORE = 'songs';
  var MODES = { order: '顺序', shuffle: '随机', single: '单曲' };
  var ORDER = ['order', 'shuffle', 'single'];

  /* ---------- 模块级状态（重绘 / 离开页面时统一清理，避免定时器泄漏） ---------- */
  var curEl = null;          // 当前挂载的页面元素
  var lastEl = null;         // 最近一次渲染过的页面元素（Router.back() 会复用旧 DOM）
  var redraw = null;         // 当前页面的重绘函数
  var progTimer = null;      // 进度 / 按钮状态刷新（模块级唯一 interval）
  var liveTimer = null;      // 「一起听」已听时长（每秒）
  var lastIdx = -1;          // 上次渲染到的歌曲下标
  var lastPlaying = null;    // 上次播放状态
  var srcSane = false;       // 是否已做过一次「失效 objectURL」清理
  var selfLiveEmit = false;  // 标记「一起听」开关是否由本页触发（避免重复重绘）
  var dbPromise = null;      // IndexedDB 连接（含降级结果）缓存

  /* ================= 小工具 ================= */
  function fmtSize(bytes) {
    bytes = +bytes || 0;
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
  function fmtClock(sec) {
    if (U && U.fmtDur) return U.fmtDur(sec);
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function songSub(song) {
    if (!song) return '点击下方按钮添加本地音乐';
    var parts = [song.artist ? song.artist : '本地音乐'];
    var sz = fmtSize(song.size);
    if (sz) parts.push(sz);
    if (song.dur) parts.push(fmtClock(song.dur));
    return parts.join(' · ');
  }

  /* ================= IndexedDB 局部实现（全部 try/catch，不支持时静默降级） ================= */
  function idbOpen() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (res) {
      try {
        if (!window.indexedDB) { res(null); return; }
        var req = window.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          try {
            var db = req.result;
            if (db && !db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
          } catch (e) { }
        };
        req.onsuccess = function () { res(req.result || null); };
        req.onerror = function () { res(null); };
        req.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbPromise;
  }

  function idbPut(id, blob) {
    return idbOpen().then(function (db) {
      return new Promise(function (res) {
        if (!db || !id) { res(false); return; }
        try {
          var tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(blob, id);
          tx.oncomplete = function () { res(true); };
          tx.onerror = function () { res(false); };
          tx.onabort = function () { res(false); };
        } catch (e) { res(false); }
      });
    }).catch(function () { return false; });
  }

  function idbGet(id) {
    return idbOpen().then(function (db) {
      return new Promise(function (res) {
        if (!db || !id) { res(null); return; }
        try {
          var tx = db.transaction(DB_STORE, 'readonly');
          var rq = tx.objectStore(DB_STORE).get(id);
          rq.onsuccess = function () { res(rq.result || null); };
          rq.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    }).catch(function () { return null; });
  }

  function idbDel(id) {
    return idbOpen().then(function (db) {
      return new Promise(function (res) {
        if (!db || !id) { res(false); return; }
        try {
          var tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).delete(id);
          tx.oncomplete = function () { res(true); };
          tx.onerror = function () { res(false); };
          tx.onabort = function () { res(false); };
        } catch (e) { res(false); }
      });
    }).catch(function () { return false; });
  }

  /* ================= 状态兜底 ================= */
  function ensureState() {
    var st = S.state;
    if (!st) return;
    if (!st.music) st.music = [];
    if (!st.musicState) st.musicState = { idx: 0, playing: false, mode: 'order', live: false, liveStartedAt: 0 };
    var ms = st.musicState;
    if (ms.idx == null) ms.idx = 0;
    if (ms.idx < 0 || ms.idx >= st.music.length) ms.idx = 0;
    if (!MODES[ms.mode]) ms.mode = 'order';
    if (ms.live == null) ms.live = false;
    if (!ms.liveStartedAt) ms.liveStartedAt = ms.live ? Date.now() : 0;

    // 仅在本次会话首次进入页面时执行：清掉上一次会话遗留的失效 blob: URL
    if (!srcSane) {
      srcSane = true;
      st.music.forEach(function (sg) {
        if (sg && sg.src) {
          try { URL.revokeObjectURL(sg.src); } catch (e) { }
          sg.src = '';
        }
      });
      // 刷新页面后并没有音频真正在播 → 修正「正在播放」状态
      var M = window.AudioX && AudioX.Music;
      if (M && !M.audio && !M.timer) ms.playing = false;
    }
  }

  /* ================= 音频源装载 ================= */
  function loadSources(done) {
    var list = S.state.music;
    var pending = 0;
    list.forEach(function (song) {
      if (!song || song.src) return;
      pending++;
      idbGet(song.id).then(function (blob) {
        if (blob) {
          try { song.src = URL.createObjectURL(blob); } catch (e) { }
        }
        pending--;
        if (pending <= 0 && done) done();
      });
    });
    if (!pending && done) done();
  }

  /* 读取时长：把 <audio> 保留在模块引用里，避免元素被回收导致元数据加载被中断 */
  var probes = [];
  function probeDuration(src, cb) {
    var a = null;
    try {
      a = document.createElement('audio');
      probes.push(a);
      var done = false;
      function finish(d) {
        if (done) return;
        done = true;
        var i = probes.indexOf(a);
        if (i > -1) probes.splice(i, 1);
        try { a.onloadedmetadata = null; a.onerror = null; } catch (e) { }
        cb(d);
      }
      a.preload = 'metadata';
      a.onloadedmetadata = function () {
        var d = 0;
        try { d = a.duration; } catch (e) { }
        finish(isFinite(d) && d > 0 ? d : 0);
      };
      a.onerror = function () { finish(0); };
      a.src = src;
    } catch (e) {
      if (a) { var j = probes.indexOf(a); if (j > -1) probes.splice(j, 1); }
      cb(0);
    }
  }

  var probing = {};   // song.id -> 正在读取时长（避免重复探测同一首）
  function readDurations() {
    S.state.music.forEach(function (song, i) {
      if (!song || !song.src || song.dur || probing[song.id]) return;
      probing[song.id] = true;
      probeDuration(song.src, function (d) {
        delete probing[song.id];
        if (!d) return;
        song.dur = d;
        var el = curEl;
        var cell = el ? el.querySelector('.mu-row-dur[data-i="' + i + '"]') : null;
        if (cell) cell.textContent = fmtClock(d);
        refresh();
      });
    });
  }

  /* ================= 播放控制（统一走 AudioX.Music） ================= */
  function currentSong() {
    var list = S.state.music, ms = S.state.musicState;
    return list[ms.idx] || null;
  }

  function playAt(i) {
    var list = S.state.music, ms = S.state.musicState;
    var song = list[i];
    if (!song) return;
    if (ms.idx === i && ms.playing) { AudioX.Music.toggle(); refresh(); return; }
    if (!song.src) { U.toast('音乐文件未就绪', 'info'); return; }
    AudioX.Music.playSong(i);
    refresh();
  }

  function togglePlay() {
    var list = S.state.music, ms = S.state.musicState;
    if (!list.length) { U.toast('还没有音乐，先添加本地音乐', 'info'); return; }
    if (ms.playing) { AudioX.Music.toggle(); refresh(); return; }
    var song = currentSong();
    if (song && !song.src) { U.toast('音乐文件未就绪', 'info'); return; }
    AudioX.Music.toggle();
    refresh();
  }

  /* 上一首 / 下一首：按模式找目标，跳过文件未就绪的歌曲 */
  function goStep(dir) {
    var list = S.state.music, ms = S.state.musicState;
    var n = list.length;
    if (!n) { U.toast('还没有音乐，先添加本地音乐', 'info'); return; }
    var pick = -1;
    for (var k = 1; k <= n; k++) {
      var idx = ms.mode === 'shuffle'
        ? Math.floor(Math.random() * n)
        : ((ms.idx + dir * k) % n + n) % n;
      if (list[idx] && list[idx].src) { pick = idx; break; }
    }
    if (pick < 0) { U.toast('音乐文件未就绪', 'info'); return; }
    AudioX.Music.playSong(pick);
    refresh();
  }

  function cycleMode() {
    var ms = S.state.musicState;
    var i = ORDER.indexOf(ms.mode);
    ms.mode = ORDER[(i + 1) % ORDER.length];
    S.saveDebounced();
    U.toast('播放模式：' + MODES[ms.mode], 'list');
    if (redraw) redraw();
  }

  /* ================= 增 / 删 ================= */
  async function addMusic() {
    var files = await U.pickFile('audio/*', true);
    if (!files || !files.length) return;
    var added = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f) continue;
      var id = S.uid('sg');
      var name = String(f.name || '未命名').replace(/\.[^.]+$/, '');
      if (!name) name = String(f.name || '未命名');
      await idbPut(id, f);         // 不支持 IndexedDB 时静默降级：仅本次会话可播放
      var song = { id: id, name: name, artist: '', size: f.size || 0 };
      try { song.src = URL.createObjectURL(f); } catch (e) { }
      S.state.music.push(song);
      added++;
    }
    if (!added) return;
    S.saveDebounced();
    U.toast('已添加 ' + added + ' 首音乐', 'check');
    if (redraw) redraw();
    readDurations();
  }

  function delSong(i) {
    var list = S.state.music, ms = S.state.musicState;
    var song = list[i];
    if (!song) return;
    if (ms.idx === i) {
      try { AudioX.Music.stop(); } catch (e) { }
      ms.playing = false;
    }
    list.splice(i, 1);
    idbDel(song.id);
    if (song.src) { try { URL.revokeObjectURL(song.src); } catch (e) { } }
    if (ms.idx >= list.length) ms.idx = 0;
    S.saveDebounced();
    U.toast('已删除《' + song.name + '》', 'trash');
    if (redraw) redraw();
  }

  function askDelete(i) {
    var song = S.state.music[i];
    if (!song) return;
    U.confirm('删除音乐', '确定要删除《' + song.name + '》吗？', { danger: true, okText: '删除' }).then(function (ok) {
      if (ok) delSong(i);
    });
  }

  /* ================= 一起听 ================= */
  function toggleLive(nv) {
    var ms = S.state.musicState;
    ms.live = !!nv;
    ms.liveStartedAt = nv ? Date.now() : 0;
    S.saveDebounced();
    // 实时互动（发消息等）由 ai.js 负责，这里只广播开关
    selfLiveEmit = true;
    try { Bus.emit('music-live', { on: !!nv }); } finally { selfLiveEmit = false; }
    if (redraw) redraw();
  }

  function tickLive() {
    var el = curEl;
    if (!el) return;
    var box = el.querySelector('.mu-live-dur');
    if (!box) return;
    var ms = S.state.musicState;
    var t = ms.liveStartedAt ? Math.max(0, Math.floor((Date.now() - ms.liveStartedAt) / 1000)) : 0;
    box.textContent = fmtClock(t);
  }

  /* ================= 定时器 ================= */
  function stopTimers() {
    if (progTimer) { clearInterval(progTimer); progTimer = null; }
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  }

  /* ================= 局部刷新（不重绘 DOM） ================= */
  function refresh() {
    var el = curEl;
    if (!el || !el.querySelector) return;
    // 页面已被移除（例如路由换页）→ 停掉定时器，避免空转
    if (el.parentNode === null) { stopTimers(); return; }
    var ms = S.state.musicState;
    var song = currentSong();

    if (lastIdx !== ms.idx) {
      lastIdx = ms.idx;
      var nameEl = el.querySelector('.mu-song-name');
      if (nameEl) nameEl.textContent = song ? song.name : '还没有音乐';
      var subEl = el.querySelector('.mu-song-sub');
      if (subEl) subEl.textContent = songSub(song);
      el.querySelectorAll('.mu-row').forEach(function (r) {
        r.classList.toggle('on', +r.dataset.i === ms.idx);
      });
      lastPlaying = null;
    }

    var cov = el.querySelector('.mu-cover');
    if (cov) cov.classList.toggle('on', !!(ms.playing && song));

    if (lastPlaying !== ms.playing) {
      lastPlaying = ms.playing;
      var btn = el.querySelector('#mu-toggle');
      if (btn) {
        var ic = ms.playing ? 'pause' : 'play';
        btn.setAttribute('data-ic', ic);
        btn.innerHTML = Icon(ic, 26);
      }
    }

    var audio = (window.AudioX && AudioX.Music) ? AudioX.Music.audio : null;
    var cur = 0, dur = 0;
    if (audio) {
      try {
        cur = audio.currentTime || 0;
        dur = audio.duration;
      } catch (e) { }
      if (!isFinite(dur) || dur < 0) dur = 0;
    } else if (song && song.dur) {
      dur = song.dur;
    }
    var pct = dur > 0 ? Math.min(100, Math.max(0, cur / dur * 100)) : 0;
    var bar = el.querySelector('.mu-bar-in');
    if (bar) bar.style.width = pct.toFixed(2) + '%';
    var curT = el.querySelector('.mu-cur');
    if (curT) curT.textContent = fmtClock(cur);
    var totEl = el.querySelector('.mu-tot');
    if (totEl) totEl.textContent = dur > 0 ? fmtClock(dur) : '--:--';
  }

  /* ================= 页面渲染 ================= */
  function render(el) {
    stopTimers();
    curEl = el;
    lastEl = el;
    ensureState();
    lastIdx = -1;
    lastPlaying = null;

    var ms = S.state.musicState;
    var list = S.state.music;
    var song = list[ms.idx] || null;
    var contact = S.state.contacts[0] || null;
    var live = !!ms.live;
    var h = '';

    /* 1. 页头（返回键的点击已由全局 [data-back] 委托处理） */
    h += '<div class="page-head">' +
      '<button class="back-btn" data-back>' + Icon('back', 22) + '</button>' +
      '<div class="ph-title">一起听音乐</div>' +
      '</div>';

    h += '<div class="mu-page">';

    /* 2. 正在播放 */
    h += '<div class="mu-now">' +
      '<div class="mu-now-top">' +
      '<div class="mu-cover' + (ms.playing && song ? ' on' : '') + '">' + Icon('music', 34) + '</div>' +
      '<div class="mu-song">' +
      '<div class="mu-song-name">' + esc(song ? song.name : '还没有音乐') + '</div>' +
      '<div class="mu-song-sub">' + esc(songSub(song)) + '</div>' +
      '</div>' +
      '<button class="mu-mode" id="mu-mode" title="切换播放模式">' + Icon('list', 16) + '<span>' + (MODES[ms.mode] || '顺序') + '</span></button>' +
      '</div>' +
      '<div class="mu-progress"><div class="mu-bar-in" id="mu-bar-in"></div></div>' +
      '<div class="mu-times"><span class="mu-cur">00:00</span><span class="mu-tot">--:--</span></div>' +
      '<div class="mu-ctrl">' +
      '<button class="mu-ctrl-btn" id="mu-prev" title="上一首">' + Icon('prev', 26) + '</button>' +
      '<button class="mu-main" id="mu-toggle" data-ic="' + (ms.playing ? 'pause' : 'play') + '" title="播放 / 暂停">' + Icon(ms.playing ? 'pause' : 'play', 26) + '</button>' +
      '<button class="mu-ctrl-btn" id="mu-next" title="下一首">' + Icon('next', 26) + '</button>' +
      '</div>' +
      '</div>';

    /* 3. 一起听 */
    h += '<div class="mu-live">' +
      '<div class="mu-live-row">' +
      '<span class="mu-live-ic">' + Icon('wave', 18) + '</span>' +
      '<div class="mu-live-info">' +
      '<div class="mu-live-t">一起听</div>' +
      '<div class="mu-live-s">' + (live ? '和 TA 听着同一首歌' : '开启后与 TA 同步听歌') + '</div>' +
      '</div>' +
      '<div class="mu-live-sw" id="mu-live-sw"></div>' +
      '</div>';
    if (live) {
      h += '<div class="mu-live-body">' +
        (contact ? U.avatarEl(contact.avatar, 40, 'mu-live-ava') : '') +
        '<div class="mu-live-txt">' +
        '<div class="mu-live-name">' + esc(contact ? contact.name : 'TA') + '<span class="mu-live-badge">正在一起听</span></div>' +
        '<div class="mu-live-time">已一起听 <span class="mu-live-dur">00:00</span></div>' +
        '</div>' +
        '</div>';
    }
    h += '</div>';

    /* 4. 添加本地音乐 */
    h += '<button class="mu-add" id="mu-add">' + Icon('plus', 16) + '<span>添加本地音乐</span></button>';

    /* 5. 播放列表 */
    h += '<div class="mu-sec"><span class="mu-sec-t">播放列表</span><span class="mu-sec-n">' + list.length + ' 首</span></div>';
    if (!list.length) {
      h += '<div class="empty"><div class="empty-ic">' + Icon('music', 34) + '</div>' +
        '<div class="empty-t">还没有音乐，点击上方添加本地音乐</div></div>';
    } else {
      h += '<div class="mu-list">';
      list.forEach(function (it, i) {
        h += '<div class="mu-row' + (i === ms.idx ? ' on' : '') + '" data-i="' + i + '">' +
          '<span class="mu-row-idx">' + (i + 1) + '</span>' +
          '<div class="mu-row-txt">' +
          '<div class="mu-row-name">' + esc(it.name) + '</div>' +
          '<div class="mu-row-sub">' + esc(songSub(it)) + '</div>' +
          '</div>' +
          '<span class="mu-row-dur" data-i="' + i + '">' + (it.dur ? fmtClock(it.dur) : '--:--') + '</span>' +
          '<button class="mu-row-del" data-del="' + i + '" title="删除">' + Icon('trash', 16) + '</button>' +
          '</div>';
      });
      h += '</div>';
    }

    h += '</div>';
    el.innerHTML = h;

    /* ---- 交互绑定 ---- */
    var swBox = el.querySelector('#mu-live-sw');
    if (swBox) {
      swBox.innerHTML = '';
      swBox.appendChild(U.switchEl(live, function (nv) { toggleLive(nv); }));
    }
    el.querySelector('#mu-toggle').addEventListener('click', function () { togglePlay(); });
    el.querySelector('#mu-prev').addEventListener('click', function () { goStep(-1); });
    el.querySelector('#mu-next').addEventListener('click', function () { goStep(1); });
    el.querySelector('#mu-mode').addEventListener('click', function () { cycleMode(); });
    el.querySelector('#mu-add').addEventListener('click', function () { addMusic(); });
    el.querySelectorAll('.mu-row').forEach(function (row) {
      row.addEventListener('click', function () { playAt(+row.dataset.i); });
    });
    el.querySelectorAll('.mu-row-del').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        askDelete(+b.dataset.del);
      });
    });

    /* ---- 取回音频 Blob → object URL ---- */
    loadSources(function () {
      if (curEl !== el) return;
      readDurations();
      refresh();
    });

    /* ---- 定时器：进度每 0.5s 刷新；一起听时长每秒刷新 ---- */
    refresh();
    tickLive();
    progTimer = setInterval(refresh, 500);
    if (live) liveTimer = setInterval(tickLive, 1000);
  }

  /* ================= 路由注册 ================= */
  Router.register('music', function (el) {
    redraw = function () { render(el); };
    render(el);
  }, { nav: false });

  /* 播放器事件（'play' | 'pause' | 'tick'）→ 刷新进度与按钮状态 */
  Bus.on('music', function () {
    if (Router.currentId() === 'music') refresh();
  });

  /* 一起听开关（本页或 ai.js 触发） */
  Bus.on('music-live', function (d) {
    if (Router.currentId() !== 'music') return;
    var on = (d && typeof d === 'object') ? !!d.on : !!d;
    var ms = S.state.musicState;
    if (ms) {
      ms.live = on;
      ms.liveStartedAt = on ? (ms.liveStartedAt || Date.now()) : 0;
    }
    if (!selfLiveEmit && redraw) redraw();
  });

  /* 路由变化：离开本页 → 停表；用 Router.back() 复用旧 DOM 回到本页 → 重新渲染并重挂定时器 */
  Bus.on('route', function (id) {
    if (id === 'music') {
      if (lastEl && lastEl !== curEl) {
        curEl = null;
        redraw = function () { render(lastEl); };
        render(lastEl);
      }
      return;
    }
    redraw = null;
    curEl = null;
    lastIdx = -1;
    lastPlaying = null;
    stopTimers();
  });
})();
