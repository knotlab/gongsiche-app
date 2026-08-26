/* ===== js/imelog.js ===== */
/* ============ imelog.js — 한글 입력 지연 계측 ============
   입력 이벤트와 화면 갱신(rAF) 시각을 메모리에만 링버퍼로 남긴다.
   계측이 지연을 만들면 안 되므로 저장소 쓰기·DOM 조작을 하지 않는다.
   원격 디버깅에서 ImeLog.report() 로 꺼내 본다.
========================================================== */
(function (global) {
  'use strict';

  const MAX = 400;
  const buf = [];
  let armed = false;

  function push(type, e) {
    const el = e && e.target;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
    const now = performance.now();
    buf.push({
      t: Math.round(now),
      type: type,
      id: el.id || el.className || '?',
      len: String(el.value == null ? '' : el.value).length,
      tail: String(el.value == null ? '' : el.value).slice(-6),
      data: (e.data === undefined ? null : e.data),
      key: (e.key === undefined ? null : e.key),
      code: (e.keyCode === undefined ? null : e.keyCode)
    });
    if (buf.length > MAX) buf.shift();

    // 이 입력이 화면에 반영되기까지 몇 ms 걸렸는지
    if (!armed) {
      armed = true;
      const at = now;
      requestAnimationFrame(() => {
        armed = false;
        buf.push({ t: Math.round(performance.now()), type: 'raf', wait: Math.round(performance.now() - at) });
        if (buf.length > MAX) buf.shift();
      });
    }
  }

  ['compositionstart', 'compositionupdate', 'compositionend',
   'beforeinput', 'input', 'keydown'].forEach((t) => {
    document.addEventListener(t, (e) => { try { push(t, e); } catch (err) {} }, true);
  });

  global.ImeLog = {
    dump: () => buf.slice(),
    clear: () => { buf.length = 0; },
    /* 사람이 읽는 요약: 이벤트 간격과 rAF 지연의 최대/평균 */
    report: () => {
      const rafs = buf.filter((b) => b.type === 'raf').map((b) => b.wait);
      const evts = buf.filter((b) => b.type !== 'raf');
      const gaps = [];
      for (let i = 1; i < evts.length; i++) gaps.push(evts[i].t - evts[i - 1].t);
      const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
      return {
        events: evts.length,
        rafAvg: avg(rafs), rafMax: rafs.length ? Math.max.apply(null, rafs) : 0,
        gapAvg: avg(gaps), gapMax: gaps.length ? Math.max.apply(null, gaps) : 0,
        tail: buf.slice(-40)
      };
    }
  };
})(window);

;
/* ===== js/util.js ===== */
/* ============ util.js — 공용 헬퍼 ============ */
(function (global) {
  'use strict';

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ---- 아이콘 (이모지 대신 SVG 스프라이트) ---- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function icon(name, cls) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVGNS, 'use');
    use.setAttribute('href', '#ic-' + name);
    svg.appendChild(use);
    return svg;
  }

  /* ---- 토스트 ----
     action = {label, onClick} 이면 토스트 안에 버튼을 붙인다(되돌리기 등) */
  let toastTimer = null;
  function toast(msg, ms, action) {
    const wrap = $('#toast-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    const t = el('div', 'toast' + (action ? ' has-act' : ''));
    t.appendChild(el('span', 'toast-msg', msg));
    if (action) {
      const b = el('button', 'toast-act', action.label);
      b.addEventListener('click', () => {
        if (t.parentNode) t.parentNode.removeChild(t);
        clearTimeout(toastTimer);
        action.onClick();
      });
      t.appendChild(b);
    }
    wrap.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); },
      ms || (action ? 5000 : 2200));
  }

  /* ---- 바텀시트 (confirm 대용 포함) ----
     items: [{label, sub, cls, onPick}] — onPick 은 시트가 닫힌 뒤 호출 */
  function sheet(title, items) {
    const back = $('#sheet-back'), box = $('#sheet');
    box.innerHTML = '';
    if (title) box.appendChild(el('div', 'sheet-title', title));

    /* 항목만 따로 스크롤한다 — 동 목록처럼 30개가 넘으면 시트가 화면 위로 넘쳐
       윗항목에 손이 안 닿았다. 제목과 취소는 고정이라 언제든 빠져나올 수 있다. */
    const scroll = el('div', 'sheet-scroll');
    items.forEach((it) => {
      if (it.sep) { scroll.appendChild(el('div', 'sheet-sep')); return; }
      const b = el('button', 'sheet-item ' + (it.cls || ''));
      b.appendChild(document.createTextNode(it.label));
      if (it.sub) b.appendChild(el('small', '', it.sub));
      b.addEventListener('click', () => { close(); if (it.onPick) it.onPick(); });
      scroll.appendChild(b);
    });
    box.appendChild(scroll);

    const cancel = el('button', 'sheet-item sheet-cancel', '취소');
    cancel.addEventListener('click', close);
    box.appendChild(cancel);

    // 고른 것이 있으면 그 자리부터 보여 준다
    const cur = scroll.querySelector('.strong');
    if (cur) { try { cur.scrollIntoView({ block: 'center' }); } catch (e) {} }

    back.classList.remove('hidden');
    back.addEventListener('click', onBack);
    function onBack(e) { if (e.target === back) close(); }
    function close() {
      back.classList.add('hidden');
      back.removeEventListener('click', onBack);
      box.innerHTML = '';
    }
    sheet.close = close;
  }

  function confirmSheet(title, okLabel, onOk, danger) {
    sheet(title, [{ label: okLabel, cls: danger ? 'danger' : 'strong', onPick: onOk }]);
  }

  /* ---- 진동 ---- */
  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {}
  }

  /* ---- 클립보드 (WebView 폴백 포함) ---- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 폴백으로 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---- 숫자 ---- */
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

  /* 소수 2자리 고정. 이진 부동소수점 때문에 32.495 가 32.494999… 로 저장돼
     손계산(32.50)과 어긋나는 것을 아주 작은 보정으로 막는다. */
  const fix2 = (n) => {
    if (typeof n !== 'number' || !isFinite(n)) return '–';
    const scaled = n * 100;
    const r = Math.round(scaled + (scaled < 0 ? -1e-9 : 1e-9));
    return (r / 100).toFixed(2);
  };

  /* 용량 표기: 1.2GB / 340MB */
  function fmtBytes(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 0) return '–';
    const GB = 1024 * 1024 * 1024, MB = 1024 * 1024;
    if (n >= GB) {
      const g = n / GB;
      return (g >= 100 ? Math.round(g) : Math.round(g * 10) / 10) + 'GB';
    }
    if (n >= MB) return Math.round(n / MB) + 'MB';
    return Math.max(1, Math.round(n / 1024)) + 'KB';
  }

  /* ---- 날짜 ---- */
  function fmtDateTime(ts) {
    const d = new Date(ts);
    const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
           '(' + w + ') ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtDateShort(ts) {
    const d = new Date(ts);
    return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' +
           pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* 날짜별 묶기용 */
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function dayLabel(ts) {
    const d = new Date(ts);
    const now = new Date();
    const k = dayKey(ts);
    if (k === dayKey(now.getTime())) return '오늘';
    if (k === dayKey(now.getTime() - 86400000)) return '어제';
    const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    const y = d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '년 ';
    return y + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + w + ')';
  }
  /* datetime-local 값 <-> epoch (로컬 타임존 기준) */
  function tsToLocalInput(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
           'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function localInputToTs(v) {
    if (!v) return NaN;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
    if (!m) { const t = Date.parse(v); return isNaN(t) ? NaN : t; }
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0).getTime();
  }

  /* ---- id ---- */
  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  /* ---- 파일명 안전화 ---- */
  function safeName(s, fallback) {
    const t = String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return t || fallback || 'photo';
  }

  /* ---- 썸네일 objectURL 캐시 (화면 간 공유) ---- */
  const urlCache = new Map();
  function thumbUrl(photoId, blob) {
    if (urlCache.has(photoId)) return urlCache.get(photoId);
    const url = URL.createObjectURL(blob);
    urlCache.set(photoId, url);
    return url;
  }
  function dropUrl(photoId) {
    if (urlCache.has(photoId)) {
      try { URL.revokeObjectURL(urlCache.get(photoId)); } catch (e) {}
      urlCache.delete(photoId);
    }
  }

  /* ---- 이미지 리사이즈 → JPEG Blob ---- */
  async function decodeImage(file) {
    if (global.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (e) {
        try { return await createImageBitmap(file); } catch (e2) { /* 폴백 */ }
      }
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다')); };
      img.src = url;
    });
  }

  function dataUrlToBlob(url, type) {
    const parts = url.split(',');
    const bin = atob(parts[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type });
  }

  /* JPEG 인코딩은 toDataURL 로 한다.
     **이 폰(갤럭시 A55 WebView)의 canvas.toBlob('image/jpeg') 은 크기·품질과 무관하게
     매번 4초쯤 걸린다** — 320px 썸네일도 4030ms 였다(실측). 사진 한 장에 8.4초가 여기서 나왔다.
     같은 캔버스를 toDataURL 로 뽑으면 108ms 다. base64 를 되돌리는 비용은 수십 KB라 무시할 만하다.
     toBlob 은 toDataURL 이 실패할 때만 쓴다 — 되돌리지 말 것. */
  function canvasToBlob(canvas, type, q) {
    return new Promise((resolve, reject) => {
      try {
        const url = canvas.toDataURL(type, q);
        if (url && url.indexOf(',') > 0) { resolve(dataUrlToBlob(url, type)); return; }
      } catch (e) { /* 아래 toBlob 으로 */ }
      if (canvas.toBlob) {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('인코딩 실패'))), type, q);
      } else {
        reject(new Error('인코딩 실패'));
      }
    });
  }

  function scaleTo(src, sw, sh, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return { cv: cv, w: w, h: h };
  }

  function drawScaled(src, sw, sh, maxSide, quality) {
    const r = scaleTo(src, sw, sh, maxSide);
    return canvasToBlob(r.cv, 'image/jpeg', quality).then((blob) => ({ blob: blob, w: r.w, h: r.h }));
  }

  /* 원본 → {full, thumb, w, h} */
  async function processImage(file, opt) {
    opt = opt || {};
    const maxSide = opt.maxSide || 1600;
    const thumbSide = opt.thumbSide || 320;
    const src = await decodeImage(file);
    const sw = src.width || src.naturalWidth;
    const sh = src.height || src.naturalHeight;
    if (!sw || !sh) throw new Error('이미지 크기를 알 수 없습니다');
    // 큰 쪽을 먼저 줄이고, 썸네일은 **그 결과에서** 뽑는다.
    // 원본(5000만 화소)에서 두 번 줄일 이유가 없다.
    const big = scaleTo(src, sw, sh, maxSide);
    if (src.close) { try { src.close(); } catch (e) {} }
    const fullBlob = await canvasToBlob(big.cv, 'image/jpeg', opt.quality || 0.82);
    const small = scaleTo(big.cv, big.w, big.h, thumbSide);
    const thumbBlob = await canvasToBlob(small.cv, 'image/jpeg', 0.7);
    return { full: fullBlob, thumb: thumbBlob, w: big.w, h: big.h };
  }

  /* ---- 사진 도장 (워터마크) ----
     저장본은 절대 건드리지 않는다 — **내보낼 때만** 사본에 찍는다(사용자 지시).
     실패하면 원본을 그대로 돌려준다 — 도장 때문에 전송이 막히면 안 된다. */
  async function stampImage(blob, text) {
    if (!text) return blob;
    try {
      const src = await decodeImage(blob);
      const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
      if (!w || !h) return blob;
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(src, 0, 0);
      if (src.close) { try { src.close(); } catch (e) {} }
      const fs = Math.max(18, Math.round(w * 0.035));      // 글자 크기 = 사진 폭의 3.5%
      ctx.font = '700 ' + fs + 'px sans-serif';
      const pad = Math.round(fs * 0.45);
      const tw = Math.ceil(ctx.measureText(text).width);
      const bx = w - tw - pad * 3, by = h - fs - pad * 2;  // 오른쪽 아래
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(bx, by, tw + pad * 2, fs + Math.round(pad * 1.4));
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'top';
      ctx.fillText(text, bx + pad, by + Math.round(pad * 0.6));
      return await canvasToBlob(cv, 'image/jpeg', 0.88);
    } catch (e) { console.warn('[stamp]', e); return blob; }
  }

  /* 도장 켬/끔 — 내보내기 시트에서 토글하고 다음에도 기억한다 */
  const WM_KEY = 'gsc.wm.v1';
  function wmPref() {
    try { return localStorage.getItem(WM_KEY) === '1'; } catch (e) { return false; }
  }
  function setWmPref(v) {
    try { localStorage.setItem(WM_KEY, v ? '1' : '0'); } catch (e) {}
  }

  /* ---- 테마 ----
     시스템(prefers-color-scheme)을 따르지 않고 앱 설정을 쓴다.
     첫 실행 때만 시스템 값을 씨앗으로 받는다 — 그 뒤로는 여기서 정한 게 전부다.
     index.html <head> 의 인라인 스크립트가 첫 프레임 전에 같은 값을 박는다(번쩍임 방지). */
  const THEME_KEY = 'gsc.theme.v1';
  function theme() {
    const t = document.documentElement.getAttribute('data-theme');
    return (t === 'dark') ? 'dark' : 'light';
  }
  function setTheme(v) {
    const t = (v === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    // 안드로이드 상태바 색도 같이 간다
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', (t === 'dark') ? '#0b1017' : '#111827');
    return t;
  }

  /* ---- 주구 ----
     현장이 1주구 / 2·4주구로 나뉜다. 감리 명부(Contacts.mine)가 이 값을 따른다.
     기본은 2·4주구 — 지금까지 쓰던 명부가 그쪽이다. */
  const JUGU_KEY = 'gsc.jugu.v1';
  function jugu() {
    try { return (localStorage.getItem(JUGU_KEY) === '1') ? '1' : '24'; }
    catch (e) { return '24'; }
  }
  function setJugu(v) {
    const j = (v === '1') ? '1' : '24';
    try { localStorage.setItem(JUGU_KEY, j); } catch (e) {}
    return j;
  }

  global.U = {
    theme: theme, setTheme: setTheme,
    jugu: jugu, setJugu: setJugu,
    $: $, $$: $$, el: el, icon: icon,
    toast: toast, sheet: sheet, confirmSheet: confirmSheet, buzz: buzz,
    copyText: copyText,
    pad2: pad2, fix2: fix2,
    fmtBytes: fmtBytes,
    fmtDateTime: fmtDateTime, fmtDateShort: fmtDateShort, fmtTime: fmtTime,
    dayKey: dayKey, dayLabel: dayLabel,
    tsToLocalInput: tsToLocalInput, localInputToTs: localInputToTs,
    uid: uid, safeName: safeName,
    thumbUrl: thumbUrl, dropUrl: dropUrl,
    processImage: processImage,
    stampImage: stampImage, wmPref: wmPref, setWmPref: setWmPref
  };
})(window);

;
/* ===== js/store.js ===== */
/* ============ store.js — IndexedDB 저장소 ============
   records : { id, title, tag, ts, memo, photos:[photoId], createdAt, updatedAt }
   photos  : { id, full:Blob, thumb:Blob, w, h, createdAt }
   todos   : { id, day:'YYYY-MM-DD', text, done, order, createdAt, updatedAt }
   tasks   : { id, day:'YYYY-MM-DD'(작업일=목록에 뜨는 날), testDay(시험일=보고 표기),
               specKey, castDay:'YYYY-MM-DD', dong, supervisor, supPhone, part(메모),
               photos:[photoId],
               sets:[{ id, name, values:[{v,d}], factor }],
               order, createdAt, updatedAt }
             완료 = 사진 1장 이상 (done 플래그를 따로 두지 않는다)
             day 와 testDay 는 다를 수 있다 — 31일에 깨고 30일자로 보고하는 경우.
             sets 이전 형식(t.values/t.factor)은 putTask 의 normalizeSets 가 옮긴다.

   title = 제목(주 식별자, 복사·파일명에 쓰임) / tag = 분류용 꼬리표(비어 있어도 됨)
========================================================= */
(function (global) {
  'use strict';

  const DB_NAME = 'gongsiche-db';
  const DB_VER = 4;          // v2: todos / v3: tasks / v4: bangs(방통시험) — 기존 스토어는 그대로 보존
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    const p = new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error('이 환경에서는 저장소를 쓸 수 없습니다')); return; }
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains('records')) {
          const s = db.createObjectStore('records', { keyPath: 'id' });
          s.createIndex('byTs', 'ts');
        }
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('todos')) {
          const t = db.createObjectStore('todos', { keyPath: 'id' });
          t.createIndex('byDay', 'day');
        }
        if (!db.objectStoreNames.contains('tasks')) {
          const k = db.createObjectStore('tasks', { keyPath: 'id' });
          k.createIndex('byDay', 'day');
        }
        if (!db.objectStoreNames.contains('bangs')) {   // 방통시험 기록(날짜별·감리·사진)
          const b = db.createObjectStore('bangs', { keyPath: 'id' });
          b.createIndex('byDay', 'day');
        }
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => { try { req.result.close(); } catch (e) {} dbp = null; };
        // 웹뷰가 메모리·저장소 압박으로 연결을 강제로 닫을 수 있다(close 이벤트).
        // 이걸 안 받으면 죽은 연결을 세션 내내 물고 있어 모든 조회가 실패하고,
        // 화면엔 "작업이 없습니다"만 떠서 **데이터가 다 날아간 것처럼 보인다**(실제 사고).
        req.result.onclose = () => { if (dbp === p) dbp = null; };
        resolve(req.result);
      };
      req.onerror = () => {
        const err = req.error || new Error('저장소 열기 실패');
        // 구버전 APK 를 새 데이터 위에 깔면 여기서 VersionError 가 나는데,
        // 그냥 빈 목록으로 보이면 "데이터 증발"로 오인한다 — 원인을 말해 준다.
        if (err && err.name === 'VersionError') {
          err.userMsg = '앱이 데이터보다 오래되었습니다 — 최신 버전을 설치해 주세요';
        }
        reject(err);
      };
      req.onblocked = () => reject(new Error('저장소가 다른 탭에서 사용 중입니다'));
    });
    dbp = p;
    // 실패한 프라미스를 계속 물고 있으면 세션 내내 저장이 죽는다 → 다음 호출에서 재시도
    p.catch(() => { if (dbp === p) dbp = null; });
    return p;
  }

  /* 모든 DB 접근의 관문. 연결이 이미 죽어 transaction() 이 동기로 던지면
     (InvalidStateError — onclose 가 늦게 오는 경우가 있다) 한 번 다시 열어 재시도한다.
     아직 시작도 못 한 트랜잭션이라 재시도가 안전하다. */
  function run(fn) {
    return open().then((db) => {
      try { return fn(db); }
      catch (e) {
        if (e && e.name === 'InvalidStateError') {
          dbp = null;
          return open().then((db2) => fn(db2));
        }
        throw e;
      }
    });
  }

  function tx(names, mode, fn) {
    return run((db) => {
      const t = db.transaction(names, mode);   // 죽은 연결이면 여기서 던진다 → run 이 재시도
      return new Promise((resolve, reject) => {
        let out;
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error || new Error('저장소 오류'));
        t.onabort = () => reject(t.error || new Error('저장이 중단되었습니다'));
        try {
          out = fn(t);
          if (out && typeof out.then === 'function') {
            // 트랜잭션 안에서 await 를 쓰면 자동 커밋돼 깨지므로 금지
            throw new Error('tx 콜백은 동기여야 합니다');
          }
        } catch (e) { try { t.abort(); } catch (e2) {} reject(e); }
      });
    });
  }

  function reqp(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  /* ---------------- photos ----------------
     네이티브(안드로이드): 원본(full)을 IndexedDB 가 아니라 **앱 데이터 파일**로 둔다
     (rec.file=1, 파일은 photos/<id>.jpg). IndexedDB 가 통째로 날아가는 사고에서 원본이 살고,
     DB 가 가벼워져 손상·축출 압박도 준다.
     웹(아이폰 PWA): WebKit 은 IDB 의 **Blob 을 별도 파일로 빼서** 저장하다 그 파일만 잃는다
     — "레코드는 살고 사진만 증발"의 실사고 원인(조사 확정). Blob 저장을 피한다:
     원본은 OPFS 파일로(지원 시), 안 되면 ArrayBuffer 인라인. 썸네일은 항상 ArrayBuffer. */
  const K_FSFLAG = 'gsc.photos.fs.v1';   // 'done' = 기존 blob 사진의 이전 완료

  function photoFsOk() {
    return !!(global.Native && Native.photoFsOk && Native.photoFsOk());
  }

  /* ---- OPFS (웹 전용 사진 파일 저장소) ---- */
  function opfsDir() {
    if (!(navigator.storage && navigator.storage.getDirectory)) return Promise.resolve(null);
    return navigator.storage.getDirectory()
      .then((root) => root.getDirectoryHandle('photos', { create: true }))
      .catch(() => null);
  }
  async function opfsWrite(id, blob) {
    const dir = await opfsDir();
    if (!dir) throw new Error('NOOPFS');
    const fh = await dir.getFileHandle(id + '.jpg', { create: true });
    if (!fh.createWritable) throw new Error('NOWRITABLE');   // 구형 사파리 — ArrayBuffer 로 폴백
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  }
  async function opfsRead(id) {
    try {
      const dir = await opfsDir();
      if (!dir) return null;
      const fh = await dir.getFileHandle(id + '.jpg');
      return await fh.getFile();
    } catch (e) { return null; }
  }
  function opfsRemove(ids) {
    opfsDir().then((dir) => {
      if (!dir) return;
      (ids || []).forEach((id) => { dir.removeEntry(id + '.jpg').catch(() => {}); });
    }).catch(() => {});
  }

  /* 저장 형식(ArrayBuffer/OPFS)을 읽는 쪽이 몰라도 되게 Blob 으로 되살린다 */
  function hydratePhoto(p) {
    if (!p) return p;
    if (p.thumbBuf && !p.thumb) p.thumb = new Blob([p.thumbBuf], { type: p.thumbType || 'image/jpeg' });
    if (p.fullBuf && !p.full) p.full = new Blob([p.fullBuf], { type: p.fullType || 'image/jpeg' });
    return p;
  }

  /* 웹 저장용 레코드 만들기 — Blob 을 남기지 않는다 */
  async function webPhotoRec(base, p) {
    const rec = Object.assign({}, base);
    delete rec.thumb;
    try {
      if (p.thumb) { rec.thumbBuf = await p.thumb.arrayBuffer(); rec.thumbType = p.thumb.type || 'image/jpeg'; }
    } catch (e) { rec.thumb = p.thumb; }
    if (p.full) {
      let stored = false;
      try { await opfsWrite(rec.id, p.full); rec.opfs = 1; stored = true; } catch (e) {}
      if (!stored) {
        try { rec.fullBuf = await p.full.arrayBuffer(); rec.fullType = p.full.type || 'image/jpeg'; }
        catch (e) { rec.full = p.full; }   // 최후 폴백 — 예전 방식(Blob)
      }
    }
    return rec;
  }

  function putPhoto(p) {
    const id = p.id || U.uid();
    const base = { id: id, thumb: p.thumb, w: p.w || 0, h: p.h || 0, createdAt: Date.now() };
    if (photoFsOk() && p.full) {
      return Native.photoWrite(id, p.full)
        .then(() => tx(['photos'], 'readwrite', (t) => {
          t.objectStore('photos').put(Object.assign({ file: 1 }, base));
        }))
        .catch((e) => {
          // 파일 쓰기가 막히면(용량 등) 예전 방식으로 물러선다 — 사진을 잃는 것보단 낫다.
          // 이전 완료 표시를 지워 다음 부팅 때 다시 파일로 옮기게 한다.
          console.warn('[putPhoto fs]', e);
          try { localStorage.removeItem(K_FSFLAG); } catch (e2) {}
          return tx(['photos'], 'readwrite', (t) => {
            t.objectStore('photos').put(Object.assign({ full: p.full }, base));
          }).catch((e3) => {
            // DB 까지 막혔다 — 이미 써 둔 파일이 어떤 정리 경로에도 안 걸리는 영구 고아가 된다
            // (gc 는 DB 키에서 출발한다, 반대심문 확인). 파일을 걷어내고 실패를 알린다.
            if (global.Native && Native.photoRemove) Native.photoRemove([id]);
            throw e3;
          });
        })
        .then(() => id);
    }
    // 웹(PWA) — Blob 대신 OPFS/ArrayBuffer
    return webPhotoRec(base, p)
      .then((rec) => tx(['photos'], 'readwrite', (t) => { t.objectStore('photos').put(rec); })
        .catch((e) => {
          if (rec.opfs) opfsRemove([id]);   // DB 실패 시 OPFS 고아 방지
          throw e;
        }))
      .then(() => id);
  }

  /* 사진 원본 blob — 인라인(Blob/ArrayBuffer)·앱 파일·OPFS 어디에 있든 Blob 으로 돌려준다 */
  function fullBlob(p) {
    if (!p) return Promise.resolve(null);
    if (p.full) return Promise.resolve(p.full);
    if (p.fullBuf) return Promise.resolve(new Blob([p.fullBuf], { type: p.fullType || 'image/jpeg' }));
    if (p.file && global.Native && Native.photoRead) return Native.photoRead(p.id);
    if (p.opfs) return opfsRead(p.id);
    return Promise.resolve(null);
  }

  function getPhoto(id) {
    return run((db) => reqp(db.transaction('photos').objectStore('photos').get(id)))
      .then(hydratePhoto);
  }

  /* 빈 id 가 하나만 섞여도 IndexedDB 는 DataError 를 던진다.
     예전엔 그걸 그대로 흘려 Promise.all 이 통째로 깨졌고 —
     **그 작업 사진이 한 장도 안 보였다.** 한 장이 깨져도 나머지는 살린다. */
  function getPhotos(ids) {
    const keys = (ids || []).filter((id) => id !== null && id !== undefined && id !== '');
    if (!keys.length) return Promise.resolve([]);
    return run((db) => {
      const st = db.transaction('photos').objectStore('photos');
      return Promise.all(keys.map((id) => {
        try { return reqp(st.get(id)).catch(() => null); }
        catch (e) { return Promise.resolve(null); }
      }));
    }).then((arr) => arr.filter(Boolean).map(hydratePhoto));
  }

  function deletePhotos(ids) {
    if (!ids || !ids.length) return Promise.resolve();
    return tx(['photos'], 'readwrite', (t) => {
      const st = t.objectStore('photos');
      ids.forEach((id) => st.delete(id));
    }).then(() => {
      // 파일(앱 데이터·OPFS)로 옮겨진 원본도 같이 지운다 (없으면 조용히 넘어간다)
      if (global.Native && Native.photoRemove) Native.photoRemove(ids);
      opfsRemove(ids);
      dropUrls(ids);
    });
  }

  /* 지운 사진의 썸네일 objectURL 캐시도 반납한다 — 안 하면 세션 내내 Blob 참조가 쌓인다(감사 지적) */
  function dropUrls(ids) {
    if (global.U && U.dropUrl) (ids || []).forEach((id) => { try { U.dropUrl(id); } catch (e) {} });
  }

  /* ---------------- records ---------------- */

  /* 구버전(제목 없이 tag 하나만 쓰던 시절) 보정.
     그때의 tag 는 사실상 제목이었으므로 title 로 옮기고 tag 는 비운다. */
  function normRec(r) {
    if (!r) return r;
    if (typeof r.title !== 'string') {
      r.title = (typeof r.tag === 'string' ? r.tag : '');
      r.tag = '';
    }
    if (typeof r.tag !== 'string') r.tag = '';
    return r;
  }

  function putRecord(r) {
    const now = Date.now();
    const rec = {
      id: r.id || U.uid(),
      title: (r.title || '').trim(),
      tag: (r.tag || '').trim(),
      ts: r.ts || now,
      memo: r.memo || '',
      photos: (r.photos || []).slice(),
      createdAt: r.createdAt || now,
      updatedAt: now
    };
    return tx(['records'], 'readwrite', (t) => { t.objectStore('records').put(rec); })
      .then(() => rec);
  }

  function getRecord(id) {
    return run((db) => reqp(db.transaction('records').objectStore('records').get(id)))
      .then(normRec);
  }

  function allRecords() {
    return run((db) => reqp(db.transaction('records').objectStore('records').getAll()))
      .then((arr) => (arr || []).map(normRec)
        .sort((a, b) => (b.ts - a.ts) || (b.createdAt - a.createdAt)));
  }

  /* 작업 하나가 참조하는 사진 id 전부 — t.photos(합집합)에 더해 sub 칸까지 이중으로 본다.
     putTask 가 합집합을 보장하지만, 사진 삭제 판단은 틀리면 복구가 없으므로 벨트에 멜빵이다. */
  function refPhotos(t, mark) {
    (t.photos || []).forEach((p) => { mark[p] = 1; });
    if (t.sub) Spec.SUBS.forEach((s) => {
      (((t.sub[s.key] || {}).photos) || []).forEach((p) => { mark[p] = 1; });
    });
  }
  // 방통 기록도 사진을 참조한다 — gc·삭제가 이걸 안 세면 방통 사진을 고아로 보고 지운다
  // (CLAUDE_MAP: 사진 참조 스토어가 늘면 gc·deleteTask·deleteRecord 셋 다 추가할 것).
  function refBangPhotos(rows, mark) {
    (rows || []).forEach((b) => (b.photos || []).forEach((p) => { mark[p] = 1; }));
  }

  /* uid 앞부분이 생성 시각(36진수)이다 — 스키마 변경 없이 사진 나이를 알 수 있다 */
  function uidTime(id) {
    const t = parseInt(String(id).split('-')[0], 36);
    return isFinite(t) ? t : 0;
  }
  const GC_GRACE = 24 * 3600 * 1000;   // 이 나이 미만 사진은 지우지 않는다(진행 중 세션 보호)

  /* 기록 삭제 — 다른 기록이 같이 쓰는 사진은 남긴다.
     읽기와 삭제를 **한 트랜잭션**에서 한다 — 나눠 하면 그 사이에 커밋된 저장을 못 보고
     남의 사진을 고아로 오판한다(버그리포트 TOCTOU 지적). */
  function deleteRecord(id) {
    let orphan = [];
    return tx(['records', 'tasks', 'bangs', 'photos'], 'readwrite', (t) => {
      const rs = t.objectStore('records').getAll();
      const ts = t.objectStore('tasks').getAll();
      const bs = t.objectStore('bangs').getAll();
      let got = 0;
      const ready = () => {
        if (++got < 3) return;
        const all = rs.result || [], tasks = ts.result || [];
        const target = all.filter((r) => r.id === id)[0];
        const mine = (target && target.photos) || [];
        const used = {};
        all.forEach((r) => { if (r.id !== id) (r.photos || []).forEach((p) => { used[p] = 1; }); });
        tasks.forEach((k) => refPhotos(k, used));
        refBangPhotos(bs.result || [], used);
        orphan = mine.filter((p) => !used[p]);
        t.objectStore('records').delete(id);
        const ps = t.objectStore('photos');
        orphan.forEach((pid) => ps.delete(pid));
      };
      rs.onsuccess = ready;
      ts.onsuccess = ready;
      bs.onsuccess = ready;
    }).then(() => {
      if (orphan.length) {
        if (global.Native && Native.photoRemove) Native.photoRemove(orphan);
        opfsRemove(orphan);
        dropUrls(orphan);
      }
    });
  }

  /* 기록에도 작업에도 속하지 않은 사진 정리 (저장 안 하고 나간 편집기 잔여물).
     ※ 사진을 쓰는 스토어가 늘어나면 반드시 여기에도 추가할 것 — 빠지면 남의 사진을 지운다.
     - 읽기·계산·삭제를 **한 트랜잭션**으로 (스냅숏 일관성 — TOCTOU 차단)
     - 24시간 미만 사진은 안 지운다 (커밋됐지만 아직 어느 작업에도 안 붙은 진행 중 사진 보호) */
  function gc(protectIds) {
    // 복원 중에는 절대 안 돈다 — 되살린 사진이 작업에 연결되기 전 창에서 gc 가 끼어들면
    // 유일하게 살아남은 원본을 미참조로 오인해 지운다(반대심문 확인).
    if (restoring) return Promise.resolve(0);
    const keep = {};
    (protectIds || []).forEach((id) => { keep[id] = 1; });
    const now = Date.now();
    let dead = [];
    return tx(['records', 'tasks', 'bangs', 'photos'], 'readwrite', (t) => {
      const rs = t.objectStore('records').getAll();
      const ts = t.objectStore('tasks').getAll();
      const bs = t.objectStore('bangs').getAll();
      const ph = t.objectStore('photos');
      const ks = ph.getAllKeys();
      let got = 0;
      const ready = () => {
        if (++got < 4) return;
        (rs.result || []).forEach((r) => (r.photos || []).forEach((p) => { keep[p] = 1; }));
        (ts.result || []).forEach((k) => refPhotos(k, keep));
        refBangPhotos(bs.result || [], keep);
        (ks.result || []).forEach((key) => {
          if (keep[key]) return;
          if (now - uidTime(key) < GC_GRACE) return;   // 오늘 찍은 건 건드리지 않는다
          dead.push(key);
          ph.delete(key);
        });
      };
      rs.onsuccess = ready;
      ts.onsuccess = ready;
      bs.onsuccess = ready;
      ks.onsuccess = ready;
    }).then(() => {
      if (dead.length) {
        if (global.Native && Native.photoRemove) Native.photoRemove(dead);
        opfsRemove(dead);
        dropUrls(dead);
      }
      return dead.length;
    }).catch(() => 0);
  }

  /* ---------------- todos ---------------- */
  function putTodo(t) {
    const now = Date.now();
    const rec = {
      id: t.id || U.uid(),
      day: t.day,
      text: (t.text || '').trim(),
      done: !!t.done,
      order: (typeof t.order === 'number') ? t.order : now,
      createdAt: t.createdAt || now,
      updatedAt: now
    };
    return tx(['todos'], 'readwrite', (s) => { s.objectStore('todos').put(rec); })
      .then(() => rec);
  }

  function todosOf(day) {
    return run((db) => reqp(
      db.transaction('todos').objectStore('todos').index('byDay').getAll(IDBKeyRange.only(day))
    )).then((arr) => (arr || []).sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt)));
  }

  function deleteTodo(id) {
    return tx(['todos'], 'readwrite', (s) => { s.objectStore('todos').delete(id); });
  }

  /* ---------------- tasks ---------------- */

  /* 계산 세트 정규화.
     한 작업에 강도 계산을 여러 벌 넣는다 — 회사가 다르거나 LOT 가 여러 개일 때.
       sets = [{ id, name, values:[{v,d}], factor }]
     구버전은 값 한 벌이 작업에 바로 붙어 있었다(t.values / t.factor).
     그건 이름 없는 세트 하나로 옮긴다. 여기서 안 옮기면 저장하는 순간 값이 날아간다. */
  function normalizeSets(t) {
    const fac = (f) => (typeof f === 'number' && isFinite(f) && f > 0) ? f : 0.97;
    const vals = (a) => (Array.isArray(a) ? a : []).filter(
      (e) => e && typeof e.v === 'number' && isFinite(e.v)
    ).map((e) => {
      const o = { v: e.v, d: (typeof e.d === 'string') ? e.d : '' };
      if (e.r) o.r = 1;      // 랜덤 생성 표식 — 작업에 넣었다 다시 열어도 색 구분이 산다
      return o;
    });

    if (Array.isArray(t.sets) && t.sets.length) {
      return t.sets.map((s) => ({
        id: (s && s.id) || U.uid(),
        name: ((s && s.name) || '').trim(),
        values: vals(s && s.values),
        factor: fac(s && s.factor)
      }));
    }
    const legacy = vals(t.values);
    if (!legacy.length) return [];
    return [{ id: U.uid(), name: '', values: legacy, factor: fac(t.factor) }];
  }

  /* 구버전 이관 — 동수 칸이 생기기 전에는 동을 메모에 적었다.
     메모가 「212동」처럼 동수 하나뿐이면 동수 칸으로 옮긴다.
     값은 옮겨질 뿐 사라지지 않고, 「212동 3층」 같은 자유 메모는 건드리지 않는다
     (그건 메모로 두는 게 맞다 — 동은 편집기에서 고르면 된다). */
  const ONLY_DONG = /^\s*(\d+)\s*동\s*$/;
  function liftDong(t) {
    if (!t || t.dong) return t;
    const m = ONLY_DONG.exec(t.part || '');
    if (!m) return t;
    t.dong = m[1] + '동';
    t.part = '';
    return t;
  }

  /* 28일 작업의 두 칸(수중·봉함). 각 칸이 사진과 계산 세트를 따로 갖는다.
     ※ 사진 id 는 t.photos 에도 반드시 합쳐 둔다 —
        gc()/deleteTask() 가 t.photos 만 보고 참조 여부를 판단하기 때문에
        빼먹으면 남의 사진을 고아로 보고 지운다(예전에 실제로 터졌던 종류의 버그). */
  function normalizeSub(t) {
    const out = {};
    Spec.SUBS.forEach((s) => {
      const raw = (t && t.sub && t.sub[s.key]) || {};
      out[s.key] = {
        photos: (raw.photos || []).filter((id) => id !== null && id !== undefined && id !== ''),
        sets: normalizeSets({ sets: raw.sets, values: raw.values, factor: raw.factor })
      };
    });
    return out;
  }

  /* 28일이면 두 칸의 사진을 합쳐 t.photos 로 삼는다(중복 없이, 순서 유지) */
  function mergedPhotos(t, sub) {
    const seen = Object.create(null), out = [];
    const push = (id) => {
      if (id === null || id === undefined || id === '' || seen[id]) return;
      seen[id] = 1; out.push(id);
    };
    Spec.SUBS.forEach((s) => (sub[s.key].photos || []).forEach(push));
    return out;
  }

  /* day 가 비거나 깨진 채 저장되면 byDay 인덱스에서 빠져 **어느 날짜 목록에도 안 뜬다**
     — 데이터가 증발한 것처럼 보이는 최악의 경로라 저장 시점에 반드시 막는다. */
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function goodDay(v, alt) { return DAY_RE.test(v || '') ? v : alt; }

  function subIsEmpty(sub) {
    return Spec.SUBS.every((s) => {
      const b = sub[s.key] || {};
      return !(b.photos && b.photos.length) && !(b.sets && b.sets.length);
    });
  }

  /* 28일이 아닌 저장의 세트 — 없으면 sub 칸(수중·봉함)에서 끌어온다.
     28일↔단일재령으로 분류를 바꿔 저장할 때 반대편 저장구조에 든 값이 조용히 버려지던 구멍을
     막는다(반대심문 확인 — 사진은 t.photos 합집합 덕에 이미 살아남지만 세트는 여기서 살린다). */
  function nonSubSets(t) {
    const s = normalizeSets(t);
    if (s.length) return s;
    if (t.sub) {
      let out = [];
      Spec.SUBS.forEach((k) => {
        const b = t.sub[k.key] || {};
        out = out.concat(normalizeSets({ sets: b.sets, values: b.values, factor: b.factor }));
      });
      return out;
    }
    return s;
  }

  /* 작업 → 저장할 레코드(정규화). putTask 와 persist28 이 같이 쓴다 */
  function taskRec(t) {
    liftDong(t);
    const now = Date.now();
    const isSub = Spec.hasSubs(t.specKey);
    const sub = isSub ? normalizeSub(t) : null;
    // 단일재령→28일 전환: sub 가 비었는데 t.photos/t.sets 에 데이터가 있으면 수중 칸으로 이관
    // (안 하면 저장 즉시 사진·강도값이 통째로 증발 — 반대심문 확인)
    if (isSub && subIsEmpty(sub)) {
      const legacyPhotos = (t.photos || []).slice();
      const legacySets = normalizeSets(t);
      if (legacyPhotos.length || legacySets.length) {
        sub[Spec.SUBS[0].key].photos = legacyPhotos;
        sub[Spec.SUBS[0].key].sets = legacySets;
      }
    }
    const day = goodDay(t.day, goodDay(t.testDay, U.dayKey(now)));
    return {
      id: t.id || U.uid(),
      day: day,                            // 작업일 = 목록에 뜨는 날 (byDay 인덱스 키)
      testDay: goodDay(t.testDay, day),    // 시험일 = 보고·카톡 표기용
      specKey: t.specKey || '',
      castDay: t.castDay || '',
      reportDay: t.reportDay || '',       // 비어 있으면 규칙대로 (Task.autoReportDay)
      dong: (t.dong || '').trim(),          // 동수 — 목록 제목이자 카톡 문구의 주어
      supervisor: (t.supervisor || '').trim(),
      supPhone: (t.supPhone || '').trim(),
      part: (t.part || '').trim(),
      jugu: (t.jugu === '1' || t.jugu === '24') ? t.jugu : '',   // 비면 동 번호로 추정(Task.juguOf)
      photoMark: !!t.photoMark,            // 목록의 「사진」 배지 — 표시 전용(완료 판정과 무관)
      // 28일은 두 칸의 사진이 곧 이 작업의 사진이다(gc 가 여기만 본다)
      photos: isSub ? mergedPhotos(t, sub) : (t.photos || []).slice(),
      sets: isSub ? [] : nonSubSets(t),
      sub: sub,                            // 28일이 아니면 null
      order: (typeof t.order === 'number') ? t.order : now,
      createdAt: t.createdAt || now,
      updatedAt: now
    };
  }

  /* ---------- 상시 미러 (근본 예방 — 조사 결론) ----------
     웹뷰의 IndexedDB 는 손상 시 통삭제·저장공간 축출을 앱이 못 막는다
     (persist() 는 웹뷰에서 무력 — 크로미움 팀 확인). 그래서 작업 전체의 진실 사본을
     **웹뷰 밖**에 상시 유지한다:
       네이티브 = SharedPreferences (OS 가 fsync+원자 교체를 보장하는 AtomicFile 패턴)
       웹      = localStorage (실사고에서 IndexedDB 와 달리 생존한 별도 계층)
     쓰기마다 800ms 디바운스로 전체를 미러링하고, 복원 때 1순위로 쓴다. */
  const K_MIRROR = 'gsc.tasks.mirror.v1';
  let mirrorTimer = null;
  let restoring = false;      // 복원 중 — gc·mirror·서버 push 를 잠근다(부분 상태 유출·원본 삭제 방지)

  function mirrorSoon() {
    // 복원 중에는 미러·서버 push 를 걸지 않는다 — 중간에 끊기면 '일부만 복원된' 불완전 상태가
    // 서버로 나가 다른 기기가 그걸 내려받는다(반대심문 확인). 복원이 끝나면 한 번만 민다.
    if (restoring) return;
    // 관리자 서버 실시간 백업도 같은 훅을 탄다(있을 때만) — 저장 경로가 늘면 여기 하나로 충분
    try { if (global.Sync) Sync.poke(); } catch (e) {}
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(() => {
      run((db) => {
        const t = db.transaction(['tasks', 'bangs']);
        return Promise.all([
          reqp(t.objectStore('tasks').getAll()),
          reqp(t.objectStore('bangs').getAll())
        ]);
      })
        .then((pair) => {
          const rows = pair[0] || [], bangs = pair[1] || [];
          if (!rows.length && !bangs.length) return;   // 빈 DB 로 미러를 덮지 않는다
          const body = JSON.stringify({
            at: Date.now(), day: U.dayKey(Date.now()), n: rows.length, tasks: rows, bangs: bangs
          });
          if (global.Native && Native.prefOk && Native.prefOk()) {
            return Native.prefSet(K_MIRROR, body);
          }
          try { localStorage.setItem(K_MIRROR, body); } catch (e) {}
        })
        .catch(() => {});
    }, 800);
  }

  function mirrorInfo() {
    const parse = (s) => {
      try {
        const j = JSON.parse(s);
        const hasT = Array.isArray(j.tasks) && j.tasks.length;
        const hasB = Array.isArray(j.bangs) && j.bangs.length;
        return (j && (hasT || hasB)) ? j : null;
      } catch (e) { return null; }
    };
    if (global.Native && Native.prefOk && Native.prefOk()) {
      return Native.prefGet(K_MIRROR).then(parse).catch(() => null);
    }
    try { return Promise.resolve(parse(localStorage.getItem(K_MIRROR))); }
    catch (e) { return Promise.resolve(null); }
  }

  function putTask(t) {
    const rec = taskRec(t);
    return tx(['tasks'], 'readwrite', (s) => { s.objectStore('tasks').put(rec); })
      .then(() => { mirrorSoon(); return rec; });
  }

  /* ---------- 구버전 수중·봉함 → 28일 합치기 ----------
     수중과 봉함은 같은 타설에서 한 번에 뽑는 한 세트다(사용자 지시).
     예전에는 분류가 둘로 나뉘어 작업도 둘이었으므로, 같은 날·같은 동·같은 타설일인 쌍을
     28일 작업 하나로 합치고 각각을 수중 칸 / 봉함 칸에 넣는다.
     짝이 없으면 혼자서라도 28일로 옮긴다 — 분류 칩에 수중·봉함이 더는 없기 때문이다.
     사진과 계산은 옮겨질 뿐 사라지지 않는다. */
  const LEGACY28 = { water: 1, seal: 1 };

  function mergeKey(t) {
    return [t.day, Task28Day(t), (t.dong || '').trim(), (t.castDay || ''),
            (t.supervisor || '').trim()].join('|');
  }
  function Task28Day(t) { return t.testDay || t.day || ''; }

  function toSub(t) {
    return {
      photos: (t.photos || []).slice(),
      sets: normalizeSets(t)
    };
  }

  /* 목록을 받아 합칠 것이 있으면 합쳐 돌려준다. 실제 저장은 호출한 쪽이 한다. */
  function merge28(rows) {
    const legacy = rows.filter((t) => LEGACY28[t.specKey]);
    if (!legacy.length) return { rows: rows, changed: [], gone: [] };

    const groups = Object.create(null);
    legacy.forEach((t) => {
      const k = mergeKey(t);
      (groups[k] = groups[k] || []).push(t);
    });

    const changed = [], gone = Object.create(null);
    Object.keys(groups).forEach((k) => {
      const g = groups[k];
      // 같은 칸끼리 둘 이상이면 합치면 값이 섞인다 — 그건 손대지 않는다
      const water = g.filter((t) => t.specKey === 'water');
      const seal  = g.filter((t) => t.specKey === 'seal');
      if (water.length > 1 || seal.length > 1) return;

      const base = water[0] || seal[0];
      const rec = Object.assign({}, base);
      rec.specKey = 'd28';
      rec.sub = {
        water: water[0] ? toSub(water[0]) : { photos: [], sets: [] },
        seal:  seal[0]  ? toSub(seal[0])  : { photos: [], sets: [] }
      };
      // 화면이 이 in-memory 병합본을 바로 쓴다 — 저장(putTask) 전에 모양을 맞춰 둔다.
      // 안 맞추면 첫 렌더에서 봉함 사진이 개수·썸네일에 안 잡힌다(감사에서 확인).
      rec.photos = mergedPhotos(rec, rec.sub);
      rec.sets = [];
      // 합쳐진 쪽(두 번째 레코드)은 지운다
      g.forEach((t) => { if (t.id !== base.id) gone[t.id] = 1; });
      changed.push(rec);
    });

    if (!changed.length) return { rows: rows, changed: [], gone: [] };
    const byId = Object.create(null);
    changed.forEach((r) => { byId[r.id] = r; });
    const out = rows.filter((t) => !gone[t.id]).map((t) => byId[t.id] || t);
    return { rows: out, changed: changed, gone: Object.keys(gone) };
  }

  /* 합친 결과를 저장한다. 실패해도 화면은 이미 합쳐진 걸 보고 있으므로 조용히 넘어간다.
     put 과 delete 는 **한 트랜잭션**이다 — 둘 사이에 다른 tasksOf 가 끼어들면
     봉함만 남은 반쪽을 또 합쳐 중복 d28 이 생길 수 있다(감사에서 확인된 레이스). */
  function persist28(m) {
    if (!m.changed.length) return;
    const recs = m.changed.map(taskRec);
    tx(['tasks'], 'readwrite', (s) => {
      const st = s.objectStore('tasks');
      recs.forEach((r) => st.put(r));
      m.gone.forEach((id) => st.delete(id));
    }).then(() => mirrorSoon()).catch((e) => console.warn('[merge28]', e));
  }

  function tasksOf(day) {
    return run((db) => reqp(
      db.transaction('tasks').objectStore('tasks').index('byDay').getAll(IDBKeyRange.only(day))
    )).then((arr) => {
      const m = merge28((arr || []).map(liftDong));
      persist28(m);                     // 저장은 기다리지 않는다 — 화면은 이미 합쳐진 걸 본다
      return m.rows.sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
    });
  }

  function getTask(id) {
    return run((db) => reqp(db.transaction('tasks').objectStore('tasks').get(id)))
      .then(liftDong);
  }

  /* 기록 삭제와 같은 규칙: 다른 데서 안 쓰는 사진만 지운다.
     읽기와 삭제가 한 트랜잭션이다 (deleteRecord 와 같은 이유). */
  function deleteTask(id) {
    let orphan = [];
    return tx(['tasks', 'records', 'bangs', 'photos'], 'readwrite', (t) => {
      const ts = t.objectStore('tasks').getAll();
      const rs = t.objectStore('records').getAll();
      const bs = t.objectStore('bangs').getAll();
      let got = 0;
      const ready = () => {
        if (++got < 3) return;
        const tasks = ts.result || [], recs = rs.result || [];
        const target = tasks.filter((k) => k.id === id)[0];
        const mineMark = {};
        if (target) refPhotos(target, mineMark);
        const used = {};
        tasks.forEach((k) => { if (k.id !== id) refPhotos(k, used); });
        recs.forEach((r) => (r.photos || []).forEach((p) => { used[p] = 1; }));
        refBangPhotos(bs.result || [], used);
        orphan = Object.keys(mineMark).filter((p) => !used[p]);
        t.objectStore('tasks').delete(id);
        const ps = t.objectStore('photos');
        orphan.forEach((pid) => ps.delete(pid));
      };
      ts.onsuccess = ready;
      rs.onsuccess = ready;
      bs.onsuccess = ready;
    }).then(() => {
      if (orphan.length) {
        if (global.Native && Native.photoRemove) Native.photoRemove(orphan);
        opfsRemove(orphan);
        dropUrls(orphan);
      }
      mirrorSoon();
    });
  }

  function estimate() {
    if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
    return Promise.resolve(null);
  }

  /* ---------- 자동 백업 (마지막 안전판) ----------
     IndexedDB 가 통째로 날아가는 사고(웹뷰 프로필 손상·저장소 정리 등)에 대비해
     작업 메타 전부를 localStorage 에 하루 한 번 떠 둔다. 저장 계층이 달라 같이 죽는 일이 드물다.
     사진(Blob)은 못 담는다 — 동·날짜·감리·강도값(sets)이 살면 일은 이어 갈 수 있다. */
  const K_BAK = 'gsc.tasks.backup.v1';
  const K_BAK2 = 'gsc.tasks.backup.prev.v1';   // 건수가 줄 때 한 세대 보관 — 부분 유실 대비

  function taskCount() {
    return run((db) => reqp(db.transaction('tasks').objectStore('tasks').count()));
  }

  function allTasks() {
    return run((db) => reqp(db.transaction('tasks').objectStore('tasks').getAll()))
      .then((arr) => {
        // tasksOf 처럼 구버전 수중·봉함을 28일로 합쳐 돌려준다 — OCR 중복판정·서버 백업이
        // 이 함수를 쓰는데, 안 합치면 legacy 'water'/'seal' 이 'd28' 과 안 맞아 같은 시험이
        // 중복 등록된다(반대심문 확인).
        const m = merge28((arr || []).map(liftDong));
        persist28(m);
        return m.rows;
      });
  }

  /* ---------- 방통시험 기록 (날짜별·감리·사진 — 동은 없다) ----------
     w=몰탈무게(g) · s1/s2=슬럼프(mm, 평균 낸다) 는 원본값으로 저장하고 화면이 다시 계산한다. */
  const K_BANG_DAY = 'gsc.filebak.bang.day.v1';
  function bangRec(b) {
    const now = Date.now();
    const num = (v) => { const n = parseFloat(v); return (isFinite(n) && n >= 0) ? n : null; };
    return {
      id: b.id || U.uid(),
      day: goodDay(b.day, U.dayKey(now)),
      dong: (b.dong || '').trim(),           // 동 — 작업과 같은 표기(사용자 지시로 추가)
      floor: String(b.floor || '').trim(),   // 층수 메모 (예: "3" → 화면에서 "3층")
      memo: (b.memo || '').trim(),           // 자유 메모(사용자 지시로 추가)
      supervisor: (b.supervisor || '').trim(),
      supPhone: (b.supPhone || '').trim(),
      jugu: (b.jugu === '1' || b.jugu === '24') ? b.jugu : '',
      photos: (b.photos || []).filter((id) => id !== null && id !== undefined && id !== ''),
      w: num(b.w), s1: num(b.s1), s2: num(b.s2),
      order: (typeof b.order === 'number') ? b.order : now,
      createdAt: b.createdAt || now,
      updatedAt: now
    };
  }
  function putBang(b) {
    const rec = bangRec(b);
    return tx(['bangs'], 'readwrite', (s) => { s.objectStore('bangs').put(rec); })
      .then(() => { mirrorSoon(); return rec; });
  }
  function bangsOf(day) {
    return run((db) => reqp(
      db.transaction('bangs').objectStore('bangs').index('byDay').getAll(IDBKeyRange.only(day))
    )).then((arr) => (arr || []).sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt)));
  }
  function allBangs() {
    return run((db) => reqp(db.transaction('bangs').objectStore('bangs').getAll())).then((a) => a || []);
  }
  function getBang(id) {
    return run((db) => reqp(db.transaction('bangs').objectStore('bangs').get(id)));
  }
  /* 삭제 — 다른 데(작업·기록·다른 방통)서 안 쓰는 사진만 지운다. 읽기·삭제 한 트랜잭션(TOCTOU 차단). */
  function deleteBang(id) {
    let orphan = [];
    return tx(['bangs', 'tasks', 'records', 'photos'], 'readwrite', (t) => {
      const bs = t.objectStore('bangs').getAll();
      const ts = t.objectStore('tasks').getAll();
      const rs = t.objectStore('records').getAll();
      let got = 0;
      const ready = () => {
        if (++got < 3) return;
        const bangs = bs.result || [], tasks = ts.result || [], recs = rs.result || [];
        const target = bangs.filter((b) => b.id === id)[0];
        const mine = (target && target.photos) || [];
        const used = {};
        bangs.forEach((b) => { if (b.id !== id) (b.photos || []).forEach((p) => { used[p] = 1; }); });
        tasks.forEach((k) => refPhotos(k, used));
        recs.forEach((r) => (r.photos || []).forEach((p) => { used[p] = 1; }));
        orphan = mine.filter((p) => !used[p]);
        t.objectStore('bangs').delete(id);
        const ps = t.objectStore('photos');
        orphan.forEach((pid) => ps.delete(pid));
      };
      bs.onsuccess = ready;
      ts.onsuccess = ready;
      rs.onsuccess = ready;
    }).then(() => {
      if (orphan.length) {
        if (global.Native && Native.photoRemove) Native.photoRemove(orphan);
        opfsRemove(orphan);
        dropUrls(orphan);
      }
      mirrorSoon();
    });
  }

  /* 지금 DB 전체(작업+방통)를 백업 모양(info)으로 — 수동 백업 파일 내보내기가 쓴다.
     미러·restoreBackup 과 같은 형식이라 그대로 되살릴 수 있다. */
  function fullSnapshot() {
    return run((db) => {
      const t = db.transaction(['tasks', 'bangs']);
      return Promise.all([
        reqp(t.objectStore('tasks').getAll()),
        reqp(t.objectStore('bangs').getAll())
      ]);
    }).then((pair) => ({
      at: Date.now(), day: U.dayKey(Date.now()),
      n: (pair[0] || []).length,
      tasks: pair[0] || [], bangs: pair[1] || []
    }));
  }

  function bakInfo(key) {
    try {
      const j = JSON.parse(localStorage.getItem(key));
      return (j && ((Array.isArray(j.tasks) && j.tasks.length) || (Array.isArray(j.bangs) && j.bangs.length))) ? j : null;
    } catch (e) { return null; }
  }
  function backupInfo() { return bakInfo(K_BAK); }

  function backupNow() {
    return run((db) => {
      const t = db.transaction(['tasks', 'bangs']);
      return Promise.all([
        reqp(t.objectStore('tasks').getAll()),
        reqp(t.objectStore('bangs').getAll())
      ]);
    })
      .then((pair) => {
        const rows = pair[0] || [], bangs = pair[1] || [];
        if (!rows.length && !bangs.length) return 0;   // 빈 DB 로 멀쩡한 백업을 덮지 않는다
        try {
          const prev = backupInfo();
          // 건수가 백업보다 줄었다 = 부분 유실일 수 있다 — 좋은 백업을 그냥 덮지 말고
          // 한 세대 옆에 보관한다(감사 지적: 완전 증발만 막고 부분 유실은 못 막던 구멍)
          if (prev && rows.length < (prev.n || 0)) {
            localStorage.setItem(K_BAK2, localStorage.getItem(K_BAK));
          }
          localStorage.setItem(K_BAK, JSON.stringify({
            at: Date.now(), day: U.dayKey(Date.now()), n: rows.length, tasks: rows, bangs: bangs
          }));
        } catch (e) { return 0; }            // 용량 초과 등 — 백업은 보조라 조용히 넘어간다
        return rows.length;
      }).catch(() => 0);
  }

  /* 하루 한 번만 뜬다 — 부팅 때 불러도 부담이 없다 */
  function backupDaily() {
    const info = backupInfo();
    if (info && info.day === U.dayKey(Date.now())) return Promise.resolve(0);
    return backupNow();
  }

  /* ---------- 파일 백업 (P0 — localStorage 와 다른 계층) ----------
     IndexedDB 와 localStorage 가 같이 죽는 사고까지 대비해 파일로도 하루 한 번 남긴다.
     쓰는 곳: 앱데이터(DATA/backup) 항상 + 공용문서(DOCUMENTS/공시체백업) 최선 노력. 7세대 보관. */
  const K_FBAK_DAY = 'gsc.filebak.day.v1';

  function backupToFileDaily() {
    if (!(global.Native && Native.backupOk && Native.backupOk())) return Promise.resolve(false);
    const today = U.dayKey(Date.now());
    try { if (localStorage.getItem(K_FBAK_DAY) === today) return Promise.resolve(false); } catch (e) {}
    return run((db) => {
      const t = db.transaction(['tasks', 'bangs']);
      return Promise.all([
        reqp(t.objectStore('tasks').getAll()),
        reqp(t.objectStore('bangs').getAll())
      ]);
    })
      .then((pair) => {
        const rows = pair[0] || [], bangs = pair[1] || [];
        if (!rows.length && !bangs.length) return false;
        const name = 'gsc-' + today.replace(/-/g, '') + '.json';
        const body = JSON.stringify({ at: Date.now(), day: today, n: rows.length, tasks: rows, bangs: bangs });
        return Native.backupWrite(name, body).then((ok) => {
          if (ok) {
            try { localStorage.setItem(K_FBAK_DAY, today); } catch (e) {}
            Native.backupTrim(7);
          }
          return ok;
        });
      }).catch(() => false);
  }

  /* 최신 파일 백업을 localStorage 백업과 같은 모양(info)으로 읽어 온다 */
  function fileBackupInfo() {
    if (!(global.Native && Native.backupOk && Native.backupOk())) return Promise.resolve(null);
    return Native.backupList().then((list) => {
      if (!list.length) return null;
      return Native.backupRead(list[0]).then((text) => {
        try {
          const j = JSON.parse(text);
          return (j && Array.isArray(j.tasks) && j.tasks.length) ? j : null;
        } catch (e) { return null; }
      });
    }).catch(() => null);
  }

  /* ---------- 기존 blob 사진 이전 (P2 마이그레이션) ----------
     네이티브: 원본 → 앱 데이터 파일. 웹: 원본 → OPFS/ArrayBuffer, 썸네일 → ArrayBuffer
     (WebKit 의 Blob 외부 파일화 회피). 한 번에 하나씩, 사이사이 쉬면서 —
     중간에 죽어도 안전: 옮긴 것만 표식이 바뀌고, 남은 건 다음 부팅에 이어서. */
  function migratePhotosToFiles() {
    const nativeFs = photoFsOk();
    try { if (localStorage.getItem(K_FSFLAG) === 'done') return Promise.resolve(0); } catch (e) {}
    return run((db) => reqp(db.transaction('photos').objectStore('photos').getAllKeys()))
      .then(async (keys) => {
        let moved = 0, left = 0;
        for (const id of (keys || [])) {
          let rec = null;
          try { rec = await getPhoto(id); } catch (e) { left++; continue; }
          // 이미 옮겨진 것(file/opfs/fullBuf)은 건너뛴다 — getPhoto 가 되살린 full 에 속지 말 것
          if (!rec || rec.file || rec.opfs || rec.fullBuf || !rec.full) continue;
          try {
            let slim;
            if (nativeFs) {
              await Native.photoWrite(id, rec.full);
              slim = { id: rec.id, thumb: rec.thumb, w: rec.w || 0, h: rec.h || 0,
                       createdAt: rec.createdAt || Date.now(), file: 1 };
            } else {
              slim = await webPhotoRec(
                { id: rec.id, w: rec.w || 0, h: rec.h || 0,
                  createdAt: rec.createdAt || Date.now() },
                { thumb: rec.thumb, full: rec.full });
            }
            await tx(['photos'], 'readwrite', (t) => { t.objectStore('photos').put(slim); });
            moved++;
          } catch (e) { console.warn('[photo migrate]', e); left++; }
          await new Promise((r) => setTimeout(r, 25));   // UI 양보
        }
        if (!left) { try { localStorage.setItem(K_FSFLAG, 'done'); } catch (e) {} }
        return moved;
      }).catch(() => 0);
  }

  /* 복원 — 사진 스토어도 같이 날아간 경우, 죽은 사진 id 가 남아 있으면
     사진 0장짜리 작업이 「완료」로 위장한다(isDone 이 개수만 본다 — 감사 지적).
     실존하는 사진 id 만 남기고 복원한다. info 를 주면 그걸(파일 백업 등), 없으면 localStorage 백업. */
  function restoreBackup(given) {
    const info = given || backupInfo() || bakInfo(K_BAK2);
    if (!info) return Promise.resolve(0);
    restoring = true;      // 이 동안 gc·mirror·서버 push 를 잠근다 (원본 삭제·부분상태 유출 차단)
    return run((db) => reqp(db.transaction('photos').objectStore('photos').getAllKeys()))
      .catch(() => [])
      .then(async (keys) => {
        const live = Object.create(null);
        (keys || []).forEach((k) => { live[k] = 1; });
        const canFs = photoFsOk();
        const revived = Object.create(null);

        // DB 는 죽었어도 원본이 파일(앱 데이터 or OPFS)로 살아 있으면 사진까지 되살린다 —
        // 썸네일을 다시 뽑아 레코드를 재생성. 파일도 없으면 그때만 목록에서 뺀다.
        const washAll = async (ids) => {
          const out = [];
          for (const id of (ids || [])) {
            if (live[id] || revived[id]) { out.push(id); continue; }
            try {
              const blob = canFs
                ? (global.Native && Native.photoRead ? await Native.photoRead(id) : null)
                : await opfsRead(id);
              if (blob) {
                // 유일하게 살아남은 원본이다 — **파일은 절대 다시 쓰지 않는다**(재기록 중
                // 끊기면 마지막 사본이 손상된다 + 재인코딩 화질 열화, 반대심문 확인).
                // 썸네일만 다시 뽑아 DB 레코드를 재생성한다.
                const img = await U.processImage(blob, { maxSide: 1600, thumbSide: 320, quality: 0.82 });
                const slim = { id: id, w: img.w, h: img.h, createdAt: uidTime(id) || Date.now() };
                if (canFs) {
                  slim.file = 1;
                  slim.thumb = img.thumb;
                } else {
                  slim.opfs = 1;
                  try {
                    slim.thumbBuf = await img.thumb.arrayBuffer();
                    slim.thumbType = img.thumb.type || 'image/jpeg';
                  } catch (e) { slim.thumb = img.thumb; }
                }
                await tx(['photos'], 'readwrite', (t) => { t.objectStore('photos').put(slim); });
                revived[id] = 1;
                out.push(id);
                continue;
              }
            } catch (e) { console.warn('[restore photo]', e); }
          }
          return out;
        };

        let n = 0;
        for (const t of (info.tasks || [])) {
          let c;
          try { c = JSON.parse(JSON.stringify(t)); } catch (e) { continue; }
          c.photos = await washAll(c.photos);
          if (c.sub) {
            for (const s of Spec.SUBS) {
              if (c.sub[s.key]) c.sub[s.key].photos = await washAll(c.sub[s.key].photos);
            }
          }
          try { await putTask(c); n++; } catch (e) {}
        }
        // 방통 기록도 같이 되살린다 — 사진은 파일로 살아남았으면 썸네일만 재생성
        for (const b of (info.bangs || [])) {
          let c;
          try { c = JSON.parse(JSON.stringify(b)); } catch (e) { continue; }
          c.photos = await washAll(c.photos);
          try { await putBang(c); } catch (e) {}
        }
        return n;
      })
      .then((n) => { restoring = false; mirrorSoon(); return n; },   // 다 끝난 뒤 완전한 상태를 한 번만 민다
            (e) => { restoring = false; throw e; });
  }

  global.Store = {
    open: open,
    putPhoto: putPhoto, getPhoto: getPhoto, getPhotos: getPhotos, deletePhotos: deletePhotos,
    fullBlob: fullBlob,
    putRecord: putRecord, getRecord: getRecord, allRecords: allRecords, deleteRecord: deleteRecord,
    putTodo: putTodo, todosOf: todosOf, deleteTodo: deleteTodo,
    putTask: putTask, tasksOf: tasksOf, getTask: getTask, deleteTask: deleteTask,
    allTasks: allTasks,
    putBang: putBang, bangsOf: bangsOf, allBangs: allBangs, getBang: getBang, deleteBang: deleteBang,
    normalizeSets: normalizeSets,
    taskCount: taskCount, backupInfo: backupInfo, backupNow: backupNow, fullSnapshot: fullSnapshot,
    backupDaily: backupDaily, restoreBackup: restoreBackup,
    backupToFileDaily: backupToFileDaily, fileBackupInfo: fileBackupInfo,
    mirrorInfo: mirrorInfo, mirrorSoon: mirrorSoon,
    migratePhotosToFiles: migratePhotosToFiles,
    gc: gc, estimate: estimate
  };
})(window);

;
/* ===== js/native.js ===== */
/* ============ native.js — Capacitor 네이티브 카메라 브리지 ============
   반환 규약
     null  : 네이티브 경로 없음 → 호출측이 <input type=file> 로 폴백
     []    : 사용자가 취소
     [File]: 정상
==================================================================== */
(function (global) {
  'use strict';

  function isNative() {
    const C = global.Capacitor;
    return !!(C && C.isNativePlatform && C.isNativePlatform());
  }
  function camera() {
    const C = global.Capacitor;
    if (!isNative() || !C.Plugins || !C.Plugins.Camera) return null;
    return C.Plugins.Camera;
  }
  /* 권한 거부와 사용자 취소는 반드시 구분해야 한다.
     Capacitor Camera 는 권한 거부 시 "User denied access to camera" 로 reject 하는데,
     이걸 취소로 처리하면 촬영 버튼이 아무 반응 없이 영영 죽는다. */
  function isPermissionDenied(e) {
    const m = String((e && (e.message || e.errorMessage)) || '');
    return /denied|permission|권한/i.test(m);
  }
  function isCancel(e) {
    const m = String((e && (e.message || e.errorMessage)) || '');
    if (isPermissionDenied(e)) return false;
    return /cancel|취소|dismiss|no image picked/i.test(m);
  }
  function warnPermission() {
    U.toast('카메라·사진 권한이 꺼져 있습니다\n설정 → 앱 → 권한에서 허용해 주세요', 4000);
  }

  async function uriToFile(path, name) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('사진 URI 로드 실패 ' + res.status);
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type || 'image/jpeg' });
  }

  /* 앱 소유 촬영 플러그인. 있으면 이걸 쓴다 —
     Capacitor Camera 는 안드로이드에서 렌즈를 못 고르고(셀카로 열린다),
     갤러리 원본을 본체에만 넣는다(본체가 금방 찬다). */
  function shotPlugin() {
    const C = global.Capacitor;
    return (isNative() && C && C.Plugins && C.Plugins.Shot) ? C.Plugins.Shot : null;
  }

  /* 사진 원본을 어디에 남길지. 기본은 SD — 본체가 먼저 찬다.
     ※ 앱 DB(축소본)는 항상 본체다. 앱 전용 저장소라 옮길 수 없다. */
  const PREF = 'gsc.gallery.v1';
  function galleryPref() {
    try { return (localStorage.getItem(PREF) === 'phone') ? 'phone' : 'sd'; }
    catch (e) { return 'sd'; }
  }
  function setGalleryPref(v) {
    try { localStorage.setItem(PREF, (v === 'phone') ? 'phone' : 'sd'); } catch (e) {}
  }

  /* WebView 는 file:// 를 직접 못 읽는다. Capacitor 가 /_capacitor_file_ 로 바꿔 준다.
     (Camera 플러그인이 path 말고 webPath 를 따로 주는 이유가 이것이다) */
  function webUrl(p) {
    const C = global.Capacitor;
    return (C && C.convertFileSrc) ? C.convertFileSrc(p) : p;
  }

  async function shoot() {
    const S = shotPlugin();
    if (S) {
      let r = null;
      try {
        r = await S.take({ prefer: galleryPref() });
      } catch (e) {
        if (isCancel(e)) return [];
        if (isPermissionDenied(e)) { warnPermission(); return []; }
        // 촬영을 시작조차 못 했다 → 아래 기본 경로로 물러선다
        console.warn('[native.shoot plugin]', e);
        r = null;
      }
      if (r) {
        if (r.cancelled || !r.path) return [];
        // SD 로 보내랬는데 본체로 갔으면 조용히 넘어가지 않는다
        if (galleryPref() === 'sd' && r.savedTo && r.savedTo !== 'SD카드') {
          U.toast('SD카드에 못 넣어 본체에 저장했습니다');
        }
        const name = 'shot_' + Date.now() + '.jpg';
        try {
          return [await uriToFile(webUrl(r.path), name)];
        } catch (e1) {
          try { return [await uriToFile(r.path, name)]; }   // 혹시 몰라 원본 경로도 한 번
          catch (e2) {
            // 이미 찍은 뒤다. 여기서 기본 카메라로 물러서면 카메라가 다시 열려
            // "찍었는데 사진이 안 붙는다"로 보인다. 알리고 끝낸다.
            console.warn('[native.shoot read]', e1, e2);
            U.toast('찍은 사진을 불러오지 못했습니다');
            return [];
          }
        }
      }
    }

    const Cam = camera();
    if (!Cam) return null;
    try {
      const p = await Cam.getPhoto({
        quality: 92, allowEditing: false, resultType: 'uri',
        source: 'CAMERA', correctOrientation: true,
        saveToGallery: true      // 원본은 폰 갤러리에도 남긴다(앱에는 1600px 축소본 저장)
      });
      const path = p.webPath || p.path;
      if (!path) return [];
      return [await uriToFile(path, 'shot_' + Date.now() + '.jpg')];
    } catch (e) {
      if (isCancel(e)) return [];
      if (isPermissionDenied(e)) { warnPermission(); return []; }
      // 네이티브 카메라는 있는데 실행이 깨진 경우. 파일피커를 다시 띄우면
      // "찍은 사진이 사라지고 피커가 또 뜨는" 것처럼 보이므로 알리고 끝낸다.
      console.warn('[native.shoot]', e);
      U.toast('사진을 불러오지 못했습니다');
      return [];
    }
  }

  async function pick() {
    const Cam = camera();
    if (!Cam) return null;
    try {
      if (Cam.pickImages) {
        const r = await Cam.pickImages({ quality: 92, limit: 0, correctOrientation: true });
        const photos = (r && r.photos) || [];
        if (!photos.length) return [];
        const out = [];
        let failed = 0;
        for (let i = 0; i < photos.length; i++) {
          const path = photos[i].webPath || photos[i].path;
          if (!path) { failed++; continue; }
          try { out.push(await uriToFile(path, 'pick_' + Date.now() + '_' + i + '.jpg')); }
          catch (e2) { console.warn('[native.pick item]', e2); failed++; }
        }
        // 고른 장수와 실제 가져온 장수가 다르면 조용히 넘어가지 않는다
        if (failed) U.toast(photos.length + '장 중 ' + failed + '장을 불러오지 못했습니다');
        return out;
      }
      const p = await Cam.getPhoto({ quality: 92, resultType: 'uri', source: 'PHOTOS', correctOrientation: true });
      const path = p.webPath || p.path;
      return path ? [await uriToFile(path, 'pick_' + Date.now() + '.jpg')] : [];
    } catch (e) {
      if (isCancel(e)) return [];
      if (isPermissionDenied(e)) { warnPermission(); return []; }
      console.warn('[native.pick]', e);
      U.toast('사진을 불러오지 못했습니다');
      return [];
    }
  }

  /* ---------- OCR 용: 파일 경로만 필요할 때 ----------
     OcrPlugin 은 네이티브 경로(file://…)를 받는다 — File 로 바꾸지 않는다. */
  async function shootPath() {
    const S = shotPlugin();
    if (S) {
      try {
        const r = await S.take({ prefer: galleryPref() });
        return (r && !r.cancelled && r.path) ? r.path : null;
      } catch (e) {
        if (isCancel(e)) return null;
        if (isPermissionDenied(e)) { warnPermission(); return null; }
        console.warn('[native.shootPath]', e);
      }
    }
    const Cam = camera();
    if (!Cam) return null;
    try {
      const p = await Cam.getPhoto({ quality: 92, resultType: 'uri',
        source: 'CAMERA', correctOrientation: true, saveToGallery: false });
      return p.path || null;
    } catch (e) {
      if (!isCancel(e) && isPermissionDenied(e)) warnPermission();
      return null;
    }
  }

  async function pickPath() {
    const Cam = camera();
    if (!Cam) return null;
    try {
      const p = await Cam.getPhoto({ quality: 92, resultType: 'uri',
        source: 'PHOTOS', correctOrientation: true });
      return p.path || null;
    } catch (e) { return null; }
  }

  /* ---------- 사진 파일 저장소 (데이터 증발 대책 P2) ----------
     사진 원본(full)을 IndexedDB 가 아니라 **앱 데이터 디렉터리의 파일**로 둔다.
     - IndexedDB 가 통째로 날아가는 사고(손상 후 재생성·할당량 축출)에서 원본이 산다
     - DB 용량이 수십 MB → 수백 KB 로 줄어 축출·손상 압박 자체가 준다
     웹(PWA)에는 Filesystem 이 없으므로 기존대로 IndexedDB 에 blob 을 둔다. */
  function fsPlugin() {
    const C = global.Capacitor;
    return (isNative() && C && C.Plugins && C.Plugins.Filesystem) ? C.Plugins.Filesystem : null;
  }

  function blobToB64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error || new Error('read fail'));
      r.readAsDataURL(blob);
    });
  }
  function b64ToBlob(b64, type) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type || 'image/jpeg' });
  }

  function photoFsOk() { return !!fsPlugin(); }

  async function photoWrite(id, blob) {
    const F = fsPlugin();
    if (!F) throw new Error('NOFS');
    await F.writeFile({ path: 'photos/' + id + '.jpg', directory: 'DATA',
                        data: await blobToB64(blob), recursive: true });
  }

  async function photoRead(id) {
    const F = fsPlugin();
    if (!F) return null;
    try {
      const r = await F.readFile({ path: 'photos/' + id + '.jpg', directory: 'DATA' });
      return (r && r.data) ? b64ToBlob(r.data) : null;
    } catch (e) { return null; }
  }

  /* 지우기는 최선 노력 — 파일이 없어도(구버전 사진) 조용히 넘어간다 */
  function photoRemove(ids) {
    const F = fsPlugin();
    if (!F) return;
    (ids || []).forEach((id) => {
      F.deleteFile({ path: 'photos/' + id + '.jpg', directory: 'DATA' }).catch(() => {});
    });
  }

  /* ---------- Preferences (SharedPreferences) ----------
     웹뷰가 관리하지 않는 저장 계층. 안드로이드 SharedPreferences 는 OS 가
     임시파일+fsync+rename(AtomicFile 패턴)으로 원자성을 보장한다(조사 확정) —
     작업 데이터의 상시 미러(진실 사본)를 여기에 둔다. */
  function prefPlugin() {
    const C = global.Capacitor;
    return (isNative() && C && C.Plugins && C.Plugins.Preferences) ? C.Plugins.Preferences : null;
  }
  function prefOk() { return !!prefPlugin(); }
  async function prefSet(key, value) {
    const P = prefPlugin();
    if (!P) return false;
    await P.set({ key: key, value: value });
    return true;
  }
  async function prefGet(key) {
    const P = prefPlugin();
    if (!P) return null;
    const r = await P.get({ key: key });
    return (r && r.value) || null;
  }

  /* ---------- 파일 백업 (데이터 증발 대책 P0) ----------
     작업 메타 JSON 을 IndexedDB·localStorage 와 **다른 계층**(파일)에 남긴다.
     1차: 앱 데이터(DATA/backup) — 항상 됨. IndexedDB 만 죽는 사고(진단된 원인)에서 생존.
     2차: 공용 문서(DOCUMENTS/공시체백업) — 되면 앱 삭제에서도 생존(권한에 따라 실패 가능, 최선 노력). */
  function backupOk() { return !!fsPlugin(); }

  /* writeFile 은 대상 파일을 **먼저 비우고** 쓴다 — 원자성이 없다(플러그인 소스로 확정).
     같은 이름에 바로 쓰면 쓰다 죽는 순간 멀쩡하던 백업까지 잃는다.
     임시 이름에 쓰고 rename(리눅스에서 원자 교체)으로 자리에 넣는다. */
  async function atomicWrite(F, dir, folder, name, text) {
    const tmp = folder + '.tmp-' + name;
    const fin = folder + name;
    await F.writeFile({ path: tmp, directory: dir, data: text, encoding: 'utf8', recursive: true });
    try {
      await F.rename({ from: tmp, to: fin, directory: dir, toDirectory: dir });
    } catch (e) {
      // 기존 파일 위 rename 을 거부하는 구현 대비 — 지우고 다시
      try { await F.deleteFile({ path: fin, directory: dir }); } catch (e2) {}
      await F.rename({ from: tmp, to: fin, directory: dir, toDirectory: dir });
    }
  }

  async function backupWrite(name, text) {
    const F = fsPlugin();
    if (!F) return false;
    let ok = false;
    try { await atomicWrite(F, 'DATA', 'backup/', name, text); ok = true; }
    catch (e) { console.warn('[backup DATA]', e); }
    try { await atomicWrite(F, 'DOCUMENTS', '공시체백업/', name, text); ok = true; }
    catch (e) { /* 공용 저장소는 기기·권한 따라 막힐 수 있다 — 1차가 있으니 조용히 */ }
    return ok;
  }

  const BAK_DIRS = [
    { path: 'backup', directory: 'DATA' },
    { path: '공시체백업', directory: 'DOCUMENTS' }
  ];

  /* 백업 파일 목록 — 이름에 날짜가 있어 이름 역순 = 최신순 */
  async function backupList() {
    const F = fsPlugin();
    if (!F) return [];
    const out = [];
    for (const d of BAK_DIRS) {
      try {
        const r = await F.readdir({ path: d.path, directory: d.directory });
        ((r && r.files) || []).forEach((f) => {
          const name = (typeof f === 'string') ? f : (f && f.name);
          if (name && /^gsc-\d{8}\.json$/.test(name)) {
            out.push({ name: name, path: d.path + '/' + name, directory: d.directory });
          }
        });
      } catch (e) {}
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }

  async function backupRead(entry) {
    const F = fsPlugin();
    if (!F || !entry) return null;
    try {
      const r = await F.readFile({ path: entry.path, directory: entry.directory, encoding: 'utf8' });
      return (r && r.data) || null;
    } catch (e) { return null; }
  }

  /* 디렉터리별로 최신 keep 개만 남긴다 */
  async function backupTrim(keep) {
    const F = fsPlugin();
    if (!F) return;
    const list = await backupList();
    const byDir = {};
    list.forEach((e) => { (byDir[e.directory] = byDir[e.directory] || []).push(e); });
    for (const dir of Object.keys(byDir)) {
      byDir[dir].slice(keep || 7).forEach((e) => {
        F.deleteFile({ path: e.path, directory: e.directory }).catch(() => {});
      });
    }
  }

  /* 본체/SD카드 여유 용량. [{label, free, total, removable}] */
  async function storage() {
    const C = global.Capacitor;
    const P = C && C.Plugins && C.Plugins.StorageInfo;
    if (P && isNative()) {
      try {
        const r = await P.get();
        const v = (r && r.volumes) || [];
        if (v.length) return v;
      } catch (e) { console.warn('[native.storage]', e); }
    }
    // 웹에서는 기기 용량을 알 수 없어 앱 할당량만 보여준다
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const e = await navigator.storage.estimate();
        if (e && e.quota) {
          return [{ label: '앱 저장소', free: Math.max(0, (e.quota || 0) - (e.usage || 0)),
                    total: e.quota, removable: false }];
        }
      } catch (e) {}
    }
    return [];
  }

  /* 현재 위치 {lat, lon}. 실패·거부·타임아웃이면 null (호출측이 조용히 폴백한다) */
  function geo(timeoutMs) {
    const ms = timeoutMs || 6000;
    const C = global.Capacitor;
    const P = C && C.Plugins && C.Plugins.Geolocation;

    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      // 플러그인이 응답을 안 줘도 홈이 멈추면 안 된다
      const timer = setTimeout(() => done(null), ms + 500);
      const ok = (lat, lon) => { clearTimeout(timer); done({ lat: lat, lon: lon }); };
      const fail = (e) => { clearTimeout(timer); if (e) console.warn('[native.geo]', e); done(null); };

      if (P && isNative()) {
        P.getCurrentPosition({ enableHighAccuracy: false, timeout: ms, maximumAge: 600000 })
          .then((p) => {
            const c = p && p.coords;
            if (c && isFinite(c.latitude) && isFinite(c.longitude)) ok(c.latitude, c.longitude);
            else fail(null);
          })
          .catch(fail);
        return;
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => ok(p.coords.latitude, p.coords.longitude),
          fail,
          { enableHighAccuracy: false, timeout: ms, maximumAge: 600000 }
        );
        return;
      }
      fail(null);
    });
  }

  global.Native = { isNative: isNative, shoot: shoot, pick: pick,
                    shootPath: shootPath, pickPath: pickPath,
                    storage: storage, geo: geo,
                    galleryPref: galleryPref, setGalleryPref: setGalleryPref,
                    photoFsOk: photoFsOk, photoWrite: photoWrite,
                    photoRead: photoRead, photoRemove: photoRemove,
                    prefOk: prefOk, prefSet: prefSet, prefGet: prefGet,
                    backupOk: backupOk, backupWrite: backupWrite,
                    backupList: backupList, backupRead: backupRead, backupTrim: backupTrim,
                    hasShot: function () { return !!shotPlugin(); } };
})(window);

;
/* ===== js/sync.js ===== */
/* ============ sync.js — 관리자 서버 실시간 백업 (beta) ============
   설계: 관리자프로그램_설계.md (v2).
   저장이 일어날 때마다(30초 디바운스) 작업 스냅숏 전체를 개인 PC 관리자 서버로 push 한다.
   실패는 유실이 아니라 지연이다 — 보류로 남겨 두고 60초마다 재시도한다(서버=PC 가 꺼져 있을 수 있다).
   서버 주소·토큰은 설정에서 넣는다(하드코딩 금지 — API 키 사고의 교훈, 설계 명시).
   본업은 이 기능 없이도 완전 동작한다 — 지하(오프라인)에선 그냥 보류만 쌓인다.
=================================================================== */
(function (global) {
  'use strict';

  const K_URL = 'gsc.sync.url.v1';
  const K_TOKEN = 'gsc.sync.token.v1';
  const K_LAST = 'gsc.sync.last.v1';        // 마지막 성공 시각(epoch)

  const DEBOUNCE = 30000;                   // 저장 후 30초 묶어서 한 번 (설계)
  const RETRY = 60000;                      // 실패 시 재시도 간격

  let timer = null;
  let retryTimer = null;
  let sending = false;
  let pending = false;                      // 보내야 하는데 아직 못 보냈다

  const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };

  function serverUrl() { return lsGet(K_URL).trim().replace(/\/+$/, ''); }
  function token() { return lsGet(K_TOKEN).trim(); }
  function isOn() { return !!(serverUrl() && token()); }
  function lastOk() { return +lsGet(K_LAST) || 0; }

  /* 네이티브면 CapacitorHttp — https 웹뷰에서 http(Tailscale IP) 를 부르는
     혼합 콘텐츠 차단을 우회한다(AI 호출과 같은 경로). 웹은 fetch. */
  async function call(method, path, body) {
    const full = serverUrl() + path;
    const headers = { 'Content-Type': 'application/json', 'X-Token': token() };
    const C = global.Capacitor;
    const H = C && C.Plugins && C.Plugins.CapacitorHttp;
    if (H && C.isNativePlatform && C.isNativePlatform()) {
      const r = await H.request({
        url: full, method: method, headers: headers,
        data: body || undefined, connectTimeout: 8000, readTimeout: 12000
      });
      if (!r || r.status < 200 || r.status >= 300) throw new Error('HTTP ' + (r && r.status));
      return (typeof r.data === 'string') ? JSON.parse(r.data || '{}') : (r.data || {});
    }
    const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
    try {
      const r = await fetch(full, {
        method: method, headers: headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { if (t) clearTimeout(t); }
  }

  /* 지금 상태 전체를 스냅숏으로 push. 최신 상태가 항상 이기므로 큐 대신
     "보류 플래그 + 보낼 때 다시 뜨기"로 충분하다(중간 상태는 서버가 이미 보존 중). */
  async function pushNow() {
    if (!isOn() || sending) return false;
    sending = true;
    try {
      const rows = await Store.allTasks();
      if (!rows.length) { pending = false; return false; }   // 빈 스냅숏은 안 보낸다(보존본 오염 방지)
      const snap = { at: Date.now(), day: U.dayKey(Date.now()), n: rows.length, tasks: rows };
      await call('POST', '/sync/backup', snap);
      pending = false;
      lsSet(K_LAST, String(Date.now()));
      clearTimeout(retryTimer);
      refreshRow();
      return true;
    } catch (e) {
      pending = true;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(pushNow, RETRY);   // PC 꺼짐 = 지연일 뿐 (설계)
      refreshRow();
      return false;
    } finally {
      sending = false;
    }
  }

  /* 저장 훅(store.js mirrorSoon)에서 부른다 — 디바운스로 묶는다 */
  function poke() {
    if (!isOn()) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(pushNow, DEBOUNCE);
    refreshRow();
  }

  /* 서버의 최신 스냅숏으로 복원 — 앱 복원 형식 그대로 내려온다 */
  async function restoreFromServer() {
    const info = await call('GET', '/sync/restore');
    if (!info || !Array.isArray(info.tasks) || !info.tasks.length) throw new Error('스냅숏 없음');
    return Store.restoreBackup(info);
  }

  /* ---------------- 설정 화면 (홈 설정 카드의 「서버 백업」 줄) ---------------- */
  function statusText() {
    if (!isOn()) return '꺼짐';
    if (pending) return '보류 중 — 서버 대기';
    const t = lastOk();
    if (!t) return '설정됨 · 아직 안 보냄';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return '방금 백업됨';
    if (m < 60) return m + '분 전 백업됨';
    if (m < 1440) return Math.round(m / 60) + '시간 전 백업됨';
    return Math.round(m / 1440) + '일 전 백업됨';
  }

  function refreshRow() {
    const el = U.$('#opt-sync-val');
    if (el) el.textContent = statusText();
  }

  function openSettings() {
    const items = [];
    items.push({
      label: serverUrl() ? '서버 주소 바꾸기' : '서버 주소 넣기',
      sub: serverUrl() || '예: http://100.64.0.10:8787 (Tailscale IP)',
      onPick: () => {
        const v = prompt('관리자 서버 주소', serverUrl() || 'http://');
        if (v === null) return;
        lsSet(K_URL, v.trim());
        refreshRow();
        if (isOn()) { poke(); U.toast('저장했습니다 — 곧 첫 백업을 보냅니다'); }
      }
    });
    items.push({
      label: token() ? '기기 토큰 바꾸기' : '기기 토큰 넣기',
      sub: token() ? '넣어져 있음' : '서버 콘솔/config.json 의 tk-…',
      onPick: () => {
        const v = prompt('기기 토큰 (tk-…)', token());
        if (v === null) return;
        lsSet(K_TOKEN, v.trim());
        refreshRow();
        if (isOn()) { poke(); U.toast('저장했습니다 — 곧 첫 백업을 보냅니다'); }
      }
    });
    if (isOn()) {
      items.push({ sep: true });
      items.push({
        label: '지금 백업 보내기', cls: 'strong',
        onPick: async () => {
          U.toast('백업 보내는 중…', 15000);
          const ok = await pushNow();
          U.toast(ok ? '서버에 백업했습니다' : '서버에 닿지 못했습니다 — 보류로 두고 재시도합니다', 3000);
        }
      });
      items.push({
        label: '서버에서 복원',
        sub: '서버가 보관한 최신 스냅숏을 이 폰에 되살립니다',
        onPick: () => {
          U.confirmSheet('서버의 최신 백업으로 복원할까요?\n같은 작업은 서버 내용으로 덮어씁니다', '복원', async () => {
            U.toast('복원 중…', 30000);
            try {
              const n = await restoreFromServer();
              U.toast('작업 ' + n + '건을 복원했습니다');
              try { Home.refresh(); } catch (e) {}
            } catch (e) {
              console.warn('[sync restore]', e);
              U.toast('복원하지 못했습니다 — 서버 연결을 확인하세요', 3000);
            }
          });
        }
      });
      items.push({ sep: true });
      items.push({
        label: '서버 백업 끄기', cls: 'danger',
        onPick: () => {
          lsDel(K_URL); lsDel(K_TOKEN);
          clearTimeout(timer); clearTimeout(retryTimer);
          pending = false;
          refreshRow();
          U.toast('서버 백업을 껐습니다 (폰 안 백업은 그대로 돕니다)');
        }
      });
    }
    U.sheet('서버 백업 (beta)', items);
  }

  function init() {
    const row = U.$('#opt-sync-row');
    if (row) row.addEventListener('click', openSettings);
    refreshRow();
    // 부팅·복귀 때 한 번씩 — 마지막 백업이 오래됐거나 보류가 남았으면 밀어 둔다
    if (isOn()) poke();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isOn() && pending) pushNow();
    });
  }

  global.Sync = {
    init: init, poke: poke, pushNow: pushNow,
    restoreFromServer: restoreFromServer,
    openSettings: openSettings, statusText: statusText, refreshRow: refreshRow,
    isOn: isOn
  };
})(window);

;
/* ===== js/share.js ===== */
/* ============ share.js — 내보내기 브리지 ============
   우선순위
     1) Capacitor(Share + Filesystem)  … APK 빌드 시 정식 경로
     2) Web Share API (파일 포함)      … 모바일 브라우저
     3) Web Share API (텍스트만)
     4) 다운로드 폴백                  … PC 브라우저
==================================================== */
(function (global) {
  'use strict';

  function cap() {
    const C = global.Capacitor;
    if (!C || !C.Plugins || !C.Plugins.Share) return null;
    // isNativePlatform 이 있으면 네이티브일 때만 사용한다 (웹에서는 Web Share 가 낫다)
    if (C.isNativePlatform && !C.isNativePlatform()) return null;
    return { Share: C.Plugins.Share, Filesystem: C.Plugins.Filesystem, isNative: true };
  }

  function canWebShareFiles(files) {
    try {
      return !!(navigator.canShare && navigator.share && files.length && navigator.canShare({ files: files }));
    } catch (e) { return false; }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const s = String(fr.result);
        const i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      fr.onerror = () => reject(fr.error || new Error('파일 인코딩 실패'));
      fr.readAsDataURL(blob);
    });
  }

  function blobsToFiles(blobs, baseName) {
    return blobs.map((b, i) => {
      const name = baseName + '_' + (i + 1) + '.jpg';
      try { return new File([b], name, { type: b.type || 'image/jpeg', lastModified: Date.now() }); }
      catch (e) { b.name = name; return b; }
    });
  }

  /* Capacitor 경로: 캐시에 파일을 쓰고 네이티브 공유 시트 호출 */
  async function shareViaCapacitor(c, blobs, baseName, text, title) {
    const uris = [];
    if (blobs.length) {
      if (!c.Filesystem) throw new Error('Filesystem 플러그인 없음');
      for (let i = 0; i < blobs.length; i++) {
        const data = await blobToBase64(blobs[i]);
        const path = 'share/' + baseName + '_' + (i + 1) + '.jpg';
        const res = await c.Filesystem.writeFile({
          path: path, data: data, directory: 'CACHE', recursive: true
        });
        uris.push(res.uri);
      }
    }
    const payload = { title: title || '공시체 기록', dialogTitle: '카카오톡 선택' };
    if (text) payload.text = text;
    if (uris.length) payload.files = uris;
    await c.Share.share(payload);
    return 'capacitor';
  }

  function clickDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // 크로미움은 한 탭에서 사용자 허가 없이 연속 다운로드를 자동 차단한다 — 클릭을 벌려(250ms)
  // 차단 확률을 낮추고, 여러 장이면 'download-multi' 를 돌려 호출부가 '성공'이 아니라
  // '차단될 수 있으니 확인하라'고 알리게 한다(반대심문 확인 — 조용한 성공 오보고 방지).
  async function downloadBlobs(blobs, baseName, text) {
    const multi = blobs.length + (text ? 1 : 0) > 1;
    for (let i = 0; i < blobs.length; i++) {
      clickDownload(blobs[i], baseName + '_' + (i + 1) + '.jpg');
      if (i < blobs.length - 1) await new Promise((r) => setTimeout(r, 250));
    }
    if (text) {   // 사진과 함께 내려받을 때도 메모를 버리지 않는다
      if (blobs.length) await new Promise((r) => setTimeout(r, 250));
      clickDownload(new Blob([text], { type: 'text/plain;charset=utf-8' }), baseName + '.txt');
    }
    return multi ? 'download-multi' : 'download';
  }

  /* 메인 진입점.
     opt = { blobs:[Blob], text:'', title:'', baseName:'' }
     반환: 'capacitor' | 'webshare' | 'webshare-text' | 'download' | 'cancel' */
  async function exportItems(opt) {
    const blobs = (opt.blobs || []).filter(Boolean);
    const text = opt.text || '';
    const baseName = U.safeName(opt.baseName, 'gongsiche');

    const c = cap();
    if (c) {
      try { return await shareViaCapacitor(c, blobs, baseName, text, opt.title); }
      catch (e) {
        if (isCancel(e)) return 'cancel';
        console.warn('[share] capacitor 실패', e);
        // 네이티브(WebView)에는 navigator.share 도 다운로드도 없다.
        // 여기서 웹 경로로 내려가면 아무 일도 안 일어나고 "저장했다"고 거짓 보고하게 된다.
        if (blobs.length) return 'fail';
      }
    }

    if (blobs.length) {
      const files = blobsToFiles(blobs, baseName);
      if (canWebShareFiles(files)) {
        try {
          const payload = { files: files, title: opt.title || '공시체 기록' };
          if (text) payload.text = text;
          await navigator.share(payload);
          return 'webshare';
        } catch (e) {
          if (isCancel(e)) return 'cancel';
          console.warn('[share] 파일 공유 실패 → 다운로드 폴백', e);
        }
      }
      return downloadBlobs(blobs, baseName, text);
    }

    if (text && navigator.share) {
      try { await navigator.share({ text: text, title: opt.title || '공시체 기록' }); return 'webshare-text'; }
      catch (e) { if (isCancel(e)) return 'cancel'; }
    }
    if (text) {
      const ok = await U.copyText(text);
      return ok ? 'copied' : downloadBlobs([], baseName, text);
    }
    return 'download';
  }

  function isCancel(e) {
    if (!e) return false;
    const n = e.name || '';
    const m = String(e.message || '');
    return n === 'AbortError' || /abort|cancel|취소|dismiss/i.test(m);
  }

  /* ---------------- ZIP 생성 (무압축 STORE — 외부 라이브러리 금지 방침) ----------------
     사진(JPEG)은 어차피 더 안 눌리므로 STORE 로 충분하다.
     파일명은 UTF-8 플래그(0x0800)를 세워 한글 폴더·이름이 어디서든 제대로 풀리게 한다. */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* entries: [{ name: '폴더/파일.jpg', data: Uint8Array }] → ZIP Blob */
  function makeZip(entries) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

    const parts = [];        // Blob 조각들 (본문)
    const centrals = [];     // 중앙 디렉터리 조각들
    let offset = 0;

    const u16 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255]);
    const u32 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);

    entries.forEach((e) => {
      const nameU8 = enc.encode(e.name);
      const data = e.data;
      const crc = crc32(data);
      // 로컬 파일 헤더
      const local = new Blob([
        u32(0x04034B50), u16(20), u16(0x0800), u16(0),      // sig, ver, UTF-8 플래그, STORE
        u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameU8.length), u16(0), nameU8
      ]);
      parts.push(local, data);
      // 중앙 디렉터리 항목
      centrals.push(new Blob([
        u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameU8.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), nameU8
      ]));
      offset += 30 + nameU8.length + data.length;
    });

    const centralBlob = new Blob(centrals);
    const eocd = new Blob([
      u32(0x06054B50), u16(0), u16(0),
      u16(entries.length), u16(entries.length),
      u32(centralBlob.size), u32(offset), u16(0)
    ]);
    return new Blob(parts.concat([centralBlob, eocd]), { type: 'application/zip' });
  }

  /* ---------------- 엑셀(.xlsx) 생성 ----------------
     xlsx = XML 몇 장을 담은 ZIP 이다 — makeZip 을 그대로 재활용해 라이브러리 없이 만든다.
     headers = 열 제목(작업 이름), cols = 열별 숫자 배열(위→아래). */
  function xmlEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function colRef(i) {          // 0→A, 25→Z, 26→AA …
    let s = ''; i++;
    while (i) { i--; s = String.fromCharCode(65 + (i % 26)) + s; i = (i / 26) | 0; }
    return s;
  }
  function makeXlsx(headers, cols) {
    const enc = new TextEncoder();
    let rows = '<row r="1">';
    headers.forEach((h, i) => {
      if (h === '' || h == null) return;        // 구분용 빈 열은 제목 셀을 안 만든다
      rows += '<c r="' + colRef(i) + '1" t="inlineStr"><is><t>' + xmlEsc(h) + '</t></is></c>';
    });
    rows += '</row>';
    const maxLen = cols.reduce((m, c) => Math.max(m, c.length), 0);
    for (let r = 0; r < maxLen; r++) {
      let row = '<row r="' + (r + 2) + '">';
      cols.forEach((c, i) => {
        if (c[r] != null) row += '<c r="' + colRef(i) + (r + 2) + '"><v>' + c[r] + '</v></c>';
      });
      rows += row + '</row>';
    }
    const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const sheet = XMLH +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData>' + rows + '</sheetData></worksheet>';
    const ct = XMLH +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>';
    const rels = XMLH +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
    const wb = XMLH +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="강도값" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const wbrels = XMLH +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>';
    return makeZip([
      { name: '[Content_Types].xml', data: enc.encode(ct) },
      { name: '_rels/.rels', data: enc.encode(rels) },
      { name: 'xl/workbook.xml', data: enc.encode(wb) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbrels) },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) }
    ]);
  }

  /* ZIP 해제 — makeZip 이 만든 무압축(STORE) ZIP 전용(백업 불러오기).
     중앙 디렉터리를 뒤에서부터 찾아 항목을 자른다. 압축(method≠0)은 다루지 않는다. */
  function parseZip(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    const dec = new TextDecoder();
    // EOCD(0x06054b50) 를 끝에서부터 찾는다 (코멘트 최대 64KB)
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65536); i--) {
      if (dv.getUint32(i, true) === 0x06054B50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP 형식이 아닙니다');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);           // 중앙 디렉터리 시작
    const out = [];
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014B50) break;
      const method = dv.getUint16(p + 10, true);
      const size = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const cmtLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (method === 0) {
        // 로컬 헤더의 이름·엑스트라 길이를 다시 읽어 데이터 시작점을 잡는다
        const ln = dv.getUint16(localOff + 26, true);
        const le = dv.getUint16(localOff + 28, true);
        const start = localOff + 30 + ln + le;
        out.push({ name: name, data: u8.subarray(start, start + size) });
      }
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return out;
  }

  /* 공유 시트로 파일 하나 보내기(카톡 등) — 사용자가 「공유」를 눌렀을 때만 쓴다 */
  async function shareFile(blob, name, title) {
    const c = cap();
    if (c) {
      try {
        if (!c.Filesystem) throw new Error('Filesystem 플러그인 없음');
        const data = await blobToBase64(blob);
        const res = await c.Filesystem.writeFile({
          path: 'share/' + name, data: data, directory: 'CACHE', recursive: true
        });
        await c.Share.share({ title: title || name, files: [res.uri], dialogTitle: '보낼 앱 선택' });
        return 'capacitor';
      } catch (e) {
        if (isCancel(e)) return 'cancel';
        console.warn('[share] file capacitor 실패', e);
        return 'fail';
      }
    }
    let file = null;
    try { file = new File([blob], name, { type: blob.type || 'application/zip' }); } catch (e) {}
    if (file && canWebShareFiles([file])) {
      try { await navigator.share({ files: [file], title: title || name }); return 'webshare'; }
      catch (e) { if (isCancel(e)) return 'cancel'; }
    }
    return downloadOne(blob, name);
  }

  function downloadOne(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'download';
  }

  /* 이름 붙은 파일 하나 내보내기(ZIP·백업).
     네이티브도 **공유 시트만** 연다(사용자 지시: 폰 용량이 빠듯해 문서 폴더 저장 금지 —
     공유용 임시 사본은 캐시라 OS 가 알아서 정리한다). 어디로 보낼지는 사용자가 시트에서 고른다. */
  async function exportFile(blob, name, title) {
    const c = cap();
    if (c) return shareFile(blob, name, title);
    let file = null;
    try { file = new File([blob], name, { type: blob.type || 'application/zip' }); } catch (e) {}
    if (file && canWebShareFiles([file])) {
      try { await navigator.share({ files: [file], title: title || name }); return 'webshare'; }
      catch (e) { if (isCancel(e)) return 'cancel'; }
    }
    return downloadOne(blob, name);
  }

  global.Share = {
    exportItems: exportItems,
    makeZip: makeZip, parseZip: parseZip, makeXlsx: makeXlsx,
    exportFile: exportFile, shareFile: shareFile,
    isNative: () => !!cap(),
    hasWebShare: () => !!(navigator.share)
  };
})(window);

;
/* ===== js/weather.js ===== */
/* ============ weather.js — 날씨 조회 · 캐시 · 안내 멘트 ============
   Open-Meteo (API 키 불필요, CORS 허용).
   현장 앱이므로 인터넷이 없어도 앱이 멈추면 안 된다 →
   마지막 성공값을 캐시해 두고 "n시간 전 기준"으로 보여준다.
================================================================ */
(function (global) {
  'use strict';

  const API = 'https://api.open-meteo.com/v1/forecast';
  const K_CACHE = 'gsc.weather.v1';
  const CACHE_V = 2;                    // 저장 형식 판. 낮으면 값이 있어도 새로 받는다
  const FRESH_MS = 30 * 60 * 1000;      // 30분 이내면 재조회 안 함
  const GEO_TIMEOUT = 6000;
  const AHEAD_H = 12;                   // 강수는 '지금부터 앞으로' 이만큼만 본다

  // GPS 를 못 쓸 때 쓰는 고정 위치
  const FALLBACK = { lat: 37.5033, lon: 126.9857, name: '구반포역' };

  /* ---------- WMO 날씨코드 ---------- */
  function codeInfo(c) {
    c = Number(c);
    if (c === 0) return { icon: 'wx-sun', text: '맑음' };
    if (c === 1) return { icon: 'wx-sun', text: '대체로 맑음' };
    if (c === 2) return { icon: 'wx-partly', text: '구름 조금' };
    if (c === 3) return { icon: 'wx-cloud', text: '흐림' };
    if (c === 45 || c === 48) return { icon: 'wx-fog', text: '안개' };
    if (c >= 51 && c <= 57) return { icon: 'wx-rain', text: '이슬비' };
    if (c >= 61 && c <= 67) return { icon: 'wx-rain', text: '비' };
    if (c >= 71 && c <= 77) return { icon: 'wx-snow', text: '눈' };
    if (c >= 80 && c <= 82) return { icon: 'wx-rain', text: '소나기' };
    if (c === 85 || c === 86) return { icon: 'wx-snow', text: '눈소나기' };
    if (c >= 95) return { icon: 'wx-thunder', text: '뇌우' };
    return { icon: 'wx-cloud', text: '흐림' };
  }

  /* ---------- 캐시 ---------- */
  function readCache() {
    try {
      const raw = localStorage.getItem(K_CACHE);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (!c || !c.data || typeof c.at !== 'number') return null;
      return c;
    } catch (e) { return null; }
  }
  function writeCache(c) {
    try { localStorage.setItem(K_CACHE, JSON.stringify(c)); } catch (e) {}
  }

  /* ---------- 위치 ---------- */
  async function locate() {
    try {
      const p = await Native.geo(GEO_TIMEOUT);
      if (p && isFinite(p.lat) && isFinite(p.lon)) {
        return { lat: p.lat, lon: p.lon, source: 'gps', name: '현재 위치' };
      }
    } catch (e) { /* 권한 거부는 오류가 아니다 — 조용히 폴백 */ }
    return { lat: FALLBACK.lat, lon: FALLBACK.lon, source: 'fallback', name: FALLBACK.name };
  }

  /* ---------- 조회 ---------- */
  function buildUrl(lat, lon) {
    return API +
      '?latitude=' + encodeURIComponent(lat) +
      '&longitude=' + encodeURIComponent(lon) +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m' +
      '&hourly=precipitation_probability,precipitation' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=auto&forecast_days=2';
  }

  /* 'YYYY-MM-DDTHH:00' — Open-Meteo 가 timezone=auto 로 주는 형식과 같게 만든다.
     new Date(문자열) 로 파싱하면 브라우저에 따라 UTC 로 읽혀 시간이 어긋나므로
     문자열끼리 비교한다(ISO 라 사전순 비교가 곧 시간순 비교다). */
  function hourKey(d) {
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate()) +
           'T' + U.pad2(d.getHours()) + ':00';
  }

  /* 앞으로 AHEAD_H 시간 안의 강수 전망.
     ※ 예전엔 daily 의 precipitation_probability_max 를 그대로 썼는데, 그건
        자정부터 자정까지의 최댓값이라 이미 지나간 비까지 포함한다.
        (실제로 오후 3시에 "강수확률 98%" 가 떴는데 그 98% 는 정오 값이었다) */
  function outlook(j, now) {
    const h = j.hourly || {};
    const times = h.time || [];
    const probs = h.precipitation_probability || [];
    if (!times.length) return { pop: null, popAt: null };

    // 현재 시각 이후 첫 칸을 찾는다(ISO 문자열이라 사전순 비교가 곧 시간순)
    const key = hourKey(now || new Date());
    let i = 0;
    while (i < times.length && times[i] < key) i++;
    if (i >= times.length) return { pop: null, popAt: null };

    // 같은 확률이면 이른 시각을 남긴다 — 알고 싶은 건 "언제부터"다
    let pop = null, popAt = null;
    for (let k = i; k < times.length && k < i + AHEAD_H; k++) {
      const p = probs[k];
      if (typeof p !== 'number' || !isFinite(p)) continue;
      if (pop === null || p > pop) { pop = p; popAt = times[k]; }
    }
    return { pop: pop, popAt: popAt };
  }

  function shape(j, now) {
    const c = j.current || {};
    const d = j.daily || {};
    const at = (a) => (Array.isArray(a) && a.length ? a[0] : null);
    const o = outlook(j, now);
    return {
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      precip: c.precipitation,
      code: c.weather_code,
      wind: c.wind_speed_10m,
      tmax: at(d.temperature_2m_max),
      tmin: at(d.temperature_2m_min),
      pop: o.pop,          // 지금부터 AHEAD_H 시간 안의 최대 강수확률
      popAt: o.popAt,      // 그 확률이 걸린 시각 ('YYYY-MM-DDTHH:00')
      dayCode: at(d.weather_code)
    };
  }

  /* force=true 면 캐시를 무시하고 새로 가져온다.
     반환: { data, at, source, name, stale:boolean } | null */
  async function get(force) {
    const cache = readCache();
    // 판이 낮은 캐시(구버전 강수확률)는 신선해도 안 쓴다.
    // 단, 아래 catch 에서 오프라인 대비용으로는 여전히 쓴다 — 그 불변식은 지킨다.
    const usable = cache && cache.v === CACHE_V;
    if (!force && usable && (Date.now() - cache.at) < FRESH_MS) {
      return { data: cache.data, at: cache.at, source: cache.source, name: cache.name, stale: false };
    }

    const loc = await locate();
    // 타임아웃이 없으면 TCP 는 붙었는데 응답이 안 오는 구간(캡티브 포털·신호 미약)에서 fetch 가
    // 무기한 pending 되어 오프라인 캐시 폴백조차 안 뜬다(반대심문 확인). 8초로 끊는다.
    const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    const killer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    try {
      const res = await fetch(buildUrl(loc.lat, loc.lon),
        { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const data = shape(j);
      if (typeof data.temp !== 'number') throw new Error('기온 없음');
      const next = { v: CACHE_V, at: Date.now(), lat: loc.lat, lon: loc.lon,
                     source: loc.source, name: loc.name, data: data };
      writeCache(next);
      return { data: data, at: next.at, source: loc.source, name: loc.name, stale: false };
    } catch (e) {
      console.warn('[weather]', e);
      if (cache) {   // 실패해도 캐시로 「n시간 전 기준(오프라인)」을 보여준다 — 이 불변식은 지킨다
        return { data: cache.data, at: cache.at, source: cache.source,
                 name: cache.name, stale: true };
      }
      return null;
    } finally {
      if (killer) clearTimeout(killer);
    }
  }

  /* ---------- 안내 멘트 ----------
     콘크리트 얘기가 아니라 '오늘 나가는 사람'을 위한 한마디.
     우선순위대로 검사해 최대 2개. */
  const RULES = [
    { level: 'warn', text: '폭염입니다 — 그늘에서 자주 쉬고 물을 챙기세요',
      hit: (w) => num(w.feels) >= 33 },
    { level: 'warn', text: '많이 춥습니다 — 방한 장비 단단히 챙기세요',
      hit: (w) => num(w.temp) < 0 },
    { level: 'warn', text: '바람이 강합니다 — 모자나 가벼운 물건 날아가지 않게 조심하세요',
      hit: (w) => num(w.wind) >= 10 },
    { level: 'care', text: '쌀쌀합니다 — 겉옷 챙기세요',
      hit: (w) => num(w.temp) <= 4 },
    { level: 'care', text: (w, now) => rainText(w, now),
      hit: (w) => num(w.pop) >= 60 || num(w.precip) > 0 },
    { level: 'care', text: '햇빛이 강합니다 — 선글라스와 자외선 차단제를 준비하세요',
      hit: (w) => (Number(w.code) === 0 || Number(w.code) === 1) && num(w.tmax) >= 25 },
    { level: 'care', text: '더운 하루입니다 — 물 넉넉히 챙기세요',
      hit: (w) => num(w.tmax) >= 30 },
    { level: 'info', text: '일교차가 큽니다 — 겉옷 하나 챙기세요',
      hit: (w) => (num(w.tmax) - num(w.tmin)) >= 10 },
    { level: 'info', text: '습합니다 — 수분 자주 보충하세요',
      hit: (w) => num(w.humidity) >= 90 && num(w.temp) >= 25 }
  ];

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : NaN; }

  /* "언제 오는지"까지 말해 준다. 그냥 '비 소식'만 띄우면
     이미 지나간 비인지 앞으로 올 비인지 알 수 없다. */
  function rainText(w, now) {
    if (num(w.precip) > 0) return '지금 비가 옵니다 — 우산 챙기세요';
    const at = w.popAt;
    if (!at || at.length < 13) return '비 소식이 있습니다 — 우산 챙기세요';
    now = now || new Date();
    const hh = Number(at.slice(11, 13));
    const today = at.slice(0, 10) === hourKey(now).slice(0, 10);
    if (today && hh - now.getHours() <= 1) return '곧 비 소식 — 우산 챙기세요';
    return (today ? '' : '내일 ') + hh + '시쯤 비 소식 — 우산 챙기세요';
  }

  function advice(w, now) {
    if (!w) return [];
    const out = [];
    for (let i = 0; i < RULES.length && out.length < 2; i++) {
      let hit = false;
      try { hit = !!RULES[i].hit(w); } catch (e) {}
      if (!hit) continue;
      let text = RULES[i].text;
      if (typeof text === 'function') {
        try { text = text(w, now); } catch (e) { text = ''; }
      }
      if (text) out.push({ level: RULES[i].level, text: text });
    }
    if (!out.length) out.push({ level: 'info', text: '오늘도 안전하게 다녀오세요' });
    return out;
  }

  /* "방금 전" / "3시간 전" */
  function ago(ts) {
    const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (m < 2) return '방금 전';
    if (m < 60) return m + '분 전';
    const h = Math.floor(m / 60);
    if (h < 24) return h + '시간 전';
    return Math.floor(h / 24) + '일 전';
  }

  /* 네트워크를 건드리지 않고 마지막으로 받아 둔 값만 본다(AI 문맥용) */
  function cached() {
    const c = readCache();
    return c ? { data: c.data, at: c.at, name: c.name } : null;
  }

  global.Weather = {
    get: get, advice: advice, codeInfo: codeInfo, ago: ago, cached: cached,
    FALLBACK: FALLBACK,
    _rules: RULES, _shape: shape          // 테스트용
  };
})(window);

;
/* ===== js/spec.js ===== */
/* ============ spec.js — 공시체 재령 · 휴일 규칙 ============
   재령(타설일로부터 며칠 뒤에 깨는가) 기준 분류.

   휴일 규칙
     - 일요일은 무조건 휴무. 일요일에 깨야 할 공시체는 월요일에 깬다.
       → 월요일 화면에는 "월요일 몫 + 전날 일요일 몫"이 함께 뜬다.
     - 토요일은 출근할 수도, 안 할 수도 있어 고정 규칙을 두지 않는다(정상 근무일로 취급).
========================================================== */
(function (global) {
  'use strict';

  /* 재령 순서대로.
     28일짜리는 수중·봉함을 **한 번에 같이 뽑는 한 세트**라 분류를 하나로 둔다.
     타설일·시험일·동·감리가 같고 양생 방법만 다르므로, 한 작업 안에서
     수중 칸 / 봉함 칸으로 나눠 사진과 계산을 따로 담는다(SUBS). */
  const SPECS = [
    { key: 'vert',   name: '수직', age: 1,  note: '' },
    { key: 'horiz',  name: '수평', age: 3,  note: '' },
    { key: 'filler', name: '필러', age: 10, note: '' },
    { key: 'd28',    name: '28일', age: 28, note: '수중·봉함', sub: true }
  ];

  /* 28일 작업 안의 두 칸. 순서가 화면 순서다. */
  const SUBS = [
    { key: 'water', name: '수중', note: '수중양생' },
    { key: 'seal',  name: '봉함', note: '봉함양생' }
  ];

  /* 구버전 작업이 쓰던 분류. 칩으로는 안 보이지만 읽을 수는 있어야 한다.
     (Store 가 28일 작업으로 옮겨 주지만, 못 옮긴 것도 화면에 떠야 한다) */
  const LEGACY = [
    { key: 'water', name: '수중', age: 28, note: '수중양생', legacy: true },
    { key: 'seal',  name: '봉함', age: 28, note: '봉함양생', legacy: true }
  ];

  function byKey(k) {
    for (let i = 0; i < SPECS.length; i++) if (SPECS[i].key === k) return SPECS[i];
    for (let i = 0; i < LEGACY.length; i++) if (LEGACY[i].key === k) return LEGACY[i];
    return null;
  }

  function subByKey(k) {
    for (let i = 0; i < SUBS.length; i++) if (SUBS[i].key === k) return SUBS[i];
    return null;
  }

  /* 이 분류가 수중/봉함 칸을 갖는가 */
  function hasSubs(k) {
    const s = byKey(k);
    return !!(s && s.sub);
  }

  /* ---------- 날짜 유틸 (시:분 무시, 로컬 자정 기준) ---------- */
  function atMidnight(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function addDays(d, n) {
    const x = atMidnight(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function sameDay(a, b) { return U.dayKey(atMidnight(a).getTime()) === U.dayKey(atMidnight(b).getTime()); }

  const isSunday = (d) => atMidnight(d).getDay() === 0;
  const isHoliday = isSunday;          // 지금은 일요일만. 공휴일을 넣으려면 여기에.

  /* 시험일이 휴일이면 다음 근무일로 민다 */
  function shiftToWorkday(d) {
    let x = atMidnight(d);
    while (isHoliday(x)) x = addDays(x, 1);
    return x;
  }

  /* 타설일 + 재령 = 실제 시험일 (휴일 보정 포함) */
  function testDayOf(castDay, age) {
    return shiftToWorkday(addDays(castDay, age));
  }

  /* 기준일에 실제로 깨는 공시체 목록.
     반환 { holiday, items:[{ spec, castDay, testDay, deferred }] }
     deferred = 원래 일요일에 깼어야 하는데 밀려온 것 */
  function dueOn(base) {
    const day = atMidnight(base);
    if (isHoliday(day)) return { holiday: true, items: [] };

    // 오늘 처리하는 "원래 시험일" 후보: 오늘 + (바로 앞의 연속된 휴일들)
    const sources = [{ d: day, deferred: false }];
    let p = addDays(day, -1);
    while (isHoliday(p)) {
      sources.push({ d: p, deferred: true });
      p = addDays(p, -1);
    }

    const items = [];
    sources.forEach((s) => {
      SPECS.forEach((spec) => {
        items.push({
          spec: spec,
          castDay: addDays(s.d, -spec.age),
          testDay: s.d,
          deferred: s.deferred
        });
      });
    });
    return { holiday: false, items: items };
  }

  /* 분류를 고르면 기본 타설일이 나온다 (기준일에 깨는 것으로 역산).
     실제로는 3일 강도를 이틀차에 깨기도 하므로 화면에서 조정 가능해야 한다. */
  function defaultCastDay(specKey, testDay) {
    const s = byKey(specKey);
    if (!s) return atMidnight(testDay);
    return addDays(testDay, -s.age);
  }

  /* 'M/D' — 내보내기 텍스트용 (요일 없이) */
  function md(d) {
    if (!d) return '';
    const x = (typeof d === 'string') ? new Date(d + 'T00:00:00') : atMidnight(d);
    if (isNaN(x)) return '';
    return (x.getMonth() + 1) + '/' + x.getDate();
  }

  /* 'M/D(요일)' */
  function shortDate(d) {
    const x = atMidnight(d);
    const w = ['일', '월', '화', '수', '목', '금', '토'][x.getDay()];
    return (x.getMonth() + 1) + '/' + x.getDate() + '(' + w + ')';
  }

  global.Spec = {
    SPECS: SPECS, SUBS: SUBS, byKey: byKey, subByKey: subByKey, hasSubs: hasSubs,
    isHoliday: isHoliday, isSunday: isSunday,
    atMidnight: atMidnight, addDays: addDays, sameDay: sameDay,
    shiftToWorkday: shiftToWorkday, testDayOf: testDayOf,
    dueOn: dueOn, defaultCastDay: defaultCastDay, shortDate: shortDate, md: md
  };
})(window);

;
/* ===== js/ocr.js ===== */
/* ============ ocr.js — 온디바이스 OCR (beta) ============
   엔진: 앱 소유 OcrPlugin(ML Kit 한국어 번들형) — 인터넷 없이 첫 실행부터 된다.
   여기엔 엔진 파사드와 **순수 파서 둘**만 둔다(화면은 ocrui.js).
   파서를 순수 함수로 둔 이유: 브라우저에서 좌표 픽스처로 검증하기 위함.

   ① parseSchedule — 시험 일정표(인쇄 표) 사진 → 작업 후보
      한 행에서 타설일·시험일·동·재령을 뽑는다. 중복은 하나로 접는다.
   ② parseBoard — 시험 성적판(화이트보드) 사진 → 강도값 후보
      시험결과 9칸의 소수 값만 뽑고, 평균·보정평균 칸은 위치로 거른다.
========================================================= */
(function (global) {
  'use strict';

  /* ---------------- 엔진 ---------------- */
  function plugin() {
    const C = global.Capacitor;
    return (C && C.isNativePlatform && C.isNativePlatform() &&
            C.Plugins && C.Plugins.Ocr) ? C.Plugins.Ocr : null;
  }

  function available() { return !!plugin(); }

  /* path(file://…) → { lines:[{text,x,y,w,h}], width, height } */
  async function read(path) {
    const P = plugin();
    if (!P) throw new Error('NOOCR');
    const r = await P.read({ path: path });
    return {
      lines: ((r && r.lines) || []).filter((l) => l && l.text),
      width: (r && r.width) || 0,
      height: (r && r.height) || 0
    };
  }

  /* ---------------- 공통: 줄 → 행 묶기 ----------------
     ML Kit 은 표 한 행을 여러 줄 조각으로 쪼개 온다.
     세로 중심이 비슷한 조각끼리 한 행으로 본다. */
  function clusterRows(lines) {
    const ls = lines.filter((l) => l.text && l.h > 0);
    if (!ls.length) return [];
    const hs = ls.map((l) => l.h).sort((a, b) => a - b);
    const medH = hs[Math.floor(hs.length / 2)] || 10;
    const tol = medH * 0.7;

    const sorted = ls.slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
    const rows = [];
    sorted.forEach((l) => {
      const cy = l.y + l.h / 2;
      const last = rows[rows.length - 1];
      if (last && Math.abs(cy - last.cy) <= tol) {
        last.items.push(l);
        last.cy = (last.cy * (last.items.length - 1) + cy) / last.items.length;
      } else {
        rows.push({ cy: cy, items: [l] });
      }
    });
    // 행 안에서는 왼→오른
    rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
    return rows.map((r) => r.items);
  }

  /* ---------------- ① 일정표 → 작업 후보 ---------------- */
  const AGE2SPEC = { 1: 'vert', 3: 'horiz', 10: 'filler', 28: 'd28' };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function datesIn(text) {
    // 2026-07-09 · 2026.7.9 · 2026/07/09 · 2026년 7월 9일
    const out = [];
    const re = /(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/g;
    let m;
    while ((m = re.exec(text))) {
      const mo = +m[2], d = +m[3];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        out.push(m[1] + '-' + pad2(mo) + '-' + pad2(d));
      }
    }
    return out;
  }

  /* lines → { items:[{dong,specKey,age,castDay,testDay,derived,offAge}], rows } */
  function parseSchedule(lines) {
    const rows = clusterRows(lines);
    const seen = Object.create(null);
    const items = [];

    rows.forEach((row) => {
      const text = row.map((l) => l.text).join('  ');
      const dates = datesIn(text);
      // 날짜를 지우고 나서 재령을 찾는다 — "…-07-09" 꼬리가 "9일" 로 오독되는 걸 막는다
      const rest = text.replace(/(20\d{2})\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}\s*일?/g, ' ');
      // 동은 여러 개일 수 있다 — "218동,208동,219동" (동 칸 하나에 나열).
      // 연이은 「N동」 무리를 통째로 잡는다. 위치 칸이 같은 동을 되풀이해도 중복 제거로 접힌다.
      let dong = '', dongMain = '', hasSpecial = false;
      const dm = rest.match(/(\d{2,3})\s*동(?:\s*[,，·]?\s*\d{2,3}\s*동)*/);
      if (dm) {
        const uniq = [];
        (dm[0].match(/\d{2,3}(?=\s*동)/g) || []).forEach((d) => {
          if (uniq.indexOf(d) < 0) uniq.push(d);
        });
        if (!uniq.length) return;
        dong = uniq.map((d) => d + '동').join(', ');
        dongMain = uniq[0] + '동';            // 담당 감리는 첫 동 기준(사용자 지시)
        // "215동 특화동"은 본동과 다른 구역이다 — 같은 날 215동 본동과 한 작업으로 접히면 안 된다
        if (uniq.length === 1 && new RegExp(uniq[0] + '\\s*동\\s*특화동').test(rest)) {
          dong = dongMain + ' 특화동';
        } else if (uniq.length > 1 && /특화동/.test(rest)) {
          // 다중동 행에 특화동이 섞였다 — 어느 동인지 확정할 수 없다. 자동 감리 배정을 막고
          // 미리보기에서 사람이 잡게 표식만 남긴다(본동 감리로 잘못 배정되던 구멍, 반대심문 확인).
          hasSpecial = true;
        }
      } else {
        // 「A9」 같은 블록명(영문+숫자) — 동 칸이 숫자동이 아닌 단지가 있다(실측 양식)
        const bm = rest.match(/(?:^|[^A-Za-z0-9가-힣])([A-Z]{1,2}\d{1,3})(?![A-Za-z0-9])/);
        if (!bm) return;
        dong = dongMain = bm[1];
      }
      if (!dates.length) return;

      // 「탈형(기타)」 행은 작업으로 만들지 않는다(사용자 지시 — 무시)
      if (/탈형/.test(rest)) return;

      const am = rest.match(/(?:^|[^\dF.\-])(\d{1,2})\s*일/);   // "28F바닥" 의 F 뒤는 제외
      let age = am ? +am[1] : null;
      let specKey = (age != null) ? AGE2SPEC[age] : null;
      if (am && !specKey) return;                 // 재령이 적혀 있는데 모르는 값 — 만들지 않는다

      dates.sort();
      let castDay = dates[0];
      let testDay = dates[dates.length - 1];
      let derived = false;

      if (!am) {
        // 재령 칸이 아예 없는 양식(필러 일정표 실측 — 날짜 두 칸이 둘 다 타설일이라 같다).
        // 날짜 간격으로만 판정하고, 그 밖의 간격은 만들지 않는다(모르는 건 안 만든다).
        const gap = Math.round((new Date(testDay) - new Date(castDay)) / 86400000);
        if (gap === 0) age = 10;                       // 같은 날짜 = 필러 양식
        else if (gap === 10 || gap === 11) age = 10;   // 일요일 이월 +1 허용
        else if (gap === 28 || gap === 29) age = 28;   // 28일 표에서 재령 칸만 놓친 행
        else return;
        specKey = AGE2SPEC[age];
      }

      if (castDay === testDay) {
        // 날짜가 하나(또는 같은 날짜 두 번 — 필러 양식)면 타설일로 보고 시험일을 규칙으로 만든다
        const t = Spec.testDayOf(new Date(castDay + 'T00:00:00'), age);
        testDay = U.dayKey(t.getTime());
        derived = true;
      }
      // 재령과 날짜 차이가 크게 어긋나면 표기 — 막지는 않는다(미리보기에서 사람이 본다)
      const diff = Math.round((new Date(testDay) - new Date(castDay)) / 86400000);
      const offAge = Math.abs(diff - age) > 3;

      const key = dong + '|' + specKey + '|' + castDay + '|' + testDay;
      if (seen[key]) return;                      // 같은 것이 여러 줄이면 하나만
      seen[key] = 1;
      items.push({ dong: dong, dongMain: dongMain, specKey: specKey, age: age,
                   castDay: castDay, testDay: testDay,
                   derived: derived, offAge: offAge, hasSpecial: hasSpecial });
    });

    return { items: items, rows: rows.length };
  }

  /* ---------------- ② 성적판 → 강도값 후보 ---------------- */
  /* lines → { values:[Number], excluded } — 값 순서는 판에 적힌 순서(행 우선)
     매직 손글씨 실측(갤럭시 A55, 실제 성적판)에서 나온 오독을 되살린다:
       "42,1|" → 42.11   (세로획을 | 나 l 로 읽음 → 1 로 교정)
       "4403"  → 44.03   (소수점 유실 — 4자리 통짜는 XX.YY 로 본다)
       "42 69" → 42.69   (소수점이 공백으로)
     복원은 그 줄이 통째로 숫자일 때만 한다 — "2024 년…" 같은 날짜 줄은 안 건드린다. */
  function parseBoard(lines, imgW) {
    // 평균 라벨 왼쪽부터 오른쪽 열 전체(평균·보정평균 칸)는 강도값이 아니다.
    // 여유는 **라벨 폭 기준**으로 잡는다 — 이미지 폭 기준이면 판이 프레임에 작게
    // 나온 사진에서 여유가 판보다 커져 3열 실값까지 잘려 나간다(실측).
    // 실측: 「평균」이 「평군」으로 읽히기도 한다 — 두 글자 다 받는다.
    const avgLine = lines.find((l) => /평\s*[균군]/.test(l.text));
    let cutoff = Infinity;
    if (avgLine) cutoff = avgLine.x - (avgLine.w || 30) * 0.5;

    const cands = [];
    let excluded = 0;
    const push = (v, l) => {
      if (!(v >= 3 && v <= 99.99)) { excluded++; return; }        // 0.97(보정계수) 등
      if (/평\s*[균군]/.test(l.text)) { excluded++; return; }          // 평균 줄에 붙은 값
      const cx = l.x + (l.w || 0) / 2;
      if (cx >= cutoff) { excluded++; return; }                    // 평균 열(보정평균)
      cands.push({ v: v, x: l.x, y: l.y, h: l.h || 10, w: l.w || 0 });
    };

    // 날짜(타설일/시험일)가 강도값으로 새는 걸 막는다 — "2026.08.16"→"26.08",
    // "0709"→"07.09" 로 오인식되던 실측 누출(반대심문 확인).
    const DATE_SUB = /(20\d{2})\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]?\s*\d{1,2}\s*일?/g;
    const DATE_HINT = /20\d{2}\s*[.\-/년]|타\s*설|시\s*험|일\s*자|월\s*일/;
    lines.forEach((l) => {
      const dateLine = DATE_HINT.test(l.text);
      // 손글씨 1 의 흔한 오독(|·l→1) + 연도 붙은 날짜 구간 제거
      const txt = l.text.replace(DATE_SUB, ' ').replace(/[|l]/g, '1');
      const re = /(\d{1,2})\s*[.,]\s*(\d{2})(?!\d)/g;
      let m, hit = false;
      while ((m = re.exec(txt))) { hit = true; push(parseFloat(m[1] + '.' + m[2]), l); }
      if (hit) return;
      if (dateLine) return;                              // 날짜 줄에선 통짜 복원을 하지 않는다
      // 소수점이 사라진 줄 — 통째로 숫자일 때만 되살린다
      const whole = txt.trim();
      let w4 = whole.match(/^(\d{2})(\d{2})$/);          // "4403"
      if (!w4) w4 = whole.match(/^(\d{1,2})\s+(\d{2})$/); // "42 69"
      // 앞자리가 0 으로 시작하는 4자리("0709")는 강도값이 아니라 MMDD 날짜다 — 뺀다
      if (w4 && w4[1].length === 2 && w4[1][0] === '0') { excluded++; return; }
      if (w4) push(parseFloat(w4[1] + '.' + w4[2]), l);
    });

    // 판에 적힌 순서로 — 행(위→아래) 우선, 행 안에서 왼→오른
    const rows = clusterRows(cands.map((c) => ({ text: String(c.v), x: c.x, y: c.y, w: c.w, h: c.h, v: c.v })));
    const values = [];
    rows.forEach((row) => row.forEach((l) => values.push(l.v)));

    return { values: values, excluded: excluded };
  }

  /* 잘라·키운 이미지(base64)를 읽는다 — 2패스용 */
  async function readData(b64) {
    const P = plugin();
    if (!P) throw new Error('NOOCR');
    const r = await P.readData({ base64: b64 });
    return {
      lines: ((r && r.lines) || []).filter((l) => l && l.text),
      width: (r && r.width) || 0,
      height: (r && r.height) || 0
    };
  }

  /* 네이티브 경로의 사진을 캔버스로 불러온다 (WebView 는 file:// 직접 못 읽는다) */
  async function loadBitmap(path) {
    const C = global.Capacitor;
    const url = (C && C.convertFileSrc) ? C.convertFileSrc(path) : path;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return createImageBitmap(await res.blob());
  }

  /* 업로드용 JPEG base64 (Gemini 경로) — 긴 변 maxSide 로 줄인다 */
  async function pathToJpegB64(path, maxSide) {
    const bm = await loadBitmap(path);
    const scale = Math.min(1, (maxSide || 1800) / Math.max(bm.width, bm.height));
    const w = Math.max(1, Math.round(bm.width * scale));
    const h = Math.max(1, Math.round(bm.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bm, 0, 0, w, h);
    bm.close && bm.close();
    const u = cv.toDataURL('image/jpeg', 0.85);
    return u.slice(u.indexOf(',') + 1);
  }

  /* ---------------- 성적판 2패스 ----------------
     1패스로 숫자들이 모여 있는 영역을 찾고, 그 영역만 잘라 키우고
     흑백·대비를 올려 다시 읽는다. 판이 프레임에 작게 나온 사진에서
     손글씨 인식률이 올라간다(실측 기반). 값이 더 많이 나온 패스를 쓴다. */
  async function readBoardSmart(path) {
    const pass1 = await read(path);
    const r1 = parseBoard(pass1.lines, pass1.width);

    // 숫자 영역 추정: 숫자꼴 줄 + 평균 라벨
    const anchors = pass1.lines.filter((l) => {
      const t = l.text.trim();
      if (/평\s*[균군]/.test(t)) return true;
      return /^[\d\s.,|lIT]+$/.test(t) && /\d{2}/.test(t);
    });
    if (anchors.length < 3) return { values: r1.values, excluded: r1.excluded, pass: 1 };

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const hs = [];
    anchors.forEach((l) => {
      x0 = Math.min(x0, l.x); y0 = Math.min(y0, l.y);
      x1 = Math.max(x1, l.x + (l.w || 0)); y1 = Math.max(y1, l.y + (l.h || 0));
      hs.push(l.h || 20);
    });
    hs.sort((a, b) => a - b);
    const m = (hs[Math.floor(hs.length / 2)] || 20) * 1.5;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
    x1 = Math.min(pass1.width || x1, x1 + m); y1 = Math.min(pass1.height || y1, y1 + m);
    const cw = x1 - x0, ch = y1 - y0;
    if (cw < 50 || ch < 50) return { values: r1.values, excluded: r1.excluded, pass: 1 };

    try {
      const bm = await loadBitmap(path);
      const scale = Math.min(3, Math.max(1.5, 2400 / Math.max(cw, ch)));
      const cv = document.createElement('canvas');
      cv.width = Math.min(4096, Math.round(cw * scale));
      cv.height = Math.min(4096, Math.round(ch * scale));
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      try { ctx.filter = 'grayscale(1) contrast(1.7)'; } catch (e) {}
      ctx.drawImage(bm, x0, y0, cw, ch, 0, 0, cv.width, cv.height);
      bm.close && bm.close();
      const u = cv.toDataURL('image/jpeg', 0.92);
      const pass2 = await readData(u.slice(u.indexOf(',') + 1));
      const r2 = parseBoard(pass2.lines, pass2.width || cv.width);
      // 더 많이 읽은 쪽을 쓴다(같으면 2패스 — 확대본이 오독이 적다)
      if (r2.values.length >= r1.values.length) {
        return { values: r2.values, excluded: r2.excluded, pass: 2 };
      }
    } catch (e) { console.warn('[ocr pass2]', e); }
    return { values: r1.values, excluded: r1.excluded, pass: 1 };
  }

  /* ---------------- 성적판 최종 경로: ML Kit 박스 + 숫자 전용 모델 ----------------
     ML Kit 은 칸 위치를 정확히 잡지만 매직 숫자를 오독한다.
     → 박스만 받아서 각 칸을 PP-OCRv5 인식 모델(readDigits, 온디바이스)로 다시 읽는다.
     읽은 문자열을 같은 좌표의 가짜 줄로 만들어 parseBoard 에 태우면
     평균 열 제외·복원 규칙이 그대로 적용된다. 실패하면 2패스(readBoardSmart)로 물러선다. */
  async function readBoard(path) {
    const P = plugin();
    if (!P) throw new Error('NOOCR');
    let pass1;
    try { pass1 = await read(path); }
    catch (e) { return readBoardSmart(path); }

    // 숫자 칸 후보 + 평균 라벨(제외 기준으로 필요)
    const numeric = pass1.lines.filter((l) => {
      const t = l.text.trim();
      return /^[\d\s.,|lIT]+$/.test(t) && /\d/.test(t);
    });
    const avg = pass1.lines.filter((l) => /평\s*[균군]/.test(l.text));

    if (typeof P.readDigits === 'function' || P.readDigits) {
      try {
        if (numeric.length) {
          const r = await P.readDigits({
            path: path,
            boxes: numeric.map((l) => ({ x: Math.round(l.x), y: Math.round(l.y),
                                         w: Math.round(l.w), h: Math.round(l.h) }))
          });
          const texts = (r && r.texts) || [];
          const synth = numeric.map((l, i) => ({
            text: String(texts[i] || ''), x: l.x, y: l.y, w: l.w, h: l.h
          })).filter((l) => l.text);
          const out = parseBoard(synth.concat(avg), pass1.width);
          if (out.values.length) return { values: out.values, excluded: out.excluded, pass: 'digits' };
        }
      } catch (e) { console.warn('[readDigits]', e); }
    }
    // 숫자 모델이 빈손이면 기존 2패스
    return readBoardSmart(path);
  }

  global.OCR = {
    available: available, read: read, readData: readData,
    readBoard: readBoard, readBoardSmart: readBoardSmart, pathToJpegB64: pathToJpegB64,
    parseSchedule: parseSchedule, parseBoard: parseBoard,
    _clusterRows: clusterRows
  };
})(window);

;
/* ===== js/contacts.js ===== */
/* ============ contacts.js — 감리 연락처 ============
   자동 생성 파일. 직접 고치지 말고 contacts.csv 를 갱신한 뒤
   node tools/make-contacts.js 를 다시 돌릴 것.
   생성: 2026-08-21 · 59명
================================================= */
(function (global) {
  'use strict';

  const LIST = [
    {
      "team": "1공구",
      "dong": "102동",
      "name": "박만옥",
      "rank": "",
      "phone": "010-9123-9678",
      "raw": "HD 1공구 102동 박만옥",
      "jugu": "1"
    },
    {
      "team": "1공구",
      "dong": "103동",
      "name": "배윤종",
      "rank": "",
      "phone": "010-2800-8413",
      "raw": "HD 1공구 103동 배윤종",
      "jugu": "1"
    },
    {
      "team": "1공구",
      "dong": "104동",
      "name": "홍경희",
      "rank": "",
      "phone": "010-5345-8630",
      "raw": "HD 1공구 104동 홍경희",
      "jugu": "1"
    },
    {
      "team": "1공구",
      "dong": "110동",
      "name": "이강호",
      "rank": "",
      "phone": "010-5272-5605",
      "raw": "HD 1공구 110동 이강호",
      "jugu": "1"
    },
    {
      "team": "1공구",
      "dong": "111동",
      "name": "성태준",
      "rank": "",
      "phone": "010-7731-2156",
      "raw": "HD 1공구 111동 성태준",
      "jugu": "1"
    },
    {
      "team": "1공구",
      "dong": "112동",
      "name": "변충섭",
      "rank": "",
      "phone": "010-5330-7531",
      "raw": "HD 1공구 112동 변충섭",
      "jugu": "1"
    },
    {
      "team": "1공구",
      "dong": "113동",
      "name": "조세진",
      "rank": "",
      "phone": "010-8296-4866",
      "raw": "HD 1공구 113동 조세진",
      "jugu": "1"
    },
    {
      "team": "1공구",
      "dong": "114동",
      "name": "전영대",
      "rank": "",
      "phone": "010-7676-9199",
      "raw": "HD 1공구 114동 전영대",
      "jugu": "1"
    },
    {
      "team": "1공구",
      "dong": "115동",
      "name": "문상기",
      "rank": "",
      "phone": "010-6277-1802",
      "raw": "HD 1공구 115동 문상기",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "101동",
      "name": "표소희",
      "rank": "",
      "phone": "010-5787-5061",
      "raw": "HD 2공구 101동 표소희",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "101동",
      "name": "김중희",
      "rank": "",
      "phone": "010-4803-2403",
      "raw": "HD 2공구 101동 김중희",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "105동",
      "name": "정한택",
      "rank": "",
      "phone": "010-8262-9934",
      "raw": "HD 2공구 105동 정한택",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "106동",
      "name": "김치수",
      "rank": "",
      "phone": "010-5419-9482",
      "raw": "HD 2공구 106동 김치수",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "107동",
      "name": "손만호",
      "rank": "",
      "phone": "010-3507-3829",
      "raw": "HD 2공구 107동 손만호",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "108동",
      "name": "서응모",
      "rank": "",
      "phone": "010-6227-2657",
      "raw": "HD 2공구 108동 서응모",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "109동",
      "name": "신천식",
      "rank": "",
      "phone": "010-8795-1504",
      "raw": "HD 2공구 109동 신천식",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "116동",
      "name": "이준용",
      "rank": "",
      "phone": "010-8402-4869",
      "raw": "HD 2공구 116동 이준용",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "117동",
      "name": "이영욱",
      "rank": "",
      "phone": "010-8962-6789",
      "raw": "HD 2공구 117동 이영욱",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "118동",
      "name": "서정일",
      "rank": "",
      "phone": "010-4278-8509",
      "raw": "HD 2공구 118동 서정일",
      "jugu": "1"
    },
    {
      "team": "2공구",
      "dong": "119동",
      "name": "정동원",
      "rank": "",
      "phone": "010-5236-4470",
      "raw": "HD 2공구 119동 정동원",
      "jugu": "1"
    },
    {
      "team": "3공구",
      "dong": "201동",
      "name": "김명서",
      "rank": "상무",
      "phone": "010-3869-0180",
      "raw": "HD 3공구 201동 김명서 상무",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "202동",
      "name": "윤준엽",
      "rank": "대리",
      "phone": "010-2976-0197",
      "raw": "HD 3공구 202동 윤준엽 대리",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "205동",
      "name": "이정춘",
      "rank": "상무",
      "phone": "010-3861-7405",
      "raw": "HD 3공구 205동 이정춘 상무",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "206동",
      "name": "정덕양",
      "rank": "이사",
      "phone": "010-6430-2596",
      "raw": "HD 3공구 206동 정덕양 이사",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "207동",
      "name": "유전하",
      "rank": "이사",
      "phone": "010-3739-1042",
      "raw": "HD 3공구 207동 유전하 이사",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "208동",
      "name": "조재호",
      "rank": "상무",
      "phone": "010-3284-3492",
      "raw": "HD 3공구 208동 조재호 상무",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "209동",
      "name": "최태식",
      "rank": "상무",
      "phone": "010-6246-2996",
      "raw": "HD 3공구 209동 최태식 상무",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "210동",
      "name": "허동수",
      "rank": "상무",
      "phone": "010-5210-6812",
      "raw": "HD 3공구 210동 허동수 상무",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "211동",
      "name": "우종안",
      "rank": "이사",
      "phone": "010-3850-6740",
      "raw": "HD 3공구 211동 우종안 이사",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "212동",
      "name": "박영훈",
      "rank": "상무",
      "phone": "010-9060-2415",
      "raw": "HD 3공구 212동 박영훈 상무",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "215동",
      "name": "박태규",
      "rank": "상무",
      "phone": "010-9840-5600",
      "raw": "HD 3공구 215동 박태규 상무",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "215동(특화동)",
      "name": "백낙민",
      "rank": "상무",
      "phone": "010-2009-9822",
      "raw": "HD 3공구 215동(특화동) 백낙민 상무",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "216동",
      "name": "박경주",
      "rank": "상무",
      "phone": "010-3278-8728",
      "raw": "HD 3공구 216동 박경주 상무",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "216동(특화동)",
      "name": "김륜희",
      "rank": "대리",
      "phone": "010-9048-4766",
      "raw": "HD 3공구 216동(특화동) 김륜희 대리",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "217동",
      "name": "길영만",
      "rank": "이사",
      "phone": "010-2552-9989",
      "raw": "HD 3공구 217동 길영만 이사",
      "jugu": "24"
    },
    {
      "team": "3공구",
      "dong": "218동",
      "name": "임영민",
      "rank": "이사",
      "phone": "010-7502-0980",
      "raw": "HD 3공구 218동 임영민 이사",
      "jugu": "24"
    },
    {
      "team": "3공구장",
      "dong": "219동",
      "name": "박종익",
      "rank": "상무",
      "phone": "010-3685-0251",
      "raw": "HD 3공구장 219동 박종익 상무",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "203동",
      "name": "김채성",
      "rank": "상무",
      "phone": "010-9014-6464",
      "raw": "HD 4공구 203동 김채성 상무",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "203동",
      "name": "장호천",
      "rank": "이사",
      "phone": "010-6218-3312",
      "raw": "HD 4공구 203동 장호천 이사",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "204동",
      "name": "윤영배",
      "rank": "이사",
      "phone": "010-5545-2134",
      "raw": "HD 4공구 204동 윤영배 이사",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "213동(특화동)",
      "name": "박기동",
      "rank": "상무",
      "phone": "010-5354-1027",
      "raw": "HD 4공구 213동(특화동) 박기동 상무",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "214동 A",
      "name": "이상호",
      "rank": "이사",
      "phone": "010-5590-1029",
      "raw": "HD 4공구 214동 A 이상호 이사",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "301동",
      "name": "정영용",
      "rank": "상무",
      "phone": "010-6528-5921",
      "raw": "HD 4공구 301동 정영용 상무",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "305동, 214동B",
      "name": "이원일",
      "rank": "이사",
      "phone": "010-5346-4720",
      "raw": "HD 4공구 305동, 214동B 이원일 이사",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "307동",
      "name": "이원도",
      "rank": "상무",
      "phone": "010-9211-2529",
      "raw": "HD 4공구 307동 이원도 상무",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "310동",
      "name": "배진수",
      "rank": "상무",
      "phone": "010-8711-8409",
      "raw": "HD 4공구 310동 배진수 상무",
      "jugu": "24"
    },
    {
      "team": "4공구장",
      "dong": "213동",
      "name": "윤도왕",
      "rank": "상무",
      "phone": "010-4701-6639",
      "raw": "HD 4공구장 213동 윤도왕 상무",
      "jugu": "24"
    },
    {
      "team": "4공구",
      "dong": "토목",
      "name": "신대식",
      "rank": "상무",
      "phone": "010-8223-1775",
      "raw": "HD 4공구 토목 신대식 상무",
      "jugu": "24"
    },
    {
      "team": "5공구",
      "dong": "302동",
      "name": "홍찬기",
      "rank": "상무",
      "phone": "010-5240-5160",
      "raw": "HD 5공구 302동 홍찬기 상무",
      "jugu": "24"
    },
    {
      "team": "5공구",
      "dong": "303동",
      "name": "조창래",
      "rank": "상무",
      "phone": "010-2567-2339",
      "raw": "HD 5공구 303동 조창래 상무",
      "jugu": "24"
    },
    {
      "team": "5공구",
      "dong": "304동",
      "name": "이남철",
      "rank": "상무",
      "phone": "010-5544-3267",
      "raw": "HD 5공구 304동 이남철 상무",
      "jugu": "24"
    },
    {
      "team": "5공구",
      "dong": "306동",
      "name": "공만규",
      "rank": "이사",
      "phone": "010-2226-9876",
      "raw": "HD 5공구 306동 공만규 이사",
      "jugu": "24"
    },
    {
      "team": "5공구",
      "dong": "308동",
      "name": "이명록",
      "rank": "이사",
      "phone": "010-9314-3502",
      "raw": "HD 5공구 308동 이명록 이사",
      "jugu": "24"
    },
    {
      "team": "5공구",
      "dong": "309동",
      "name": "김한일",
      "rank": "상무",
      "phone": "010-6685-7667",
      "raw": "HD 5공구 309동 김한일 상무",
      "jugu": "24"
    },
    {
      "team": "5공구",
      "dong": "311동",
      "name": "정민호",
      "rank": "상무",
      "phone": "010-5253-2419",
      "raw": "HD 5공구 311동 정민호 상무",
      "jugu": "24"
    },
    {
      "team": "5공구장",
      "dong": "312동",
      "name": "박영권",
      "rank": "상무",
      "phone": "010-3813-5884",
      "raw": "HD 5공구장 312동 박영권 상무",
      "jugu": "24"
    },
    {
      "team": "",
      "dong": "공공청사",
      "name": "송영수",
      "rank": "이사",
      "phone": "010-8977-4811",
      "raw": "공공청사 송영수 이사",
      "jugu": "24"
    },
    {
      "team": "주구중심",
      "dong": "B2",
      "name": "이상규",
      "rank": "이사",
      "phone": "010-8714-6703",
      "raw": "HD 주구중심 B2 이상규 이사",
      "jugu": "24"
    },
    {
      "team": "주구중심",
      "dong": "B3",
      "name": "한형구",
      "rank": "상무",
      "phone": "010-4097-7577",
      "raw": "HD 주구중심 B3 한형구 상무",
      "jugu": "24"
    }
  ];

  /* 현재 주구(1주구 / 2·4주구)의 사람들만. 설정은 U.jugu() — 홈에서 고른다.
     명부는 전체를 들고 있고 보여줄 때만 거른다. byPhone 은 안 거른다(과거 작업 호환). */
  function mine() {
    var j = (global.U && global.U.jugu) ? global.U.jugu() : "24";
    return LIST.filter(function (c) { return (c.jugu || "24") === j; });
  }

  /* 표시용 이름: "김명서 상무" */
  function label(c) { return c ? (c.name + (c.rank ? " " + c.rank : "")) : ""; }

  /* 소속: "3공구 201동" */
  function where(c) { return c ? [c.team, c.dong].filter(Boolean).join(" ") : ""; }

  /* 검색 — 이름·동·공구·번호 아무거나 */
  function search(q) {
    const s = String(q || "").trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return mine();
    return mine().filter(function (c) {
      return (c.raw + c.phone).toLowerCase().replace(/\s+/g, "").indexOf(s) >= 0;
    });
  }

  /* 타설부위 글자에서 동을 읽어 담당자를 추천한다 ("3동 5층" → 303동 아님, "201동 벽체" → 201동) */
  function suggest(text) {
    const m = String(text || "").match(/(\d{3})\s*동/);
    if (!m) return null;
    const dong = m[1] + "동";
    const hit = mine().filter(function (c) { return c.dong.indexOf(dong) >= 0; });
    return hit.length ? hit[0] : null;
  }


  /* 한 사람이 여러 동을 맡으면 연락처에 "305동, 214동B" 처럼 한 칸에 들어 있다.
     목록에 그대로 내보내면 동 두 개가 한 줄로 묶여 나오므로 쪼갠다. */
  function dongParts(c) {
    return String((c && c.dong) || "").split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  /* 동 목록 (중복 제거, 번호순) */
  function dongs() {
    var seen = {}, out = [];
    mine().forEach(function (c) {
      dongParts(c).forEach(function (d) {
        if (seen[d]) return;
        seen[d] = 1; out.push(d);
      });
    });
    return out.sort(function (a, b) {
      var na = parseInt(a, 10), nb = parseInt(b, 10);
      var xa = isNaN(na), xb = isNaN(nb);
      if (xa !== xb) return xa ? 1 : -1;   // 번호 없는 곳(공공청사)은 맨 뒤로
      if (!xa && na !== nb) return na - nb;
      return a.localeCompare(b, "ko");
    });
  }

  /* 그 동을 맡은 감리들 (한 동에 둘인 경우도 있다) */
  function byDong(dong) {
    if (!dong) return [];
    return mine().filter(function (c) { return dongParts(c).indexOf(dong) >= 0; });
  }

  function byPhone(p) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].phone === p) return LIST[i];
    return null;
  }

  global.Contacts = { LIST: LIST, label: label, where: where, search: search,
                      suggest: suggest, byPhone: byPhone, dongs: dongs, byDong: byDong,
                      dongsOf: dongParts, mine: mine };
})(window);

;
/* ===== js/task.js ===== */
/* ============ task.js — 시험 작업 ============
   워크플로우
     당일 아침(또는 전 근무일 마지막)에 작업을 등록한다.
       분류(수직/수평/필러/28일/봉함/수중) → 타설일이 자동으로 잡힌다(조정 가능)
       담당 감리 · 메모
     현장에서 사진 2장을 찍으면 그 세트는 완료로 본다.
     강도값은 작업 안에서 바로 입력해 평균·보정평균을 낸다.
========================================================= */
(function (global) {
  'use strict';

  /* 한 감리가 여러 양생을 같이 하기도 해서 장수는 고정하지 않는다.
     한 장이라도 올라오면 그 작업은 끝난 것으로 본다. */
  function today() { return U.dayKey(Date.now()); }

  /* ---------- 주구 분리 (사용자 지시: 1주구와 2·4주구 데이터는 따로) ----------
     작업엔 만들 때의 주구가 박힌다(draft·OCR 등록). 주구가 없는 구버전 작업은
     동 번호로 추정한다 — 1주구는 101~119동, 나머지(2xx·3xx·A9 등)는 2·4주구. */
  function juguOf(t) {
    if (t && (t.jugu === '1' || t.jugu === '24')) return t.jugu;
    const m = String((t && t.dong) || '').match(/^(\d{3})/);
    const n = m ? +m[1] : 0;
    return (n >= 101 && n <= 119) ? '1' : '24';
  }

  /* 목록은 항상 현재 주구 것만 — 반대편 주구 작업은 세그를 바꿔야 보인다 */
  function list(day) {
    return Store.tasksOf(day || today())
      .then((rows) => rows.filter((t) => juguOf(t) === U.jugu()));
  }
  function get(id) { return Store.getTask(id); }
  function save(t) { return Store.putTask(t); }
  function remove(id) { return Store.deleteTask(id); }

  /* ---------- 28일 작업의 두 칸(수중·봉함) ----------
     한 세트로 같이 뽑으니 작업도 하나다. 사진·계산만 칸별로 나뉜다. */
  function hasSubs(t) { return Spec.hasSubs(t && t.specKey); }
  function subOf(t, key) {
    const s = (t && t.sub && t.sub[key]) || {};
    return { photos: s.photos || [], sets: s.sets || [] };
  }
  function subPhotos(t, key) { return subOf(t, key).photos; }

  /* 완료 — 사진은 전경+판넬 2장이 한 짝이다(사용자 지시). n 장이 0 초과 짝수여야 끝.
     28일은 **수중·봉함 둘 다** 그 조건을 만족해야 끝이다 — 한쪽만 찍고 넘어가는 걸 막는다. */
  function evenPhotos(photos) {
    const n = (photos || []).length;
    return n > 0 && n % 2 === 0;
  }
  function isDone(t) {
    if (hasSubs(t)) return Spec.SUBS.every((s) => evenPhotos(subPhotos(t, s.key)));
    return evenPhotos((t && t.photos) || []);
  }

  /* 아직 사진이 없는 칸 이름들. 28일이 아니면 빈 배열.
     "미완료"만 뜨면 뭘 더 찍어야 하는지 모른다 — 어느 칸이 비었는지 이름으로 말해 준다. */
  function pendingSubs(t) {
    if (!hasSubs(t)) return [];
    return Spec.SUBS.filter((s) => subPhotos(t, s.key).length === 0).map((s) => s.name);
  }

  /* 목록에 붙일 한마디: '봉함 미완료' · '수중 사진 홀수' · '사진 홀수' · 끝났으면 ''
     0장인 칸은 기존대로 "미완료", 짝을 못 채운 홀수 장 칸은 "사진 홀수"로 갈라 말한다 —
     둘 다 isDone 은 false 지만 뭘 더 찍어야 하는지가 다르다. */
  function doneNote(t) {
    if (hasSubs(t)) {
      const bits = [];
      const left = pendingSubs(t);
      if (left.length) bits.push(left.join('·') + ' 미완료');
      Spec.SUBS.forEach((s) => {
        const n = subPhotos(t, s.key).length;
        if (n > 0 && n % 2 !== 0) bits.push(s.name + ' 사진 홀수');
      });
      return bits.join(' · ');
    }
    const n = ((t && t.photos) || []).length;
    return (n > 0 && n % 2 !== 0) ? '사진 홀수' : '';
  }

  function counts(items) {
    const all = (items || []).length;
    const done = (items || []).filter(isDone).length;
    return { all: all, done: done };
  }

  /* 날짜가 둘이다. 섞으면 안 된다.
       day      = 작업일. 이 작업이 어느 날 목록에 뜨는가 (IndexedDB byDay 인덱스 키)
       testDay  = 시험일. 보고·카톡 표기에 쓰는 날짜
     보통은 같지만, 밀린 시험을 늦게 하고 날짜만 앞당겨 적는 "가라" 상황에선 다르다.
     예) 31일에 깼는데 30일자로 보고 → day=31(31일 목록에 남는다), testDay=30(카톡은 30일)
     testDay 가 없는 구버전 작업은 day 를 그대로 시험일로 본다. */
  function testDayOf(t) { return (t && (t.testDay || t.day)) || ''; }

  /* 분류를 고르면 기본 타설일이 따라온다. 시험일에서 재령만큼 역산. */
  function defaultCast(specKey, dayKey) {
    const d = dayKey ? new Date(dayKey + 'T00:00:00') : new Date();
    return U.dayKey(Spec.defaultCastDay(specKey, d).getTime());
  }

  /* 새 작업 초안 (아직 저장 전) */
  function draft(dayKey, specKey) {
    const day = dayKey || today();
    const key = specKey || Spec.SPECS[0].key;
    return {
      id: null, day: day, testDay: day, specKey: key, dong: '',
      jugu: U.jugu(),                  // 만들 때의 주구가 이 작업의 소속이다
      castDay: defaultCast(key, day),
      supervisor: '', part: '', photos: [], values: [],
      factor: Calc.DEFAULT_FACTOR
    };
  }

  /* 실제 재령(타설일 → 시험일 일수). 휴일 이월이나 조기 시험 때문에 표준과 다를 수 있다. */
  function actualAge(t) {
    const test = testDayOf(t);
    if (!t || !t.castDay || !test) return null;
    const a = new Date(t.castDay + 'T00:00:00');
    const b = new Date(test + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  function label(t) {
    const s = Spec.byKey(t && t.specKey);
    return s ? s.name : '분류 없음';
  }

  /* ---------- 계산 세트 ----------
     한 작업에 강도 계산이 여러 벌 들어간다 — 회사가 다르거나 LOT 가 여러 개일 때.
     구버전(값 한 벌이 작업에 바로 붙어 있던 형식)은 Store 가 세트 하나로 옮겨 준다. */
  function setsOf(t) { return Store.normalizeSets(t || {}); }

  /* 이름이 비어 있으면 순번으로 부른다 */
  function setName(set, i) {
    return (set && set.name) ? set.name : ('세트 ' + (i + 1));
  }

  function setStats(set) {
    return Calc.statsOf((set && set.values) || [], set && set.factor);
  }

  /* 28일이면 수중·봉함 칸의 세트까지 통틀어 본다. t.sets 만 보면 d28 은 언제나 빈 것처럼
     보인다 — AI 검수가 값이 멀쩡한 28일 작업마다 「강도값이 없습니다」를 내던 원인(감사 확인).
     tag = 칸 이름(수중/봉함), 일반 작업은 ''. */
  function allSets(t) {
    if (!hasSubs(t)) return setsOf(t).map((s) => ({ set: s, tag: '' }));
    const out = [];
    Spec.SUBS.forEach((s) => {
      Store.normalizeSets(subOf(t, s.key)).forEach((x) => out.push({ set: x, tag: s.name }));
    });
    return out;
  }

  /* 값이 하나라도 들어 있는 세트만 — 빈 세트는 세지 않는다. 28일은 두 칸 통틀어. */
  function filledSets(t) {
    return allSets(t).filter((p) => (p.set.values || []).length).map((p) => p.set);
  }

  /* 목록 한 줄에 쓸 요약: 세트가 하나면 보정평균, 여럿이면 개수 */
  function setsBrief(t) {
    const f = filledSets(t);
    if (!f.length) return '';
    if (f.length === 1) return '보정 ' + U.fix2(setStats(f[0]).corr);
    return '계산 ' + f.length + '세트';
  }

  /* 카톡 등에 붙여넣을 한 줄. 28일은 수중/봉함 칸 이름을 앞에 붙인다 */
  function summary(t) {
    const s = Spec.byKey(t.specKey);
    const bits = [];
    bits.push('[' + (s ? s.name : '분류없음') + ']');
    if (t.part) bits.push(t.part);
    const all = allSets(t);
    all.forEach((p, i) => {
      const st = setStats(p.set);
      if (!st.n) return;
      const nm = (p.tag ? p.tag + ' ' : '') +
                 ((all.length > 1 && !p.tag) ? (setName(p.set, i) + ' ') : '');
      bits.push(nm + '보정평균 ' + U.fix2(st.corr) + ' N/mm²');
    });
    return bits.join(' ');
  }

  /* ---------- 내보내기 묶음 ----------
     카톡은 감리에게 보낸다 → **감리별로 묶는다.**
     한 감리 안에서도 동·분류가 다르면 따로 보낸다.
     문구는 "201동 수직입니다" / "204동 28일강도입니다" 형식(수중은 28일강도로 쓴다). */

  /* 카톡에 쓸 동 표기. 연락처의 동은 "215동(특화동)" · "305동, 214동B" 처럼
     지저분한 것이 섞여 있어 앞의 「숫자+동」만 뽑는다. 없으면 적힌 그대로.
     A/B 접미와 특화동 표기는 **지워지면 안 된다**(사용자 지시) — "214동B"를 "214동"으로
     보내면 옆동(214동A)과 헷갈려 카톡이 엉뚱한 동으로 나간다. 괄호·공백 유무는 다양해도
     "214동B" / "215동 특화동" 꼴로 정규화해 돌려준다. 다중 동은 여전히 첫 동만 본다. */
  function dongText(d) {
    const s = String(d || '').trim();
    if (!s) return '';
    const m = s.match(/(\d+)\s*동\s*(\(?\s*특화동\s*\)?|[A-Za-z])?/);
    if (!m) return s;
    const suf = (m[2] || '').replace(/[()\s]/g, '');
    if (!suf) return m[1] + '동';
    if (suf === '특화동') return m[1] + '동 특화동';
    return m[1] + '동' + suf.toUpperCase();
  }

  /* 규칙이 정해주는 표기 날짜 (재령·검수용으로 계속 쓴다) */
  function autoReportDay(t) {
    const s = Spec.byKey(t && t.specKey);
    if (!s) return '';
    return (s.age <= 10) ? (t.castDay || '') : testDayOf(t);
  }
  function reportDayOf(t) {
    return (t && t.reportDay) ? t.reportDay : autoReportDay(t);
  }

  /* 그 작업의 동수. 안 적혀 있어도 담당 감리가 한 동만 맡으면 그 동으로 본다 —
     예전 작업은 동수 칸이 없던 시절 것이라 비어 있는데, 카톡에 동이 빠지면 못 알아본다.
     둘 이상 맡는 감리(이원일 이사)면 짐작하지 않고 비워 둔다. */
  function dongOf(t) {
    const d = dongText(t && t.dong);
    if (d) return d;
    const sup = ((t && t.supervisor) || '').trim();
    if (!sup || !global.Contacts) return '';
    const hit = Contacts.LIST.filter((c) => Contacts.label(c) === sup);
    if (hit.length !== 1) return '';
    const ds = Contacts.dongsOf(hit[0]);
    return (ds.length === 1) ? dongText(ds[0]) : '';
  }

  /* 봉함은 감리축으로 보내지 않는다(사용자 지시). 날짜축으로만 나간다.
     28일 작업이면 봉함 "칸"이 그 대상이고, 구버전이면 분류 자체가 봉함이다. */
  function supAxisOff(t, subKey) {
    if (subKey) return subKey === 'seal';
    if (hasSubs(t)) return false;                 // 칸을 지정 안 하면 작업 자체는 대상이다
    const s = Spec.byKey(t && t.specKey);
    return !!s && s.key === 'seal';
  }

  /* 카톡에 붙일 한 줄: "201동 수직입니다" · 감리축으로 안 보내는 것은 빈 문자열
     28일은 수중 칸만 나가고 문구는 "201동 28일강도입니다". */
  function exportLabel(t, subKey) {
    const s = Spec.byKey(t && t.specKey);
    if (!s) return '';
    if (hasSubs(t)) {
      if (subKey === 'seal') return '';
      const d0 = dongOf(t);
      return (d0 ? d0 + ' ' : '') + '28일강도입니다';
    }
    if (supAxisOff(t)) return '';
    const name = (s.key === 'water') ? '28일강도' : s.name;
    const d = dongOf(t);
    return (d ? d + ' ' : '') + name + '입니다';
  }

  function exportGroup(t, subKey) {
    const s = Spec.byKey(t.specKey);
    if (!s) return null;
    if (hasSubs(t) && subKey === 'seal') return null;    // 봉함 칸은 감리축에서 뺀다
    if (!hasSubs(t) && supAxisOff(t)) return null;
    const label = exportLabel(t, subKey);
    if (!label) return null;
    const sup = (t.supervisor || '').trim();
    const d = dongOf(t);
    return {
      key: sup + '|' + d + '|' + s.key + '|' + (subKey || ''),
      sup: sup, dong: d, day: reportDayOf(t),
      label: label
    };
  }

  /* 날짜축 묶음 — 감리와 무관하게 같은 날·같은 분류끼리. 예 "7/22 필러"
     수직·수평·필러는 타설일, 수중·봉함은 시험일 기준(reportDayOf 가 그 규칙이다). */
  function dayGroup(t, subKey) {
    const s = Spec.byKey(t && t.specKey);
    if (!s) return null;
    const day = reportDayOf(t);
    // 날짜축은 수중과 봉함을 구별해 보낸다(사용자 지시) — 28일도 칸별로 갈라 놓는다
    let name;
    if (subKey) name = (subKey === 'water') ? '28일강도' : '봉함';
    else name = (s.key === 'water') ? '28일강도' : s.name;
    return { key: day + '|' + s.key + '|' + (subKey || ''), day: day,
             label: (day ? (Spec.md(day) + ' ') : '') + name };
  }

  /* 사진 도장 문구: "211동 28일 수중 · 8/13" — 내보내기 도장(U.stampImage)에 쓴다 */
  function wmText(t, subKey) {
    const s = Spec.byKey(t && t.specKey);
    const bits = [];
    const d = dongOf(t);
    if (d) bits.push(d);
    if (s) {
      const sub = subKey ? (Spec.subByKey(subKey) || {}).name : '';
      bits.push(s.name + (sub ? ' ' + sub : ''));
    }
    const day = reportDayOf(t);
    return bits.join(' ') + (day ? ' · ' + Spec.md(day) : '');
  }

  /* 한 작업이 내보내기에 내놓는 조각들.
     보통은 작업 하나 = 조각 하나지만, 28일은 수중·봉함 두 조각이다
     (사진이 칸마다 다르므로 조각이 자기 사진 목록을 직접 들고 다닌다). */
  function pieces(t) {
    if (!hasSubs(t)) {
      return [{ t: t, subKey: '', photos: (t.photos || []).slice() }];
    }
    return Spec.SUBS.map((s) => ({ t: t, subKey: s.key, photos: subPhotos(t, s.key).slice() }));
  }

  /* 공통 묶기 — 어떤 축으로 묶을지만 함수로 받는다.
     묶음의 photos 는 개수, photoIds 는 실제로 보낼 사진이다. */
  function groupBy(tasks, fn) {
    const map = {}, order = [];
    (tasks || []).forEach((t) => {
      pieces(t).forEach((pc) => {
        const g = fn(pc.t, pc.subKey);
        if (!g) return;
        if (!map[g.key]) {
          map[g.key] = { key: g.key, label: g.label, sup: g.sup || '',
                         dong: g.dong || '', day: g.day || '', subKey: pc.subKey,
                         items: [], photoIds: [], photoSrc: {} };
          order.push(g.key);
        }
        const box = map[g.key];
        if (box.items.indexOf(pc.t) < 0) box.items.push(pc.t);
        pc.photos.forEach((id) => {
          if (box.photoIds.indexOf(id) < 0) {
            box.photoIds.push(id);
            box.photoSrc[id] = pc;      // 사진 도장용 — 이 사진이 어느 작업·칸 것인지
          }
        });
      });
    });
    return order.map((k) => {
      const g = map[k];
      g.photos = g.photoIds.length;
      return g;
    });
  }

  /* 감리축 — 감리·동·분류가 같은 것끼리. 예 "201동 수직입니다" */
  function groupForExport(tasks) {
    return groupBy(tasks, exportGroup).sort((a, b) =>
      (a.sup || '￿').localeCompare(b.sup || '￿', 'ko') ||
      (a.dong || '').localeCompare(b.dong || '', 'ko') ||
      a.label.localeCompare(b.label, 'ko'));
  }

  /* 날짜축 — 예전부터 쓰던 방식. 둘 다 남긴다(사용자 지시: 투트랙). */
  function groupByDay(tasks) {
    return groupBy(tasks, dayGroup).sort((a, b) =>
      (a.day || '').localeCompare(b.day || '') || a.label.localeCompare(b.label, 'ko'));
  }

  global.Task = {
    today: today, list: list, get: get, save: save, remove: remove,
    isDone: isDone, counts: counts, draft: draft, defaultCast: defaultCast,
    testDayOf: testDayOf, dongText: dongText, dongOf: dongOf, juguOf: juguOf,
    hasSubs: hasSubs, subOf: subOf, subPhotos: subPhotos, pieces: pieces,
    pendingSubs: pendingSubs, doneNote: doneNote,
    setsOf: setsOf, allSets: allSets, setName: setName, setStats: setStats,
    filledSets: filledSets, setsBrief: setsBrief,
    actualAge: actualAge, label: label, summary: summary,
    autoReportDay: autoReportDay, reportDayOf: reportDayOf, exportLabel: exportLabel,
    wmText: wmText,
    supAxisOff: supAxisOff,
    exportGroup: exportGroup, groupForExport: groupForExport, groupByDay: groupByDay
  };
})(window);

;
/* ===== js/calc.js ===== */
/* ============ calc.js — P1 압축강도 계산 ============
   입력 규칙: 숫자만 왼→오른쪽으로 채운다.  ##.##
     "2453"  → 24.53      (4자리 = 자동등록)
     "245"   → 24.50      (모자란 칸은 0. 화면에 보이는 그대로 등록된다)
     "24530" → 245.30     (자동등록 끄면 5~6자리까지)
==================================================== */
(function (global) {
  'use strict';

  const MAX_AUTO = 4;      // 자동등록 모드 최대 자릿수
  const MAX_FREE = 6;      // 수동 모드 최대 자릿수 (9999.99)
  const MAX_VALUE = 9999.99;
  const K_ENTRIES = 'gsc.entries.v1';
  const K_AUTO = 'gsc.autoreg.v1';
  const K_FACTOR = 'gsc.factor.v1';
  const K_DIGITS = 'gsc.digits.v1';
  const K_SPREAD = 'gsc.fill.spread.v1';
  const DEFAULT_FACTOR = 0.97;
  const DEFAULT_SPREAD = 1;      // 편차 범위 0.5~3 (사용자 지시)
  const MIN_SPREAD = 0.5;
  const MAX_SPREAD = 3;

  let digits = '';
  let entries = [];        // [{v:Number, d:'2453'}]
  let autoReg = true;
  let factor = DEFAULT_FACTOR;   // 보정계수 (평균 × factor)
  let spread = DEFAULT_SPREAD;   // 채우기 편차 — 슬라이더가 곧 이 값이다
  let justAdded = -1;             // 방금 등록된 칩 인덱스 (애니메이션용)

  /* ---------- 값 변환 ---------- */
  function digitsToValue(ds) {
    if (!ds) return NaN;
    const s = ds.length < 4 ? (ds + '0000').slice(0, 4) : ds;
    const intLen = Math.max(2, s.length - 2);
    const v = parseFloat(s.slice(0, intLen) + '.' + s.slice(intLen));
    return isFinite(v) ? v : NaN;
  }

  function valueToDigits(v) {
    if (!isFinite(v)) return '';
    let s = String(Math.round(Math.abs(v) * 100));   // 센트 단위 정수
    while (s.length < 4) s = '0' + s;                // 정수부 최소 2자리 (aa.bb)
    return s.slice(0, MAX_FREE);
  }

  /* ---------- 저장 ---------- */
  function save() {
    try {
      localStorage.setItem(K_ENTRIES, JSON.stringify(entries));
      localStorage.setItem(K_AUTO, autoReg ? '1' : '0');
      localStorage.setItem(K_FACTOR, String(factor));
      localStorage.setItem(K_DIGITS, digits);
      localStorage.setItem(K_SPREAD, String(spread));
    } catch (e) { /* 저장 실패는 치명적이지 않음 */ }
  }

  /* 입력 중인 숫자만 저장. ⌫ 로 되돌린 값이 재시작에서 사라지지 않게 한다 */
  function saveDigits() {
    try { localStorage.setItem(K_DIGITS, digits); } catch (e) {}
  }

  /* 보정계수 문자열 → 숫자. 유효하지 않으면 NaN. 소수 4자리로 절단한다(입력 흔들림 방지).
     ※ 보정평균은 「평균 × 계수」가 아니라 값별 보정 후 평균(corrOf)이다 —
        화면의 평균 × 계수와 보정평균이 0.01 어긋나 보여도 그게 맞는 값이다. */
  function parseFactor(s) {
    const t = String(s == null ? '' : s).trim().replace(/,/g, '.');
    if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return NaN;
    const v = parseFloat(t);
    if (!isFinite(v) || v <= 0 || v > 10) return NaN;
    return Math.round(v * 10000) / 10000;
  }

  function factorText(v) {
    return String(Math.round(v * 10000) / 10000);
  }

  /* 저장된 항목 1건을 정규화. 못 믿을 값이면 null */
  function normalizeEntry(e) {
    let v = null;
    if (typeof e === 'number') v = e;                       // 구버전 포맷
    else if (e && typeof e === 'object' && (typeof e.v === 'number' || typeof e.v === 'string')) v = Number(e.v);
    else return null;

    if (typeof v !== 'number' || !isFinite(v) || v <= 0 || v > MAX_VALUE) return null;

    let d = (e && typeof e.d === 'string') ? e.d : '';
    if (!/^\d{1,6}$/.test(d) || Math.abs(digitsToValue(d) - v) > 1e-9) d = valueToDigits(v);
    const out = { v: v, d: d };
    if (e && typeof e === 'object' && e.r) out.r = 1;   // 랜덤 생성 표식(색 구분용) 보존
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(K_ENTRIES);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) entries = arr.map(normalizeEntry).filter(Boolean);
      }
      const a = localStorage.getItem(K_AUTO);
      if (a !== null) autoReg = a === '1';
      const f = parseFactor(localStorage.getItem(K_FACTOR));
      if (!isNaN(f)) factor = f;
      const d = localStorage.getItem(K_DIGITS);
      if (d && /^\d{1,6}$/.test(d)) digits = d;
      const sp = parseFloat(localStorage.getItem(K_SPREAD));
      if (isFinite(sp) && sp >= MIN_SPREAD && sp <= MAX_SPREAD) spread = Math.round(sp * 100) / 100;
    } catch (e) { entries = []; }
  }

  /* 밖에서 값 여러 개를 한 번에 등록 — OCR 이 읽어 온 값을 넣는 용도.
     입력 규칙(범위·자릿수)은 손입력과 똑같이 검사한다. 못 믿을 값은 버린다. */
  function addValues(vals) {
    let ok = 0;
    (vals || []).forEach((v) => {
      const e = normalizeEntry({ v: Number(v) });
      if (e) { entries.push(e); ok++; }
    });
    if (ok) { justAdded = entries.length - 1; save(); render(); }
    return ok;
  }

  /* ---------- 통계 ---------- */

  /* 보정평균 — 성적판에 손으로 적는 방식 그대로(사용자 지시):
       ① 각 값 × 계수를 소수 셋째 자리에서 반올림(→ 두 자리)
       ② 그 평균을 다시 셋째 자리에서 반올림
     「평균 × 계수」 한 방과 0.01 차이가 날 수 있다 — 판(손계산)과 맞아야 하는 쪽은 이 방식이다.
     AI 검수의 판 대조(audit.js)도 이 함수를 쓴다. */
  function round2(x) { return Math.round(x * 100 + 1e-9) / 100; }
  function corrOf(vals, fac) {
    const n = (vals || []).length;
    if (!n) return NaN;
    let s = 0;
    for (let i = 0; i < n; i++) s += round2(vals[i] * fac);
    return round2(s / n);
  }

  function stats() {
    const n = entries.length;
    if (!n) return { n: 0, factor: factor };
    let sum = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = entries[i].v;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const avg = sum / n;
    let sd = null;
    if (n >= 2) {
      let ss = 0;
      for (let i = 0; i < n; i++) { const d = entries[i].v - avg; ss += d * d; }
      sd = Math.sqrt(ss / (n - 1));   // 표본표준편차
    }
    return { n: n, sum: sum, avg: avg, min: min, max: max, sd: sd, factor: factor,
             corr: corrOf(entries.map((e) => e.v), factor) };
  }

  /* ---------- 렌더 ---------- */
  function renderDisplay() {
    const box = U.$('#display-mask');
    if (!box) return;
    const L = digits.length;
    const intLen = Math.max(2, L - 2);
    const ip = digits.slice(0, intLen);
    const dp = digits.slice(intLen);
    let html = '';
    for (let i = 0; i < intLen; i++) {
      html += i < ip.length ? '<span class="d">' + ip[i] + '</span>' : '<span class="ph">0</span>';
    }
    html += '<span class="dot">.</span>';
    for (let i = 0; i < 2; i++) {
      html += i < dp.length ? '<span class="d">' + dp[i] + '</span>' : '<span class="ph">0</span>';
    }
    box.innerHTML = html;
  }

  function renderChips() {
    const wrap = U.$('#chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!entries.length) { justAdded = -1; return; }
    let newChip = null;
    entries.forEach((e, i) => {
      const chip = U.el('div', 'chip' + (i === justAdded ? ' new' : '') + (e.r ? ' rand' : ''));
      chip.dataset.i = i;                 // 드래그 정렬 시 원래 위치를 되짚는 데 쓴다
      chip.appendChild(U.el('span', 'idx', (i + 1) + ''));
      chip.appendChild(U.el('span', 'val', U.fix2(e.v)));
      const x = U.el('button', 'x');
      x.appendChild(U.icon('close'));
      x.setAttribute('aria-label', (i + 1) + '번 값 ' + U.fix2(e.v) + ' 삭제');
      x.addEventListener('click', (ev) => { ev.stopPropagation(); removeAt(i); });
      chip.appendChild(x);
      wrap.appendChild(chip);
      if (i === justAdded) newChip = chip;
    });
    // 새 칩이 접힌 곳에 있으면 최소한으로만 스크롤 (#chips 는 스크롤 컨테이너가 아니다)
    if (newChip && newChip.scrollIntoView) {
      try { newChip.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    }
    justAdded = -1;
  }

  /* ---------- 칩 드래그 정렬 ----------
     세로 스크롤과 겹치므로 길게 눌러야(200ms) 집힌다.
     그전에 손가락이 움직이면 스크롤로 보고 취소한다. */
  function renumberChips(wrap) {
    Array.prototype.forEach.call(wrap.querySelectorAll('.chip'), (c, i) => {
      const s = c.querySelector('.idx');
      if (s) s.textContent = (i + 1) + '';
    });
  }

  function commitChipOrder(wrap) {
    const order = Array.prototype.map.call(wrap.querySelectorAll('.chip'), (c) => Number(c.dataset.i));
    const next = order.map((i) => entries[i]).filter(Boolean);
    if (next.length !== entries.length) { render(); return; }   // 뭔가 어긋나면 원상 복구
    const changed = next.some((e, i) => e !== entries[i]);
    entries = next;
    if (changed) { save(); U.buzz(12); }
    render();
  }

  function bindChipDrag() {
    const wrap = U.$('#chips');
    if (!wrap) return;
    let st = null;

    /* revert=true 는 브라우저가 제스처를 뺏어간 경우(pointercancel) —
       반쯤 옮겨진 DOM 을 커밋하지 말고 원래 순서로 되돌린다 */
    const stop = (revert) => {
      if (!st) return;
      clearTimeout(st.timer);
      if (st.dragging) {
        if (st.ghost && st.ghost.parentNode) st.ghost.parentNode.removeChild(st.ghost);
        st.chip.classList.remove('drag-src');
        wrap.classList.remove('dragging');
        if (revert === true) render(); else commitChipOrder(wrap);
      }
      st = null;
    };

    /* 집은 뒤 손가락을 움직이면 브라우저가 스크롤 제스처로 가로채 pointercancel 을 쏜다
       — "집어도 드래그하면 풀리는" 원인(실기기 증상). touch-action 을 제스처 도중에 바꾸는
       건(.dragging 클래스) 소용없고, **touchmove 자체를 막아야** 스크롤을 안 뺏긴다.
       집기 전(스크롤 의도 판별 중)에는 막지 않는다 — 등록값 3줄 초과 스크롤은 살아야 한다. */
    wrap.addEventListener('touchmove', (e) => {
      if (st && st.dragging) e.preventDefault();
    }, { passive: false });

    // 길게 누르기가 컨텍스트 메뉴로 새는 것도 드래그를 끊는다
    wrap.addEventListener('contextmenu', (e) => { if (st) e.preventDefault(); });

    wrap.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest && e.target.closest('.chip');
      if (!chip || (e.target.closest && e.target.closest('.x'))) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      st = { chip: chip, id: e.pointerId, x0: e.clientX, y0: e.clientY, dragging: false, timer: null };
      st.timer = setTimeout(() => {
        if (!st) return;
        st.dragging = true;
        U.buzz(14);
        wrap.classList.add('dragging');
        chip.classList.add('drag-src');
        const r = chip.getBoundingClientRect();
        const g = chip.cloneNode(true);
        g.className = 'chip chip-ghost';
        g.style.width = r.width + 'px';
        g.style.left = (r.left + r.width / 2) + 'px';
        g.style.top = (r.top + r.height / 2) + 'px';
        document.body.appendChild(g);
        st.ghost = g;
        try { wrap.setPointerCapture(st.id); } catch (err) {}
      }, 200);
    });

    wrap.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (!st.dragging) {
        // 집히기 전에 움직였다면 스크롤 의도로 본다
        if (Math.abs(e.clientX - st.x0) > 8 || Math.abs(e.clientY - st.y0) > 8) {
          clearTimeout(st.timer);
          st = null;
        }
        return;
      }
      e.preventDefault();
      st.ghost.style.left = e.clientX + 'px';
      st.ghost.style.top = e.clientY + 'px';

      const under = document.elementFromPoint(e.clientX, e.clientY);
      const over = under && under.closest ? under.closest('.chip') : null;
      if (over && over !== st.chip && over.parentNode === wrap) {
        const r = over.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        wrap.insertBefore(st.chip, after ? over.nextSibling : over);
        renumberChips(wrap);
      }
    }, { passive: false });

    wrap.addEventListener('pointerup', () => stop(false));
    wrap.addEventListener('pointercancel', () => stop(true));
  }

  function renderStats() {
    const s = stats();
    U.$('#stat-avg').textContent = s.n ? U.fix2(s.avg) : '–';
    U.$('#stat-corr').textContent = s.n ? U.fix2(s.corr) : '–';
  }

  function render() { renderDisplay(); renderChips(); renderStats(); fit(); }

  /* ---------- 화면에 맞추기 ----------
     미디어쿼리는 화면 전체 높이만 본다. 계산 본문이 실제로 쓸 수 있는 높이는
     거기서 상단바·작업연결바·탭바·세이프에어리어를 뺀 값이라 훨씬 짧다.
     (실측 SM-A556S: 화면 891px → 본문 631px. max-height:800px 는 끝내 안 걸린다)
     그래서 여기서 직접 재보고 모자란 만큼 단계를 올린다.

     줄이는 순서는 사용자 지시 — "위를 잘라먹더라도 키패드·등록값은 살려라".
       tight-top : 통계 카드만 양보
       tight     : 키패드·칩도 한 단
       xtight    : 끝까지
     한 단 올릴 때마다 다시 재고, 들어가면 거기서 멈춘다. */
  const TIERS = ['', 'tight-top', 'tight', 'xtight'];
  let fitting = false;

  function fits(view) {
    const scroll = view.querySelector('.calc-scroll');
    const zone = view.querySelector('.keypad-zone');
    if (!scroll || !zone) return true;
    // 통계 카드가 잘리지 않는가 (스크롤이 안 생겼는가)
    if (scroll.scrollHeight > scroll.clientHeight + 1) return false;
    // 키패드가 뷰 밖으로 밀려나지 않았는가 (탭바 뒤로 들어가면 아랫줄이 통째로 잘린다)
    if (zone.getBoundingClientRect().bottom > view.getBoundingClientRect().bottom + 1) return false;
    return true;
  }

  function fit() {
    const view = U.$('#view-calc');
    if (!view || fitting) return;
    // 숨어 있으면 높이가 전부 0이라 재봐야 헛수고다. 보일 때 다시 부른다.
    if (view.classList.contains('hidden') || !view.clientHeight) return;
    fitting = true;
    try {
      view.classList.remove('nofit');
      for (let i = 0; i < TIERS.length; i++) {
        view.classList.remove('tight-top', 'tight', 'xtight');
        if (TIERS[i]) view.classList.add(TIERS[i]);
        if (fits(view)) return;          // 들어갔다 → 이 단계로 확정
      }
      // 끝까지 가도 안 들어간다(가로·분할 화면). 키패드·칩은 안 줄이기로 했으니
      // 남은 수는 화면째 스크롤뿐이다 — 잘라서 못 누르게 두는 것보다 낫다.
      view.classList.add('nofit');
    } finally { fitting = false; }
  }

  /* ---------- 동작 ---------- */
  function pressDigit(ch) {
    // 자동등록 모드에서 입력칸이 이미 꽉 차 있으면(⌫ 로 되돌린 값 등) 먼저 등록하고 새 값을 시작한다.
    // 이걸 안 하면 24.53 되돌린 뒤 숫자를 누를 때 245.3x 로 자라 10배 오입력이 된다.
    if (autoReg && digits.length >= MAX_AUTO) register();

    if (digits.length >= MAX_FREE) {
      U.toast('최대 ' + MAX_FREE + '자리까지 입력됩니다');
      return;
    }
    // 자동등록 중에는 '00' 키가 4자리를 건너뛰지 않도록 잘라 넣는다
    let room = MAX_FREE - digits.length;
    if (autoReg) room = Math.min(room, MAX_AUTO - digits.length);
    if (room <= 0) return;

    digits += ch.slice(0, room);
    U.buzz(6);
    renderDisplay(); saveDigits();
    if (autoReg && digits.length >= MAX_AUTO) register();
  }

  function backspace() {
    if (digits.length) {
      digits = digits.slice(0, -1);
      U.buzz(6);
      renderDisplay(); saveDigits();
      return;
    }
    // 입력칸이 비어 있으면 마지막 등록값을 되돌려 편집
    if (entries.length) {
      const last = entries.pop();
      digits = (last.d || valueToDigits(last.v)).slice(0, MAX_FREE);
      save(); render();
      U.buzz(14);
      U.toast(U.fix2(last.v) + ' 되돌림 — 수정 후 다시 등록하세요');
    }
  }

  function clearInput() {
    if (!digits.length) { U.toast('입력칸이 비어 있습니다'); return; }
    digits = ''; U.buzz(10); renderDisplay(); saveDigits();
  }

  function register() {
    if (!digits.length) { U.toast('숫자를 먼저 입력하세요'); return; }
    const v = digitsToValue(digits);
    if (!isFinite(v) || v <= 0) {
      // '00' 두 번 누르면 0.00 이 조용히 등록돼 평균을 통째로 오염시킨다
      U.toast('0은 등록할 수 없습니다');
      digits = ''; renderDisplay(); saveDigits();
      return;
    }
    entries.push({ v: v, d: digits });
    justAdded = entries.length - 1;
    digits = '';
    save(); render();
    U.buzz(18);
  }

  function removeAt(i) {
    if (i < 0 || i >= entries.length) return;
    const gone = entries.splice(i, 1)[0];
    save(); render();
    U.buzz(10);
    U.toast(U.fix2(gone.v) + ' 삭제됨');
  }

  /* ---------- 랜덤값 채우기 (beta) ----------
     입력된 값을 기준으로 비슷한 값을 만들어 9개(판 전체)까지 채운다.
     직접 입력한 **마지막 값은 항상 맨 끝자리**(9번)로 옮긴다(사용자 지시).
     퍼짐은 슬라이더(#fill-spread, 모듈 전역 `spread`)가 곧 값이다 — 판에 적힌 값처럼 흩어진다. */
  function fillRandom(target) {
    const n = entries.length;
    if (!n) { U.toast('기준이 될 값을 먼저 입력하세요'); return; }
    if (n >= target) {
      U.toast('이미 ' + n + '개가 있습니다 — ' + target + '개보다 적을 때 채워집니다');
      return;
    }
    const s = stats();
    const made = [];
    for (let i = target - n; i > 0; i--) {
      // 균등난수 둘의 합 → 가운데가 두터운 종 모양 (자연스러운 흩어짐)
      const jitter = ((Math.random() + Math.random()) - 1) * spread * 3;
      const v = Math.round(Math.max(0.01, Math.min(MAX_VALUE, s.avg + jitter)) * 100) / 100;
      const e = normalizeEntry({ v: v, r: 1 });   // r = 랜덤 표식 — 칩이 색으로 구분된다
      if (e) made.push(e);
    }
    const last = entries.pop();          // 직접 입력한 마지막 값 → 맨 끝으로
    entries = entries.concat(made, [last]);
    digits = '';
    justAdded = entries.length - 1;
    save(); render();
    U.buzz(12);
    U.toast(made.length + '개를 채웠습니다 · 입력한 값이 맨 끝(' + entries.length + '번)입니다');
  }

  /* 28일 작업의 봉함 칸에 연결됐을 때만 쓰는 채우기 — 같은 세트의 수중 칸 값에 평균을 맞춘다.
     수중 칸 개수만큼 채우되 이미 입력한 값은 그대로 두고 모자란 만큼만 만든다. */
  async function fillSealFromWater() {
    if (!linkedId || linkedSub !== 'seal') return;
    // await 너머에서 다른 세트로 갈아탈 수 있다 — 지금 대상을 붙들어 두고, 끝나고도 같은지 확인한다.
    const id = linkedId, sub = linkedSub, setId = linkedSet;
    let t = null;
    try { t = await Store.getTask(id); } catch (e) { console.error(e); }
    if (linkedId !== id || linkedSub !== sub || linkedSet !== setId) return;   // 그 사이 다른 세트로 이동함
    if (!t) { U.toast('작업을 찾지 못했습니다'); return; }

    // 수중이 여러 세트(회사·LOT)면 **연결된 봉함 세트의 순번**에 대응하는 수중 세트만 따른다 —
    // 첫 봉함은 첫 수중, 둘째는 둘째와 비슷하게. 전부 합산하면 개수·평균이 다 틀어진다(사용자 확인 버그).
    const waterSets = Store.normalizeSets(Task.subOf(t, 'water'))
      .filter((s) => (s.values || []).some((v) => typeof v.v === 'number' && isFinite(v.v)));
    if (!waterSets.length) { U.toast('수중 칸에 값이 없습니다'); return; }
    const sealSets = Store.normalizeSets(Task.subOf(t, 'seal'));
    let idx = sealSets.findIndex((s) => s.id === setId);
    if (idx < 0) idx = 0;
    const src = waterSets[Math.min(idx, waterSets.length - 1)];
    const waterVals = src.values.map((v) => v.v).filter((v) => typeof v === 'number' && isFinite(v));

    const target = waterVals.length;
    const n = entries.length;
    if (n >= target) {
      U.toast('이미 ' + n + '개가 있습니다 — ' + target + '개보다 적을 때 채워집니다');
      return;
    }
    const avg = waterVals.reduce((a, b) => a + b, 0) / waterVals.length;
    const made = [];
    for (let i = target - n; i > 0; i--) {
      const jitter = ((Math.random() + Math.random()) - 1) * spread * 3;
      const v = Math.round(Math.max(0.01, Math.min(MAX_VALUE, avg + jitter)) * 100) / 100;
      const e = normalizeEntry({ v: v, r: 1 });   // r = 랜덤 표식 — 칩이 색으로 구분된다
      if (e) made.push(e);
    }
    entries = entries.concat(made);
    digits = '';
    justAdded = entries.length - 1;
    save(); render();
    U.buzz(12);
    U.toast(made.length + '개를 채웠습니다 · 수중 평균 ' + U.fix2(avg) + ' 기준');
  }

  /* 되묻지 않고 바로 지운다. 대신 토스트에서 한 번에 되돌릴 수 있다. */
  function clearAll() {
    if (!entries.length) { U.toast('지울 값이 없습니다'); return; }
    const backup = entries.slice();
    const n = backup.length;
    entries = []; digits = '';
    save(); render(); U.buzz(14);
    U.toast(n + '개를 지웠습니다', 5000, {
      label: '되돌리기',
      onClick: () => {
        entries = backup.slice();
        save(); render();
        U.toast('되돌렸습니다');
      }
    });
  }

  /* ---------- 요약 텍스트 ---------- */
  function summaryText(opt) {
    const s = stats();
    if (!s.n) return '';
    const lines = [];
    lines.push('[공시체 압축강도] ' + U.fmtDateTime(Date.now()));
    entries.forEach((e, i) => lines.push('  ' + (i + 1) + ') ' + U.fix2(e.v)));
    lines.push('─────────────');
    lines.push('평균 ' + U.fix2(s.avg) + ' N/mm²  (n=' + s.n + ')');
    lines.push('보정평균 ' + U.fix2(s.corr) + ' N/mm²  (×' + factorText(s.factor) + ')');
    if (s.n >= 2) {
      lines.push('최소 ' + U.fix2(s.min) + ' / 최대 ' + U.fix2(s.max) +
                 (s.sd != null ? ' / 표준편차 ' + U.fix2(s.sd) : ''));
    }
    if (opt && opt.noHeader) lines.shift();
    return lines.join('\n');
  }

  function copySummary() {
    const t = summaryText();
    if (!t) { U.toast('등록된 값이 없습니다'); return; }
    U.copyText(t).then((ok) => U.toast(ok ? '결과를 복사했습니다' : '복사에 실패했습니다'));
  }

  /* ---------- 작업 연결 ----------
     작업 편집기의 「계산기 열기」로 들어오면 이 탭이 그 작업의 입력창이 된다.
     저장을 누르면 값이 작업으로 들어가고 편집기로 돌아간다. */
  let linkedId = null;
  let linkedSet = null;      // 어느 계산 세트에 넣을 것인가
  let linkedSub = null;      // 28일 작업이면 수중/봉함 중 어느 칸인가

  function sameVals(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { if (a[i].v !== b[i].v) return false; }
    return true;
  }

  /* 「봉함 채우기」(수중 평균 기반)는 28일 작업의 봉함 칸에 연결됐을 때만 의미가 있다 */
  function syncFillSealBtn() {
    const btn = U.$('#btn-fill-seal');
    if (btn) btn.classList.toggle('hidden', !(linkedId && linkedSub === 'seal'));
  }

  function linkTo(taskId, setId, label, values, f, subKey) {
    const incoming = (values || []).slice();
    // 어디에도 저장되지 않은 입력 버퍼를 말없이 덮지 않는다 — 공시체는 이미 깨서 재측정이 안 된다.
    // 되돌리기 토스트를 준다(clearAll 과 같은 안전장치, 반대심문 확인).
    if (!linkedId && entries.length && !sameVals(entries, incoming)) {
      const bk = entries.slice(), bf = factor;
      U.toast('입력값 ' + entries.length + '개를 치우고 세트를 열었습니다', 6000, {
        label: '되돌리기',
        onClick: () => {
          unlink();
          entries = bk.slice(); factor = bf; digits = '';
          const fin = U.$('#factor'); if (fin) fin.value = factorText(factor);
          save(); render(); fit();
          U.toast('되돌렸습니다');
        }
      });
    }
    linkedId = taskId || null;
    linkedSet = setId || null;
    linkedSub = subKey || null;
    entries = incoming;
    factor = (typeof f === 'number' && isFinite(f) && f > 0) ? f : DEFAULT_FACTOR;
    digits = '';
    save(); render();
    const bar = U.$('#calc-link');
    U.$('#calc-link-name').textContent = label || '';
    bar.classList.toggle('hidden', !linkedId);
    const fin = U.$('#factor');
    if (fin) fin.value = factorText(factor);
    syncFillSealBtn();
    fit();   // 연결바(약 59px)가 생기면 남는 높이가 그만큼 줄어든다
  }

  function unlink() {
    linkedId = null;
    linkedSet = null;
    linkedSub = null;
    U.$('#calc-link').classList.add('hidden');
    syncFillSealBtn();
    fit();   // 연결바가 사라져 높이가 도로 늘었다
  }

  /* 연결된 세트에 값을 써 넣는다. 세트가 사라졌으면 새로 만들어 붙인다
     (편집기에서 지운 뒤 계산 탭으로 돌아온 경우 — 값을 잃는 것보다 낫다). */
  /* 28일 작업은 계산이 수중 칸 / 봉함 칸으로 나뉘어 있다 — 어느 칸에 쓸지 subKey 로 받는다 */
  function writeSet(t, vals, fac, setId, subKey) {
    if (subKey && Task.hasSubs(t)) {
      if (!t.sub) t.sub = {};
      if (!t.sub[subKey]) t.sub[subKey] = { photos: [], sets: [] };
      const box = t.sub[subKey];
      const ss = Store.normalizeSets(box);
      const j = ss.findIndex((s) => s.id === setId);
      if (j >= 0) { ss[j].values = vals; ss[j].factor = fac; }
      else ss.push({ id: setId || U.uid(), name: '', values: vals, factor: fac });
      box.sets = ss;
      delete box.values; delete box.factor;
      return t;
    }
    const sets = Task.setsOf(t);
    const i = sets.findIndex((s) => s.id === setId);
    if (i >= 0) { sets[i].values = vals; sets[i].factor = fac; }
    else sets.push({ id: setId || U.uid(), name: '', values: vals, factor: fac });
    t.sets = sets;
    delete t.values; delete t.factor;
    return t;
  }

  async function saveToTask() {
    if (!linkedId) return;
    if (!entries.length) { U.toast('등록된 값이 없습니다'); return; }
    // await 너머에서 연결 대상과 값이 바뀔 수 있다(다른 세트로 갈아타기, 값 수정).
    // 저장할 것을 전부 여기서 붙들고 간다.
    const id = linkedId, setId = linkedSet, subKey = linkedSub;
    const vals = entries.slice(), fac = factor, n = vals.length;
    let t = null;
    try { t = await Store.getTask(id); } catch (e) { console.error(e); }
    if (!t) { U.toast('작업을 찾지 못했습니다'); if (linkedId === id) unlink(); return; }
    writeSet(t, vals, fac, setId, subKey);
    try { await Store.putTask(t); }
    catch (e) { console.error(e); U.toast('저장하지 못했습니다'); return; }

    // 저장하는 사이 다른 작업으로 갈아탔으면 화면은 건드리지 않는다
    if (linkedId !== id) { U.toast('값 ' + n + '개를 작업에 저장했습니다'); return; }
    unlink();
    entries = []; digits = ''; save(); render();
    U.toast('값 ' + n + '개를 작업에 저장했습니다');

    Nav.go('home');
    try {
      const fresh = await Store.getTask(id);
      if (fresh) TaskUI.open(fresh, fresh.day);
    } catch (e) { console.error(e); }
  }

  /* 계산 탭의 값들을 작업에 넣는다.
     늘 새 작업을 만들면 곤란하다 — 오늘 등록해 둔 작업에 그냥 붙이는 경우가 더 많다. */
  async function attachToRecord() {
    if (!entries.length) { U.toast('등록된 값이 없습니다'); return; }
    if (linkedId) { saveToTask(); return; }

    const day = U.dayKey(Date.now());
    let tasks = [];
    try {
      tasks = (await Store.tasksOf(day))
        .filter((t) => Task.juguOf(t) === U.jugu());   // 주구 분리 — 목록과 같은 눈높이
    } catch (e) { console.error(e); }

    const items = [];
    items.push({
      label: '새 작업 만들기', cls: 'strong',
      sub: '분류·메모를 이어서 입력합니다',
      onPick: () => {
        Nav.go('home');
        TaskUI.open(null, day);
        TaskUI.setValues(entries.slice(), factor);
        entries = []; digits = ''; save(); render();
        U.toast('새 작업에 값을 넣었습니다');
      }
    });

    if (tasks.length) {
      items.push({ sep: true });
      tasks.forEach((t) => {
        const had = Task.filledSets(t).length;
        const mk = (subKey, subName) => ({
          label: Task.label(t) + (subName ? ' ' + subName : '') + ' · ' + (t.dong || '동 미지정'),
          // 덮어쓰지 않는다 — 세트를 하나 더 붙인다(회사·LOT 가 여러 개인 경우)
          sub: had ? ('계산 세트 ' + had + '개 있음 → 새 세트로 추가') : (t.supervisor || '첫 세트로 들어갑니다'),
          onPick: () => putInto(t, subKey)
        });
        if (Task.hasSubs(t)) {
          // 28일은 값이 수중/봉함 칸에 나뉘어 산다 — 칸을 안 물으면 putTask 가
          // t.sets 를 통째로 버려 값이 증발한다(감사에서 확인된 실경로). 칸별로 내놓는다.
          Spec.SUBS.forEach((s) => items.push(mk(s.key, s.name)));
        } else {
          items.push(mk('', ''));
        }
      });
    }

    U.sheet('계산값 ' + entries.length + '개를 어디에 넣을까요?', items);
  }

  async function putInto(t, subKey) {
    const n = entries.length;
    // writeSet 이 28일(sub 칸)과 일반 작업을 모두 안다 — 직접 t.sets 를 만지면 d28 에서 증발한다
    writeSet(t, entries.slice(), factor, null, subKey || '');
    try { await Store.putTask(t); }
    catch (e) { console.error(e); U.toast('저장하지 못했습니다'); return; }
    entries = []; digits = ''; save(); render();
    U.toast('값 ' + n + '개를 「' + (t.dong || Task.label(t)) + '」에 넣었습니다');
    Nav.go('home');
    try {
      const fresh = await Store.getTask(t.id);
      if (fresh) TaskUI.open(fresh, fresh.day);
    } catch (e) { console.error(e); }
  }

  /* ---------- 바인딩 ---------- */
  function bind() {
    // 회전·소프트키보드·창크기 변화 → 남는 높이가 달라지므로 다시 맞춘다
    const refit = () => fit();
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);

    const kp = U.$('#keypad');
    kp.addEventListener('click', (e) => {
      const btn = e.target.closest('.key');
      if (!btn) return;
      const k = btn.dataset.k;
      if (k === 'back') backspace();
      else if (k === 'esc') clearInput();
      else pressDigit(k);
    });
    // 등록은 키패드 밖(입력칸 옆)으로 나가서 따로 받는다
    const enter = U.$('#key-enter');
    if (enter) enter.addEventListener('click', () => register());

    const auto = U.$('#auto-reg');
    auto.checked = autoReg;
    document.body.classList.toggle('manual-reg', !autoReg);
    auto.addEventListener('change', () => {
      autoReg = auto.checked;
      document.body.classList.toggle('manual-reg', !autoReg);
      save(); renderDisplay();
      U.toast(autoReg ? '4자리 입력 시 자동으로 등록됩니다' : '자동등록 해제 — 등록 버튼을 누르세요');
    });

    /* 보정계수 */
    const fin = U.$('#factor');
    fin.value = factorText(factor);
    fin.addEventListener('input', () => {
      const v = parseFactor(fin.value);
      if (isNaN(v)) { fin.classList.add('bad'); return; }
      fin.classList.remove('bad');
      factor = v;
      save(); renderStats();
    });
    fin.addEventListener('blur', () => {
      fin.classList.remove('bad');
      fin.value = factorText(factor);
      document.body.classList.remove('kb-edit');
      fit();
    });
    fin.addEventListener('focus', () => {
      // 소프트키보드가 올라오면 키패드가 잘려 평균이 안 보인다 → 편집 중엔 키패드를 접는다
      document.body.classList.add('kb-edit');
      try { fin.select(); } catch (e) {}
      fit();
    });
    U.$('#factor-reset').addEventListener('click', () => {
      factor = DEFAULT_FACTOR;
      fin.value = factorText(factor);
      fin.classList.remove('bad');
      save(); renderStats();
      U.toast('보정계수를 0.97로 되돌렸습니다');
    });

    U.$('#calc-link-save').addEventListener('click', saveToTask);
    U.$('#btn-clear').addEventListener('click', clearAll);
    U.$('#btn-fill9').addEventListener('click', () => fillRandom(9));
    U.$('#btn-fill-seal').addEventListener('click', fillSealFromWater);

    /* 채우기 편차 슬라이더 */
    const spreadEl = U.$('#fill-spread');
    const spreadVal = U.$('#fill-spread-val');
    if (spreadEl) {
      spreadEl.value = String(spread);
      if (spreadVal) spreadVal.textContent = U.fix2(spread);
      spreadEl.addEventListener('input', () => {
        const v = parseFloat(spreadEl.value);
        if (!isFinite(v)) return;
        spread = Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, Math.round(v * 100) / 100));
        if (spreadVal) spreadVal.textContent = U.fix2(spread);
        save();
      });
    }

    U.$('#calc-menu-btn').addEventListener('click', () => {
      U.sheet('계산 옵션', [
        { label: '결과 복사', sub: '카카오톡에 붙여넣기용 텍스트', onPick: copySummary },
        { label: '작업에 넣기', sub: '새 작업 또는 오늘 등록한 작업', onPick: attachToRecord },
        { label: '방통시험 계산', sub: '몰탈 밀도·슬럼프 → 카톡 보고 문구', onPick: () => {
            if (global.Bangtong) Bangtong.open();
          } },
        { sep: true },
        { label: '전체 지우기', cls: 'danger', onPick: clearAll }
      ]);
    });

    /* 물리 키보드 · 숫자 넘패드.
       넘패드는 NumLock 이 꺼져 있으면 key 가 방향키/Home 등으로 오므로 code 로도 받는다. */
    document.addEventListener('keydown', (e) => {
      if (!isActive()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;   // Ctrl+1 같은 단축키를 삼키지 않는다
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      const code = e.code || '';
      let digit = null;

      if (e.key >= '0' && e.key <= '9') digit = e.key;
      else if (/^Numpad[0-9]$/.test(code)) digit = code.slice(6);   // NumLock 꺼짐 대비
      else if (/^Digit[0-9]$/.test(code)) digit = code.slice(5);

      if (digit !== null) { pressDigit(digit); e.preventDefault(); return; }

      // 등록: Enter / 넘패드 Enter / + (연속 입력 시 편함)
      if (e.key === 'Enter' || code === 'NumpadEnter' || e.key === '+' || code === 'NumpadAdd') {
        register(); e.preventDefault(); return;
      }
      // 한 자리 지우기 / 되돌리기
      if (e.key === 'Backspace' || code === 'Backspace') { backspace(); e.preventDefault(); return; }
      // 입력 초기화
      if (e.key === 'Escape' || e.key === 'Delete' || code === 'NumpadDecimal' ||
          code === 'Delete' || code === 'Escape') {
        clearInput(); e.preventDefault(); return;
      }
      // 소수점 키는 이 앱에서 의미가 없다(자동 배치) — 눌러도 무시하되 알려준다
      if (e.key === '.' || e.key === ',') {
        U.toast('소수점은 자동으로 들어갑니다');
        e.preventDefault();
      }
    });
  }

  function isActive() {
    const v = U.$('#view-calc');
    return v && !v.classList.contains('hidden') && !Nav.isTaskOpen() && !Nav.isSupOpen();
  }

  function init() { load(); bind(); bindChipDrag(); render(); }

  /* 임의의 값 목록에 대한 통계 — 작업(task) 화면에서 재사용한다 */
  function statsOf(entries, f) {
    const n = (entries || []).length;
    const fac = (typeof f === 'number' && isFinite(f) && f > 0) ? f : DEFAULT_FACTOR;
    if (!n) return { n: 0, factor: fac };
    let sum = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = entries[i].v;
      sum += v; if (v < min) min = v; if (v > max) max = v;
    }
    const avg = sum / n;
    let sd = null;
    if (n >= 2) {
      let ss = 0;
      for (let i = 0; i < n; i++) { const d = entries[i].v - avg; ss += d * d; }
      sd = Math.sqrt(ss / (n - 1));
    }
    return { n: n, sum: sum, avg: avg, min: min, max: max, sd: sd, factor: fac,
             corr: corrOf((entries || []).map((e) => e.v), fac) };
  }

  global.Calc = {
    init: init,
    summaryText: summaryText,
    stats: stats,
    statsOf: statsOf, corrOf: corrOf,
    linkTo: linkTo, addValues: addValues, unlink: unlink,
    fit: fit,
    digitsToValue: digitsToValue,
    valueToDigits: valueToDigits,
    parseFactor: parseFactor,
    DEFAULT_FACTOR: DEFAULT_FACTOR,
    // 테스트용
    _digitsToValue: digitsToValue,
    _valueToDigits: valueToDigits,
    _parseFactor: parseFactor,
    _normalizeEntry: normalizeEntry,
    _entries: () => entries.slice(),
    _digits: () => digits,
    _factor: () => factor
  };
})(window);

;
/* ===== js/tasks.js ===== */
/* ============ tasks.js — 작업 탭 (목록 + 묶어 내보내기) ============
   날짜별로 작업을 늘어놓고, 체크해서 사진을 한 번에 보낸다.
   날짜 헤더를 누르면 그 날짜 전체가 선택된다.
   (기록/내보내기 탭이 하던 일을 여기로 합쳤다)
================================================================ */
(function (global) {
  'use strict';

  const WARN_PHOTOS = 30;          // 카카오톡 한 번에 보내기 한도 근처
  let all = [];                    // 기준일의 작업
  let sel = Object.create(null);
  let seq = 0;
  let searchQ = '';
  let base = Spec.atMidnight(new Date());   // 기준 날짜(시험일)

  const isToday = () => Spec.sameDay(base, new Date());

  /* ---------------- 데이터 ---------------- */
  let loadFail = null;      // 읽기 실패를 "작업 없음"과 구별해 보여준다 (실패면 에러 객체)

  let bangs = [];                  // 기준일의 방통시험 기록(작업 탭에서도 보인다 — 사용자 지시)

  async function load() {
    // 날짜를 빠르게 넘기면 먼저 시작한 조회가 나중에 끝나 새 날짜 목록을 덮어쓴다.
    // 조회 시작 시점의 날짜를 붙들고, 그 사이 바뀌었으면 결과를 버린다.
    const want = U.dayKey(base.getTime());
    let rows = [], brows = [], fail = null;
    try { rows = await Store.tasksOf(want); } catch (e) { console.error(e); fail = e || true; }
    try { brows = await Store.bangsOf(want); } catch (e) { console.warn('[bangs]', e); }
    if (want !== U.dayKey(base.getTime())) return;      // 지나간 조회 — 버린다
    loadFail = fail;
    // 주구 분리(사용자 지시) — 현재 주구 작업만. 반대편은 홈 설정에서 세그를 바꿔야 보인다
    all = rows.filter((t) => Task.juguOf(t) === U.jugu());
    bangs = brows.filter((b) => !b.jugu || b.jugu === U.jugu());
    const alive = Object.create(null);
    all.forEach((t) => { alive[t.id] = 1; });
    Object.keys(sel).forEach((id) => { if (!alive[id]) delete sel[id]; });
  }

  function renderNav() {
    const d = base;
    const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    const el = U.$('#tasks-day');
    el.innerHTML = '';
    el.appendChild(U.el('span', 'day-text', (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + w + ')'));
    if (isToday()) el.appendChild(U.el('span', 'day-badge', '오늘'));
  }

  function goDay(delta) {
    base = delta === 0 ? Spec.atMidnight(new Date()) : Spec.addDays(base, delta);
    sel = Object.create(null);
    U.buzz(6);
    refresh();
  }

  function visible() {
    let rows = all;
    if (listFilter) rows = rows.filter((t) => listFilter.test(t));
    const q = searchQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) => {
      const s = (t.dong || '') + ' ' + (t.part || '') + ' ' +
                (t.supervisor || '') + ' ' + Task.label(t);
      return s.toLowerCase().indexOf(q) >= 0;
    });
  }

  function selected() {
    return visible().filter((t) => sel[t.id]).sort((a, b) => a.createdAt - b.createdAt);
  }
  function photoCount() {
    return selected().reduce((n, t) => n + ((t.photos || []).length), 0);
  }

  async function refresh() {
    renderNav();
    await load();
    await render();
  }

  /* ---------------- 렌더 ---------------- */
  let emptyNode = null;

  async function render() {
    const my = ++seq;
    const list = U.$('#tasks-list');
    if (!emptyNode) emptyNode = U.$('#tasks-empty') || U.el('p', 'empty-msg');
    const rows = visible();
    // 다시 그리면 예전 노드 지도는 버린다 — 안 버리면 화면에 없는 노드를 붙들고 있게 된다
    rowEls = Object.create(null);
    headEls = [];

    if (!rows.length) {
      list.innerHTML = '';
      emptyNode.innerHTML = loadFail
        // userMsg 는 store.js 가 만든 고정 문구다(사용자 입력 아님)
        ? ((loadFail.userMsg || '목록을 불러오지 못했습니다.') + '<br>위 날짜를 탭하면 다시 시도합니다.')
        : (all.length
          ? (listFilter
            ? '필터 「' + listFilter.label + '」에 맞는 작업이 없습니다.'
            : '조건에 맞는 작업이 없습니다.')
          : '이 날짜에 작업이 없습니다.<br>오른쪽 위 <b>+</b> 로 등록하세요.');
      list.appendChild(emptyNode);
      appendBangs(list);               // 작업이 없어도 그날 방통시험은 보인다
      updateBar();
      return;
    }

    // 수행은 감리별로 몰아서 하고, 끝난 작업은 아래로
    const supKey = (t) => (t.supervisor || '￿감리 미지정');
    const sorted = rows.slice().sort((a, b) => {
      const da = Task.isDone(a) ? 1 : 0, db = Task.isDone(b) ? 1 : 0;
      if (da !== db) return da - db;
      const sa = supKey(a), sb = supKey(b);
      if (sa !== sb) return sa.localeCompare(sb, 'ko');
      return (a.order - b.order) || (a.createdAt - b.createdAt);
    });

    // 썸네일은 한 번에 읽는다. 행마다 따로 읽으면 트랜잭션이 행 수만큼 열려
    // 검색 한 글자마다 목록이 굳는다(실측된 지연 원인).
    const wantIds = [];
    sorted.forEach((t) => {
      const id = (t.photos || [])[0];
      if (id) wantIds.push(id);
    });
    const pmap = Object.create(null);
    if (wantIds.length) {
      try {
        const got = await Store.getPhotos(wantIds);
        (got || []).forEach((p) => { pmap[p.id] = p; });
      } catch (e) { console.warn('[tasks thumbs]', e); }
      if (my !== seq) return;
    }

    const nodes = [];
    let lastHead = null;
    for (const t of sorted) {
      const done = Task.isDone(t);
      const head = done ? ' done' : supKey(t);
      if (head !== lastHead) {
        lastHead = head;
        nodes.push(supHeader(t, done));
      }
      nodes.push(taskRow(t, pmap));
    }
    const frag = document.createDocumentFragment();
    nodes.forEach((n) => frag.appendChild(n));
    list.innerHTML = '';
    list.appendChild(frag);
    appendBangs(list);
    updateBar();
  }

  /* 그날의 방통시험 — 목록 끝에 별도 구간으로. 탭하면 방통 화면에서 수정, 보내기 버튼은 건별 카톡.
     (선택·전송 묶음에는 안 낀다 — 방통은 자기 문구·사진으로 따로 나간다) */
  function appendBangs(list) {
    if (!bangs.length || !global.Bangtong) return;
    const head = U.el('div', 'day-head');
    head.appendChild(U.el('b', '', '방통시험'));
    head.appendChild(U.el('span', '', bangs.length + '건'));
    list.appendChild(head);
    bangs.forEach((b) => {
      const r = Bangtong.statsOf(b);
      const card = U.el('div', 'bang-saved-item');
      const main = U.el('div', 'bang-si-main');
      main.appendChild(U.el('span', 'bang-si-sup', Bangtong.placeOf(b)));   // 윗줄 = 동(사용자 지시)
      const sub = [Bangtong.supOf(b),
                   (r.kgm3 != null ? (r.kgm3 + 'kg/㎥') : ''),
                   (r.slump != null ? '슬럼프 ' + r.slump + 'mm' : ''),
                   ((b.photos || []).length ? '사진 ' + b.photos.length + '장' : '')]
        .filter(Boolean).join(' · ');
      main.appendChild(U.el('span', 'bang-si-sub', sub));
      main.addEventListener('click', () => Bangtong.openEdit(b));
      card.appendChild(main);
      const send = U.el('button', 'bang-si-btn');
      send.textContent = '보내기';
      send.addEventListener('click', () => Bangtong.exportRec(b));
      card.appendChild(send);
      list.appendChild(card);
    });
  }

  /* 감리(또는 완료) 구간 머리 — 누르면 그 구간 전체 선택 */
  function groupOf(t, done) {
    const supKey = (x) => (x.supervisor || '￿감리 미지정');
    return visible().filter((x) => (Task.isDone(x) === done) &&
      (done || supKey(x) === supKey(t)));
  }
  function groupAllOn(t, done) {
    const rs = groupOf(t, done);
    return rs.length > 0 && rs.every((x) => sel[x.id]);
  }

  /* ---------------- 선택 표시만 갱신 ----------------
     체크 하나 누를 때마다 목록을 통째로 다시 그리면(썸네일까지) 폰에서 눈에 띄게 굼뜨다.
     선택은 화면에 이미 있는 노드의 클래스만 바꾸면 되므로 다시 그리지 않는다. */
  let rowEls = Object.create(null);   // taskId → 행 노드
  let headEls = [];                   // { el, t, done }

  function setChk(box, on) {
    if (!box) return;
    box.classList.toggle('on', on);
    box.innerHTML = '';
    if (on) box.appendChild(U.icon('check'));
  }

  function syncSelection() {
    Object.keys(rowEls).forEach((id) => {
      const row = rowEls[id];
      if (!row || !row.isConnected) return;
      const on = !!sel[id];
      row.classList.toggle('on', on);
      setChk(row.firstChild, on);
    });
    headEls.forEach((h) => {
      if (h.el.isConnected) setChk(h.el.firstChild, groupAllOn(h.t, h.done));
    });
    updateBar();
  }

  function supHeader(t, done) {
    const on = groupAllOn(t, done);
    const h = U.el('div', 'day-head day-head-btn');
    const box = U.el('span', 'chk' + (on ? ' on' : ''));
    if (on) box.appendChild(U.icon('check'));
    h.appendChild(box);
    h.appendChild(U.el('b', '', done ? '완료' : (t.supervisor || '감리 미지정')));
    h.appendChild(U.el('span', '', groupOf(t, done).length + '건'));
    h.addEventListener('click', () => {
      // 지금 화면 상태를 다시 본다 — 만들 때의 on 을 쓰면 두 번째 탭이 안 먹는다
      const next = !groupAllOn(t, done);
      groupOf(t, done).forEach((x) => { if (next) sel[x.id] = true; else delete sel[x.id]; });
      syncSelection();
    });
    headEls.push({ el: h, t: t, done: done });
    return h;
  }

  /* pmap = 미리 한 번에 읽어 둔 { photoId: photo } — 여기선 IndexedDB 를 건드리지 않는다 */
  function taskRow(t, pmap) {
    const row = U.el('div', 'bat-row' + (sel[t.id] ? ' on' : ''));
    const box = U.el('span', 'chk' + (sel[t.id] ? ' on' : ''));
    if (sel[t.id]) box.appendChild(U.icon('check'));
    row.appendChild(box);

    const th = U.el('div', 'bat-thumb');
    const id = (t.photos || [])[0];
    const p = id ? (pmap || {})[id] : null;
    if (p) {
      const img = new Image();
      img.src = U.thumbUrl(p.id, p.thumb || p.full);
      img.alt = '';
      th.appendChild(img);
    } else {
      const np = U.el('div', 'nopic' + (id ? ' bad' : ''));
      np.appendChild(U.icon(id ? 'warn' : 'note'));
      th.appendChild(np);
    }
    row.appendChild(th);

    const body = U.el('div', 'bat-body');
    const head = U.el('div', 'rec-meta');
    const sp = Spec.byKey(t.specKey);
    head.appendChild(U.el('span', 'due-spec' + (sp ? ' sp-' + sp.key : ''), Task.label(t)));
    head.appendChild(U.el('span', 'rec-title', Task.dongOf(t) || '동 미지정'));
    // 동수와 담당 감리는 한 줄에 같이 간다(사용자 지시)
    if (t.supervisor) head.appendChild(U.el('span', 'row-sup', t.supervisor));
    if (t.photoMark) head.appendChild(U.el('span', 'photo-mark', '사진'));   // 표시 전용 배지
    body.appendChild(head);

    // 28일은 어느 칸이 남았는지 이름으로 알린다 — "미완료"만으론 뭘 더 찍을지 모른다
    const note = Task.doneNote(t);
    if (note) head.appendChild(U.el('span', 'sub-left', note));

    // 사진 장수·계산값은 여기 안 적는다(사용자 지시)
    const meta = [];
    if (t.part) meta.push(t.part);
    if (t.castDay) meta.push('타설 ' + Spec.shortDate(new Date(t.castDay + 'T00:00:00')));
    body.appendChild(U.el('div', 'task-meta', meta.join(' · ')));
    row.appendChild(body);

    // 체크는 행 전체, 편집은 오른쪽 버튼
    const edit = U.el('button', 'row-edit');
    edit.appendChild(U.icon('back'));
    edit.setAttribute('aria-label', '작업 열기');
    edit.addEventListener('click', (e) => { e.stopPropagation(); TaskUI.open(t, t.day); });
    row.appendChild(edit);

    row.addEventListener('click', () => {
      if (sel[t.id]) delete sel[t.id]; else sel[t.id] = true;
      syncSelection();          // 목록을 다시 그리지 않는다
    });
    rowEls[t.id] = row;
    return row;
  }

  function updateBar() {
    const n = selected().length;
    const p = photoCount();
    const btn = U.$('#tasks-send');
    const btnSup = U.$('#tasks-send-sup');
    const info = U.$('#tasks-info');
    // 축마다 묶음 수가 다르다 — 누르기 전에 몇 번 보내야 하는지 보여 준다.
    // 봉함은 감리축으로 안 나가므로 봉함만 골랐으면 감리별은 0 이 된다.
    const rows = n ? selected() : [];
    const gd = n ? Task.groupByDay(rows).filter((x) => x.photos > 0).length : 0;
    const gs = n ? Task.groupForExport(rows).filter((x) => x.photos > 0).length : 0;
    const off = (n === 0 || p === 0);
    btn.disabled = off || gd === 0;
    btn.classList.toggle('off', btn.disabled);
    if (btnSup) {
      btnSup.disabled = off || gs === 0;
      btnSup.classList.toggle('off', btnSup.disabled);
    }
    // 파일(압축) 내보내기 — 사진이 없어도 강도값만 있으면 된다
    const zb = U.$('#tasks-zip');
    if (zb) {
      const hasVals = n ? rows.some((t) => Task.filledSets(t).length > 0) : false;
      zb.disabled = (n === 0) || (p === 0 && !hasVals);
      zb.classList.toggle('off', zb.disabled);
      zb.textContent = n ? ('파일 내보내기 — ' + zipTitle()) : '파일 내보내기';
    }
    btn.textContent = (n && p) ? ('날짜별 ' + gd) : '날짜별';
    if (btnSup) btnSup.textContent = (n && p) ? ('감리별 ' + gs) : '감리별';
    info.textContent = n
      ? (n + '건 · 사진 ' + p + '장')
      : '작업을 선택하세요';
    U.$('#tasks-all').textContent =
      (visible().length && n === visible().length) ? '전체 해제' : '전체 선택';

    // 검수는 사진이 없어도 된다(앱 데이터만으로도 잡을 게 많다) → 선택만 있으면 켠다
    const ab = U.$('#tasks-audit');
    if (ab) {
      ab.disabled = (n === 0);
      U.$('#tasks-audit-label').textContent = n ? ('AI 검수 · ' + n + '건') : 'AI 검수';
    }
  }

  /* ---------------- 전송 ----------------
     카톡에는 묶음 단위로 보낸다: 사진 여러 장 → 그 밑에 텍스트 한 줄.
     묶는 기준은 분류마다 다르다 (Task.exportGroup 참고).
       수직·수평·필러 = 타설일   → "7/27 수평"
       수중·봉함     = 시험일   → "8/1 28일강도" / "7/31 봉함"  */
  async function sendGroup(g, copyText) {
    U.toast('사진 준비 중…', 60000);
    let blobs = [], missing = 0;
    try {
      // 묶음이 자기 사진을 들고 있다 — 28일은 수중 칸과 봉함 칸이 서로 다른 사진을 낸다
      const ids = (g.photoIds && g.photoIds.length)
        ? g.photoIds
        : g.items.reduce((a, t) => a.concat(t.photos || []), []);
      const photos = await Store.getPhotos(ids);
      const byId = {};
      photos.forEach((p) => { byId[p.id] = p; });
      const wm = U.wmPref();      // 사진 도장 — 내보내는 사본에만 찍는다(저장본 보존)
      for (const id of ids) {
        let b = byId[id] ? await Store.fullBlob(byId[id]) : null;   // 파일로 옮겨진 원본 포함
        if (b && wm) {
          const pc = (g.photoSrc || {})[id];
          if (pc) b = await U.stampImage(b, Task.wmText(pc.t, pc.subKey));
        }
        if (b) blobs.push(b); else missing++;
      }
    } catch (e) { console.error(e); }

    if (!blobs.length) { U.toast('보낼 사진이 없습니다'); return; }
    if (missing) U.toast(missing + '장은 불러오지 못해 빠집니다', 3000);

    let copied = false;
    if (copyText) { try { copied = await U.copyText(g.label); } catch (e) {} }

    const base = U.safeName(g.label, '공시체').replace(/\//g, '-');
    let how = 'download';
    try {
      how = await Share.exportItems({
        blobs: blobs, text: g.label, title: g.label, baseName: base
      });
    } catch (e) { console.error(e); U.toast('내보내기에 실패했습니다'); return; }

    if (how === 'cancel') U.toast('내보내기를 취소했습니다');
    else if (how === 'fail') U.toast(copied ? '공유에 실패했습니다\n「' + g.label + '」는 복사했습니다' : '공유에 실패했습니다');
    else if (how === 'download') U.toast('공유 기능이 없어 파일로 저장했습니다');
    else if (how === 'download-multi') U.toast('파일로 저장합니다 — 브라우저가 여러 장을 막으면 허용을 눌러 주세요', 4000);
    else if (how === 'copied') U.toast('「' + g.label + '」를 복사했습니다');
    else if (copied) U.toast('사진을 보낸 뒤 붙여넣기\n「' + g.label + '」', 4000);
    else U.toast('공유할 앱에서 카카오톡을 선택하세요');
  }

  /* ---------------- 목록 필터 (사용자 지시: 작업 탭에서 보이는 것 자체를 거른다) ----------------
     전송 시트가 아니라 목록에 건다 — 걸어 두면 목록·전체선택·전송·검수가 전부 그 범위만 본다. */
  let listFilter = null;      // { label, test(t) } — 세션 동안 유지, '전체'로 해제

  // "3공구장"(공구장)도 그 공구다 — 별도 필터로 두지 않고 "3공구"로 합친다(사용자 지시)
  function normTeam(tm) {
    return String(tm || '').trim().replace(/^(\d+\s*공구)장$/, '$1');
  }
  function teamOf(t) {
    const sup = (t.supervisor || '').trim();
    if (!sup || !global.Contacts) return '';
    const hit = Contacts.LIST.find((c) => Contacts.label(c) === sup);
    return normTeam(hit && hit.team);
  }

  /* 블럭 판정 — 현장 배치도(3BL/4BL) 실측(사용자 지시).
     A5=4블럭 / A9·B2·B3=3블럭 / 3XX동=전부 4블럭 /
     2XX동은 {203,204,213,214}만 4블럭·나머지 3블럭 / 그 외(1XX동 등)는 블럭 없음.
     특화동·A/B 접미(214동B·215동 특화동)는 "동" 뒤에 붙으므로 앞 숫자만 잡으면 자연히 무시된다. */
  function blockOf(t) {
    const raw = String((t && t.dong) || Task.dongOf(t) || '').trim();
    if (!raw) return '';
    const lm = raw.match(/^([A-Za-z])\s*(\d+)/);
    if (lm) {
      const key = lm[1].toUpperCase() + lm[2];
      if (key === 'A5') return '4블럭';
      if (key === 'A9' || key === 'B2' || key === 'B3') return '3블럭';
      return '';
    }
    const dm = raw.match(/(\d+)\s*동/);
    if (!dm) return '';
    const n = dm[1];
    if (n[0] === '3') return '4블럭';
    if (n[0] === '2') return (['203', '204', '213', '214'].indexOf(n) >= 0) ? '4블럭' : '3블럭';
    return '';
  }

  function syncFilterBtn() {
    const b = U.$('#tasks-filter');
    if (!b) return;
    b.textContent = listFilter ? ('필터: ' + listFilter.label) : '필터';
    b.classList.toggle('on', !!listFilter);
  }

  function setFilter(f) {
    listFilter = f;
    syncFilterBtn();
    render();
  }

  function pickFilter() {
    const items = [];
    items.push({
      label: '전체 (필터 없음)', cls: listFilter ? '' : 'strong',
      onPick: () => setFilter(null)
    });
    items.push({ sep: true });
    // 종류별
    Spec.SPECS.forEach((s) => {
      items.push({
        label: '종류 · ' + s.name,
        onPick: () => setFilter({ label: s.name, test: (t) => t.specKey === s.key })
      });
    });
    // 블럭별 — 이 날짜 작업들 중 블럭 판정되는 게 있을 때만(공구 목록과 같은 패턴)
    const blocks = [];
    all.forEach((t) => { const bl = blockOf(t); if (bl && blocks.indexOf(bl) < 0) blocks.push(bl); });
    if (blocks.length) items.push({ sep: true });
    blocks.sort().forEach((bl) => {
      items.push({
        label: '블럭 · ' + bl,
        onPick: () => setFilter({ label: bl, test: (t) => blockOf(t) === bl })
      });
    });
    // 공구별 — 이 날짜 작업들의 감리 소속에서 뽑는다
    const teams = [];
    all.forEach((t) => { const tm = teamOf(t); if (tm && teams.indexOf(tm) < 0) teams.push(tm); });
    if (teams.length) items.push({ sep: true });
    teams.sort().forEach((tm) => {
      items.push({
        label: '공구 · ' + tm,
        onPick: () => setFilter({ label: tm, test: (t) => teamOf(t) === tm })
      });
    });
    // 감리별
    const sups = [];
    all.forEach((t) => {
      const s = (t.supervisor || '').trim();
      if (s && sups.indexOf(s) < 0) sups.push(s);
    });
    if (sups.length) items.push({ sep: true });
    sups.sort((a, b) => a.localeCompare(b, 'ko')).forEach((s) => {
      items.push({
        label: '감리 · ' + s,
        onPick: () => setFilter({ label: s, test: (t) => (t.supervisor || '').trim() === s })
      });
    });
    U.sheet('무엇만 볼까요?', items);
  }

  /* ---------------- 파일(압축) 내보내기 ----------------
     기준일 이름의 ZIP(예: 0815.zip) 하나로 — 분류 폴더(수직/수평/필러/28일강도/봉함, 있는 것만),
     각 폴더에 사진(동_타설-시험_n.jpg)과 **강도값 엑셀 한 장**(강도값.xlsx — 작업마다 열,
     값은 위→아래. 같은 분류라도 열 제목으로 구분). 사용자 지시 양식.
     수중 칸의 폴더명은 카톡 문구와 같은 「28일강도」다(사용자 지시). */
  const ZIP_FOLDER = { vert: '수직', horiz: '수평', filler: '필러', water: '28일강도', seal: '봉함' };
  const mmdd = (d) => (d ? String(d).slice(5).replace('-', '') : '0000');
  // 압축파일 이름 — 「8월 25일 강도시험분.zip」 꼴(사용자 지시)
  const zipTitle = () => (base.getMonth() + 1) + '월 ' + base.getDate() + '일 강도시험분.zip';

  async function exportDayZip(rows) {
    U.toast('압축파일 만드는 중…', 60000);
    const zipName = zipTitle();
    const entries = [];
    const used = Object.create(null);          // 같은 동·날짜가 겹치면 _2, _3 …
    const uniq = (name) => {
      if (!used[name]) { used[name] = 1; return name; }
      return name + '_' + (++used[name]);
    };
    const sheets = Object.create(null);        // 폴더 → [{ header, vals }] (엑셀 열들)

    try {
      for (const t of rows) {
        // 폴더 이름은 날짜별 내보내기 라벨과 같은 꼴(사용자 지시) — 「8.25 봉함」
        // ('/' 는 압축 안에서 하위 폴더가 되므로 '.' 로). 날짜는 보고 날짜 규칙(reportDayOf)을 따른다.
        const dtag = (Spec.md(Task.reportDayOf(t) || t.day) || '').replace('/', '.');
        const fname = (k) => (dtag ? dtag + ' ' : '') + ZIP_FOLDER[k];
        // 28일은 수중/봉함 칸이 각각 제 폴더로, 단일재령·구버전(water/seal)은 분류 폴더로
        const pieces = Task.hasSubs(t)
          ? Spec.SUBS.map((s) => ({ folder: fname(s.key), box: Task.subOf(t, s.key) }))
          : [{ folder: ZIP_FOLDER[t.specKey] ? fname(t.specKey) : '', box: { photos: (t.photos || []), sets: Task.setsOf(t) } }];
        // 사진·열 이름은 동만(사용자 지시) — 날짜는 폴더가 이미 말해 준다
        const nameBase = U.safeName(Task.dongOf(t) || '동미지정', '동미지정');

        for (const pc of pieces) {
          if (!pc.folder) continue;            // 모르는 분류는 만들지 않는다
          const ids = pc.box.photos || [];
          const sets = Store.normalizeSets(pc.box);
          // 한 칸에 세트가 여럿(회사·LOT별)이면 세트 사이에 빈 행 하나 — 세로로 구분(사용자 지시).
          // null 은 makeXlsx 가 셀을 안 만들어 빈 칸이 된다.
          const vals = [];
          sets.forEach((s) => {
            if (!(s.values || []).length) return;
            if (vals.length) vals.push(null);
            s.values.forEach((v) => vals.push(v.v));
          });
          if (!ids.length && !vals.length) continue;
          const key = uniq(pc.folder + '/' + nameBase);

          if (ids.length) {
            let photos = [];
            try { photos = await Store.getPhotos(ids); } catch (e) {}
            const byId = {}; photos.forEach((p) => { byId[p.id] = p; });
            let n = 0;
            for (const id of ids) {
              const b = byId[id] ? await Store.fullBlob(byId[id]) : null;
              if (!b) continue;
              n++;
              entries.push({ name: key + '_' + n + '.jpg', data: new Uint8Array(await b.arrayBuffer()) });
            }
          }
          if (vals.length) {
            // 강도값은 폴더당 엑셀 한 장에 모은다 — 작업 이름이 열 제목(같은 분류 구분)
            (sheets[pc.folder] = sheets[pc.folder] || [])
              .push({ header: key.slice(pc.folder.length + 1), vals: vals });
          }
        }
      }

      // 폴더별 강도값.xlsx — 열=작업, 행=값(위→아래). 작업 사이엔 빈 열 하나(사용자 지시: 구분)
      for (const folder of Object.keys(sheets)) {
        const cols = sheets[folder];
        const heads = [], colsArr = [];
        cols.forEach((c, i) => {
          if (i) { heads.push(''); colsArr.push([]); }
          heads.push(c.header); colsArr.push(c.vals);
        });
        const xlsx = Share.makeXlsx(heads, colsArr);
        entries.push({ name: folder + '/강도값.xlsx', data: new Uint8Array(await xlsx.arrayBuffer()) });
      }

      if (!entries.length) { U.toast('내보낼 사진·강도값이 없습니다'); return; }
      const zip = Share.makeZip(entries);
      const how = await Share.exportFile(zip, zipName, zipName);
      if (how === 'cancel') U.toast('내보내기를 취소했습니다');
      else if (how === 'fail') U.toast('공유에 실패했습니다');
      else if (how === 'download') U.toast(zipName + ' 파일로 저장했습니다');
      else U.toast(zipName + ' — 보낼 앱을 선택하세요');
    } catch (e) {
      console.error('[zip]', e);
      U.toast('압축파일을 만들지 못했습니다');
    }
  }

  /* 내보내기 두 갈래 — 묶는 축만 다르고 보내는 방식은 같다.
       byDay : 같은 날 같은 분류끼리   → "7/22 필러"
       bySup : 감리·동·분류가 같은 것 → "201동 수직입니다" */
  function askSend(axis) {
    const rows = selected();
    if (!rows.length) { U.toast('작업을 선택하세요'); return; }
    const bySup = (axis === 'sup');
    const groups = (bySup ? Task.groupForExport(rows) : Task.groupByDay(rows))
      .filter((g) => g.photos > 0);
    if (!groups.length) {
      // 봉함은 감리축으로 안 보낸다 — 사진이 없는 것과 구별해 알린다
      if (bySup && rows.every(Task.supAxisOff)) {
        U.toast('봉함은 감리별로 보내지 않습니다\n날짜별로 보내세요', 3500);
      } else {
        U.toast('선택한 작업에 사진이 없습니다');
      }
      return;
    }

    const items = [];
    // 사진 도장(동·분류·날짜) — 원할 때만(사용자 지시). 설정은 다음에도 기억된다.
    items.push({
      label: '사진 도장: ' + (U.wmPref() ? '켬' : '끔'),
      sub: '사진 귀퉁이에 동·분류·날짜를 찍어 보냅니다 — 탭해서 ' + (U.wmPref() ? '끄기' : '켜기'),
      onPick: () => { U.setWmPref(!U.wmPref()); askSend(axis); }
    });
    items.push({ sep: true });
    groups.forEach((g) => {
      const over = g.photos > WARN_PHOTOS;
      const who = bySup ? (g.sup || '감리 미지정') : (g.items.length + '건');
      items.push({
        label: g.label + ' · 사진 ' + g.photos + '장',
        cls: over ? 'danger' : 'strong',
        sub: who + (bySup ? (' · ' + g.items.length + '건') : '') +
             (over ? ' · 카카오톡은 보통 한 번에 30장까지입니다'
                   : ' · 보낸 뒤 문구 붙여넣기'),
        onPick: () => sendGroup(g, true)
      });
    });
    items.push({ sep: true });
    items.push({
      label: '묶음 이름만 복사',
      sub: groups.map((g) => g.label).join(' · '),
      onPick: () => {
        U.copyText(groups.map((g) => g.label).join('\n'))
          .then((o) => U.toast(o ? '복사했습니다' : '복사에 실패했습니다'));
      }
    });
    U.sheet((bySup ? '감리별 ' : '날짜별 ') + groups.length + '건 — 하나씩 보내세요', items);
  }

  /* ---------------- 바인딩 ---------------- */
  function bind() {
    U.$('#tasks-send').addEventListener('click', () => askSend('day'));
    U.$('#tasks-send-sup').addEventListener('click', () => askSend('sup'));
    U.$('#tasks-prev').addEventListener('click', () => goDay(-1));
    U.$('#tasks-next').addEventListener('click', () => goDay(1));
    U.$('#tasks-day').addEventListener('click', () => goDay(0));
    U.$('#tasks-audit').addEventListener('click', () => {
      AuditUI.start(selected());
    });
    // 목록 필터 — 종류·공구·감리 (사용자 지시: 전송 시트가 아니라 목록에서)
    const fb = U.$('#tasks-filter');
    if (fb) fb.addEventListener('click', pickFilter);

    // 파일(압축) 내보내기 — 전용 버튼(사용자 지시: 시트 안 아님)
    const zb = U.$('#tasks-zip');
    if (zb) zb.addEventListener('click', () => {
      const rows = selected();
      if (!rows.length) { U.toast('작업을 선택하세요'); return; }
      exportDayZip(rows);
    });

    // 홈뿐 아니라 여기서도 등록한다. 보고 있는 날짜에 그대로 만든다.
    U.$('#tasks-add').addEventListener('click', () => {
      TaskUI.open(null, U.dayKey(base.getTime()));
    });

    U.$('#tasks-all').addEventListener('click', () => {
      const rows = visible();
      // 필터 범위만 다룬다 — 「전체 해제」가 전역 sel 을 지우면 안 보이는(다른 필터) 선택까지
      // 조용히 사라진다(반대심문 확인). 「전체 선택」과 대칭으로 보이는 행만 켜고 끈다.
      if (rows.length && selected().length === rows.length) rows.forEach((t) => { delete sel[t.id]; });
      else rows.forEach((t) => { sel[t.id] = true; });
      syncSelection();
    });
    const s = U.$('#tasks-search');
    let t = null, composing = false;
    // 렌더가 싸진 뒤로 굳이 오래 기다릴 이유가 없다(예전 200ms)
    const apply = () => { clearTimeout(t); t = setTimeout(() => { searchQ = s.value; render(); }, 110); };
    s.addEventListener('compositionstart', () => { composing = true; clearTimeout(t); });
    s.addEventListener('compositionend', () => { composing = false; apply(); });
    s.addEventListener('input', () => { if (!composing) apply(); });
  }

  function init() { bind(); }

  global.Tasks = { init: init, refresh: refresh };
})(window);

;
/* ===== js/taskui.js ===== */
/* ============ taskui.js — 작업 편집기 화면 ============
   분류를 고르면 타설일이 자동으로 잡히고(조정 가능),
   강도값과 사진 2장을 채우면 그 세트가 완료된다.
=================================================== */
(function (global) {
  'use strict';

  let tk = null;           // 편집 중인 작업
  let saving = null;       // 저장 재진입 가드
  let dirty = false;

  const $ = U.$;

  /* 편집기는 홈에서도, 작업 탭에서도 열린다.
     저장·삭제 뒤에 홈만 새로 그리면 작업 탭 목록이 옛날 것으로 남는다. */
  function refreshLists() {
    try { Home.refresh(); } catch (e) {}
    try { if (Nav.current() === 'tasks') Tasks.refresh(); } catch (e) {}
  }

  /* ---------------- 열기 ---------------- */
  function open(task, dayKey) {
    // 목록이 들고 있던 사본은 그 사이의 저장(계산기 연결 저장 등)보다 낡았을 수 있다.
    // 낡은 사본을 편집해 저장하면 최신 저장이 조용히 되돌아간다 — id 가 있으면 새로 읽는다.
    if (task && task.id) {
      Store.getTask(task.id)
        .then((fresh) => openNow(fresh || task, dayKey))
        .catch(() => openNow(task, dayKey));
      return;
    }
    openNow(task, dayKey);
  }

  function openNow(task, dayKey) {
    tk = task ? JSON.parse(JSON.stringify(task)) : Task.draft(dayKey);
    dirty = false;
    bangX = null;                    // 열 때는 항상 공시체 모드부터
    $('#tk-heading').textContent = task ? '작업' : '새 작업';
    $('#tk-delete').classList.toggle('hidden', !task);
    renderSpecs();
    $('#tk-cast').value = tk.castDay || '';
    $('#tk-day').value = Task.testDayOf(tk);
    $('#tk-part').value = tk.part || '';
    const pm = $('#tk-photomark');
    if (pm) pm.checked = !!tk.photoMark;
    clearHints();          // 앞서 연 작업의 추천 칩이 남아 있으면 안 된다
    curSub = 'water';      // 열 때는 항상 수중부터
    renderSubTabs();
    renderDong();
    renderWorkDay();
    renderSup();
    renderAge();
    renderReport();
    renderValues();
    renderPhotos();
    syncBangUI();
    Nav.showTask(true);
  }

  /* 분류 선택 = 그날 해야 할 강도시험 목록이기도 하다.
     각 칩에 타설일을 같이 띄워서 "오늘 뭘 깨야 하는지"를 여기서 바로 본다. */
  function renderSpecs() {
    const wrap = $('#tk-specs');
    wrap.innerHTML = '';
    const test = Task.testDayOf(tk);
    const day = test ? new Date(test + 'T00:00:00') : new Date();

    $('#tk-due-when').textContent = '(' + Spec.shortDate(day) + ' 시험 기준)';

    Spec.SPECS.forEach((s) => {
      const b = U.el('button', 'spec-pill sp-' + s.key + (s.key === tk.specKey ? ' on' : ''));
      b.appendChild(U.el('span', 'sp-name', s.name));
      b.appendChild(U.el('span', 'sp-age', s.age + '일'));
      b.appendChild(U.el('span', 'sp-cast', Spec.shortDate(Spec.defaultCastDay(s.key, day))));
      b.addEventListener('click', () => {
        if (tk.specKey === s.key) return;
        if (bangX) { bangX = null; }                  // 방통 모드에서 분류로 되돌아온다
        // 28일↔단일재령으로 저장구조가 바뀌면 반대편에 든 사진·강도값이 저장 때 버려진다 —
        // 미리 옮겨 둔다(증발 방지, 반대심문 확인). store.taskRec 에도 같은 안전판이 있다.
        migrateAcrossSub(tk.specKey, s.key);
        tk.specKey = s.key;
        // 분류를 바꾸면 타설일 기본값도 따라간다 (직접 고친 값은 덮어쓴다)
        tk.castDay = Task.defaultCast(s.key, Task.testDayOf(tk));
        $('#tk-cast').value = tk.castDay;
        dirty = true;
        renderSpecs(); renderAge(); renderReport();
        renderSubTabs(); renderValues(); renderPhotos();
        syncBangUI();
      });
      wrap.appendChild(b);
    });

    // 방통시험 — 분류 칩과 같은 줄·같은 동작(사용자 지시). 누르면 이 화면이 바로 방통 입력이 된다.
    const bp = U.el('button', 'spec-pill sp-bang' + (tk.specKey === 'bang' ? ' on' : ''));
    bp.appendChild(U.el('span', 'sp-name', '방통시험'));
    bp.addEventListener('click', enterBang);
    wrap.appendChild(bp);

    // 월요일이면 전날(일요일) 몫도 함께 시험한다
    const note = $('#tk-due-note');
    const due = Spec.dueOn(day);
    const deferred = due.items.filter((i) => i.deferred);
    if (deferred.length) {
      note.textContent = '일요일 휴무분 · ' +
        deferred.map((i) => i.spec.name + ' ' + Spec.shortDate(i.castDay)).join(' · ');
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  }

  /* 이 작업이 어느 날 목록에 뜨는지 — 시험일과 헷갈리지 않게 따로 보여준다.
     시험일을 고쳐도 목록은 안 움직이므로, 옮기려면 여기를 바꿔야 한다. */
  function renderWorkDay() {
    const el = $('#tk-workday');
    if (!el || !tk) return;
    el.value = tk.day || '';
    const hint = $('#tk-workday-hint');
    if (!hint) return;
    const test = Task.testDayOf(tk);
    const diff = !!(test && tk.day && test !== tk.day);
    hint.textContent = diff ? '시험일과 다름' : '';
    hint.classList.toggle('warn', diff);
  }

  function renderAge() {
    const el = $('#tk-age');
    const a = Task.actualAge(tk);
    const s = Spec.byKey(tk.specKey);
    if (a == null) { el.textContent = ''; return; }
    const std = s ? s.age : null;
    let txt = '재령 ' + a + '일';
    if (std != null && a !== std) txt += ' (표준 ' + std + '일과 다름)';
    el.textContent = txt;
    el.classList.toggle('off', std != null && a !== std);
  }

  /* 카톡에 나갈 한 줄을 미리 보여준다.
     밀린 시험을 늦게 해도 날짜(타설일/시험일)를 고치면 여기 바로 반영된다. */
  function renderReport() {
    const el = $('#tk-report-prev');
    if (!el) return;
    el.innerHTML = '';
    if (!tk || bangX) return;        // 방통 모드 — 이 구획은 숨겨져 있고 spec 'bang' 은 보고축에 없다
    // 내보내기가 두 갈래라 문구도 둘이다 — 어느 쪽으로 보내든 뭐가 나갈지 여기서 본다
    const rows = [
      ['감리별', Task.supAxisOff(tk) ? '보내지 않음' : Task.exportLabel(tk)],
      ['날짜별', (Task.groupByDay([tk])[0] || {}).label]
    ];
    rows.forEach(([axis, text]) => {
      const row = U.el('div', 'report-row');
      row.appendChild(U.el('span', 'report-axis', axis));
      row.appendChild(U.el('span', 'report-text', text || '—'));
      el.appendChild(row);
    });
  }

  /* ---------------- 28일: 수중 / 봉함 칸 ----------------
     수중과 봉함은 한 세트로 같이 뽑으니 작업은 하나다. 사진과 계산만 칸별로 나뉜다.
     화면을 둘로 늘리는 대신 탭으로 갈아 끼운다 — 편집기가 길어지면 손이 안 닿는다. */
  let curSub = 'water';

  /* 지금 보고 있는 칸의 키('' = 28일 아님) — 사진 렌더/삭제 레이스 가드에 쓴다 */
  function curKey() { return (tk && Task.hasSubs(tk)) ? curSub : ''; }

  /* 분류가 28일↔단일재령을 넘나들 때 저장구조 사이로 데이터를 옮긴다(무손실).
     이렇게 안 하면 taskRec 이 반대편 구조를 빈 값으로 덮어써 사진·강도값이 증발한다. */
  function migrateAcrossSub(prevKey, newKey) {
    const wasSub = Spec.hasSubs(prevKey);
    const nowSub = Spec.hasSubs(newKey);
    if (wasSub === nowSub) return;
    if (!wasSub && nowSub) {
      // 단일재령 → 28일: t.photos / t.sets 를 수중 칸으로 모은다
      const photos = (tk.photos || []).slice();
      const sets = Store.normalizeSets(tk);
      const first = Spec.SUBS[0].key;
      tk.sub = {};
      Spec.SUBS.forEach((s) => { tk.sub[s.key] = { photos: [], sets: [] }; });
      tk.sub[first] = { photos: photos.slice(), sets: sets };
      tk.photos = photos.slice();                 // 합집합 유지(gc 가 여기만 본다)
      delete tk.sets; delete tk.values; delete tk.factor;
      if (photos.length || sets.length) U.toast('사진·값을 ' + (Spec.subByKey(first) || {}).name + ' 칸으로 옮겼습니다');
    } else if (wasSub && !nowSub) {
      // 28일 → 단일재령: 두 칸을 하나로 평탄화
      const photos = [], seen = {};
      let sets = [];
      Spec.SUBS.forEach((s) => {
        const b = (tk.sub && tk.sub[s.key]) || {};
        (b.photos || []).forEach((id) => { if (id != null && !seen[id]) { seen[id] = 1; photos.push(id); } });
        sets = sets.concat(Store.normalizeSets({ sets: b.sets, values: b.values, factor: b.factor }));
      });
      tk.photos = photos;
      tk.sets = sets;
      delete tk.sub;
      if (photos.length || sets.length) U.toast('두 칸의 사진·값을 합쳤습니다');
    }
    curSub = 'water';
  }

  /* ---------------- 방통시험 모드 (사용자 지시: 분류 칩처럼, 화면 이동 없이) ----------------
     「방통시험」 칩을 고르면 이 편집기가 그대로 방통 입력이 된다.
     tk 는 공용 캐리어(동·감리·사진·날짜)로 계속 쓰고, 방통 고유값만 bangX 가 든다.
     저장은 putTask 가 아니라 putBang — 값은 계산기식 숫자 문자열(무게=끝2자리 소수). */
  let bangX = null;   // { w, s1, s2, fl(숫자 문자열), id(저장된 방통 id), active }
  const isBang = () => !!bangX;
  const bDigits = (s) => String(s || '').replace(/\D/g, '');
  // 무게는 자율 입력(사용자 지시) — 숫자와 소수점 하나만 남긴다
  const bClean = (s) => {
    let t = String(s || '').replace(/[^0-9.]/g, '');
    const i = t.indexOf('.');
    if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '');
    return t;
  };

  function enterBang() {
    if (bangX) return;
    if (!tk) return;
    migrateAcrossSub(tk.specKey, 'bang');   // d28 에서 오면 사진을 평탄화(hasSubs('bang')=false)
    tk.specKey = 'bang';
    bangX = { w: '', s1: '', s2: '', fl: '', id: null, active: 'w' };
    dirty = true;
    renderSpecs(); renderSubTabs(); renderValues(); renderPhotos(); renderReport();
    syncBangUI();
  }

  /* 방통 모드 화면 전환 — 공시체 전용 구획은 CSS(.bangmode)가 숨긴다 */
  function syncBangUI() {
    const on = isBang();
    $('#view-task').classList.toggle('bangmode', on);
    $('#tk-bang-fields').classList.toggle('hidden', !on);
    $('#tk-bang-keypad').classList.toggle('hidden', !on);
    $('#tk-heading').textContent = on ? '방통시험' : (tk && tk.id ? '작업' : '새 작업');
    $('#tk-delete').classList.toggle('hidden', on ? !bangX.id : !(tk && tk.id));
    if (on) { renderBangFields(); renderBangResult(); }
  }

  function renderBangFields() {
    if (!bangX) return;
    $('#tkbv-w').textContent = bClean(bangX.w) || '0';   // 무게: 친 그대로(자율)
    $('#tkbv-s1').textContent = bDigits(bangX.s1) ? String(parseInt(bangX.s1, 10)) : '0';
    $('#tkbv-s2').textContent = bDigits(bangX.s2) ? String(parseInt(bangX.s2, 10)) : '0';
    $('#tkbv-fl').textContent = bDigits(bangX.fl) ? (parseInt(bangX.fl, 10) + '층') : '—';
    ['w', 's1', 's2', 'fl'].forEach((f) => $('#tkb-' + f).classList.toggle('on', bangX.active === f));
  }

  function bangVals() {
    const w = parseFloat(bClean(bangX.w));
    const a = bDigits(bangX.s1), b = bDigits(bangX.s2);
    return {
      w: (isFinite(w) && w > 0) ? w : null,
      s1: a ? parseInt(a, 10) : null,
      s2: b ? parseInt(b, 10) : null
    };
  }

  function renderBangResult() {
    if (!bangX) return;
    $('#tk-bang-result').innerHTML = Bangtong.resultHTML(Bangtong._calc(bangVals()));
  }

  function bangPress(k) {
    if (!bangX) return;
    const isW = (bangX.active === 'w');
    let s = isW ? bClean(bangX[bangX.active]) : bDigits(bangX[bangX.active]);
    if (k === 'del') s = s.slice(0, -1);
    else if (k === 'clr') s = '';
    else if (k === '.') {
      if (!isW || s.indexOf('.') >= 0) return;          // 소수점은 무게 칸에서만, 하나만
      s = (s === '' ? '0.' : s + '.');
    } else if (/^[0-9]$/.test(k)) {
      s = (s === '0') ? k : (s + k);
      const max = isW ? 10 : (bangX.active === 'fl' ? 2 : 4);
      if (s.length > max) return;
    }
    bangX[bangX.active] = s;
    dirty = true;
    renderBangFields(); renderBangResult();
    U.buzz(4);
  }

  function bindBang() {
    $('#tk-bang-keypad').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tkk]');
      if (b) bangPress(b.getAttribute('data-tkk'));
    });
    ['w', 's1', 's2', 'fl'].forEach((f) => {
      $('#tkb-' + f).addEventListener('click', () => {
        if (!bangX) return;
        bangX.active = f;
        renderBangFields();
        U.buzz(4);
      });
    });
  }

  /* 지금 편집 중인 그릇. 28일이 아니면 작업 자체가 그릇이다. */
  function bag() {
    if (!tk) return { photos: [], sets: [] };
    if (!Task.hasSubs(tk)) return tk;
    if (!tk.sub) tk.sub = {};
    if (!tk.sub[curSub]) tk.sub[curSub] = { photos: [], sets: [] };
    if (!tk.sub[curSub].photos) tk.sub[curSub].photos = [];
    return tk.sub[curSub];
  }

  function renderSubTabs() {
    const wrap = $('#tk-subtabs');
    if (!wrap) return;
    const on = !!tk && Task.hasSubs(tk);
    wrap.classList.toggle('hidden', !on);
    wrap.innerHTML = '';
    if (!on) return;
    Spec.SUBS.forEach((s) => {
      const n = Task.subPhotos(tk, s.key).length;
      const b = U.el('button', 'subtab' + (curSub === s.key ? ' on' : ''));
      b.appendChild(U.el('span', 'subtab-name', s.name));
      b.appendChild(U.el('span', 'subtab-n' + (n ? ' has' : ''), n ? (n + '장') : '없음'));
      b.addEventListener('click', () => {
        if (curSub === s.key) return;
        curSub = s.key;
        renderSubTabs(); renderValues(); renderPhotos();
      });
      wrap.appendChild(b);
    });
    const lab = $('#tk-sets-label');
    if (lab) lab.textContent = (Spec.subByKey(curSub) || {}).name + ' 압축강도';
  }

  /* ---------------- 동수 ----------------
     동을 고르면 그 동 담당 감리가 따라온다(한 동에 둘이면 고르게 한다).
     동수는 목록 제목이자 카톡 문구("201동 수직입니다")의 주어다. */
  function renderDong() {
    const el = $('#tk-dong-name');
    if (!el || !tk) return;
    el.textContent = tk.dong || '동 선택';
    el.classList.toggle('ph', !tk.dong);
  }

  /* 추천 칩 — 후보를 그 자리에 늘어놓고 누르면 바로 붙는다.
     시트를 또 띄우면(모달 위 모달) 손이 많이 가서 칩으로 한다. */
  function chips(el, label, items) {
    if (!el) return;
    el.innerHTML = '';
    if (!items.length) { el.classList.add('hidden'); return; }
    el.appendChild(U.el('span', '', label + ' '));
    items.forEach((it) => {
      const b = U.el('button', 'sup-sug', it.label);
      b.addEventListener('click', (e) => { e.preventDefault(); it.onPick(); });
      el.appendChild(b);
    });
    el.classList.remove('hidden');
  }

  function clearHints() {
    ['#tk-sup-hint', '#tk-dong-hint'].forEach((s) => {
      const el = $(s);
      if (el) { el.innerHTML = ''; el.classList.add('hidden'); }
    });
  }

  /* 동 → 감리. 하나면 바로 붙이고, 여럿이면 다 띄워 고르게 한다. */
  /* 동 → 감리 싱크 규칙(사용자 지시): **감리가 비어 있을 때만** 자동으로 따라 채운다.
     이미 감리가 있으면 동만 바꿔도 감리를 안 건드린다 — 커스텀 짝(다른 동 감리에게 보고 등)을 허용. */
  function pickDong(dong) {
    if (!tk) return;
    tk.dong = dong || '';
    dirty = true;
    renderDong();
    renderReport();
    clearHints();

    if (tk.supervisor) { renderSup(); return; }        // 지정된 감리는 그대로 — 따라 바뀌지 않는다

    const sups = Contacts.byDong(dong);
    if (sups.length === 1) { pickSup(sups[0], true); return; }
    renderSup();
    if (sups.length > 1) {
      chips($('#tk-sup-hint'), '담당 감리',
        sups.map((c) => ({ label: Contacts.label(c), onPick: () => pickSup(c, true) })));
    }
  }

  function openDongPicker() {
    const list = Contacts.dongs();
    const items = list.map((d) => {
      const sups = Contacts.byDong(d).map((c) => Contacts.label(c)).join(', ');
      return { label: d, sub: sups, cls: (tk && tk.dong === d) ? 'strong' : '',
               onPick: () => pickDong(d) };
    });
    // 명부에 없는 동·장소도 쓴다(사용자 지시) — prompt 는 설정(서버 백업)과 같은 방식
    items.unshift({ label: '직접 입력', sub: '명부에 없는 동·장소',
      onPick: () => {
        const v = prompt('동 이름 (예: 220동, A9, 옥탑)', (tk && tk.dong) || '');
        if (v === null) return;
        pickDong(v.trim());
      } });
    items.unshift({ label: '지정 안 함', onPick: () => pickDong('') });
    U.sheet('동수 고르기', items);
  }

  /* ---------------- 담당 감리 ---------------- */
  function renderSup() {
    const nameEl = $('#tk-sup-name');
    const whereEl = $('#tk-sup-where');
    const callEl = $('#tk-sup-call');
    const hintEl = $('#tk-sup-hint');

    const c = tk.supPhone ? Contacts.byPhone(tk.supPhone) : null;
    if (tk.supervisor) {
      nameEl.textContent = tk.supervisor;
      nameEl.classList.remove('ph');
      whereEl.textContent = c ? Contacts.where(c) : '';
      callEl.classList.toggle('hidden', !tk.supPhone);
    } else {
      nameEl.textContent = '감리 선택';
      nameEl.classList.add('ph');
      whereEl.textContent = '';
      callEl.classList.add('hidden');
    }

    // 추천 칩은 pickDong/pickSup 이 세우고 지운다 — 여기선 건드리지 않는다
    void hintEl;
  }

  /* 감리 → 동 싱크 규칙(사용자 지시): **동이 비어 있을 때만** 자동으로 따라 채운다.
     이미 동이 있으면 감리만 바꿔도 동을 안 건드린다 — 커스텀 짝을 허용.
     fromDong 이면 동에서 온 것이므로 되짚어 가지 않는다 — 안 그러면 서로 덮어쓴다. */
  function pickSup(c, fromDong) {
    if (!tk) return;
    tk.supervisor = c ? Contacts.label(c) : '';
    tk.supPhone = c ? c.phone : '';
    dirty = true;
    renderSup();
    // 고르고 나면 추천 칩은 할 일을 다 했다
    const sh = $('#tk-sup-hint');
    if (sh) { sh.innerHTML = ''; sh.classList.add('hidden'); }
    if (fromDong) { $('#tk-dong-hint').classList.add('hidden'); return; }
    if (tk.dong) { $('#tk-dong-hint').classList.add('hidden'); return; }   // 지정된 동은 그대로

    const ds = c ? Contacts.dongsOf(c) : [];
    if (ds.length === 1) {
      tk.dong = ds[0];
      renderDong(); renderReport();
      $('#tk-dong-hint').classList.add('hidden');
      return;
    }
    chips($('#tk-dong-hint'), ds.length ? '담당 동' : '',
      ds.map((d) => ({ label: d, onPick: () => {
        tk.dong = d; dirty = true; renderDong(); renderReport();
        $('#tk-dong-hint').classList.add('hidden');
      } })));
  }

  /* 감리 목록 화면 */
  function openSupPicker() {
    const list = $('#sup-list');
    const input = $('#sup-search');
    input.value = '';

    const draw = (q) => {
      list.innerHTML = '';
      const rows = Contacts.search(q);
      if (!rows.length) {
        list.appendChild(U.el('p', 'empty-msg', '검색 결과가 없습니다'));
        return;
      }
      const frag = document.createDocumentFragment();
      // 선택 해제
      const none = U.el('button', 'sup-item');
      none.appendChild(U.el('span', 'sup-name ph', '지정 안 함'));
      none.addEventListener('click', () => { pickSup(null); Nav.showSup(false); });
      frag.appendChild(none);

      // 명부에 없는 감리도 쓴다(사용자 지시) — 이름 필수, 전화는 선택(비우면 전화버튼 숨김)
      const custom = U.el('button', 'sup-item');
      const cl = U.el('div', 'sup-left');
      cl.appendChild(U.el('span', 'sup-name', '직접 입력'));
      cl.appendChild(U.el('span', 'sup-sub', '명부에 없는 감리'));
      custom.appendChild(cl);
      custom.addEventListener('click', () => {
        if (!tk) return;
        const name = prompt('감리 이름·직급 (예: 홍길동 소장)', tk.supervisor || '');
        if (name === null || !name.trim()) return;
        const phone = prompt('전화번호 (선택 — 비워도 됩니다)', tk.supPhone || '');
        tk.supervisor = name.trim();
        tk.supPhone = (phone === null) ? '' : phone.trim();
        dirty = true;
        renderSup(); renderReport();
        const sh = $('#tk-sup-hint');
        if (sh) { sh.innerHTML = ''; sh.classList.add('hidden'); }
        Nav.showSup(false);
      });
      frag.appendChild(custom);

      rows.forEach((c) => {
        const b = U.el('button', 'sup-item' + (tk && tk.supPhone === c.phone ? ' on' : ''));
        const left = U.el('div', 'sup-left');
        left.appendChild(U.el('span', 'sup-name', Contacts.label(c)));
        left.appendChild(U.el('span', 'sup-sub', Contacts.where(c) + ' · ' + c.phone));
        b.appendChild(left);
        b.addEventListener('click', () => { pickSup(c); Nav.showSup(false); });
        frag.appendChild(b);
      });
      list.appendChild(frag);
    };

    draw('');
    let t = null, composing = false;
    const apply = () => { clearTimeout(t); t = setTimeout(() => draw(input.value), 150); };
    input.oncompositionstart = () => { composing = true; clearTimeout(t); };
    input.oncompositionend = () => { composing = false; apply(); };
    input.oninput = () => { if (!composing) apply(); };

    Nav.showSup(true);
  }

  function callSup() {
    if (!tk || !tk.supPhone) return;
    const c = Contacts.byPhone(tk.supPhone);
    const who = (tk.supervisor || '') + (c ? ' (' + Contacts.where(c) + ')' : '');
    U.sheet(who + '\n' + tk.supPhone, [
      { label: '전화 걸기', cls: 'strong', onPick: () => {
          // tel: 을 열면 다이얼러가 뜬다 (기기에 따라 바로 발신)
          try { global.location.href = 'tel:' + tk.supPhone.replace(/[^0-9+]/g, ''); }
          catch (e) { U.toast('전화 앱을 열지 못했습니다'); }
        } },
      { label: '번호 복사', sub: tk.supPhone, onPick: () => {
          U.copyText(tk.supPhone).then((o) => U.toast(o ? '번호를 복사했습니다' : '복사에 실패했습니다'));
        } }
    ]);
  }

  /* ---------------- 계산 세트 ----------------
     한 작업에 강도 계산이 여러 벌 들어간다 — 회사가 다르거나 LOT 가 여러 개일 때.
     값 자체는 계산 탭 키패드로 넣는다(여기 작은 칸에 치는 것보다 훨씬 빠르다).
     여기서는 세트를 만들고·이름 붙이고·지우고, 계산기로 넘어가기만 한다. */
  function renderValues() {
    const wrap = $('#tk-sets');
    const box = bag();
    if (!wrap) return;
    wrap.innerHTML = '';
    const sets = Store.normalizeSets(box);   // ← 반드시 그릇에서. tk 에서 읽으면 칸이 비워진다
    box.sets = sets;                      // 구버전 값을 세트로 옮긴 결과를 그대로 들고 간다
    delete box.values; delete box.factor;

    if (!sets.length) {
      wrap.appendChild(U.el('p', 'set-empty', '아직 계산 세트가 없습니다'));
      return;
    }

    sets.forEach((set, i) => {
      const row = U.el('div', 'set-row');

      const name = U.el('input', 'set-name');
      name.type = 'text';
      name.maxLength = 24;
      name.placeholder = '세트 ' + (i + 1);
      name.value = set.name || '';
      name.setAttribute('autocomplete', 'off');
      name.setAttribute('autocorrect', 'off');
      name.setAttribute('autocapitalize', 'off');
      name.setAttribute('spellcheck', 'false');
      name.addEventListener('input', () => { set.name = name.value; dirty = true; });

      const st = Task.setStats(set);
      const sum = U.el('div', 'set-sum');
      if (st.n) {
        sum.innerHTML = st.n + '개 · 보정평균 <b>' + U.fix2(st.corr) +
                        '</b> N/mm² <span>(×' + st.factor + ')</span>';
      } else {
        sum.textContent = '값 없음';
        sum.classList.add('off');
      }

      // label 로 감싸면 요약줄을 눌러도 이름칸이 잡힌다 — 34px 입력칸 하나만 노리지 않아도 된다
      const left = U.el('label', 'set-main');
      left.appendChild(name);
      left.appendChild(sum);

      const open = U.el('button', 'set-open');
      open.appendChild(U.icon('calc'));
      open.setAttribute('aria-label', Task.setName(set, i) + ' 계산기 열기');
      open.addEventListener('click', () => openCalc(set.id));

      const del = U.el('button', 'set-del');
      del.appendChild(U.icon('close'));
      del.setAttribute('aria-label', Task.setName(set, i) + ' 삭제');
      del.addEventListener('click', () => removeSet(set, i));

      row.appendChild(left);
      row.appendChild(open);
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function removeSet(set, i) {
    const st = Task.setStats(set);
    const go = () => {
      const b2 = bag();
      b2.sets = Store.normalizeSets(b2).filter((s) => s.id !== set.id);
      dirty = true; renderValues();
      U.toast(Task.setName(set, i) + '를 지웠습니다');
    };
    if (!st.n) { go(); return; }          // 빈 세트는 되묻지 않는다
    U.confirmSheet(Task.setName(set, i) + ' 삭제\n값 ' + st.n + '개가 함께 지워집니다', '삭제', go, true);
  }

  /* 새 세트를 만들고 바로 계산기로 넘어간다 */
  async function addSet() {
    if (!tk) return;
    const box = bag();
    const sets = Store.normalizeSets(box);
    const fresh = { id: U.uid(), name: '', values: [], factor: Calc.DEFAULT_FACTOR };
    box.sets = sets.concat([fresh]);
    delete box.values; delete box.factor;
    dirty = true;
    renderValues();
    await openCalc(fresh.id);
  }

  /* 작업을 먼저 저장해 id 를 확보한 뒤 계산 탭을 그 세트에 연결한다 */
  async function openCalc(setId) {
    if (!tk) return;
    // await 너머에서 tk(다른 작업 열기)와 curSub(수중/봉함 탭 전환)가 바뀔 수 있다.
    // 바뀐 curSub 로 반대편 칸을 뒤지면 엉뚱한 세트에 연결돼 실측값을 덮어쓴다(감사 확인).
    const owner = tk;
    const sub = Task.hasSubs(tk) ? curSub : '';
    const rec = await save(true);
    if (!rec) { U.toast('작업을 저장하지 못했습니다'); return; }
    if (tk !== owner) return;          // 저장 사이 다른 작업으로 갈아탔다 — 건드리지 않는다
    const sets = sub ? Store.normalizeSets(Task.subOf(rec, sub)) : Task.setsOf(rec);
    let idx = sets.findIndex((s) => s.id === setId);
    if (idx < 0) idx = sets.length - 1;
    const set = sets[idx];
    if (!set) { U.toast('세트를 찾지 못했습니다'); return; }

    const bits = [Task.label(rec) + (sub ? (' ' + (Spec.subByKey(sub)||{}).name) : '')];
    if (rec.part) bits.push(rec.part);
    if (sets.length > 1) bits.push(Task.setName(set, idx));

    Nav.showTask(false);
    Nav.go('calc');
    Calc.linkTo(rec.id, set.id, bits.join(' · '), set.values, set.factor, sub);
  }

  /* 사진 크게 보기 — 원본(파일·OPFS 이전분 포함)을 라이트박스로.
     균열·표면 확인이 이 앱의 목적이라 핀치 확대는 라이트박스에서만 풀린다(Nav.setZoomable). */
  async function openLightbox(pid) {
    let blob = null;
    try {
      const p = await Store.getPhoto(pid);
      blob = (await Store.fullBlob(p)) || (p && p.thumb) || null;
    } catch (e) { console.error(e); }
    if (!blob) { U.toast('사진을 불러오지 못했습니다'); return; }
    const img = $('#lightbox-img');
    const url = URL.createObjectURL(blob);
    img.src = url;
    $('#lightbox').classList.remove('hidden');
    Nav.setZoomable(true);
    Nav.setLightboxCloser(() => {
      $('#lightbox').classList.add('hidden');
      Nav.setZoomable(false);
      img.removeAttribute('src');
      URL.revokeObjectURL(url);
      Nav.setLightboxCloser(null);
    });
  }

  /* ---------------- 사진 ---------------- */
  async function renderPhotos() {
    if (!tk) return;
    const owner = tk;
    // 수중/봉함 탭도 스냅샷 — await 사이에 탭이 바뀌면 낡은 렌더가 반대편 칸을 덮어 그려
    // 엉뚱한 사진이 지워질 수 있다(openCalc·addFiles 와 같은 계열 레이스, 반대심문 확인).
    const subAt = curKey();
    const grid = $('#tk-photos');
    grid.innerHTML = '';
    const box = bag();
    const n = (box.photos || []).length;
    $('#tk-pcount').textContent = n;
    // 28일은 두 칸을 다 채워야 완료다 — 이 칸만 찼다고 「완료」라 하면 거짓말이다
    const doneEl = $('#tk-pdone');
    const note = Task.doneNote(tk);
    if (note) { doneEl.textContent = '· ' + note; doneEl.className = 'done-flag off'; }
    else if (Task.isDone(tk)) { doneEl.textContent = '· 완료'; doneEl.className = 'done-flag'; }
    else { doneEl.textContent = ''; doneEl.className = ''; }
    if (!n) return;

    let photos = [];
    try { photos = await Store.getPhotos(box.photos); } catch (e) { console.error(e); }
    if (tk !== owner || curKey() !== subAt) return;   // 다른 작업/칸으로 갈아탔다 — 덮어 그리지 않는다
    const byId = {};
    photos.forEach((p) => { byId[p.id] = p; });
    grid.innerHTML = '';

    box.photos.forEach((pid, i) => {
      const p = byId[pid];
      const cell = U.el('div', 'photo-cell');
      if (p) {
        const img = new Image();
        img.src = U.thumbUrl(p.id, p.thumb || p.full);
        img.alt = (i + 1) + '번 사진';
        cell.appendChild(img);
        // 탭하면 원본 크게 보기(사용자 지시) — 삭제 X 는 stopPropagation 이라 안 겹친다
        cell.addEventListener('click', () => openLightbox(pid));
      } else { cell.classList.add('loading'); cell.textContent = '불러오기 실패'; }
      const del = U.el('button', 'del');
      del.appendChild(U.icon('close'));
      del.setAttribute('aria-label', (i + 1) + '번 사진 삭제');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        // 렌더된 그 칸이 아직 현재 칸일 때만 지운다 — 렌더한 box 를 그대로 쓴다(인덱스 어긋남 방지)
        if (!tk || curKey() !== subAt) return;
        U.dropUrl(box.photos[i]);
        box.photos.splice(i, 1); dirty = true; renderPhotos(); renderSubTabs();
      });
      cell.appendChild(del);
      cell.appendChild(U.el('span', 'n', (i + 1) + ''));
      grid.appendChild(cell);
    });
  }

  /* 처리 중인(아직 어느 작업에도 저장 안 된) 사진 id.
     doSave 의 gc 가 이걸 모르면 방금 찍은 사진을 미참조로 오인해 지운다(감사에서 확인된 레이스).
     gc 를 부르는 쪽은 반드시 이 목록을 보호 목록에 합친다. */
  const pendingIds = [];
  function unpend(id) { const i = pendingIds.indexOf(id); if (i >= 0) pendingIds.splice(i, 1); }

  async function addFiles(fileList, fromCamera) {
    if (!tk) return;
    const owner = tk;
    // 그릇도 지금 스냅샷 — 처리 중 수중/봉함 탭이 바뀌어도 시작한 칸에 붙인다(감사 확인)
    const box = bag();
    const files = Array.prototype.slice.call(fileList || []).filter((f) => f && f.size);
    if (!files.length) return;

    // 아이폰(PWA)의 <input capture> 촬영본은 사진 앱에 안 남는다 — 공유 시트로 저장할 수 있게
    // 처리본을 들고 있는다(사용자 지시: PWA 에서도 사진이 기기에 같이 남아야 한다).
    const shareFiles = [];
    const wantShare = fromCamera && !Native.isNative() &&
                      typeof navigator.share === 'function' && !!navigator.canShare;

    U.toast('사진 처리 중…', 60000);
    let ok = 0, fail = 0, aborted = false;
    try {
      for (const f of files) {
        const id = U.uid();
        pendingIds.push(id);           // putPhoto 커밋 전에 등록 — gc 와의 틈을 없앤다
        try {
          const img = await U.processImage(f, { maxSide: 1600, thumbSide: 320, quality: 0.82 });
          await Store.putPhoto(Object.assign({ id: id }, img));
          if (wantShare) {
            try { shareFiles.push(new File([img.full], 'gongsiche_' + id + '.jpg', { type: 'image/jpeg' })); }
            catch (e) {}
          }
        } catch (e) { console.error('[photo]', e); fail++; unpend(id); continue; }
        if (tk !== owner) { aborted = true; unpend(id); Store.deletePhotos([id]).catch(() => {}); break; }
        box.photos.push(id); dirty = true; ok++;
        // **장마다** 즉시 작업에 연결해 저장한다 — putPhoto 와 putTask 사이에서 앱이 죽으면
        // 사진이 고아가 되는 창을 한 장 분량으로 줄인다(반대심문 확인). 새 작업도 첫 장에서 생긴다.
        if (tk === owner) await save(true);
        unpend(id);                    // 작업 레코드에 실렸다 — 이제부터는 DB 가 지킨다
      }
      if (tk === owner) { await renderPhotos(); renderSubTabs(); }
    } finally {
      if (aborted) U.toast('편집기를 벗어나 사진 추가를 중단했습니다');
      else if (fail && ok) U.toast(ok + '장 추가 · ' + fail + '장 실패');
      else if (fail) U.toast(fail + '장 모두 불러오지 못했습니다');
      else {
        const done = ok + '장 추가했습니다' + ((tk && Task.isDone(tk)) ? ' · 완료' : '');
        if (ok && shareFiles.length && navigator.canShare({ files: shareFiles })) {
          // 자동 저장은 브라우저가 막는다(사용자 제스처 필요) — 한 번 눌러 사진 앱에 저장
          U.toast(done + '\n촬영본은 앱 안에만 있습니다', 8000, {
            label: '사진 앱에 저장',
            onClick: () => { navigator.share({ files: shareFiles }).catch(() => {}); }
          });
        } else {
          U.toast(done);
        }
      }
    }
  }

  /* ---------------- 저장 / 삭제 ---------------- */
  function collect() {
    if (!tk) return null;
    tk.castDay = $('#tk-cast').value || tk.castDay;
    // #tk-day 는 시험일이다. 목록 날짜(day)는 #tk-workday 로만 바뀐다.
    tk.testDay = $('#tk-day').value || Task.testDayOf(tk);
    const wd = $('#tk-workday');
    if (wd && wd.value) tk.day = wd.value;
    tk.part = $('#tk-part').value.trim();   // 순수 메모
    return tk;                    // supervisor/supPhone 은 감리 선택에서 채운다
  }

  /* 예전엔 저장 중이면 그 Promise 를 그대로 돌려줬다. 그러면 A 저장 중에 B 를 저장할 때
     B 는 저장되지 않고 A 의 결과만 받아 갔다. 버리지 말고 순서대로 줄 세운다. */
  function save(silent) {
    const p = (saving || Promise.resolve()).then(() => doSave(silent));
    saving = p.catch(() => {});
    return p;
  }

  /* 이 작업이 들고 있는 사진 id 전부(28일은 수중·봉함 칸 포함) — gc 보호 목록용.
     owner.photos 스냅샷만 쓰면 d28 칸 사진과 방금 push 된 사진이 빠진다. */
  function photoIdsOf(t) {
    if (!t) return [];
    const out = (t.photos || []).slice();
    if (t.sub) Spec.SUBS.forEach((s) => {
      (((t.sub[s.key] || {}).photos) || []).forEach((id) => {
        if (out.indexOf(id) < 0) out.push(id);
      });
    });
    return out;
  }

  async function doSave(silent) {
    if (!tk) return null;
    collect();
    // await 를 넘는 순간 tk 가 다른 작업으로 바뀔 수 있다(닫기·다른 작업 열기).
    // 저장 대상을 붙들어 두고, 화면 상태는 '아직 그 작업을 보고 있을 때만' 건드린다.
    const owner = tk;

    // 방통 모드 — putTask 가 아니라 putBang. tk 는 동·감리·사진 캐리어다.
    if (bangX) {
      const bx = bangX;
      const v = bangVals();
      const rec = {
        id: bx.id || undefined,
        day: owner.day || U.dayKey(Date.now()),
        dong: owner.dong || '', floor: bDigits(bx.fl),
        memo: (owner.part || '').trim(),               // 메모 칸(#tk-part)을 방통 메모로 쓴다
        supervisor: owner.supervisor || '', supPhone: owner.supPhone || '',
        jugu: owner.jugu || U.jugu(),
        photos: (owner.photos || []).slice(),
        w: v.w, s1: v.s1, s2: v.s2
      };
      let saved;
      try { saved = await Store.putBang(rec); }
      catch (e) { console.error(e); U.toast('저장하지 못했습니다'); return null; }
      if (bangX === bx) {
        bx.id = saved.id;
        if (tk === owner) { dirty = false; syncBangUI(); }
      }
      Store.gc((owner.photos || []).slice().concat(pendingIds));
      refreshLists();
      if (!silent) U.toast('방통시험을 저장했습니다');
      return saved;
    }

    let rec;
    try { rec = await Store.putTask(owner); }
    catch (e) { console.error(e); U.toast('저장하지 못했습니다'); return null; }
    owner.id = rec.id; owner.createdAt = rec.createdAt;
    if (tk === owner) {
      dirty = false;
      $('#tk-heading').textContent = '작업';
      $('#tk-delete').classList.remove('hidden');
    }
    // 보호 목록은 저장 뒤 **지금** 다시 모은다 — 저장 사이에 붙은 사진과 처리 중 사진까지 지킨다
    Store.gc(photoIdsOf(owner).concat(pendingIds));
    refreshLists();
    if (!silent) U.toast('저장했습니다');
    return rec;
  }

  function removeTask() {
    // 방통 모드 — 저장된 방통 기록을 지운다
    if (bangX) {
      if (!bangX.id) { tk = null; bangX = null; Nav.showTask(false); return; }
      const bid = bangX.id;
      const owner = tk;
      U.confirmSheet('이 방통시험 기록을 지울까요?\n사진도 함께 지워집니다', '삭제', async () => {
        try { await Store.deleteBang(bid); }
        catch (e) { console.error(e); U.toast('삭제하지 못했습니다'); return; }
        if (tk === owner) { tk = null; bangX = null; Nav.showTask(false); }
        refreshLists();
        U.toast('삭제했습니다');
      }, true);
      return;
    }
    if (!tk || !tk.id) { tk = null; Nav.showTask(false); return; }
    const id = tk.id;
    const owner = tk;
    U.confirmSheet('이 작업을 삭제할까요?\n사진도 함께 지워집니다', '삭제', async () => {
      try { await Store.deleteTask(id); }
      catch (e) { console.error(e); U.toast('삭제하지 못했습니다'); return; }
      // 삭제가 도는 사이 다른 작업을 열었을 수 있다 — 그때는 그 화면을 닫지 않는다
      if (tk === owner) { tk = null; Nav.showTask(false); }
      refreshLists();
      U.toast('삭제했습니다');
    }, true);
  }

  function tryClose() {
    if (!tk) { Nav.showTask(false); return; }
    collect();
    // 예전의 "빈 작업" 판정은 동·분류·날짜만 고른 작업을 빈 것으로 오판해 경고 없이
    // 버렸다(작업 증발 신고의 실제 원인 — 버그리포트). 규칙을 단순화한다:
    // 바뀐 게 없으면 조용히 닫고, 바뀌었으면 무조건 묻는다.
    if (!dirty) { tk = null; Nav.showTask(false); Store.gc(pendingIds.slice()); return; }
    U.sheet('저장하지 않은 변경이 있습니다', [
      { label: '저장하고 나가기', cls: 'strong', onPick: async () => {
          const r = await save(true);
          if (r) { tk = null; Nav.showTask(false); U.toast('저장했습니다'); }
        } },
      { label: '저장하지 않고 나가기', cls: 'danger', onPick: () => {
          tk = null; Nav.showTask(false); Store.gc(pendingIds.slice());
        } }
    ]);
  }

  /* ---------------- 내보내기 ---------------- */
  async function exportTask() {
    // 방통 모드 — 저장 뒤 방통 전용 카톡(문구+사진)으로 보낸다
    if (bangX) {
      const r = await save(true);
      if (r) Bangtong.exportRec(r);
      return;
    }
    const rec = await save(true);
    if (!rec) return;
    const title = Task.summary(rec);
    const n = (rec.photos || []).length;
    const items = [];
    if (n) {
      items.push({
        label: '사진 도장: ' + (U.wmPref() ? '켬' : '끔'),
        sub: '사진 귀퉁이에 동·분류·날짜를 찍어 보냅니다 — 탭해서 ' + (U.wmPref() ? '끄기' : '켜기'),
        onPick: () => { U.setWmPref(!U.wmPref()); exportTask(); }
      });
      items.push({ label: '사진 ' + n + '장 보내기 + 제목 복사', cls: 'strong',
        sub: title, onPick: () => doExport(rec, true) });
      items.push({ label: '사진 ' + n + '장만 보내기', sub: '클립보드는 그대로 둡니다',
        onPick: () => doExport(rec, false) });
      items.push({ sep: true });
    }
    items.push({ label: '제목 복사', sub: title, onPick: () => {
      U.copyText(title).then((o) => U.toast(o ? '복사했습니다' : '복사에 실패했습니다')); } });
    U.sheet('카카오톡으로 내보내기', items);
  }

  async function doExport(rec, copyTitle) {
    const title = Task.summary(rec);
    let blobs = [];
    if ((rec.photos || []).length) {
      U.toast('사진 준비 중…', 60000);
      try {
        const photos = await Store.getPhotos(rec.photos);
        const byId = {}; photos.forEach((p) => { byId[p.id] = p; });
        const wm = U.wmPref();      // 사진 도장 — 내보내는 사본에만
        const subKeyOf = (id) => {
          if (!Task.hasSubs(rec)) return '';
          for (const s of Spec.SUBS) {
            if (Task.subPhotos(rec, s.key).indexOf(id) >= 0) return s.key;
          }
          return '';
        };
        for (const id of rec.photos) {
          let b = byId[id] ? await Store.fullBlob(byId[id]) : null;   // 파일로 옮겨진 원본 포함
          if (b && wm) b = await U.stampImage(b, Task.wmText(rec, subKeyOf(id)));
          if (b) blobs.push(b);
        }
      } catch (e) { console.error(e); }
      const missing = rec.photos.length - blobs.length;
      if (!blobs.length) { U.toast('사진을 불러오지 못했습니다'); return; }
      if (missing) U.toast(missing + '장은 불러오지 못해 빠집니다', 3000);
    }
    let copied = false;
    if (copyTitle) { try { copied = await U.copyText(title); } catch (e) {} }

    // 파일명도 보고 날짜 기준 — 목록 날짜(day)와 다를 수 있다
    const base = U.safeName((rec.part || Task.label(rec)), '공시체') + '_' +
                 (Task.reportDayOf(rec) || rec.day || '').replace(/-/g, '');
    let how = 'download';
    try {
      how = await Share.exportItems({ blobs: blobs, text: title, title: title, baseName: base });
    } catch (e) { console.error(e); U.toast('내보내기에 실패했습니다'); return; }

    if (how === 'cancel') U.toast('내보내기를 취소했습니다');
    else if (how === 'fail') U.toast(copied ? '공유에 실패했습니다\n제목은 복사했습니다' : '공유에 실패했습니다');
    else if (how === 'download') U.toast('공유 기능이 없어 파일로 저장했습니다');
    else if (how === 'download-multi') U.toast('파일로 저장합니다 — 브라우저가 여러 장을 막으면 허용을 눌러 주세요', 4000);
    else if (copied) U.toast('사진을 보낸 뒤 대화창에 붙여넣기', 3500);
    else U.toast('공유할 앱에서 카카오톡을 선택하세요');
  }

  /* ---------------- 바인딩 ---------------- */
  function bind() {
    $('#tk-back').addEventListener('click', tryClose);
    bindBang();
    $('#tk-delete').addEventListener('click', removeTask);
    $('#tk-save').addEventListener('click', () => { save(false); });
    $('#tk-export').addEventListener('click', () => { exportTask(); });

    $('#tk-part').addEventListener('input', () => { dirty = true; });
    // 「사진」 배지 체크 — 표시 전용, 아무 기능에도 영향 없음(사용자 지시)
    const pmBox = $('#tk-photomark');
    if (pmBox) pmBox.addEventListener('change', () => {
      if (!tk) return;
      tk.photoMark = pmBox.checked;
      dirty = true;
    });
    $('#tk-dong-pick').addEventListener('click', openDongPicker);
    $('#tk-sup-pick').addEventListener('click', openSupPicker);
    $('#tk-sup-call').addEventListener('click', callSup);
    $('#sup-back').addEventListener('click', () => Nav.showSup(false));
    $('#tk-cast').addEventListener('change', () => {
      if (!tk) return; tk.castDay = $('#tk-cast').value; dirty = true; renderAge(); renderReport();
    });
    $('#tk-day').addEventListener('change', () => {
      if (!tk) return;
      tk.testDay = $('#tk-day').value;      // 시험일만 바뀐다 — 목록은 안 움직인다
      dirty = true; renderSpecs(); renderAge(); renderReport(); renderWorkDay();
    });
    $('#tk-workday').addEventListener('change', () => {
      if (!tk) return;
      tk.day = $('#tk-workday').value || tk.day;
      dirty = true; renderWorkDay();
    });

    $('#tk-add-set').addEventListener('click', () => { addSet(); });

    const shootInput = $('#file-shoot'), pickInput = $('#file-pick');
    shootInput.addEventListener('change', (e) => addFiles(e.target.files, true));
    pickInput.addEventListener('change', (e) => addFiles(e.target.files));

    /* 카메라·앨범 인텐트가 뜨는 동안 안드로이드가 앱을 죽일 수 있다(저사양·메모리 압박).
       떠나기 전에 무음 저장해 두면 돌아왔을 때 콜드부팅이어도 작업이 산다(버그리포트 P1). */
    const holdBeforeLeave = async () => { if (tk && dirty) await save(true); };

    // 네이티브(APK)면 Camera 플러그인, 아니면 <input type=file> 폴백
    $('#tk-shoot').addEventListener('click', async () => {
      await holdBeforeLeave();
      const files = await Native.shoot();
      if (files === null) { shootInput.value = ''; shootInput.click(); return; }
      if (files.length) addFiles(files, true);
    });
    $('#tk-pick').addEventListener('click', async () => {
      await holdBeforeLeave();
      const files = await Native.pick();
      if (files === null) { pickInput.value = ''; pickInput.click(); return; }
      if (files.length) addFiles(files);
    });

    // 카톡 전환·홈버튼 등 모든 이탈을 커버하는 안전망 — 가려지는 순간 무음 저장.
    // ※ 완료 보장은 못 한다(브라우저가 기다려 주지 않는다) — 최선 노력이고,
    //   확실한 보장은 카메라/사진추가 경로의 await 저장(holdBeforeLeave·addFiles)이 맡는다.
    //   pagehide 도 같이 받아 신호를 이중화한다.
    const flushEdit = () => { if (tk && dirty) save(true); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushEdit();
    });
    window.addEventListener('pagehide', flushEdit);
  }

  function init() { bind(); }

  /* 계산 탭에서 넘어온 값을 새 세트로 채운다 */
  function setValues(values, factor) {
    if (!tk) return;
    const fac = (typeof factor === 'number' && isFinite(factor) && factor > 0)
      ? factor : Calc.DEFAULT_FACTOR;
    const box = bag();
    box.sets = Store.normalizeSets(box).concat([
      { id: U.uid(), name: '', values: (values || []).slice(), factor: fac }
    ]);
    delete box.values; delete box.factor;
    dirty = true;
    renderValues();
  }

  global.TaskUI = {
    init: init, open: open, tryClose: tryClose, setValues: setValues,
    isOpen: () => !!tk, addFiles: addFiles
  };
})(window);

;
/* ===== js/audit.js ===== */
/* ============ audit.js — AI 검수 (beta) ============
   두 겹으로 본다.

   1) 규칙 검사 — 앱이 가진 값끼리 대조. 인터넷도 API 도 필요 없다.
   2) 사진 판독 — 시험 성적판(화이트보드)에 적힌 값을 읽어 앱 값과 대조.

   ※ 딥시크는 이미지를 못 받는다(실측: image_url → HTTP 400 both models).
      그래서 판독만 Gemini 를 쓴다. 키가 없으면 1)만 하고 그 사실을 화면에 밝힌다.

   ※ 모델에게 "맞다/틀리다"를 시키지 않는다. 판에 적힌 숫자를 읽게만 하고
      대조는 compare() 가 코드로 한다 — 판정을 지어낼 여지를 없앤다.
================================================================ */
(function (global) {
  'use strict';

  const K_GKEY = 'gsc.vision.key.v1';
  /* 기본 키를 앱에 박아 둔다 — 사용자 지시(쓰는 사람이 둘뿐).
     APK 를 뜯으면 보이는 값이다. 밖으로 돌리게 되면 빼야 한다.
     앱에서 키를 새로 넣으면 그게 우선한다. */
  const DEFAULT_GKEY = '';
  const G_MODEL = 'gemini-3.1-flash-lite';     // 이미지 받는 것 중 가장 싼 쪽(무료 티어 있음)
  const G_API = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const TIMEOUT = 45000;
  const MAX_PHOTOS = 3;   // 마지막 N장을 본다 — 또렷하게 다시 찍은 판이 대개 뒤에 붙는다(반대심문 확인)

  /* ---------- 비전 키 ---------- */
  function gkey() {
    try {
      const own = (localStorage.getItem(K_GKEY) || '').trim();
      if (own) return own;
    } catch (e) {}
    return DEFAULT_GKEY;
  }
  function ownGkey() {
    try { return (localStorage.getItem(K_GKEY) || '').trim(); } catch (e) { return ''; }
  }
  function setGkey(v) {
    try { localStorage.setItem(K_GKEY, (v || '').trim()); } catch (e) {}
  }
  function hasVision() { return !!gkey(); }

  /* ---------- 1) 규칙 검사 ----------
     level: 'bad'(고쳐야 함) / 'warn'(확인 필요) / 'info'(참고) */
  function rules(t) {
    const out = [];
    const s = Spec.byKey(t.specKey);
    if (!s) out.push({ level: 'bad', text: '분류가 없습니다' });

    const age = Task.actualAge(t);
    if (age != null && age < 0) {
      out.push({ level: 'bad', text: '타설일이 시험일보다 늦습니다' });
    } else if (s && age != null && age !== s.age) {
      const d = age - s.age;
      out.push({
        level: Math.abs(d) >= 2 ? 'bad' : 'warn',
        text: s.name + '(' + s.age + '일)인데 타설~시험이 ' + age + '일입니다 ' +
              '(' + (d > 0 ? '+' : '') + d + '일)'
      });
    }
    if (!(t.photos || []).length) out.push({ level: 'bad', text: '사진이 없어 카톡으로 못 보냅니다' });
    if (!Task.filledSets(t).length) out.push({ level: 'warn', text: '강도값이 없습니다' });
    return out;
  }

  /* ---------- 2) 사진 판독 ---------- */
  function nativeHttp() {
    const C = global.Capacitor;
    return (C && C.isNativePlatform && C.isNativePlatform() &&
            C.Plugins && C.Plugins.CapacitorHttp) ? C.Plugins.CapacitorHttp : null;
  }

  function blobToB64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        const i = s.indexOf(',');
        res(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = () => rej(new Error('사진을 읽지 못했습니다'));
      r.readAsDataURL(blob);
    });
  }

  async function readPhotos(t) {
    // 앞이 아니라 **뒤에서** N장 — 흐릿하게 먼저 찍고 또렷하게 다시 찍은 판은 배열 끝에 붙는다.
    // 앞 2장만 보내면 나중에 찍은 좋은 사진을 영영 못 본다(반대심문 확인).
    const ids = (t.photos || []).slice(-MAX_PHOTOS);
    if (!ids.length) return [];
    let rows = [];
    try { rows = await Store.getPhotos(ids); } catch (e) { return []; }
    const out = [];
    for (const p of rows) {
      // 손글씨 숫자는 썸네일(320px)로 안 읽힌다 — 원본(최대 1600px)을 쓴다 (파일 이전분 포함)
      const blob = (await Store.fullBlob(p)) || p.thumb;
      if (!blob) continue;
      try { out.push({ b64: await blobToB64(blob), mime: blob.type || 'image/jpeg' }); }
      catch (e) {}
    }
    return out;
  }

  /* 판정 말고 '읽기'만 시킨다 */
  function visionPrompt() {
    return [
      '건설현장 콘크리트 압축강도 시험 성적판(화이트보드) 사진이다. 손글씨가 섞여 있다.',
      '',
      '사진은 보통 2장이 한 세트다 — 시험실 전경 한 장, 화이트보드 근접 한 장.',
      '**화이트보드가 가장 크고 또렷하게 나온 사진 하나만 기준으로 읽어라.**',
      '멀리 작게 찍힌 판은 무시한다. 두 장이 어긋나면 크게 찍힌 쪽이 맞다.',
      '',
      '**시험기(압축시험기) 계기판에 뜬 숫자는 절대 읽지 마라.**',
      '그건 하중 표시기 값(예: 160.10)이라 강도값이 아니다. 화이트보드에 적힌 것만 읽는다.',
      '',
      '판에 적힌 값을 읽어 아래 JSON 만 출력해라. 설명 문장·코드블록 금지.',
      '',
      '{"cast":"YYYY-MM-DD","test":"YYYY-MM-DD","spec":"수직|수평|필러|수중|봉함|null",',
      ' "values":[숫자,...],"factor":숫자,"corr":숫자,"part":"타설부위","age":숫자}',
      '',
      '읽는 법:',
      '- cast = 「타설일자」, test = 「시험일자」. "2026년 7월 27일" → "2026-07-27".',
      '- values = 「시험결과(N/mm²)」 표의 ①②③… 칸에 적힌 숫자 전부.',
      '  칸은 9개까지 있고 보통 3개만 채워져 있다. 빈 칸은 빼고 적힌 것만 순서대로 담아라.',
      '- factor = 「평균」 옆에 적힌 보정계수(보통 0.97).',
      '- corr = 시험결과 표 오른쪽 아래에 크게 적힌 최종 보정평균 값.',
      '- spec = 타설부위 줄 오른쪽에 적힌 분류(수직/수평/필러/수중/봉함).',
      '- age = 「재령일」 칸의 일수.',
      '',
      '규칙:',
      '- 못 읽거나 안 보이는 항목은 null 로 둬라. 절대 추측해서 채우지 마라.',
      '- 숫자는 소수점까지 그대로. 19.35 를 19.4 로 반올림하지 마라.',
      '- 판정하지 마라. 맞다/틀리다는 쓰지 말고 읽은 값만 담아라.'
    ].join('\n');
  }

  async function callVision(prompt, images) {
    const k = gkey();
    if (!k) throw new Error('NOVKEY');
    const input = [{ type: 'text', text: prompt }];
    images.forEach((im) => {
      input.push({ type: 'image', data: im.b64, mime_type: im.mime || 'image/jpeg' });
    });
    const body = { model: G_MODEL, input: input };
    const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': k };

    const http = nativeHttp();
    if (http) {
      const res = await http.request({
        url: G_API, method: 'POST', headers: headers, data: body,
        connectTimeout: TIMEOUT, readTimeout: TIMEOUT
      });
      if (res.status < 200 || res.status >= 300) {
        throw new Error('HTTP ' + res.status + ' ' + brief(res.data));
      }
      return pickText((typeof res.data === 'string') ? JSON.parse(res.data) : res.data);
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch(G_API, {
        method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + brief(await res.text()));
      return pickText(await res.json());
    } finally { clearTimeout(timer); }
  }

  function brief(v) {
    const s = (typeof v === 'string') ? v : JSON.stringify(v || '');
    return s.length > 200 ? s.slice(0, 200) + '…' : s;
  }

  /* 응답 형식이 바뀔 수 있어 여러 모양을 받아 준다 */
  function pickText(d) {
    if (!d) throw new Error('빈 응답');
    if (typeof d.text === 'string' && d.text.trim()) return d.text.trim();
    if (typeof d.output_text === 'string' && d.output_text.trim()) return d.output_text.trim();
    const walk = (arr) => {
      let s = '';
      (arr || []).forEach((o) => {
        if (typeof o === 'string') s += o;
        else if (o && typeof o.text === 'string') s += o.text;
        else if (o && o.type === 'thought') { /* 사고 단계는 본문이 아니다 — 건너뛴다 */ }
        else if (o && Array.isArray(o.content)) s += walk(o.content);
        else if (o && Array.isArray(o.parts)) s += walk(o.parts);
        else if (o && Array.isArray(o.steps)) s += walk(o.steps);
      });
      return s;
    };
    // 실측한 /v1beta/interactions 응답: { steps:[{type:'thought'},{content:[{text:'…'}]}] }
    let s = walk(d.steps || d.output || d.outputs || d.content);
    if (s && s.trim()) return s.trim();
    const c = d.candidates && d.candidates[0];       // 구형 generateContent 모양
    const parts = c && c.content && c.content.parts;
    if (parts && parts.length) {
      s = parts.map((p) => p.text || '').join('');
      if (s.trim()) return s.trim();
    }
    throw new Error('응답을 해석하지 못했습니다: ' + brief(d));
  }

  function parseJson(text) {
    let s = String(text || '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  /* ---------- 성적판 값만 읽기 (계산기 판넬 OCR 의 온라인 경로) ----------
     온디바이스 ML Kit 이 매직 손글씨에 약해서(9칸 중 3~7칸 실측),
     인터넷이 될 땐 이쪽을 먼저 쓴다. 원칙은 검수와 동일 — 모델은 숫자만 읽고
     판정·필터링은 코드가 한다. */
  async function readBoardValues(b64) {
    const prompt = [
      '콘크리트 시험 성적판(화이트보드) 사진이다.',
      '「시험결과(N/mm²)」 표의 ①②③… 칸에 손글씨로 적힌 숫자만 순서대로 담아',
      '{"values":[41.45,42.98]} 형태의 JSON 으로만 답하라.',
      '- 칸은 최대 9개, 빈 칸은 건너뛴다. 적힌 순서(왼→오른, 위→아래)를 지켜라.',
      '- 「평균」 칸의 보정계수(0.97 같은 1 미만 값)와 오른쪽 아래 큰 보정평균 값은 넣지 마라.',
      '- 시험기 계기판에 뜬 숫자도 넣지 마라 — 판에 손으로 적힌 것만.',
      '- 못 읽으면 {"values":[]} 로 답하라. JSON 밖에 다른 말을 쓰지 마라.'
    ].join('\n');
    const txt = await callVision(prompt, [{ b64: b64 }]);
    const j = parseJson(txt);
    const out = [];
    ((j && j.values) || []).forEach((v) => {
      const n = Number(v);
      if (isFinite(n) && n >= 3 && n <= 99.99) out.push(Math.round(n * 100) / 100);
    });
    return out;
  }

  /* ---------- 대조 (코드가 한다) ----------
     확인할 건 셋이다 — 강도값 · 보정평균 · 타설/시험일. */
  /* null 은 숫자가 아니다. isFinite(null) 이 true 라 그냥 쓰면 0 으로 새어 들어온다. */
  function num(v) {
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  }
  function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  /* 화면에는 소수 둘째 자리까지만 보인다. 그러니 '보이는 값'으로 비교해야
     10.000 과 10.005 처럼 화면상 10.00 / 10.01 로 다른 값이 같다고 통과하지 않는다.
     반올림은 U.fix2 와 같은 방식(1e-9 보정)을 쓴다. */
  function cents(v) { return Math.round(v * 100 + 1e-9); }
  function same2(a, b) {
    return num(a) !== null && num(b) !== null && cents(a) === cents(b);
  }
  /* 값은 적는 순서가 뒤바뀔 수 있고 개수도 3~9개로 다양하다
     → 정렬해서 다중집합으로 비교한다 */
  function sameList(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return false;
    const x = a.slice().sort((p, q) => p - q), y = b.slice().sort((p, q) => p - q);
    return x.every((v, i) => same2(v, y[i]));
  }

  function compare(t, r) {
    const out = [];
    if (!r) return out;
    const sets = Task.filledSets(t);

    const nums = (Array.isArray(r.values) ? r.values : [])
      .map(Number).filter((v) => isFinite(v) && v > 0);
    const hasNums = nums.length > 0;
    const hasCorr = num(r.corr) !== null;
    const hasCast = isDay(r.cast);
    const hasTest = isDay(r.test);

    // 사진은 붙어 있는데 핵심을 하나도 못 읽었다면 "이상 없음"이 아니다.
    // 안 읽고 통과시키면 검수를 했다는 착각만 남는다.
    if (!hasNums && !hasCorr && !hasCast && !hasTest) {
      out.push({
        level: 'warn', fromPhoto: true,
        text: '사진에서 값을 읽지 못했습니다 — 판이 흐리거나 각도가 나쁩니다. 눈으로 확인하세요'
      });
      return out;
    }

    // ── 강도값·보정평균은 **같은 세트 안에서** 맞아야 한다.
    //    따로 맞추면 값은 A세트, 보정평균은 B세트에 걸려 통과하는 구멍이 생긴다.
    if ((hasNums || hasCorr) && sets.length) {
      const vOk = (set) => !hasNums || sameList(nums, (set.values || []).map((e) => e.v));
      const cOk = (set) => !hasCorr || same2(Task.setStats(set).corr, r.corr);
      const both = sets.find((s) => vOk(s) && cOk(s));
      if (!both) {
        const appTxt = sets.map((set, i) => Task.setName(set, i) + ' ' +
          (set.values || []).map((e) => U.fix2(e.v)).join(', ') +
          ' → ' + U.fix2(Task.setStats(set).corr)).join(' / ');
        if (hasNums && !sets.some(vOk)) {
          out.push({ level: 'bad', fromPhoto: true,
            text: '강도값이 다릅니다\n판 ' + nums.map((v) => U.fix2(v)).join(', ') +
                  '\n앱 ' + appTxt });
        } else if (hasCorr && !sets.some(cOk)) {
          out.push({ level: 'bad', fromPhoto: true,
            text: '보정평균이 다릅니다 — 판 ' + U.fix2(r.corr) + '\n앱 ' + appTxt });
        } else {
          // 각각은 어딘가에 맞는데 한 세트에서 같이 맞는 곳이 없다
          out.push({ level: 'bad', fromPhoto: true,
            text: '강도값과 보정평균이 서로 다른 세트에 걸립니다\n판 ' +
                  nums.map((v) => U.fix2(v)).join(', ') + ' → ' + U.fix2(r.corr) +
                  '\n앱 ' + appTxt });
        }
      }
    }

    // 판 자체의 손계산이 틀린 경우 (앱과 무관하게 판만 봐도 안 맞는다)
    // 판과 같은 방식으로 계산해야 공정하다 — 값별 보정 후 평균(Calc.corrOf)
    if (hasNums && hasCorr) {
      const fac = num(r.factor) !== null && r.factor > 0 ? r.factor : Calc.DEFAULT_FACTOR;
      const want = Calc.corrOf(nums, fac);
      if (!same2(want, r.corr)) {
        out.push({ level: 'bad', fromPhoto: true,
          text: '판에 적힌 보정평균이 계산과 안 맞습니다 — 적힘 ' + U.fix2(r.corr) +
                ' / 계산 ' + U.fix2(want) + ' (\u00d7' + fac + ')' });
      }
    }

    // ── 타설일 · 시험일
    const cmpDay = (photo, app, name) => {
      if (!isDay(photo) || !app) return;
      if (photo !== app) {
        out.push({ level: 'bad', fromPhoto: true,
          text: name + '이 다릅니다 — 판 ' + Spec.md(photo) + ' / 앱 ' + Spec.md(app) });
      }
    };
    cmpDay(r.cast, t.castDay, '타설일');
    cmpDay(r.test, Task.testDayOf(t), '시험일');

    // ── 분류 (덤)
    const sp = Spec.byKey(t.specKey);
    if (typeof r.spec === 'string' && r.spec && sp && r.spec !== sp.name) {
      out.push({ level: 'warn', fromPhoto: true,
        text: '분류가 다릅니다 — 판 ' + r.spec + ' / 앱 ' + sp.name });
    }
    return out;
  }

  /* 화면에 보여줄 "판에서 읽은 것" */
  function summarize(r) {
    const p = [];
    if (isDay(r.cast)) p.push('타설 ' + Spec.md(r.cast));
    if (isDay(r.test)) p.push('시험 ' + Spec.md(r.test));
    if (typeof r.spec === 'string' && r.spec) p.push(r.spec);
    const nums = (Array.isArray(r.values) ? r.values : []).filter((v) => num(v) !== null);
    if (nums.length) p.push(nums.map((v) => U.fix2(v)).join(', '));
    if (num(r.corr) !== null) p.push('보정평균 ' + U.fix2(r.corr));
    return p.join(' \u00b7 ');
  }

  /* ---------- 검수 한 건 ---------- */
  async function auditOne(t, useVision) {
    const item = { id: t.id, task: t, issues: rules(t), read: '', visionError: '' };
    if (!useVision || !hasVision() || !(t.photos || []).length) return item;
    try {
      const imgs = await readPhotos(t);
      if (!imgs.length) {
        // 사진 id 는 있는데 못 읽었다(죽은 참조·읽기 예외) — 조용히 넘기면 '이상 없음'으로 위장한다.
        // 반드시 경고로 남긴다(반대심문 확인 — CLAUDE_MAP 이 금지한 '미판독=이상없음' 재발 방지).
        item.visionError = '사진을 불러오지 못해 글씨를 읽지 못했습니다';
        return item;
      }
      const j = parseJson(await callVision(visionPrompt(), imgs));
      if (!j) { item.visionError = '사진 판독 결과를 해석하지 못했습니다'; return item; }
      item.readObj = j;
      item.read = summarize(j);
      compare(t, j).forEach((x) => item.issues.push(x));
    } catch (e) {
      item.visionError = explain(e);
    }
    return item;
  }

  /* ---------- 여러 건 ---------- */
  async function run(tasks, opts) {
    const useVision = !(opts && opts.noVision);
    const onStep = (opts && opts.onStep) || function () {};
    const list = (tasks || []).slice();
    const out = [];
    for (let i = 0; i < list.length; i++) {
      onStep(i, list.length, list[i]);
      out.push(await auditOne(list[i], useVision));
    }
    return out;
  }

  function worst(item) {
    const lv = item.issues.map((x) => x.level);
    if (lv.indexOf('bad') >= 0) return 'bad';
    if (lv.indexOf('warn') >= 0) return 'warn';
    // 사진 판독 실패 = 값 검증을 못 한 것. '이상 없음'(초록)으로 위장하지 않는다(반대심문 확인).
    if (item.visionError) return 'warn';
    if (lv.indexOf('info') >= 0) return 'info';
    return 'ok';
  }

  function explain(e) {
    const m = String((e && e.message) || e || '');
    if (m === 'NOVKEY') return '사진 판독용 키가 없습니다.';
    if (/400/.test(m) && /image/i.test(m)) return '이 모델이 사진을 받지 않습니다.';
    if (/401|403|API key|PERMISSION/i.test(m)) return '판독용 API 키가 올바르지 않습니다.';
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(m)) return '판독 요청 한도를 넘었습니다. 잠시 뒤 다시.';
    if (/5\d\d/.test(m)) return '판독 서버 오류입니다.';
    if (/abort/i.test(m)) return '판독이 너무 늦어 끊었습니다.';
    if (/Failed to fetch|NetworkError/i.test(m)) return '인터넷이 없어 사진 판독을 건너뜁니다.';
    return m;
  }

  global.Audit = {
    run: run, rules: rules, worst: worst, explain: explain, compare: compare,
    hasVision: hasVision, gkey: gkey, setGkey: setGkey, ownGkey: ownGkey,
    readBoardValues: readBoardValues,
    MODEL: G_MODEL, API: G_API,
    _visionPrompt: visionPrompt, _callVision: callVision,
    _pickText: pickText, _parseJson: parseJson, _sameList: sameList,
    _summarize: summarize, _same2: same2, _num: num
  };
})(window);

;
/* ===== js/auditui.js ===== */
/* ============ auditui.js — AI 검수 결과 화면 ============
   검수는 **권고**다. 막지 않는다.
   여기서 뭐라 하든 「사진 보내기」는 그대로 눌린다 — 판단은 사람이 한다.
   그래서 말투도 "틀렸다"가 아니라 "확인해 보세요"로 쓴다.
=================================================== */
(function (global) {
  'use strict';

  const $ = U.$;
  let running = false;

  const LV = { bad: '주의', warn: '확인', info: '참고' };

  /* ---------------- 실행 ---------------- */
  async function start(tasks) {
    if (running) return;
    const list = (tasks || []).slice();
    if (!list.length) { U.toast('검수할 작업을 선택하세요'); return; }

    running = true;
    Nav.showAudit(true);
    const sum = $('#audit-sum');
    const box = $('#audit-list');
    box.innerHTML = '';
    sum.className = 'audit-sum busy';
    sum.textContent = '검수 중… 0/' + list.length;

    let rows = [];
    try {
      rows = await Audit.run(list, {
        onStep: (i, n) => { sum.textContent = '검수 중… ' + (i + 1) + '/' + n; }
      });
    } catch (e) {
      console.error(e);
      sum.className = 'audit-sum warn';
      sum.textContent = '검수하지 못했습니다';
      running = false;
      return;
    }
    running = false;
    render(rows);
  }

  /* ---------------- 렌더 ---------------- */
  function render(rows) {
    const sum = $('#audit-sum');
    const box = $('#audit-list');
    box.innerHTML = '';

    const flagged = rows.filter((r) => Audit.worst(r) !== 'ok').length;
    sum.className = 'audit-sum ' + (flagged ? 'warn' : 'ok');
    sum.textContent = flagged
      ? (rows.length + '건 중 ' + flagged + '건 확인해 보세요')
      : (rows.length + '건 모두 이상 없습니다');

    // 검수는 권고다 — 이걸 먼저 밝힌다
    box.appendChild(note('권고일 뿐입니다. 여기서 뭐라 하든 사진 보내기는 그대로 됩니다.', 'calm'));

    const noVision = !Audit.hasVision();
    const failed = rows.filter((r) => r.visionError);
    if (noVision) {
      box.appendChild(note('사진 글씨는 안 읽었습니다 — 판독용 키가 없어 앱 데이터만 대조했습니다.'));
    } else if (failed.length) {
      box.appendChild(note('사진 판독 실패 ' + failed.length + '건 — ' + failed[0].visionError));
    }

    rows.forEach((r) => box.appendChild(card(r)));
  }

  function note(text, cls) {
    const n = U.el('div', 'audit-note' + (cls ? ' ' + cls : ''));
    n.appendChild(U.icon('alert'));
    n.appendChild(U.el('span', '', text));
    return n;
  }

  function card(r) {
    const t = r.task;
    const lv = Audit.worst(r);
    const c = U.el('div', 'audit-card ' + lv);

    const head = U.el('button', 'audit-head');
    const sp = Spec.byKey(t.specKey);
    head.appendChild(U.el('span', 'due-spec' + (sp ? ' sp-' + sp.key : ''), Task.label(t)));
    head.appendChild(U.el('span', 'audit-title',
      (t.dong || '동 미지정') + (t.supervisor ? ' · ' + t.supervisor : '')));
    const flag = U.el('span', 'audit-flag ' + lv);
    flag.appendChild(U.icon(lv === 'ok' ? 'check' : 'alert'));
    head.appendChild(flag);
    head.addEventListener('click', () => { TaskUI.open(t, t.day); });
    c.appendChild(head);

    if (r.read) {
      const rd = U.el('div', 'audit-read');
      rd.appendChild(U.el('b', '', '사진에서 읽음'));
      rd.appendChild(U.el('span', '', r.read));
      c.appendChild(rd);
    }

    r.issues.forEach((x) => {
      const line = U.el('div', 'audit-line ' + x.level);
      line.appendChild(U.el('b', '', LV[x.level] || '확인'));
      line.appendChild(U.el('span', '', x.text + (x.fromPhoto ? ' (사진)' : '')));
      c.appendChild(line);
    });
    // 사진 판독 실패는 이 카드에도 표시한다 — 상단 요약 한 줄만으론 어느 카드인지 모른다(반대심문 확인)
    if (r.visionError) {
      const line = U.el('div', 'audit-line warn');
      line.appendChild(U.el('b', '', '확인'));
      line.appendChild(U.el('span', '', '사진 글씨를 읽지 못했습니다 — 값 검증 안 됨'));
      c.appendChild(line);
    } else if (!r.issues.length) {
      c.appendChild(U.el('div', 'audit-line ok', '이상 없음'));
    }
    return c;
  }

  /* ---------------- 옵션 ---------------- */
  function menu() {
    U.sheet('AI 검수 (권고)', [
      { label: '사진 판독 키 바꾸기',
        sub: (Audit.ownGkey() ? '내 키 사용 중' : '앱에 심어 둔 기본 키 사용 중') +
             ' · ' + Audit.MODEL,
        onPick: askKey },
      { label: '기본 키로 되돌리기', sub: '앱에 심어 둔 키를 씁니다',
        onPick: () => { Audit.setGkey(''); U.toast('기본 키로 되돌렸습니다'); } }
    ]);
  }

  function askKey() {
    // 자주 하는 일이 아니라 화면을 따로 만들지 않고 기본 입력창으로 받는다
    const v = global.prompt('사진 판독용 Google AI Studio API 키', Audit.gkey() || '');
    if (v === null) return;
    Audit.setGkey(v);
    U.toast(v.trim() ? '키를 저장했습니다' : '기본 키로 되돌렸습니다');
  }

  function close() { Nav.showAudit(false); }

  function init() {
    $('#audit-back').addEventListener('click', close);
    $('#audit-menu').addEventListener('click', menu);
  }

  global.AuditUI = { init: init, start: start, close: close };
})(window);

;
/* ===== js/places.js ===== */
/* 주변 식당 — 점메추 재료.
   현장이 구반포역으로 고정이라 목록을 앱에 구워 넣었다.
   그래서 인터넷이 없어도 상호가 나오고, 인터넷이 되면 OSM 으로 조용히 갱신한다.
   ※ 딥시크는 이 동네 가게를 모른다(실측). 그래서 이 목록을 프롬프트에 실어 준다.
      대신 영업시간·휴무·폐업은 아무도 모른다 — AI 가 그 사실을 밝히게 되어 있다. */
(function (global) {
  'use strict';

  const LAT = 37.5033, LON = 126.9857;        // 구반포역
  const CACHE = 'gsc.places.v1';
  const MAXAGE = 30 * 24 * 3600 * 1000;       // 30일. 가게는 잘 안 옮긴다
  const RADIUS = 1100;

  /* OSM 에서 받아 한 번 손본 씨앗 목록(거리 m).
     컨벤션홀·골프연습장처럼 밥집이 아닌 것과 저녁 술집은 뺐다. */
  const SEED = [
    { n: '삐앙다', d: 174, k: '' },
    { n: '한신칼국수', d: 220, k: '칼국수' },
    { n: '한신김밥', d: 220, k: '분식' },
    { n: '대전집', d: 220, k: '백반' },
    { n: '샛집남원추어탕', d: 220, k: '추어탕' },
    { n: '미소의집', d: 220, k: '분식' },
    { n: '구반포 커피', d: 220, k: '카페' },
    { n: '헤이카페', d: 434, k: '카페' },
    { n: '구름카페', d: 494, k: '카페' },
    { n: '오티보(ortivo)', d: 570, k: '' },
    { n: '봇타야산', d: 571, k: '' },
    { n: '댓짱돈까스', d: 651, k: '돈까스' },
    { n: '헨델과 그레텔 구내식당', d: 694, k: '구내식당' },
    { n: '만남의집 식당', d: 750, k: '백반' },
    { n: '개미식당 숙성통삼겹', d: 768, k: '삼겹살' },
    { n: '방배골숯불갈비', d: 777, k: '갈비' },
    { n: '고향 엄마손 생바지락 칼국수', d: 788, k: '칼국수' },
    { n: 'BHC 방배본동점', d: 793, k: '치킨' },
    { n: '본죽', d: 814, k: '죽' },
    { n: '우식이네', d: 860, k: '' },
    { n: '교촌치킨', d: 877, k: '치킨' },
    { n: '희객', d: 900, k: '' },
    { n: '두매골', d: 918, k: '' },
    { n: '원조부안집 방배카페골목점', d: 934, k: '한식' },
    { n: '수다', d: 934, k: '' },
    { n: '사천양꼬치', d: 1022, k: '양꼬치' },
    { n: '한국회관', d: 1026, k: '한식' },
    { n: '베리굿 스콘', d: 1029, k: '카페' },
    { n: '주미요', d: 1034, k: '' },
    { n: '다이닌', d: 1036, k: '' },
    { n: '개성순대국', d: 1050, k: '순대국' },
    { n: '미노루', d: 1051, k: '스시' },
    { n: '피자먹다', d: 1076, k: '피자' },
    { n: '장인감자탕', d: 1079, k: '감자탕' },
    { n: '찹쌀순대만드는집', d: 1090, k: '순대' }
  ];

  /* ---------- 캐시 ---------- */
  function cached() {
    try {
      const raw = localStorage.getItem(CACHE);
      if (!raw) return null;
      const c = JSON.parse(raw);
      return (c && Array.isArray(c.items) && c.items.length) ? c : null;
    } catch (e) { return null; }
  }

  /* 씨앗 + 갱신본을 상호 기준으로 합친다. 갱신이 없어도 항상 뭔가 나온다. */
  function list() {
    const c = cached();
    if (!c) return SEED.slice();
    const seen = Object.create(null), out = [];
    c.items.concat(SEED).forEach((p) => {
      const key = String(p.n || '').replace(/\s+/g, '');
      if (!key || seen[key]) return;
      seen[key] = 1;
      out.push(p);
    });
    return out.sort((a, b) => a.d - b.d);
  }

  /* AI 프롬프트에 실을 한 덩어리. 가까운 순으로 자른다. */
  function brief(max) {
    const items = list().slice(0, max || 24);
    if (!items.length) return '';
    return items.map((p) => '- ' + p.n + (p.k ? '(' + p.k + ')' : '') +
                            ' 도보 ' + Math.round(p.d / 80) + '분').join('\n');
  }

  /* ---------- 갱신(선택) ----------
     공용 Overpass 는 자주 504 라 미러를 돌린다. 실패해도 씨앗이 있으니 조용히 넘어간다. */
  const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  function query() {
    return '[out:json][timeout:25];nwr["amenity"~"^(restaurant|fast_food)$"]' +
           '(around:' + RADIUS + ',' + LAT + ',' + LON + ');out center tags 150;';
  }

  function metersTo(la, lo) {
    const R = 6371000, rad = (d) => d * Math.PI / 180;
    const dx = Math.cos(rad((LAT + la) / 2)) * rad(lo - LON) * R;
    const dy = rad(la - LAT) * R;
    return Math.round(Math.hypot(dx, dy));
  }

  async function fetchFrom(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 12000);
    try {
      const res = await fetch(url + '?data=' + encodeURIComponent(query()),
                              { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  /* 최근에 받았으면 건너뛴다. force 면 무조건 받는다. */
  async function refresh(force) {
    const c = cached();
    if (!force && c && (Date.now() - c.at) < MAXAGE) return list();
    for (let i = 0; i < MIRRORS.length; i++) {
      try {
        const d = await fetchFrom(MIRRORS[i]);
        const items = (d && d.elements || [])
          .filter((e) => e.tags && e.tags.name)
          .map((e) => {
            const la = (e.lat != null) ? e.lat : (e.center && e.center.lat);
            const lo = (e.lon != null) ? e.lon : (e.center && e.center.lon);
            if (typeof la !== 'number' || typeof lo !== 'number') return null;
            return { n: e.tags.name, d: metersTo(la, lo), k: e.tags.cuisine || '' };
          })
          .filter(Boolean)
          .sort((a, b) => a.d - b.d);
        if (!items.length) continue;
        try {
          localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), items: items }));
        } catch (e) { /* 저장 실패는 무시 — 씨앗으로 돈다 */ }
        return list();
      } catch (e) { /* 다음 미러 */ }
    }
    return list();
  }

  global.Places = {
    list: list, brief: brief, refresh: refresh, cached: cached, SEED: SEED
  };
})(window);

;
/* ===== js/ai.js ===== */
/* ============ ai.js — AI 어시스턴트 (beta) ============
   DeepSeek API. 모델은 저가형 deepseek-v4-flash.

   ※ 이것만 인터넷이 필요하다.
      계산·작업 같은 본업은 지하에서도 돌아야 해서 전부 오프라인이다.
      여긴 물어볼 게 있을 때 지상에서 쓰는 보조 기능이라 온라인이어도 된다.

   CORS: DeepSeek 는 브라우저 직접 호출을 허용하지 않는다.
   안드로이드에서는 Capacitor 의 네이티브 HTTP(CapacitorHttp)로 우회하고,
   PC 브라우저(개발용)에서는 fetch 로 시도하되 막히면 그렇게 말해 준다.
================================================================ */
(function (global) {
  'use strict';

  const API = 'https://api.deepseek.com/chat/completions';
  const MODEL = 'deepseek-v4-flash';     // 가볍고 싼 쪽
  const K_KEY = 'gsc.ai.key.v1';
  /* 기본 키를 앱에 심어 둔다 — 사용자 지시(쓰는 사람이 둘뿐이라 그냥 넣기로 함).
     APK 를 뜯으면 보이는 값이다. 밖으로 APK 를 돌리게 되면 반드시 빼고
     각자 넣게 바꿔야 한다. 앱에서 키를 새로 넣으면 그게 우선한다. */
  const DEFAULT_KEY = '';
  const K_LOG = 'gsc.ai.log.v1';
  const MAX_TURNS = 12;                  // 주고받은 말 보관 한도(토큰 절약)
  const TIMEOUT = 40000;

  /* ---------- API 키 ---------- */
  function key() {
    try {
      const own = (localStorage.getItem(K_KEY) || '').trim();
      if (own) return own;
    } catch (e) {}
    return DEFAULT_KEY;
  }
  /* 사용자가 직접 넣은 키가 따로 있는가 (설정 화면 문구용) */
  function ownKey() {
    try { return (localStorage.getItem(K_KEY) || '').trim(); } catch (e) { return ''; }
  }
  function setKey(v) {
    try { localStorage.setItem(K_KEY, (v || '').trim()); } catch (e) {}
  }
  function hasKey() { return !!key(); }

  /* ---------- 대화 보관 ---------- */
  function log() {
    try {
      const a = JSON.parse(localStorage.getItem(K_LOG) || '[]');
      return Array.isArray(a) ? a.filter((m) => m && m.role && typeof m.content === 'string') : [];
    } catch (e) { return []; }
  }
  function saveLog(arr) {
    try { localStorage.setItem(K_LOG, JSON.stringify((arr || []).slice(-MAX_TURNS * 2))); }
    catch (e) {}
  }
  function clearLog() { saveLog([]); }

  /* ---------- 앱이 아는 것 ----------
     매번 API 로 보내는 배경지식. 여기 적힌 게 곧 어시스턴트가 아는 전부다. */
  const GUIDE = [
    '너는 「공시체 계산기」 앱에 들어 있는 현장 보조 어시스턴트다.',
    '사용자는 콘크리트 품질관리 담당자(현장에서 "매니저님"으로 불린다)이고, 한국어로만 답한다.',
    '현장은 서울 구반포역 일대다. 지하 시험실은 인터넷이 안 터져서 계산·작업은 오프라인으로 돈다.',
    '다만 네게 질문이 닿았다는 건 지금 통신이 된다는 뜻이다 — "인터넷이 없어서 못 한다"고 하지 마라.',
    '근무는 오전 07:00–11:00, 오후 13:00–17:00. 일요일은 휴무이고 토요일은 유동적이다.',
    '',
    '[앱 구조] 탭 3개 — 홈 · 계산 · 작업.',
    '- 홈: 인사, 날씨와 안내 멘트, 기준 날짜(좌우 화살표로 이동), 시계와 근무시간, 그날 작업 목록.',
    '- 계산: 숫자 키패드로 압축강도 값을 넣어 평균과 보정평균을 낸다.',
    '- 작업: 날짜별 작업 목록, 여러 건을 골라 카카오톡으로 묶어 보낸다.',
    '',
    '[계산 탭 쓰는 법]',
    '- 단위는 N/mm²(메가파스칼). 값은 보통 두 자리 + 소수 둘째 자리(예 24.53).',
    '- 소수점을 찍지 않는다. 숫자 4개를 누르면 aa.bb 로 자동 등록된다(2453 → 24.53).',
    '- 「4자리 자동등록」을 끄면 5~6자리도 넣을 수 있고, 그때만 등록 버튼이 나타난다.',
    '- 보정계수 기본값은 0.97. 평균 × 보정계수 = 보정평균이고, 보정평균이 최종 보고값이다.',
    '- ⌫ 는 한 자리 지우기. 입력칸이 비어 있으면 마지막 등록값을 되돌린다. C 는 입력만 지운다.',
    '- 「작업에 넣기」로 계산값을 새 작업이나 오늘 등록된 기존 작업에 넣는다(덮어쓰지 않고 세트로 추가).',
    '',
    '[작업 = 공시체 한 세트 깨기]',
    '- 한 작업이 갖는 것: 분류(재령) · 타설일 · 시험일 · 담당 감리 · 메모 · 계산 세트 · 사진.',
    '- 사진이 한 장이라도 붙으면 그 작업은 완료로 본다. 별도 완료 버튼은 없다.',
    '- 계산 세트는 여러 개 넣을 수 있다. 회사가 다르거나 LOT 가 여러 개일 때 나눠 담는다.',
    '- 날짜가 둘이다. 「목록 날짜」는 그 작업이 어느 날 목록에 뜨는지이고,',
    '  「시험일」은 보고·카톡 표기에 쓰는 날짜다. 늦게 깨고 원래 날짜로 보고할 때 서로 달라진다.',
    '',
    '[재령·분류] 5가지',
    '- 수직 1일 / 수평 3일 / 필러 10일 / 수중 28일(수중양생) / 봉함 28일(봉함양생).',
    '- 분류를 고르면 시험일에서 재령을 역산해 타설일이 자동으로 잡힌다(직접 고칠 수 있다).',
    '- 일요일은 휴무라 일요일에 깨야 할 것은 월요일에 함께 깬다.',
    '',
    '[카카오톡 내보내기 규칙]',
    '- 수직·수평·필러: 같은 날 "타설"한 것을 감리 무관하게 한 번에. 표기는 "7/22 필러" 형식.',
    '- 수중·봉함: 같은 날 "시험"한 것을 한 번에. 수중은 텍스트를 "28일강도"로 쓴다(예 "8/1 28일강도").',
    '- 사진을 먼저 보내고 대화창에 제목을 붙여넣는 방식이다.',
    '- 아래 [지금 앱 상태]의 각 작업에 「카톡표기」가 이미 규칙대로 계산돼 있다.',
    '  카톡 문구를 물으면 그 값을 그대로 쓰고 날짜를 되묻지 마라.',
    '',
    '[압축강도 시험 절차 일반]',
    '- 공시체를 양생조에서 꺼내 표면 물기를 닦고 지름·높이를 확인한다.',
    '- 가압면에 이물질이 없게 하고 시험기 중앙에 놓는다(편심되면 값이 낮게 나온다).',
    '- 하중을 일정 속도로 올려 파괴될 때까지 가압하고 최대하중을 읽는다.',
    '- 압축강도 = 최대하중 ÷ 단면적. 앱에는 이미 환산된 N/mm² 값을 넣는다.',
    '- 한 세트에서 값이 유독 튀면 편심·단부 불량을 의심한다.',
    '',
    '[점심·생활]',
    '- 점심시간은 11:00~13:00. 선택지는 둘이다 — 현장 함바(구내식당)로 빨리 때우거나,',
    '  구반포역 일대로 나가서 사먹거나. 함바는 빠르고 싸지만 메뉴 선택권이 없다.',
    '- 구반포·반포·잠원 일대에는 백반·국밥·칼국수·중식·분식 같은 평범한 식당가가 있다.',
    '- **점메추는 이 앱의 정식 기능이다. 피하지 말고 바로 골라 줘라.**',
    '- 밥 얘기를 하면 [현장 주변 식당] 목록이 아래에 붙어 온다. **거기 있는 상호로 추천해라.**',
    '  목록에 없는 상호는 지어내지 마라. 목록이 안 붙어 왔으면 메뉴로만 추천한다.',
    '- 영업시간·휴무·폐업은 아무도 모른다 — 상호를 댔으면 그 점을 한 줄로만 덧붙여라.',
    '- 추천할 땐 날씨와 시각을 반영해라. 더우면 시원한 것, 추우면 국물, 오후가 빡세면 든든한 것.',
    '- 점심시간이 이미 지났으면 억지로 추천하지 말고 그 사실을 먼저 말해라.',
    '',
    '[대신 써주기]',
    '- 감리에게 보낼 카톡·보고 문장을 대신 써 달라고 하면 바로 완성된 문장으로 준다.',
    '- 현장 보고체로 짧고 건조하게. 존댓말. 인사말은 한 줄 이내.',
    '- 강도값·부위·날짜는 사용자가 준 것만 쓴다. 없으면 [   ] 로 빈칸을 남겨라 — 지어내지 마라.',
    '',
    '[현장 명부]',
    '- 아래 [담당 감리 명부] 에 동별 담당 감리와 전화번호가 다 실려 온다.',
    '  "203동 누구야" "송영수 이사 번호" 같은 걸 물으면 거기서 바로 답해라.',
    '- 명부에 없는 사람·번호는 지어내지 마라. 없으면 없다고 말한다.',
    '- 전화번호는 010-0000-0000 형태 그대로 읽어 준다.',
    '',
    '[답변 규칙]',
    '- 짧고 실무적으로. 현장에서 폰으로 읽는다. 표는 쓰지 말고 3~5줄 안쪽으로.',
    '- 앱 조작을 물으면 어느 탭에서 무엇을 누르는지 순서대로 알려준다.',
    '- 위에 없는 사내 규정·특정 배합·법규 수치는 모른다고 말하고 담당 감리에게 확인하라고 안내한다.',
    '- 안전과 직결된 판단(합격 여부 최종 결정 등)은 단정하지 말고 근거와 함께 확인을 권한다.'
  ].join('\n');

  /* 현장 명부 — 동과 담당 감리, 전화번호.
     GUIDE 에 박지 않고 여기서 만든다. contacts.js 를 다시 뽑아도 저절로 따라온다.
     "203동 누구야?" "송영수 이사 번호" 같은 걸 앱을 안 뒤지고 물어볼 수 있어야 한다. */
  function roster() {
    if (!global.Contacts || !Contacts.LIST || !Contacts.LIST.length) return '';
    const lines = Contacts.dongs().map((d) => {
      const who = Contacts.byDong(d)
        .map((c) => Contacts.label(c) + ' ' + (c.phone || '번호없음'))
        .join(' / ');
      return '- ' + d + ': ' + who;
    });
    return ['[담당 감리 명부] 동을 고르면 앱이 이 표대로 감리를 채운다.',
            '한 동에 둘이면 둘 다 적혀 있고, 한 사람이 여러 동을 맡기도 한다.',
            lines.join('\n')].join('\n');
  }

  /* 지금 앱 상태를 한 줄로 — "오늘 뭐 있지?" 같은 질문에 답할 수 있게 */
  async function context() {
    const now = new Date();
    const day = U.dayKey(now.getTime());
    const bits = ['오늘은 ' + Spec.shortDate(now) + ', 현재 ' +
                  U.pad2(now.getHours()) + ':' + U.pad2(now.getMinutes()) + '.'];
    const list = roster();
    if (list) bits.push(list);
    try {
      const tasks = await Store.tasksOf(day);
      if (!tasks.length) bits.push('오늘 등록된 작업은 없다.');
      else {
        const done = tasks.filter(Task.isDone).length;
        bits.push('오늘 작업 ' + tasks.length + '건 중 ' + done + '건 완료.');
        // 카톡 문구를 되묻지 않게 앱이 아는 건 다 실어 준다 —
        // 타설일·시험일·감리·강도값, 그리고 앱이 규칙대로 만든 표기까지.
        bits.push(tasks.slice(0, 8).map((t) => {
          const p = [];
          p.push('- ' + Task.label(t) + (t.part ? (' ' + t.part) : ''));
          if (t.castDay) p.push('타설 ' + Spec.md(t.castDay));
          const test = Task.testDayOf(t);
          if (test) p.push('시험 ' + Spec.md(test));
          if (t.supervisor) p.push('감리 ' + t.supervisor);
          const lab = Task.exportLabel(t);
          if (lab) p.push('카톡표기 "' + lab + '"');
          const brief = Task.setsBrief(t);
          if (brief) p.push(brief);
          p.push((t.photos || []).length + '장');
          p.push(Task.isDone(t) ? '완료' : '미완료');
          return p.join(' · ');
        }).join('\n'));
      }
    } catch (e) { /* 저장소를 못 읽어도 대화는 되게 둔다 */ }
    // 날씨는 받아 둔 캐시만 본다 — 여기서 또 네트워크를 타면 답이 그만큼 느려진다
    try {
      const w = Weather.cached();
      if (w && w.data && typeof w.data.temp === 'number') {
        const d = w.data;
        const p = ['날씨: ' + Weather.codeInfo(d.code).text + ' ' + d.temp.toFixed(1) + '℃'];
        if (typeof d.feels === 'number') p.push('체감 ' + d.feels.toFixed(1) + '℃');
        if (typeof d.pop === 'number') p.push('앞으로 12시간 강수확률 ' + d.pop + '%');
        if (typeof d.wind === 'number') p.push('바람 ' + d.wind.toFixed(1) + 'm/s');
        bits.push(p.join(' · '));
      }
    } catch (e) {}

    return bits.join('\n');
  }

  /* ---------- 추천 질문 ----------
     매뉴얼 FAQ 말투("보정계수 0.97은 왜 곱하나요?")는 아무도 안 누른다.
     사람한테 말 걸듯, 실제로 하루 중에 떠오르는 것만. 눌릴 확률 높은 순. */
  const SUGGEST = [
    '오늘 뭐 깨야 돼?',
    '오늘 카톡 뭐라고 보내면 돼?',
    '오늘 점심 뭐 먹지',
    '카톡 보낼 거 남았어?',
    '오늘 한 거 보고용으로 정리해줘',
    '값 하나만 튀는데 왜 이럴까',
    '허리 뻐근한데 스트레칭 좀',
    '공시체가 이상하게 깨졌는데'
  ];

  /* ---------- 호출 ----------
     안드로이드: CapacitorHttp(네이티브) → CORS 없음
     PC 브라우저: fetch (DeepSeek 가 CORS 를 안 열어 두면 막힌다) */
  function nativeHttp() {
    const C = global.Capacitor;
    return (C && C.isNativePlatform && C.isNativePlatform() &&
            C.Plugins && C.Plugins.CapacitorHttp) ? C.Plugins.CapacitorHttp : null;
  }

  async function callApi(messages) {
    const k = key();
    if (!k) throw new Error('NOKEY');
    const body = { model: MODEL, messages: messages, stream: false };
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k };

    const http = nativeHttp();
    if (http) {
      const res = await http.request({
        url: API, method: 'POST', headers: headers, data: body,
        connectTimeout: TIMEOUT, readTimeout: TIMEOUT
      });
      if (res.status < 200 || res.status >= 300) {
        throw new Error('HTTP ' + res.status + ' ' + short(res.data));
      }
      const d = (typeof res.data === 'string') ? JSON.parse(res.data) : res.data;
      return pickText(d);
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch(API, {
        method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + short(await res.text()));
      return pickText(await res.json());
    } finally { clearTimeout(timer); }
  }

  function short(v) {
    let s = (typeof v === 'string') ? v : JSON.stringify(v || '');
    return s.length > 180 ? s.slice(0, 180) + '…' : s;
  }

  function pickText(d) {
    const c = d && d.choices && d.choices[0];
    const t = c && c.message && c.message.content;
    if (typeof t !== 'string' || !t.trim()) throw new Error('빈 응답');
    return t.trim();
  }

  /* 밥 얘기가 나올 때만 주변 가게 목록을 싣는다.
     항상 실으면 질문마다 토큰을 먹는데, 정작 쓰이는 건 점메추 때뿐이다. */
  const FOODY = /점심|점메추|저녁|아침|메뉴|밥|먹|식당|맛집|카페|커피|배고|한식|중식|일식|분식|국밥|칼국수|배달/;

  /* 질문 하나 보내기. 성공하면 대화록에 쌓고 답을 돌려준다. */
  async function ask(question) {
    const q = (question || '').trim();
    if (!q) return null;
    const history = log();
    let sys = GUIDE + '\n\n[지금 앱 상태]\n' + (await context());
    if (FOODY.test(q)) {
      try {
        const near = Places.brief(24);
        if (near) {
          sys += '\n\n[현장 주변 식당 — 실제로 있는 곳이다. 여기서 골라라]\n' + near;
        }
        Places.refresh();     // 다음 번을 위해 조용히 갱신(기다리지 않는다)
      } catch (e) { /* 목록이 없어도 대화는 되게 둔다 */ }
    }
    const msgs = [{ role: 'system', content: sys }]
      .concat(history)
      .concat([{ role: 'user', content: q }]);
    const answer = await callApi(msgs);
    saveLog(history.concat([
      { role: 'user', content: q },
      { role: 'assistant', content: answer }
    ]));
    return answer;
  }

  /* 오류를 사람 말로 */
  function explain(e) {
    const m = String((e && e.message) || e || '');
    if (m === 'NOKEY') return 'API 키를 먼저 넣어 주세요.';
    if (/401|Unauthorized|invalid.*key/i.test(m)) return 'API 키가 올바르지 않습니다.';
    if (/402|Insufficient|balance/i.test(m)) return 'DeepSeek 잔액이 부족합니다.';
    if (/429/.test(m)) return '요청이 몰렸습니다. 잠시 뒤 다시 시도해 주세요.';
    if (/5\d\d/.test(m)) return 'DeepSeek 서버 오류입니다. 잠시 뒤 다시 시도해 주세요.';
    if (/abort/i.test(m)) return '응답이 너무 늦어 끊었습니다.';
    if (/Failed to fetch|NetworkError|CORS/i.test(m)) {
      return '연결하지 못했습니다.\n지하나 비행기모드면 인터넷이 없어서 그렇습니다 — 지상에서 다시 시도해 주세요.';
    }
    return '문제가 생겼습니다: ' + m;
  }

  global.AI = {
    ask: ask, explain: explain,
    key: key, setKey: setKey, hasKey: hasKey, ownKey: ownKey,
    log: log, clearLog: clearLog,
    SUGGEST: SUGGEST, MODEL: MODEL,
    _guide: GUIDE, _context: context
  };
})(window);

;
/* ===== js/aiui.js ===== */
/* ============ aiui.js — AI 어시스턴트 화면 ============
   질문 → DeepSeek → 답. 대화는 이 폰에만 남는다.
   본업(계산·작업)은 오프라인이지만 여긴 인터넷이 있어야 한다 — 그렇게 안내한다.
=================================================== */
(function (global) {
  'use strict';

  const $ = U.$;
  let busy = false;
  let emptyNode = null;
  /* 앱에 기본 키가 심겨 있어 평소엔 설정칸을 안 보여준다.
     ⋯ 메뉴에서 「API 키 바꾸기」를 눌렀을 때만 연다. */
  let showKey = false;

  /* ---------------- 열기 / 닫기 ---------------- */
  function open() {
    showKey = false;
    renderSetup();
    renderLog();
    renderSuggest();
    Nav.showAI(true);
    scrollEnd();
  }

  function close() {
    try { document.activeElement && document.activeElement.blur(); } catch (e) {}
    Nav.showAI(false);
  }

  /* ---------------- API 키 ---------------- */
  function renderSetup() {
    const need = !AI.hasKey();          // 기본 키까지 없을 때만 강제
    const open = need || showKey;
    $('#ai-setup').classList.toggle('hidden', !open);
    $('#ai-setup-msg').textContent = need
      ? 'DeepSeek API 키를 넣으면 쓸 수 있습니다.'
      : (AI.ownKey() ? '내 키를 쓰고 있습니다. 바꾸려면 새로 넣으세요.'
                     : '앱에 심어 둔 기본 키를 쓰고 있습니다. 내 키를 쓰려면 넣으세요.');
    $('#ai-input').disabled = need;
    $('#ai-send').disabled = need;
    $('#ai-input').placeholder = need ? 'API 키를 먼저 넣어 주세요' : '궁금한 걸 물어보세요';
  }

  function saveKey() {
    const v = $('#ai-key').value.trim();
    if (!v) { U.toast('키를 입력해 주세요'); return; }
    AI.setKey(v);
    $('#ai-key').value = '';
    showKey = false;
    renderSetup();
    renderSuggest();
    U.toast('키를 저장했습니다');
  }

  /* ---------------- 대화 ---------------- */
  function bubble(role, text) {
    const b = U.el('div', 'ai-msg ' + (role === 'user' ? 'me' : 'bot'));
    b.appendChild(U.el('div', 'ai-bubble', text));
    return b;
  }

  function renderLog() {
    const box = $('#ai-log');
    if (!emptyNode) {
      emptyNode = U.el('div', 'ai-empty');
      emptyNode.appendChild(U.el('p', 'ai-empty-t', '무엇이든 물어보세요'));
    }
    box.innerHTML = '';
    const rows = AI.log();
    if (!rows.length) { box.appendChild(emptyNode); return; }
    rows.forEach((m) => box.appendChild(bubble(m.role, m.content)));
  }

  function scrollEnd() {
    const box = $('#ai-log');
    // 렌더 직후엔 높이가 아직 안 잡혀 있어 한 틱 뒤에 내린다
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }

  /* ---------------- 추천 질문 ---------------- */
  function renderSuggest() {
    const wrap = $('#ai-suggest');
    wrap.innerHTML = '';
    // 대화가 시작됐거나 키가 없으면 감춘다
    if (!AI.hasKey() || AI.log().length) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    AI.SUGGEST.forEach((q) => {
      const b = U.el('button', 'ai-chip', q);
      b.addEventListener('click', () => { $('#ai-input').value = q; send(); });
      wrap.appendChild(b);
    });
  }

  /* ---------------- 보내기 ---------------- */
  async function send() {
    if (busy) return;
    const input = $('#ai-input');
    const q = input.value.trim();
    if (!q) return;
    if (!AI.hasKey()) { U.toast('API 키를 먼저 넣어 주세요'); return; }

    busy = true;
    input.value = '';
    $('#ai-send').disabled = true;
    $('#ai-suggest').classList.add('hidden');

    const box = $('#ai-log');
    if (!AI.log().length) box.innerHTML = '';
    box.appendChild(bubble('user', q));
    const wait = U.el('div', 'ai-msg bot');
    const dots = U.el('div', 'ai-bubble ai-wait', '…');
    wait.appendChild(dots);
    box.appendChild(wait);
    scrollEnd();

    try {
      const a = await AI.ask(q);
      dots.classList.remove('ai-wait');
      dots.textContent = a;
    } catch (e) {
      console.warn('[ai]', e);
      dots.classList.remove('ai-wait');
      dots.classList.add('ai-err');
      dots.textContent = AI.explain(e);
    } finally {
      busy = false;
      $('#ai-send').disabled = !AI.hasKey();
      scrollEnd();
    }
  }

  /* ---------------- 옵션 ---------------- */
  function menu() {
    const items = [
      { label: '대화 지우기', cls: 'danger', onPick: () => {
          AI.clearLog(); renderLog(); renderSuggest();
          U.toast('대화를 지웠습니다');
        } },
      { label: AI.ownKey() ? 'API 키 바꾸기' : '내 API 키 넣기', onPick: () => {
          showKey = true; renderSetup(); $('#ai-key').focus();
        } },
      { label: '기본 키로 되돌리기', sub: '앱에 심어 둔 키를 씁니다', onPick: () => {
          AI.setKey(''); showKey = false; renderSetup();
          U.toast('기본 키로 되돌렸습니다');
        } }
    ];
    U.sheet('AI 어시스턴트 (' + AI.MODEL + ')', items);
  }

  /* ---------------- 바인딩 ---------------- */
  function init() {
    $('#ai-open').addEventListener('click', open);
    $('#ai-back').addEventListener('click', close);
    $('#ai-menu').addEventListener('click', menu);
    $('#ai-key-save').addEventListener('click', saveKey);
    $('#ai-send').addEventListener('click', send);

    const input = $('#ai-input');
    // 한글 조합 중 Enter 는 무시한다(조합 확정이 먼저다)
    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !composing) { e.preventDefault(); send(); }
    });
    $('#ai-key').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveKey(); }
    });
  }

  global.AIUI = { init: init, open: open, close: close, isOpen: () => Nav.isAIOpen() };
})(window);

;
/* ===== js/ocrui.js ===== */
/* ============ ocrui.js — OCR 화면 흐름 (beta) ============
   ① 작업 탭 스캔 버튼: 일정표 사진 → 작업 자동 등록 (중복은 건너뜀)
   ② 계산 탭 스캔 버튼: 성적판 사진 → 강도값 입력
   둘 다 **등록 전에 읽은 내용을 보여주고 사람이 확정**한다 — OCR 은 권고일 뿐이다.
   플러그인이 없는 환경(웹·미지원 폰)에선 버튼 자체를 숨긴다.
========================================================= */
(function (global) {
  'use strict';

  const $ = U.$;

  /* 사진을 어디서 가져올지 — 촬영 / 앨범 */
  function askSource(title, cb) {
    U.sheet(title, [
      { label: '촬영', onPick: async () => cb(await Native.shootPath()) },
      { label: '앨범에서 고르기', onPick: async () => cb(await Native.pickPath()) }
    ]);
  }

  async function readImage(path) {
    U.toast('사진에서 글자를 읽는 중…', 60000);
    try {
      return await OCR.read(path);
    } finally {
      U.toast('읽기 완료', 700);   // 긴 토스트는 반드시 교체 — 실패면 뒤이어 에러 토스트가 덮는다
    }
  }

  /* ---------------- ① 일정표 → 작업 ---------------- */
  async function fromSchedule() {
    askSource('일정표 사진 (beta)', async (path) => {
      if (!path) return;
      let doc;
      try { doc = await readImage(path); }
      catch (e) { console.warn('[ocr]', e); U.toast('사진을 읽지 못했습니다'); return; }

      const parsed = OCR.parseSchedule(doc.lines);
      if (!parsed.items.length) {
        U.toast('표에서 타설일·동·재령을 찾지 못했습니다\n사진을 더 크게 찍어 보세요', 3500);
        return;
      }

      // 이미 있는 작업과 겹치면 건너뛴다 (동·분류·타설일이 같으면 같은 작업으로 본다)
      // 동이 여러 개인 행은 첫 동 기준으로 본다 — Task.dongOf 도 첫 「N동」만 뽑으므로 짝이 맞는다
      // 날짜 버킷(tasksOf)으로 조회하면 목록날짜≠시험일인 「가라」 작업을 놓친다(감사 지적)
      // → 전체와 대조한다. 동·분류·타설일 셋이 같으면 날짜와 무관하게 같은 타설이다.
      let existing = [];
      try {
        // 중복 대조도 **현재 주구 안에서만** — 반대편 주구에 잘못 등록된 같은 행이 있어도
        // 이번(맞는) 주구 등록을 막으면 안 된다
        existing = (await Store.allTasks()).filter((t) => Task.juguOf(t) === U.jugu());
      } catch (e) {}
      // 동 비교는 적힌 그대로(공백·괄호만 접어서) — dongOf(첫 「N동」만)로 비교하면
      // "215동"과 "215동 특화동"이 같은 것으로 보여 본동 행이 중복으로 잘못 걸러진다.
      // 괄호도 접는 이유: 수동 등록은 명부 표기 「215동(특화동)」, OCR 은 「215동 특화동」이라
      // 같은 작업이 다르게 보인다(감사 지적 — 안 접으면 이중 등록).
      const dkey = (s) => String(s || '').replace(/[\s()（）]/g, '');
      const fresh = [];
      let dup = 0;
      for (const it of parsed.items) {
        const want = dkey(it.dong);
        const exists = existing.some((t) =>
          (dkey(t.dong) || dkey(Task.dongOf(t))) === want && t.specKey === it.specKey &&
          (t.castDay || '') === it.castDay);
        if (exists) dup++; else fresh.push(it);
      }

      if (!fresh.length) {
        U.toast('전부 이미 등록돼 있습니다 (' + dup + '건)', 3000);
        return;
      }

      // 담당 감리를 여기서 정해 **미리보기에 보여준다** — 오배정은 등록 전에 사람이 잡는다(감사 지적).
      // 동이 여러 개면 첫 동 감리(사용자 지시). 특화동은 명부에 「N동(특화동)」 담당이 따로 있다 —
      // 본동 감리로 붙이면 카톡이 엉뚱한 사람에게 간다(감사 확인). 확실치 않으면 비워 둔다.
      fresh.forEach((it) => {
        if (it.hasSpecial) { it.sup = null; return; }   // 다중동+특화동 — 자동 배정 안 함(사람이 잡는다)
        const special = /특화동$/.test(it.dong || '');
        const key = special
          ? String(it.dongMain || '').replace(/동$/, '동(특화동)')
          : (it.dongMain || it.dong);
        const sups = Contacts.byDong(key);
        it.sup = (sups.length === 1) ? sups[0] : null;
      });

      const linesTxt = fresh.map((it) => {
        const s = Spec.byKey(it.specKey);
        return it.dong + ' ' + (s ? s.name : it.age + '일') +
               ' · 타설 ' + Spec.md(it.castDay) + ' → 시험 ' + Spec.md(it.testDay) +
               ' · ' + (it.sup ? Contacts.label(it.sup) : '감리 미지정') +
               (it.hasSpecial ? ' (특화동 포함 — 감리 확인!)' : '') +
               (it.offAge ? ' (재령 확인!)' : '');
      }).join('\n');
      const title = '읽은 작업 ' + fresh.length + '건' +
                    (dup ? ' · 중복 ' + dup + '건 제외' : '') + '\n' + linesTxt;

      U.confirmSheet(title, fresh.length + '건 등록', async () => {
        let ok = 0;
        for (const it of fresh) {
          const sup = it.sup || null;      // 미리보기에서 보여준 그 감리 그대로
          try {
            await Store.putTask({
              day: it.testDay, testDay: it.testDay,
              specKey: it.specKey, castDay: it.castDay,
              dong: it.dong,
              jugu: U.jugu(),               // 스캔한 시점의 주구 소속으로 등록

              supervisor: sup ? Contacts.label(sup) : '',
              supPhone: sup ? sup.phone : '',
              part: '', photos: [], sets: []
            });
            ok++;
          } catch (e) { console.error('[ocr task]', e); }
        }
        try { Home.refresh(); } catch (e) {}
        try { Tasks.refresh(); } catch (e) {}
        U.toast('작업 ' + ok + '건을 등록했습니다');
      });
    });
  }

  /* ---------------- ② 성적판 → 강도값 ----------------
     **완전 오프라인**(사용자 지시 — 인터넷 독립, 무거워도 됨).
     지금은 ML Kit 2패스(영역 확대+대비 보정). 손글씨 숫자 전용 인식기가
     준비되면 readBoardSmart 안에서 갈아 끼운다 — 화면 흐름은 안 바뀐다. */
  async function fromBoard() {
    askSource('성적판 사진 (beta)', async (path) => {
      if (!path) return;
      U.toast('사진에서 값을 읽는 중…', 60000);
      let values = null;
      try {
        const r = await OCR.readBoard(path);
        values = r.values;
      } catch (e) {
        console.warn('[board ocr]', e);
        U.toast('사진을 읽지 못했습니다');
        return;
      }
      U.toast('읽기 완료', 700);

      if (!values.length) {
        U.toast('시험결과 값을 찾지 못했습니다\n판이 크게 나오게 찍어 보세요', 3500);
        return;
      }

      const title = '읽은 값 ' + values.length + '개 — 확인하세요\n' +
                    values.map((v) => U.fix2(v)).join(' · ') +
                    '\n(잘못 읽힌 값은 넣은 뒤 ×로 지우면 됩니다)';
      U.confirmSheet(title, '계산기에 넣기', () => {
        const n = Calc.addValues(values);
        U.toast(n ? ('값 ' + n + '개를 넣었습니다') : '넣을 수 있는 값이 없습니다');
      });
    });
  }

  /* ---------------- 바인딩 ---------------- */
  function init() {
    const on = OCR.available();
    const b1 = $('#tasks-ocr'), b2 = $('#calc-ocr'), b3 = $('#home-ocr');
    if (b1) { b1.classList.toggle('hidden', !on); b1.addEventListener('click', fromSchedule); }
    if (b2) { b2.classList.toggle('hidden', !on); b2.addEventListener('click', fromBoard); }
    if (b3) { b3.classList.toggle('hidden', !on); b3.addEventListener('click', fromSchedule); }
  }

  global.OCRUI = { init: init };
})(window);

;
/* ===== js/powder.js ===== */
/* ============ powder.js — 몰래 파우더 (건설현장판, 숨김 기능) ============
   지하 대기시간용 낙하 모래 물리 장난감(사용자 요청). 숨김 입구: 홈 인사말 5연타.
   뒤로가기로 닫힌다. 완전 오프라인.

   시스템:
   - 배합 체인: 시멘트+물→시멘트풀, +모래→모르타르, +자갈→레미콘 → 양생 → 콘크리트
   - 온도: 셀마다 온도(열전도·상변화). 물↔얼음↔증기, 모래 고온→유리, 철근 고온→쇳물,
     아스팔트 온도로 녹고 굳음. **양생 속도가 온도를 따른다 — 영하면 양생 정지(한중콘크리트)**
   - 하중: 받침 없는 구조체는 무너지고(철근·옹벽이 앵커), 약한 재료는 위 하중에 압괴돼 잔해가 된다
   - 폭발물: 다이너마이트·화약·니트로(열·불로 기폭, 연쇄)
   - 시간: 배속(½·1·2·4)과 멈춤
   - 공시체 = 강체(bodies[]): 낱알이 아니라 한 덩어리로 떨어지고·가라앉고·부서질 때만 통째로.
     몰드에 부어 굳히면 저절로 탈형돼 덩어리가 되고, 압축기 화면(UTM)에서 가압해 강도를 잰다.
========================================================================= */
(function (global) {
  'use strict';

  /* ---------------- 재료 ----------------
     kind: solid/powder/liquid/slurry/gas/empty
     flam: 인화(불 접촉·발화온도 ign 이상이면 불붙음)
     cureTo/cure: 양생 결과/기본 소요(온도가 배속·정지시킨다)
     crush: 압괴 한계(위에 쌓인 셀 수) — 넘으면 잔해가 된다. 없으면 안 부서짐
     anchor: 구조 앵커(자신·이웃 구조체가 안 떨어진다) */
  const M = [
    { id: 0,  name: '지우개',   color: [13, 17, 23],    kind: 'empty' },
    { id: 1,  name: '옹벽',     color: [72, 76, 84],    kind: 'solid', anchor: 1, boom: 0 },
    { id: 2,  name: '모래',     color: [217, 192, 122], kind: 'powder' },
    { id: 3,  name: '자갈',     color: [143, 138, 128], kind: 'powder', heavy: 1 },
    { id: 4,  name: '시멘트',   color: [154, 160, 168], kind: 'powder' },
    { id: 5,  name: '물',       color: [77, 159, 232],  kind: 'liquid' },
    // 양생은 천천히(사용자 지시) — 급하면 배속(×4)이나 히터 보온양생을 쓰는 게 게임의 재미
    { id: 6,  name: '시멘트풀', color: [184, 188, 196], kind: 'slurry', cureTo: 16, cure: 600 },
    { id: 7,  name: '모르타르', color: [169, 169, 163], kind: 'slurry', cureTo: 17, cure: 750 },
    { id: 8,  name: '레미콘',   color: [125, 131, 140], kind: 'slurry', cureTo: 18, cure: 900 },
    { id: 9,  name: '고강도',   color: [91, 100, 114],  kind: 'slurry', cureTo: 19, cure: 700 },
    { id: 10, name: '기름',     color: [181, 141, 61],  kind: 'liquid', flam: 1, ign: 260 },
    { id: 11, name: '우레탄폼', color: [240, 208, 96],  kind: 'slurry', cureTo: 20, cure: 100, grow: 1, flam: 1, ign: 320 },
    { id: 12, name: '용접불꽃', color: [255, 122, 48],  kind: 'gas', fire: 1, life: 26 },
    { id: 13, name: '연기',     color: [107, 107, 107], kind: 'gas', life: 90 },
    { id: 14, name: '증기',     color: [207, 216, 224], kind: 'gas', life: 160 },
    { id: 15, name: '얼음',     color: [191, 227, 255], kind: 'solid', crush: 60 },
    { id: 16, name: '굳은시멘트', color: [194, 198, 205], kind: 'solid', crush: 40, hidden: 1 },
    { id: 17, name: '굳은몰탈', color: [151, 151, 143], kind: 'solid', crush: 55, hidden: 1 },
    { id: 18, name: '콘크리트', color: [111, 117, 128], kind: 'solid', crush: 110 },
    { id: 19, name: '고강도콘크리트', color: [74, 81, 96], kind: 'solid', crush: 200, hidden: 1 },
    { id: 20, name: '굳은폼',   color: [230, 217, 160], kind: 'solid', crush: 14, flam: 1, ign: 300, hidden: 1 },
    { id: 21, name: '거푸집',   color: [165, 113, 63],  kind: 'solid', crush: 90, flam: 1, ign: 280 },
    { id: 22, name: '철근',     color: [85, 96, 108],   kind: 'solid', anchor: 1 },
    { id: 23, name: '녹슨철근', color: [138, 90, 58],   kind: 'solid', anchor: 1, crush: 130, hidden: 1 },
    { id: 24, name: '쇳물',     color: [255, 176, 82],  kind: 'liquid', hot: 1400 },
    { id: 25, name: '벽돌',     color: [176, 96, 70],   kind: 'solid', crush: 90 },
    { id: 26, name: '유리',     color: [168, 205, 214], kind: 'solid', crush: 25 },
    { id: 27, name: '눈',       color: [242, 247, 251], kind: 'powder', light: 1 },
    { id: 28, name: '염화칼슘', color: [232, 226, 242], kind: 'powder' },
    { id: 29, name: '흙',       color: [122, 92, 62],   kind: 'powder' },
    { id: 30, name: '진흙',     color: [93, 70, 48],    kind: 'slurry', cureTo: 29, cure: 900 },
    { id: 31, name: '다이너마이트', color: [214, 60, 48], kind: 'solid', expl: 9, ign: 150, crush: 999 },
    { id: 32, name: '화약',     color: [58, 58, 62],    kind: 'powder', expl: 4, ign: 180 },
    { id: 33, name: '잔해',     color: [120, 116, 110], kind: 'powder', heavy: 1 },
    { id: 34, name: '아스팔트', color: [46, 46, 52],    kind: 'solid', crush: 70 },
    { id: 35, name: '아스팔트(액)', color: [64, 60, 66], kind: 'liquid', hot: 130, hidden: 1 },
    { id: 36, name: '히터',     color: [255, 96, 64],   kind: 'solid', anchor: 1, heat: 600 },
    { id: 37, name: '쿨러',     color: [96, 180, 255],  kind: 'solid', anchor: 1, heat: -60 },
    { id: 38, name: '니트로',   color: [98, 190, 98],   kind: 'liquid', expl: 6, ign: 60 },
    { id: 39, name: 'C4',       color: [222, 200, 120], kind: 'solid', expl: 13, ign: 450, stable: 1, crush: 999 },
    { id: 40, name: '도화선',   color: [180, 150, 120], kind: 'solid', flam: 1, ign: 140, crush: 999 },
    { id: 41, name: '석고',     color: [235, 231, 222], kind: 'powder' },
    { id: 42, name: '석고반죽', color: [222, 218, 208], kind: 'slurry', cureTo: 43, cure: 400, hidden: 1 },
    { id: 43, name: '석고보드', color: [240, 236, 228], kind: 'solid', crush: 30, hidden: 1 },
    { id: 44, name: '유리물',   color: [255, 210, 140], kind: 'liquid', hot: 1000, hidden: 1 },
    { id: 45, name: '염산',     color: [190, 240, 120], kind: 'liquid' },
    { id: 46, name: '씨앗',     color: [120, 160, 70],  kind: 'powder' },
    { id: 47, name: '풀',       color: [70, 160, 60],   kind: 'solid', flam: 1, ign: 250, crush: 10, hidden: 1 },
    { id: 48, name: 'LPG가스',  color: [200, 200, 230], kind: 'gas', life: 240, flam: 1, ign: 350 },
    // ---- 화학 (재미난 반응들) ----
    { id: 49, name: '생석회',   color: [225, 220, 205], kind: 'powder' },                    // +물 = 발열!
    { id: 50, name: '소석회',   color: [236, 233, 224], kind: 'powder', hidden: 1 },
    { id: 51, name: '에폭시A',  color: [230, 190, 90],  kind: 'liquid' },                    // A+B = 경화
    { id: 52, name: '에폭시B',  color: [90, 150, 230],  kind: 'liquid' },
    { id: 53, name: '에폭시',   color: [205, 170, 95],  kind: 'solid', crush: 160, hidden: 1 },
    { id: 54, name: '팽창제',   color: [210, 205, 190], kind: 'powder' },                    // +물 = 무소음 파쇄
    { id: 55, name: '팽창반죽', color: [222, 216, 200], kind: 'slurry', cureTo: 33, cure: 90, grow: 2, hidden: 1 },
    { id: 56, name: '수은',     color: [200, 205, 215], kind: 'liquid' },                    // 무거운 액체 — 다 뜬다
    { id: 57, name: '액체질소', color: [170, 220, 255], kind: 'liquid', heat: -196 },
    { id: 58, name: '테르밋',   color: [150, 90, 60],   kind: 'powder' },                    // 600°C 에서 점화 — 쇳물이 된다
    { id: 59, name: '소화분말', color: [240, 170, 200], kind: 'powder' },                    // 불을 끈다
    { id: 60, name: '드라이아이스', color: [220, 240, 250], kind: 'powder', heat: -78 },
    // ---- 강체(덩어리) — bodies[] 가 관리한다. 낱알처럼 움직이지 않는다 ----
    { id: 61, name: '공시체',   color: [130, 136, 146], kind: 'solid', hidden: 1 },
    { id: 62, name: '몰드',     color: [96, 116, 150],  kind: 'solid', anchor: 1, crush: 999, hidden: 1 }
  ];
  const BODY = 61, MOLD = 62;
  const KIND = M.map((m) => m.kind);
  const CRUSH = M.map((m) => m.crush || 0);
  const ANCHOR = M.map((m) => m.anchor ? 1 : 0);

  /* ---------------- 격자 ---------------- */
  const W = 120, H = 176, AMBIENT = 20;
  let mat = new Uint8Array(W * H);
  let life = new Uint16Array(W * H);
  let temp = new Int16Array(W * H).fill(AMBIENT);
  let moved = new Uint8Array(W * H);
  const I = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const N4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  /* ---------------- 상태·화면 ---------------- */
  let root = null, cv = null, ctx = null, imgData = null;
  let running = false, paused = false, raf = 0;
  let curMat = 8, brush = 1;                        // 기본 붓 1 (사용자 지시)
  let speed = 1;                                    // 기본 ×1 (사용자 지시). ½ 은 프레임 걸러 1틱
  let halfFlip = false;
  let boomQ = [];                                   // 연쇄 폭발 큐
  let bodies = [], nextBid = 1;                     // 강체 공시체 목록 (life[i] = bid)
  let molds = [];                                   // 놓인 몰드 { x, y(내부 좌상단), t }
  const noise = new Uint8Array(W * H);
  for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 3) | 0;

  /* ---------------- UI ---------------- */
  function buildUI() {
    root = document.createElement('div');
    root.id = 'powder';
    root.className = 'pd hidden';
    // 모바일 최적화: 자주 누르는 조작(속도·붓·멈춤·비우기)은 엄지가 닿는 아래줄로
    root.innerHTML =
      '<div class="pd-top">' +
      '  <b class="pd-title">몰래 파우더<i>건설현장판</i></b>' +
      '  <span class="pd-top-btns">' +
      '    <button class="pd-btn pd-go-press" id="pd-pressbtn">압축기</button>' +
      '    <button class="pd-btn pd-x" id="pd-close">닫기</button>' +
      '  </span>' +
      '</div>' +
      '<div class="pd-stage"><canvas id="pd-cv"></canvas></div>' +
      '<div class="pd-hud"><i id="pd-swatch"></i><span id="pd-info">레미콘을 부어 보세요 — 영하면 양생이 안 됩니다</span></div>' +
      '<div class="pd-ctl">' +
      '  <button class="pd-btn" id="pd-speed">×1</button>' +
      '  <button class="pd-btn" id="pd-brush">붓 1</button>' +
      '  <button class="pd-btn" id="pd-pause">멈춤</button>' +
      '  <button class="pd-btn" id="pd-clear">비우기</button>' +
      '</div>' +
      '<div class="pd-cats" id="pd-cats"></div>' +
      '<div class="pd-pal" id="pd-pal"></div>' +
      '<div class="pd-press hidden" id="pd-press">' +
      '  <div class="pd-top">' +
      '    <b class="pd-title">압축강도 시험기<i>UTM</i></b>' +
      '    <span class="pd-top-btns"><button class="pd-btn pd-x" id="pd-press-close">현장으로</button></span>' +
      '  </div>' +
      '  <div class="pd-shelf-cap">공시체 고르기 — 현장에서 만든 것부터</div>' +
      '  <div class="pd-shelf" id="pd-shelf"></div>' +
      '  <div class="pd-utm">' +
      '    <div class="pd-utm-col">' +
      '      <div class="pd-utm-head" id="pd-utm-head"></div>' +
      '      <div class="pd-spec-slot"><div class="pd-spec empty" id="pd-spec"></div></div>' +
      '      <div class="pd-utm-base"></div>' +
      '    </div>' +
      '    <div class="pd-gauge">' +
      '      <b id="pd-kn">0.0</b><span class="pd-kn-unit">kN</span>' +
      '      <span id="pd-mpa">0.00 N/mm²</span>' +
      '      <div class="pd-press-res hidden" id="pd-press-res"></div>' +
      '    </div>' +
      '  </div>' +
      '  <button class="pd-go" id="pd-go" disabled>공시체를 고르세요</button>' +
      '</div>';
    document.body.appendChild(root);

    cv = root.querySelector('#pd-cv');
    cv.width = W; cv.height = H;
    ctx = cv.getContext('2d');
    imgData = ctx.createImageData(W, H);

    renderCats();
    renderPal();
    hud();

    root.querySelector('#pd-close').addEventListener('click', close);
    root.querySelector('#pd-clear').addEventListener('click', () => {
      mat.fill(0); life.fill(0); temp.fill(AMBIENT); boomQ.length = 0;
      bodies.length = 0; molds.length = 0;
      U.buzz(10);
    });
    root.querySelector('#pd-pressbtn').addEventListener('click', openPress);
    root.querySelector('#pd-press-close').addEventListener('click', closePress);
    root.querySelector('#pd-go').addEventListener('click', startPress);
    root.querySelector('#pd-pause').addEventListener('click', (e) => {
      paused = !paused;
      e.target.textContent = paused ? '재생' : '멈춤';
    });
    root.querySelector('#pd-brush').addEventListener('click', (e) => {
      brush = brush === 3 ? 6 : (brush === 6 ? 1 : 3);
      e.target.textContent = '붓 ' + brush;
    });
    root.querySelector('#pd-speed').addEventListener('click', (e) => {
      // ½ → 1 → 2 → 4 순환 (시간 조절)
      speed = speed === 0.5 ? 1 : (speed === 1 ? 2 : (speed === 2 ? 4 : 0.5));
      e.target.textContent = '×' + (speed === 0.5 ? '½' : speed);
    });

    let drawing = false, last = null;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width * W) | 0,
               y: ((e.clientY - r.top) / r.height * H) | 0 };
    };
    cv.addEventListener('pointerdown', (e) => {
      const p = pos(e);
      if (curMold) { stampMold(p.x, p.y); return; }                           // 몰드도 한 번에 하나
      if (curStamp) { stampAt(p.x, p.y, curStamp); return; }                  // 공시체는 한 번에 하나
      drawing = true; last = p; paint(p.x, p.y); hud(p.x, p.y);
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      line(last.x, last.y, p.x, p.y);
      last = p;
    });
    const up = () => { drawing = false; last = null; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  /* ---- 팔레트: 카테고리 탭 + 재료 칩 (게임 HUD) ---- */
  /* 찾기 쉽게 일하는 순서대로 분류(사용자 지시): 배합 → 자재 → 공시체 → 화학 → 위험 → 자연 → 도구 */
  const CATS = [
    { name: '배합', ids: [8, 9, 6, 7, 4, 2, 3, 5] },
    { name: '자재', ids: [22, 21, 25, 26, 34, 41, 11, 1] },
    { name: '공시체', stamps: [
      { label: '몰드', mold: 1 },
      { label: '콘크리트', mat: 18 }, { label: '고강도', mat: 19 },
      { label: '몰탈', mat: 17 }, { label: '시멘트', mat: 16 },
      { label: '석고', mat: 43 }, { label: '유리', mat: 26 },
      { label: '벽돌', mat: 25 }, { label: '얼음', mat: 15 }
    ] },
    { name: '화학', ids: [49, 51, 52, 54, 45, 58, 59, 57, 60, 56] },
    { name: '위험', ids: [12, 10, 48, 32, 40, 31, 39, 38, 24] },
    { name: '자연', ids: [27, 15, 28, 29, 46, 33] },
    { name: '도구', ids: [36, 37, 0] }
  ];
  let curCat = 0;
  let curStamp = 0;                    // 0 이면 붓 모드, 아니면 그 재료의 공시체 찍기
  let curMold = 0;                     // 1 이면 몰드 놓기 모드

  function renderCats() {
    const el = root.querySelector('#pd-cats');
    el.innerHTML = '';
    CATS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'pd-cat' + (i === curCat ? ' on' : '');
      b.textContent = c.name;
      b.addEventListener('click', () => { curCat = i; renderCats(); renderPal(); U.buzz(4); });
      el.appendChild(b);
    });
  }

  function renderPal() {
    const pal = root.querySelector('#pd-pal');
    pal.innerHTML = '';
    const c = CATS[curCat];
    if (c.stamps) {
      c.stamps.forEach((s) => {
        const b = document.createElement('button');
        if (s.mold) {
          b.className = 'pd-mat' + (curMold ? ' on' : '');
          b.innerHTML = '<i class="pd-cyl pd-moldic"></i>' + s.label;
          b.addEventListener('click', () => {
            curMold = 1; curStamp = 0;
            renderPal(); hud();
            U.buzz(4);
          });
        } else {
          const m = M[s.mat];
          b.className = 'pd-mat' + (!curMold && curStamp === s.mat ? ' on' : '');
          b.innerHTML = '<i class="pd-cyl" style="background:rgb(' + m.color.join(',') + ')"></i>' + s.label;
          b.addEventListener('click', () => {
            curStamp = s.mat; curMold = 0;
            renderPal(); hud();
            U.buzz(4);
          });
        }
        pal.appendChild(b);
      });
      return;
    }
    c.ids.forEach((id) => {
      const m = M[id];
      const b = document.createElement('button');
      b.className = 'pd-mat' + (!curStamp && !curMold && id === curMat ? ' on' : '');
      b.innerHTML = '<i style="background:rgb(' + m.color.join(',') + ')"></i>' + m.name;
      b.addEventListener('click', () => {
        curMat = id; curStamp = 0; curMold = 0;
        renderPal(); hud();
        U.buzz(4);
      });
      pal.appendChild(b);
    });
  }

  function hud(x, y) {
    const el = root.querySelector('#pd-info');
    const sw = root.querySelector('#pd-swatch');
    if (!el) return;
    const m = curMold ? M[MOLD] : (curStamp ? M[curStamp] : M[curMat]);
    if (sw) sw.style.background = 'rgb(' + m.color.join(',') + ')';
    let txt = curMold ? '몰드 놓기 — 안을 채워 굳히면 저절로 탈형됩니다'
            : curStamp ? ('공시체 찍기: ' + m.name + ' — 한 덩어리다. 압축기에 넣어 보세요')
            : ('붓: ' + m.name);
    if (x != null && inb(x, y)) {
      const i = I(x, y);
      txt = M[mat[i]].name + ' · ' + temp[i] + '°C  |  ' + txt;
    }
    el.textContent = txt;
  }

  function hudMsg(t) { const el = root && root.querySelector('#pd-info'); if (el) el.textContent = t; }

  /* ---------------- 강체 공시체 (하나의 덩어리 — 사용자 지시) ----------------
     공시체는 낱알이 아니라 bodies[] 의 직사각형 강체다. 셀은 mat=BODY, life=bid 로 표시만 하고
     이동·파괴는 몸체 단위로 한다. 부서질 때(폭발·압괴·산)만 통째로 잔해가 된다. */
  const SPEC_W = 9, SPEC_H = 19;       // 실물 100×200mm 원기둥 비율

  function makeBody(x0, y0, m) {
    const b = { bid: nextBid++, x: x0, y: y0, w: SPEC_W, h: SPEC_H, mat: m };
    if (nextBid > 65000) nextBid = 1;                 // life 는 Uint16 — 안전 순환
    for (let yy = y0; yy < y0 + SPEC_H; yy++) {
      for (let xx = x0; xx < x0 + SPEC_W; xx++) {
        const i = I(xx, yy);
        mat[i] = BODY; life[i] = b.bid; temp[i] = AMBIENT;
      }
    }
    bodies.push(b);
    return b;
  }

  function bodyById(bid) {
    for (const b of bodies) if (b.bid === bid) return b;
    return null;
  }

  function shatterBody(b) {                            // 통째로 바스러진다
    for (let yy = b.y; yy < b.y + b.h; yy++) {
      for (let xx = b.x; xx < b.x + b.w; xx++) {
        const i = I(xx, yy);
        if (mat[i] === BODY && life[i] === b.bid) { mat[i] = 33; life[i] = 0; }
      }
    }
    const k = bodies.indexOf(b);
    if (k >= 0) bodies.splice(k, 1);
    U.buzz(15);
  }

  function removeBody(b) {                             // 시험기 반출 — 흔적 없이
    for (let yy = b.y; yy < b.y + b.h; yy++) {
      for (let xx = b.x; xx < b.x + b.w; xx++) {
        const i = I(xx, yy);
        if (mat[i] === BODY && life[i] === b.bid) { mat[i] = 0; life[i] = 0; }
      }
    }
    const k = bodies.indexOf(b);
    if (k >= 0) bodies.splice(k, 1);
  }

  /* 공시체 도장 — 완성품을 바로 찍는다(기성품) */
  function stampAt(cx0, cy0, m) {
    const x0 = Math.max(0, Math.min(W - SPEC_W, cx0 - (SPEC_W >> 1)));
    const y0 = Math.max(0, Math.min(H - SPEC_H, cy0 - (SPEC_H >> 1)));
    for (let yy = y0; yy < y0 + SPEC_H; yy++) {
      for (let xx = x0; xx < x0 + SPEC_W; xx++) {
        const id = mat[I(xx, yy)];
        if (id && KIND[id] === 'solid') { hudMsg('자리가 좁습니다 — 빈 곳에 찍으세요'); return; }
      }
    }
    makeBody(x0, y0, m);
    U.buzz(10);
  }

  /* 몰드 — 내부 9×19 + 좌우·바닥 벽. 안에 부어 굳으면 저절로 탈형된다 */
  function stampMold(cx0, cy0) {
    const x0 = Math.max(1, Math.min(W - SPEC_W - 1, cx0 - (SPEC_W >> 1)));
    const y0 = Math.max(0, Math.min(H - SPEC_H - 1, cy0 - (SPEC_H >> 1)));
    for (let yy = y0; yy <= y0 + SPEC_H; yy++) {
      for (let xx = x0 - 1; xx <= x0 + SPEC_W; xx++) {
        const id = mat[I(xx, yy)];
        if (id && KIND[id] === 'solid') { hudMsg('자리가 좁습니다 — 빈 곳에 놓으세요'); return; }
      }
    }
    for (let yy = y0; yy <= y0 + SPEC_H; yy++) {
      setWall(x0 - 1, yy); setWall(x0 + SPEC_W, yy);
      for (let xx = x0; xx < x0 + SPEC_W; xx++) {
        const i = I(xx, yy);
        if (yy === y0 + SPEC_H) { setWall(xx, yy); }
        else { mat[i] = 0; life[i] = 0; }
      }
    }
    molds.push({ x: x0, y: y0, t: 0 });
    hudMsg('몰드를 놓았습니다 — 레미콘을 부어 채우세요');
    U.buzz(10);
  }
  function setWall(x, y) { const i = I(x, y); mat[i] = MOLD; life[i] = 0; temp[i] = AMBIENT; }

  /* 몸체 물리 — 셀 순회가 끝난 뒤 몸체 단위로 낙하·침강·압괴 */
  function bodiesStep() {
    if (!bodies.length) return;
    bodies.sort((a, b) => b.y - a.y);                  // 아래 것부터 — 쌓인 채 같이 떨어진다
    for (let k = 0; k < bodies.length; k++) {
      const b = bodies[k];
      const yb = b.y + b.h;
      let can = yb < H, hasLiq = false;
      if (can) {
        for (let xx = b.x; xx < b.x + b.w; xx++) {
          const m2 = mat[I(xx, yb)];
          if (passable(m2)) continue;
          if (KIND[m2] === 'liquid') { hasLiq = true; continue; }
          can = false; break;
        }
      }
      if (can && (!hasLiq || Math.random() < 0.35)) {  // 액체 속에선 천천히 가라앉는다
        for (let xx = b.x; xx < b.x + b.w; xx++) {
          const iT = I(xx, b.y), iB = I(xx, yb);
          const mv = mat[iB];                          // 밀려난 액체·가스는 위로
          mat[iT] = (KIND[mv] === 'liquid' || KIND[mv] === 'gas') ? mv : 0;
          life[iT] = 0; temp[iT] = temp[iB];
          mat[iB] = BODY; life[iB] = b.bid;
        }
        b.y++;
        continue;
      }
      // 압괴 — 위 하중이 한계를 넘으면 통째로 (현장식 압축시험 놀이는 그대로 살린다)
      if (Math.random() < 0.05) {
        const lim = CRUSH[b.mat] || 60;
        let load = 0;
        for (let xx = b.x; xx < b.x + b.w; xx++) {
          for (let yy = b.y - 1; yy >= 0; yy--) {
            const m2 = mat[I(xx, yy)];
            if (!m2 || KIND[m2] === 'gas') break;
            load += (KIND[m2] === 'solid') ? 2 : 1;
          }
        }
        if (load > lim * b.w) { shatterBody(b); k--; }
      }
    }
  }

  /* 몰드 감시 — 벽이 헐리면 폐기, 내부가 다 굳으면 탈형해 덩어리로 */
  function moldsStep() {
    for (let k = molds.length - 1; k >= 0; k--) {
      const md = molds[k];
      let broken = false;
      for (let yy = md.y; yy <= md.y + SPEC_H && !broken; yy++) {
        if (mat[I(md.x - 1, yy)] !== MOLD || mat[I(md.x + SPEC_W, yy)] !== MOLD) broken = true;
      }
      if (!broken) {
        for (let xx = md.x; xx < md.x + SPEC_W; xx++) {
          if (mat[I(xx, md.y + SPEC_H)] !== MOLD) { broken = true; break; }
        }
      }
      if (broken) { molds.splice(k, 1); continue; }
      let full = true;
      const cnt = {};
      for (let yy = md.y; yy < md.y + SPEC_H && full; yy++) {
        for (let xx = md.x; xx < md.x + SPEC_W; xx++) {
          const id = mat[I(xx, yy)];
          if (!id || id === BODY || id === MOLD || KIND[id] !== 'solid') { full = false; break; }
          cnt[id] = (cnt[id] || 0) + 1;
        }
      }
      if (!full) { md.t = 0; continue; }
      if (++md.t < 40) continue;                       // 다 굳은 걸 확인하고 잠깐 뜸
      let best = 18, n = 0;
      for (const id in cnt) if (cnt[id] > n) { n = cnt[id]; best = +id; }
      for (let yy = md.y; yy <= md.y + SPEC_H; yy++) {
        if (mat[I(md.x - 1, yy)] === MOLD) mat[I(md.x - 1, yy)] = 0;
        if (mat[I(md.x + SPEC_W, yy)] === MOLD) mat[I(md.x + SPEC_W, yy)] = 0;
      }
      for (let xx = md.x; xx < md.x + SPEC_W; xx++) {
        if (mat[I(xx, md.y + SPEC_H)] === MOLD) mat[I(xx, md.y + SPEC_H)] = 0;
      }
      makeBody(md.x, md.y, best);
      molds.splice(k, 1);
      hudMsg('탈형! ' + M[best].name + ' 공시체 완성 — 압축기로 가져가 보세요');
      U.buzz(20);
    }
  }

  function paint(cx0, cy0) {
    const r = brush;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx0 + dx, y = cy0 + dy;
        if (!inb(x, y)) continue;
        const k = KIND[curMat];
        if ((k === 'powder' || k === 'liquid' || k === 'slurry' || k === 'gas') && Math.random() < 0.4) continue;
        const i = I(x, y);
        if (mat[i] === BODY) {                         // 지우개가 덩어리에 닿으면 통째로 지운다
          if (curMat === 0) { const bb = bodyById(life[i]); if (bb) removeBody(bb); }
          continue;                                    // 다른 재료로는 못 덮는다 (강체 불변식)
        }
        if (curMat !== 0 && mat[i] !== 0 && KIND[mat[i]] === 'solid') continue;
        mat[i] = curMat;
        life[i] = 0;
        temp[i] = M[curMat].hot || (curMat === 12 ? 700 : (M[curMat].heat || AMBIENT));
      }
    }
  }

  function line(x0, y0, x1, y1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= n; s++) {
      paint(Math.round(x0 + (x1 - x0) * s / n), Math.round(y0 + (y1 - y0) * s / n));
    }
  }

  /* ---------------- 반응(배합·용해) ---------------- */
  function react(a, b) {
    if ((a === 4 && b === 5) || (a === 5 && b === 4)) return [6, 6];      // 시멘트+물 → 시멘트풀
    if ((a === 6 && b === 2) || (a === 2 && b === 6)) return [7, 7];      // +모래 → 모르타르
    if ((a === 7 && b === 3) || (a === 3 && b === 7)) return [8, 8];      // +자갈 → 레미콘
    if (a === 28 && (b === 15 || b === 27)) return [5, 5];                // 염화칼슘 — 제설
    if ((a === 15 || a === 27) && b === 28) return [5, 5];
    if ((a === 28 && b === 5) || (a === 5 && b === 28)) return [5, 5];
    if ((a === 29 && b === 5) || (a === 5 && b === 29)) return [30, 30];  // 흙+물 → 진흙
    if ((a === 41 && b === 5) || (a === 5 && b === 41)) return [42, 42];  // 석고+물 → 석고반죽
    if ((a === 49 && b === 5) || (a === 5 && b === 49)) return [50, 50];  // 생석회+물 → 소석회 (발열!)
    if ((a === 51 && b === 52) || (a === 52 && b === 51)) return [53, 53];// 에폭시 A+B → 경화
    if ((a === 54 && b === 5) || (a === 5 && b === 54)) return [55, 55];  // 팽창제+물 → 무소음 파쇄
    return null;
  }

  function tryReact(i, x, y) {
    const a = mat[i];
    for (let k = 0; k < 4; k++) {
      const nx = x + N4[k][0], ny = y + N4[k][1];
      if (!inb(nx, ny)) continue;
      const j = I(nx, ny);
      const r = react(a, mat[j]);
      if (r) {
        const hot = (a === 49 || mat[j] === 49);       // 생석회 수화 발열 — 진짜 화학이다
        mat[i] = r[0]; mat[j] = r[1];
        life[i] = 0; life[j] = 0;
        if (hot) { temp[i] = 220; temp[j] = 220; }
        return true;
      }
    }
    return false;
  }

  function swap(i, j) {
    const m = mat[i], l = life[i], t = temp[i];
    mat[i] = mat[j]; life[i] = life[j]; temp[i] = temp[j];
    mat[j] = m; life[j] = l; temp[j] = t;
    moved[i] = 1; moved[j] = 1;
  }
  const passable = (id) => id === 0 || KIND[id] === 'gas';
  const sinkIn = (id) => KIND[id] === 'liquid' && id !== 56;   // 수은엔 다 뜬다(무거운 액체)

  /* ---------------- 폭발 ---------------- */
  function boom(cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const x = cx + dx, y = cy + dy;
        if (!inb(x, y)) continue;
        const i = I(x, y);
        const id = mat[i];
        if (id === 1) continue;                       // 옹벽은 발파로도 안 깨진다
        if (id === BODY) {                            // 덩어리는 통째로 바스러진다
          const bb = bodyById(life[i]);
          if (bb) shatterBody(bb);
          continue;
        }
        if (M[id].expl && !(dx === 0 && dy === 0)) {  // 연쇄 기폭
          boomQ.push([x, y, M[id].expl]);
          mat[i] = 0;
          continue;
        }
        temp[i] = 900;
        if (d2 < r * r * 0.36) {
          mat[i] = Math.random() < 0.5 ? 12 : 0;      // 중심부 — 화염
          life[i] = 0;
        } else if (KIND[id] === 'solid') {
          mat[i] = 33; life[i] = 0;                   // 구조물 → 잔해
        } else if (id && Math.random() < 0.5) {
          mat[i] = 13; life[i] = 0;
        }
      }
    }
    U.buzz(30);
  }

  function fuse(i, x, y) {                            // 폭발물 기폭 조건
    const id = mat[i];
    if (!M[id].expl) return false;
    // C4(stable)는 불로는 안 터진다 — 고온(뇌관)이나 다른 폭발의 연쇄로만
    if (temp[i] >= (M[id].ign || 150) || (!M[id].stable && nearFire(x, y))) {
      mat[i] = 0;
      boomQ.push([x, y, M[id].expl]);
      return true;
    }
    return false;
  }

  /* ---------------- 온도 ---------------- */
  function condOf(id) {
    const k = KIND[id];
    if (id === 22 || id === 23) return 0.5;           // 철 — 잘 통한다
    if (id === 20 || id === 11) return 0.03;          // 폼 — 단열재
    if (k === 'solid') return 0.2;
    if (k === 'liquid' || k === 'slurry') return 0.3;
    if (k === 'powder') return 0.15;
    return 0.12;                                      // 공기·가스
  }

  function heatPass() {
    // 위→아래 한 방향 이웃 섞기 — 싸고 그럴듯하다
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = I(x, y);
        const id = mat[i];
        if (M[id].heat != null) { temp[i] = M[id].heat; continue; }   // 히터·쿨러는 온도원
        if (id === 12) { temp[i] = Math.max(temp[i], 700); }
        if (id === 24) { temp[i] = Math.max(temp[i], 1300); }
        let sum = 0, n = 0;
        if (x > 0) { sum += temp[i - 1]; n++; }
        if (x < W - 1) { sum += temp[i + 1]; n++; }
        if (y > 0) { sum += temp[i - W]; n++; }
        if (y < H - 1) { sum += temp[i + W]; n++; }
        const c = condOf(id);
        temp[i] += ((sum / n - temp[i]) * c) | 0;
        if (!id) temp[i] += ((AMBIENT - temp[i]) * 0.02) | 0;         // 공기는 서서히 제자리로
      }
    }
  }

  /* 온도에 따른 상변화 — true 면 이 셀은 이번 틱 끝 */
  function phase(i, x, y) {
    const id = mat[i], t = temp[i];
    switch (id) {
      case 5:  if (t <= -1) { mat[i] = 15; return true; }
               if (t >= 100) { mat[i] = 14; life[i] = 0; return true; }
               break;
      case 15: if (t >= 1) { mat[i] = 5; return true; } break;
      case 27: if (t >= 1) { mat[i] = 5; return true; } break;
      case 14: if (t < 95 && Math.random() < 0.03) { mat[i] = 5; return true; } break;
      case 2:  if (t >= 450) { mat[i] = 26; return true; } break;      // 모래 → 유리 (불더미·쇳물로 구워진다)
      case 22: case 23:
               if (t >= 1300) { mat[i] = 24; return true; } break;     // 철근 → 쇳물
      case 24: if (t < 1000) { mat[i] = 22; return true; } break;      // 쇳물 → 철
      case 34: if (t >= 90) { mat[i] = 35; return true; } break;       // 아스팔트 녹음
      case 35: if (t < 60) { mat[i] = 34; return true; } break;
      case 26: if (t >= 900) { mat[i] = 44; return true; } break;      // 유리 → 유리물
      case 44: if (t < 500) { mat[i] = 26; return true; } break;
    }
    // 인화물 자연 발화
    if (M[id].flam && M[id].ign && t >= M[id].ign) { mat[i] = 12; life[i] = 0; return true; }
    return false;
  }

  /* ---------------- 하중·지지 ---------------- */
  function solidStep(i, x, y) {
    const id = mat[i];
    if (id === 47 && Math.random() < 0.02 && y > 0 && mat[I(x, y - 1)] === 0) {
      // 풀 — 조경. 5칸까지 위로 자란다
      let stalk = 0;
      for (let yy = y; yy < H && mat[I(x, yy)] === 47; yy++) stalk++;
      if (stalk < 5) mat[I(x, y - 1)] = 47;
    }
    if (ANCHOR[id]) {
      if (id === 22 || id === 23) rustCheck(i, x, y);
      return;
    }
    // 지지 검사 — 아래 3칸 중 하나라도 고체거나, 이웃에 앵커(철근·옹벽)가 있으면 버틴다
    let held = (y === H - 1);
    if (!held) {
      for (const dx of [0, -1, 1]) {
        const nx = x + dx;
        if (inb(nx, y + 1) && KIND[mat[I(nx, y + 1)]] === 'solid') { held = true; break; }
      }
    }
    if (!held) {
      for (let k = 0; k < 4 && !held; k++) {
        const nx = x + N4[k][0], ny = y + N4[k][1];
        if (inb(nx, ny) && ANCHOR[mat[I(nx, ny)]]) held = true;
      }
    }
    if (!held) {                                       // 받침이 없다 — 무너진다
      const below = I(x, y + 1);
      if (passable(mat[below]) || sinkIn(mat[below])) { swap(i, below); return; }
    }
    // 압괴 — 위에 쌓인 무게가 한계를 넘으면 잔해가 된다 (가끔만 재서 싸게)
    const lim = CRUSH[id];
    if (lim && lim < 999 && Math.random() < 0.04) {
      let load = 0;
      for (let yy = y - 1; yy >= 0 && load <= lim; yy--) {
        const m2 = mat[I(x, yy)];
        if (!m2 || KIND[m2] === 'gas') break;
        load += (KIND[m2] === 'solid') ? 2 : 1;        // 구조체가 더 무겁다
      }
      if (load > lim) { mat[i] = 33; life[i] = 0; U.buzz(6); }
    }
  }

  /* 철근 부식 — 천천히(사용자 지시), 대신 화학이 사실적이다:
     물 접촉 = 서서히 · 염화칼슘/염산 접촉 = 염해로 몇 배 빨리.
     콘크리트에 완전히 덮인 철근은 물이 안 닿으니 안 녹슨다(피복의 존재 이유).
     녹슨철근도 계속 젖어 있으면 결국 삭아서 잔해가 된다. */
  function rustCheck(i, x, y) {
    const id = mat[i];
    let gain = 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + N4[k][0], ny = y + N4[k][1];
      if (!inb(nx, ny)) continue;
      const t2 = mat[I(nx, ny)];
      if (t2 === 5) gain = Math.max(gain, 1);
      else if (t2 === 28 || t2 === 45) gain = 4;       // 염해
    }
    if (!gain) return;
    life[i] += gain;
    if (id === 22 && life[i] > 900) { mat[i] = 23; life[i] = 0; }
    else if (id === 23 && life[i] > 1500) { mat[i] = 33; life[i] = 0; }
  }

  /* ---------------- 한 틱 ---------------- */
  function step() {
    moved.fill(0);
    heatPass();
    const ltr = (Math.random() < 0.5);

    for (let y = H - 1; y >= 0; y--) {
      for (let xx = 0; xx < W; xx++) {
        const x = ltr ? xx : (W - 1 - xx);
        const i = I(x, y);
        const id = mat[i];
        if (!id || moved[i]) continue;
        if (id === BODY) continue;                     // 덩어리는 bodiesStep 이 몸체 단위로 움직인다

        if (phase(i, x, y)) continue;
        if (M[id].expl && fuse(i, x, y)) continue;

        const kind = KIND[id];

        if (kind === 'solid') { solidStep(i, x, y); continue; }

        if (kind === 'gas') {
          if (id === 12) fireStep(i, x, y);
          else gasStep(i, x, y, id);
          continue;
        }

        if (tryReact(i, x, y)) continue;

        if (kind === 'powder') {
          const p = M[id];
          if (id === 46) {                             // 씨앗 — 흙(진흙) 위에서 싹튼다
            const b2 = y + 1 < H ? mat[I(x, y + 1)] : 0;
            if ((b2 === 29 || b2 === 30) && Math.random() < 0.08) { mat[i] = 47; continue; }
          }
          if (id === 58 && temp[i] >= 600) {           // 테르밋 점화 — 초고온으로 타며 쇳물이 된다
            mat[i] = 24; temp[i] = 2200;
            if (y > 0 && mat[I(x, y - 1)] === 0) { mat[I(x, y - 1)] = 12; life[I(x, y - 1)] = 0; }
            continue;
          }
          if (id === 59) {                             // 소화분말 — 불을 끄고 식힌다
            for (let k = 0; k < 4; k++) {
              const nx = x + N4[k][0], ny = y + N4[k][1];
              if (!inb(nx, ny)) continue;
              const j = I(nx, ny);
              if (mat[j] === 12) { mat[j] = 13; life[j] = 0; temp[j] = 30; if (Math.random() < 0.25) mat[i] = 0; }
              else if (temp[j] > 60) temp[j] = 60;
            }
            if (!mat[i]) continue;
          }
          if (id === 60 && Math.random() < 0.005) {    // 드라이아이스 — 천천히 승화
            mat[i] = 13; life[i] = 0;
            continue;
          }
          if (p.light && Math.random() < 0.4) continue;
          const below = y + 1 < H ? I(x, y + 1) : -1;
          if (below >= 0 && (passable(mat[below]) || sinkIn(mat[below]))) { swap(i, below); continue; }
          const dir = Math.random() < 0.5 ? -1 : 1;
          if (Math.random() < (p.heavy ? 0.25 : 1)) {
            for (const d of [dir, -dir]) {
              if (inb(x + d, y + 1) && passable(mat[I(x + d, y + 1)])) { swap(i, I(x + d, y + 1)); break; }
            }
          }
          continue;
        }

        if (kind === 'slurry') {
          // 걸쭉함 — 밑이 뚫려 있으면 흘러내리고, 받쳐지면 **정착해서 양생이 쌓인다**.
          // (예전엔 바닥에서 옆으로 계속 흘러다녀 양생이 영영 안 됐다 — 실측 버그)
          const below = y + 1 < H ? I(x, y + 1) : -1;
          if (below >= 0 && passable(mat[below])) {
            swap(i, below); life[i] = 0; life[below] = 0;
            continue;
          }
          cureStep(i, x, y, id);
          // 갓 부은 것만 퍼진다 — 양생이 시작됐거나 얼었으면 그 자리에 멈춘다
          if (temp[i] > 0 && life[i] < 30 && Math.random() < 0.15) {
            const dir = Math.random() < 0.5 ? -1 : 1;
            for (const d of [dir, -dir]) {
              if (inb(x + d, y + 1) && passable(mat[I(x + d, y + 1)])) { swap(i, I(x + d, y + 1)); break; }
              if (inb(x + d, y) && passable(mat[I(x + d, y)])) { swap(i, I(x + d, y)); break; }
            }
          }
          continue;
        }

        if (kind === 'liquid') {
          if (id === 45) {                             // 염산 — 닿는 걸 녹인다(옹벽·유리는 견딤)
            let ate = false;
            for (let k = 0; k < 4; k++) {
              const nx = x + N4[k][0], ny = y + N4[k][1];
              if (!inb(nx, ny)) continue;
              const j = I(nx, ny);
              const t2 = mat[j];
              if (t2 === BODY) {                       // 산이 덩어리를 만나면 통째로 삭는다
                const bb = bodyById(life[j]);
                if (bb) shatterBody(bb);
                if (Math.random() < 0.4) mat[i] = 0;
                ate = true;
                break;
              }
              if (t2 && t2 !== 1 && t2 !== 26 && t2 !== 44 && t2 !== 45 && KIND[t2] !== 'gas') {
                mat[j] = Math.random() < 0.3 ? 13 : 0;
                if (Math.random() < 0.4) mat[i] = 0;   // 산도 같이 소모된다
                ate = true;
                break;
              }
            }
            if (ate && !mat[i]) continue;
          }
          if (id === 57 && Math.random() < 0.03) { mat[i] = 14; life[i] = 0; continue; }   // 액체질소 — 증발
          const below = y + 1 < H ? I(x, y + 1) : -1;
          if (below >= 0 && passable(mat[below])) { swap(i, below); continue; }
          if (id === 5 && below >= 0 && mat[below] === 10) { swap(i, below); continue; }   // 물이 기름 밑으로
          if (id === 56 && below >= 0 && KIND[mat[below]] === 'liquid' && mat[below] !== 56) {
            swap(i, below); continue;                  // 수은 — 어떤 액체보다 무겁다
          }
          const dir = Math.random() < 0.5 ? -1 : 1;
          let m1 = false;
          for (const d of [dir, -dir]) {
            if (inb(x + d, y + 1) && passable(mat[I(x + d, y + 1)])) { swap(i, I(x + d, y + 1)); m1 = true; break; }
          }
          if (m1) continue;
          for (const d of [dir, -dir]) {
            if (inb(x + d, y) && passable(mat[I(x + d, y)])) { swap(i, I(x + d, y)); break; }
          }
          continue;
        }
      }
    }

    bodiesStep();
    moldsStep();

    // 폭발은 순회가 끝난 뒤 한꺼번에 — 순회 중 터뜨리면 반쪽짜리 프레임이 된다
    if (boomQ.length) {
      const q = boomQ; boomQ = [];
      let n = 0;
      for (const b of q) { boom(b[0], b[1], b[2]); if (++n > 24) break; }   // 연쇄 폭주 제한
    }
  }

  /* 양생 — 온도를 따른다: 영하 정지(한중), 10도 미만 반속, 35도 초과 급결(서중) */
  function cureStep(i, x, y, id) {
    const p = M[id];
    if (!p.cureTo) return;
    const t = temp[i];
    if (t <= 0) return;                                // 동결 — 양생이 멈춘다
    if (p.grow && life[i] < 20 && Math.random() < (p.grow === 2 ? 0.5 : 0.25)) {
      const k = (Math.random() * 4) | 0;
      const nx = x + N4[k][0], ny = y + N4[k][1];
      if (inb(nx, ny)) {
        const j = I(nx, ny), t2 = mat[j];
        if (t2 === 0) { mat[j] = id; life[j] = 10; }
        else if (p.grow === 2 && KIND[t2] === 'solid' && CRUSH[t2] && CRUSH[t2] < 999 && Math.random() < 0.35) {
          mat[j] = 33; life[j] = 0;                    // 팽창제 — 발파 없이 콘크리트를 쪼갠다
        }
      }
    }
    const gain = t < 10 ? 1 : (t > 35 ? 3 : 2);
    if ((life[i] += gain) >= p.cure) { mat[i] = p.cureTo; life[i] = 0; }
  }

  function nearFire(x, y) {
    for (let k = 0; k < 4; k++) {
      const nx = x + N4[k][0], ny = y + N4[k][1];
      if (inb(nx, ny) && mat[I(nx, ny)] === 12) return true;
    }
    return false;
  }

  function fireStep(i, x, y) {
    for (let k = 0; k < 4; k++) {
      const nx = x + N4[k][0], ny = y + N4[k][1];
      if (!inb(nx, ny)) continue;
      const j = I(nx, ny);
      const t = mat[j];
      if (M[t].flam && Math.random() < 0.22) { mat[j] = 12; life[j] = 0; }
      else if (t === 5 && Math.random() < 0.5) { mat[j] = 14; mat[i] = 0; return; }
      else if ((t === 15 || t === 27) && Math.random() < 0.3) mat[j] = 5;
    }
    if (Math.random() < 0.12 && y > 0 && mat[I(x, y - 1)] === 0) mat[I(x, y - 1)] = 13;
    if (++life[i] > M[12].life) { mat[i] = Math.random() < 0.25 ? 13 : 0; life[i] = 0; return; }
    const dx = ((Math.random() * 3) | 0) - 1;
    if (inb(x + dx, y - 1) && mat[I(x + dx, y - 1)] === 0) swap(i, I(x + dx, y - 1));
  }

  function gasStep(i, x, y, id) {
    if (++life[i] > M[id].life) {
      mat[i] = (id === 14 && Math.random() < 0.25) ? 5 : 0;
      life[i] = 0;
      return;
    }
    const dx = ((Math.random() * 3) | 0) - 1;
    if (inb(x + dx, y - 1) && mat[I(x + dx, y - 1)] === 0) { swap(i, I(x + dx, y - 1)); return; }
    if (inb(x + dx, y) && mat[I(x + dx, y)] === 0 && Math.random() < 0.5) swap(i, I(x + dx, y));
  }

  /* ---------------- 압축강도 시험기 (별도 화면) ----------------
     현장 공시체(몰드 탈형·도장)를 가져오거나 기성품을 골라 가압한다.
     최대하중(kN) → 압축강도(N/mm²) 환산은 실물 Ø100 공시체와 같다. */
  const AREA_KN = 7.854;               // Ø100mm: 1 N/mm² ≒ 7.854 kN
  const STR = { 16: 12, 17: 16, 18: 27, 19: 46, 43: 5, 26: 8, 25: 14, 15: 3, 20: 1, 53: 32 };
  const NOM = { 16: 10, 17: 15, 18: 24, 19: 40, 43: 4, 26: 6, 25: 12, 15: 2 };
  let prSpec = null;                   // { mat, bid? } — bid 있으면 현장 공시체
  let prLoad = 0, prCap = 0, prRate = 1;
  let prState = 'idle';                // idle | run | broken

  function strengthOf(m) {
    if (STR[m] != null) return STR[m];
    // crush:999 는 "압괴 안 됨" 표식이지 강도가 아니다 — 폴백은 60 에서 자른다
    // (다이너마이트 공시체가 249 N/mm² 로 나오던 구멍 — 반대심문 확인)
    return Math.max(2, Math.min(60, ((CRUSH[m] || 40) / 4) | 0));
  }
  function shade(c, dlt) { return 'rgb(' + c.map((v) => Math.max(0, Math.min(255, v + dlt))).join(',') + ')'; }
  function specGrad(m) {
    const c = M[m].color;
    return 'linear-gradient(90deg,' + shade(c, -18) + ',' + shade(c, 14) + ' 35%,' + shade(c, -26) + ')';
  }

  function pressOpen() { return !!(root && !root.querySelector('#pd-press').classList.contains('hidden')); }
  function openPress() {
    root.querySelector('#pd-press').classList.remove('hidden');
    renderShelf();
    U.buzz(6);
  }
  function closePress() { root.querySelector('#pd-press').classList.add('hidden'); }

  /* 진열대 실시간 동기화 — 화면을 보는 사이 현장 공시체가 부서지면 목록도 따라간다
     (죽은 칩을 골라 침묵 실패하던 구멍 — 반대심문 확인) */
  let shelfSig = '';
  function shelfSync() {
    const sig = bodies.map((b) => b.bid).join(',');
    if (sig === shelfSig) return;
    if (prSpec && prSpec.bid && !bodyById(prSpec.bid) && prState !== 'run') {
      prSpec = null;
      const spec = root.querySelector('#pd-spec');
      spec.className = 'pd-spec empty';
      spec.style.background = '';
      const go = root.querySelector('#pd-go');
      go.disabled = true;
      go.textContent = '공시체를 고르세요';
      U.toast('고른 공시체가 현장에서 부서졌습니다');
    }
    renderShelf();
  }

  function renderShelf() {
    shelfSig = bodies.map((b) => b.bid).join(',');
    const el = root.querySelector('#pd-shelf');
    el.innerHTML = '';
    bodies.forEach((b) => {                            // 현장에서 만든 게 먼저 — 시험하면 사라진다
      const m = M[b.mat];
      const c = document.createElement('button');
      c.className = 'pd-mat' + (prSpec && prSpec.bid === b.bid ? ' on' : '');
      c.innerHTML = '<i class="pd-cyl" style="background:rgb(' + m.color.join(',') + ')"></i>현장 ' + m.name;
      c.addEventListener('click', () => pickSpec({ mat: b.mat, bid: b.bid }));
      el.appendChild(c);
    });
    CATS[2].stamps.forEach((s) => {
      if (s.mold) return;
      const m = M[s.mat];
      const c = document.createElement('button');
      c.className = 'pd-mat' + (prSpec && !prSpec.bid && prSpec.mat === s.mat ? ' on' : '');
      c.innerHTML = '<i class="pd-cyl" style="background:rgb(' + m.color.join(',') + ')"></i>' + s.label;
      c.addEventListener('click', () => pickSpec({ mat: s.mat }));
      el.appendChild(c);
    });
  }

  function pickSpec(sp) {
    if (prState === 'run') return;                     // 가압 중엔 교체 금지
    prSpec = sp; prState = 'idle'; prLoad = 0;
    const spec = root.querySelector('#pd-spec');
    spec.className = 'pd-spec';
    spec.style.background = specGrad(sp.mat);
    root.querySelector('#pd-press-res').classList.add('hidden');
    const go = root.querySelector('#pd-go');
    go.disabled = false;
    go.textContent = '가압 시작';
    setGauge(0);
    renderShelf();
    U.buzz(4);
  }

  function startPress() {
    if (!prSpec || prState === 'run') return;
    if (prSpec.bid) {                                  // 현장 공시체 — 현장에서 사라진다
      const b = bodyById(prSpec.bid);
      if (!b) {                                        // hudMsg 는 오버레이 뒤라 안 보인다 — 토스트로
        U.toast('그 공시체는 이미 부서졌습니다');
        prSpec = null;
        const go = root.querySelector('#pd-go');
        go.disabled = true;
        go.textContent = '공시체를 고르세요';
        renderShelf();
        return;
      }
      removeBody(b);
      prSpec = { mat: prSpec.mat };
      renderShelf();
    }
    if (M[prSpec.mat].expl) {                          // 폭발물 공시체 — 강도가 아니라 사고다
      prCap = 30 + Math.random() * 40;                 // 낮은 하중에서 기폭
    } else {
      const fc = strengthOf(prSpec.mat) * (0.9 + Math.random() * 0.2); // ±10% — 시험은 원래 흔들린다
      prCap = fc * AREA_KN;
    }
    prRate = Math.max(0.2, prCap / 260);               // 4초쯤에 파괴
    prLoad = 0; prState = 'run';
    const spec = root.querySelector('#pd-spec');
    spec.className = 'pd-spec';
    spec.style.background = specGrad(prSpec.mat);
    root.querySelector('#pd-press-res').classList.add('hidden');
    const go = root.querySelector('#pd-go');
    go.disabled = true;
    go.textContent = '가압 중…';
  }

  function setGauge(kn) {
    root.querySelector('#pd-kn').textContent = kn.toFixed(1);
    root.querySelector('#pd-mpa').textContent = (kn / AREA_KN).toFixed(2) + ' N/mm²';
    const head = root.querySelector('#pd-utm-head');
    if (head) head.style.transform = 'translateY(' + (prCap ? Math.min(8, kn / prCap * 8) : 0) + 'px)';
  }

  function prTick() {
    prLoad = Math.min(prCap, prLoad + prRate);
    setGauge(prLoad);
    const spec = root.querySelector('#pd-spec');
    const r = prLoad / prCap;
    spec.classList.toggle('crack1', r >= 0.75 && r < 0.92);
    spec.classList.toggle('crack2', r >= 0.92);
    if (prLoad >= prCap) breakSpec();
  }

  function breakSpec() {
    prState = 'broken';
    root.querySelector('#pd-spec').className = 'pd-spec boom';
    U.buzz(40);
    const res = root.querySelector('#pd-press-res');
    if (M[prSpec.mat].expl) {                          // 폭발물을 눌렀다 — 자업자득
      res.innerHTML =
        '<b>폭발!!</b>' +
        '<span>' + prCap.toFixed(1) + ' kN 에서 기폭했습니다</span>' +
        '<em class="bad">폭발물은 공시체가 아닙니다</em>';
    } else {
      const fc = prCap / AREA_KN;
      const nom = NOM[prSpec.mat];
      res.innerHTML =
        '<b>' + fc.toFixed(2) + ' N/mm²</b>' +
        '<span>최대하중 ' + prCap.toFixed(1) + ' kN</span>' +
        (nom != null
          ? '<em class="' + (fc >= nom ? 'ok' : 'bad') + '">기준 ' + nom + ' — ' + (fc >= nom ? '합격' : '미달') + '</em>'
          : '');
    }
    res.classList.remove('hidden');
    const go = root.querySelector('#pd-go');
    go.disabled = false;
    go.textContent = '다시 시험';
  }

  /* ---------------- 렌더 ---------------- */
  function render() {
    const d = imgData.data;
    const bmap = {};
    for (const bb of bodies) bmap[bb.bid] = bb;
    for (let i = 0, p = 0; i < mat.length; i++, p += 4) {
      const id = mat[i];
      let c = M[id].color;
      let r, g, b;
      if (id === BODY) {
        // 덩어리 — 원기둥 음영(가운데 밝게)으로 낱알이 아니라 한 물체로 보이게
        const bb = bmap[life[i]];
        if (bb) c = M[bb.mat].color;
        r = c[0]; g = c[1]; b = c[2];
        if (bb) {
          const x = i % W, y = (i / W) | 0;
          const mid = (bb.w - 1) / 2;
          const sh = 12 - Math.abs((x - bb.x) - mid) * 4;
          r += sh; g += sh; b += sh;
          if (y === bb.y || y === bb.y + bb.h - 1) { r -= 14; g -= 14; b -= 14; }
        }
      } else {
        r = c[0]; g = c[1]; b = c[2];
        if (id) {
          const n = noise[i] * 6 - 6;
          r += n; g += n; b += n;
        }
      }
      if (id) {
        // 뜨거우면 붉게 달아오른다 (철근·콘크리트 가열 표현)
        const t = temp[i];
        if (t > 300 && KIND[id] === 'solid') {
          const glow = Math.min(140, (t - 300) >> 2);
          r += glow; g += glow >> 2;
        }
      }
      d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function loop() {
    if (!running) return;
    if (!paused) {
      if (speed === 0.5) { halfFlip = !halfFlip; if (halfFlip) step(); }
      else for (let k = 0; k < speed; k++) step();
    }
    if (prState === 'run') prTick();                   // 시험기는 멈춤과 무관하게 돈다
    if (pressOpen()) shelfSync();
    render();
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- 열기/닫기 ---------------- */
  function open() {
    if (!root) buildUI();
    root.classList.remove('hidden');
    running = true; paused = false;
    loop();
    U.toast('발견! 지하 대기시간 전용입니다', 2000);
  }

  function close() {
    if (root && pressOpen()) { closePress(); return; } // 뒤로가기 — 시험기 화면만 먼저 닫힌다
    running = false;
    cancelAnimationFrame(raf);
    if (root) root.classList.add('hidden');
  }

  function isOpen() { return !!(root && !root.classList.contains('hidden')); }

  global.Powder = {
    open: open, close: close, isOpen: isOpen,
    // 테스트용
    _paint: function (x, y, m, r) { const c = curMat, b = brush; curMat = m; brush = r || 1; paint(x, y); curMat = c; brush = b; },
    _set: function (x, y, m) {
      const i = I(x, y);
      mat[i] = m; life[i] = 0;
      temp[i] = M[m].hot || (m === 12 ? 700 : (M[m].heat != null ? M[m].heat : AMBIENT));
    },
    _tick: function (n) { for (let k = 0; k < (n || 1); k++) step(); },
    _at: function (x, y) { return mat[I(x, y)]; },
    _temp: function (x, y) { return temp[I(x, y)]; },
    _setTemp: function (x, y, t) { temp[I(x, y)] = t; },
    _count: function (m) { let c = 0; for (let i = 0; i < mat.length; i++) if (mat[i] === m) c++; return c; },
    _clear: function () {
      mat.fill(0); life.fill(0); temp.fill(AMBIENT); boomQ.length = 0;
      bodies.length = 0; molds.length = 0;
    },
    _stamp: function (x, y, m) { stampAt(x, y, m); },
    _mold: function (x, y) { stampMold(x, y); },
    _prTick: function (n) { for (let k = 0; k < (n || 1) && prState === 'run'; k++) prTick(); },
    _bodies: function () { return bodies.map((b) => ({ bid: b.bid, x: b.x, y: b.y, w: b.w, h: b.h, mat: b.mat })); },
    _molds: function () { return molds.length; }
  };
})(window);

;
/* ===== js/bangtong.js ===== */
/* ============ bangtong.js — 방통시험 계산·저장 (beta) ============
   바닥 몰탈(방통) 품질시험. 입력은 **숫자 키패드**로 넣는다(OS 키보드 안 씀).
   몰탈 무게는 **자율 입력**이다(사용자 지시: 자릿수 안 정함) — 소수점(.) 키로 그대로 친다.
   슬럼프·층은 정수. 입력: 몰탈 무게(g) · 슬럼프 2회(mm — 평균) · 메모(자유)
   고정값(현장 기준): 시료실린더 400ml · 밀도기준 2400kg/㎥ 이상 · 슬럼프기준 220±20mm
   저장: **날짜별 · 담당 감리 · 사진**(동은 없다 — 사용자 지시). 저장한 건 목록에서 카톡으로 내보낸다.
   카톡 문구는 사용자 예시 양식 그대로:
     몰탈 무게 971.16g, 시료실린더 부피 400ml
     밀도 : 971.16/400=2.4279g/ml=2427.9kg/㎥
     밀도기준 : 2400kg/㎥ 이상
     슬럼프 240mm
     슬럼프기준 220±20mm
================================================================ */
(function (global) {
  'use strict';

  const VOL = 400;                     // 시료실린더 부피 (ml)
  const DEN_MIN = 2400;                // 밀도 기준 (kg/㎥ 이상)
  const SL_BASE = 220, SL_TOL = 20;    // 슬럼프 기준 (mm)
  // v2: 무게가 ÷100 숫자열에서 자율 문자열("971.16")로 바뀌어 옛 초안과 호환되지 않는다
  const K_SAVE = 'gsc.bang.draft.v2';

  const $ = U.$;

  /* 입력 중인 초안 — 값은 문자열(키패드가 그대로 채운다).
     무게는 친 그대로("971.16" — 소수점 포함 자율), 슬럼프·층은 정수. 계산은 그때그때 환산. */
  const EMPTY = () => ({ w: '', s1: '', s2: '', fl: '', memo: '',
                         dong: '', supervisor: '', supPhone: '', photos: [] });
  let draft = EMPTY();
  let active = 'w';                    // 지금 키패드가 채우는 칸 (w·s1·s2·fl)
  let editing = null;                  // 저장된 기록 수정 중이면 { id, day, order, createdAt }
  let stash = null;                    // 수정하러 들어올 때 새 입력 초안을 잠시 보관

  function num(s) {
    const v = parseFloat(String(s == null ? '' : s).trim().replace(/,/g, ''));
    return (isFinite(v) && v > 0) ? v : null;
  }

  /* 숫자 문자열 → 값 */
  const digitsOf = (s) => String(s == null ? '' : s).replace(/\D/g, '');
  // 무게는 친 그대로(소수점 포함) — 숫자와 점 하나만 남긴다
  function wclean(s) {
    let t = String(s == null ? '' : s).replace(/[^0-9.]/g, '');
    const i = t.indexOf('.');
    if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '');
    return t;
  }
  function weightVal(s) { const v = parseFloat(wclean(s)); return (isFinite(v) && v > 0) ? v : null; }
  function intVal(s) { const d = digitsOf(s); return d ? parseInt(d, 10) : null; }
  function fmtInt(s) { const d = digitsOf(s); return d ? String(parseInt(d, 10)) : '0'; }
  /* 초안의 세 칸을 계산·저장용 숫자로 */
  function draftVals() { return { w: weightVal(draft.w), s1: intVal(draft.s1), s2: intVal(draft.s2) }; }

  /* ---------------- 계산 ---------------- */
  function calc(d) {
    d = d || draft;
    const w = num(d.w);
    const ss = [num(d.s1), num(d.s2)].filter((v) => v != null);
    const r = { w: w };
    if (w != null) {
      r.gml = Math.round(w / VOL * 10000) / 10000;         // 소수 4자리 (예: 2.4279)
      r.kgm3 = Math.round(w / VOL * 1000 * 10) / 10;       // 소수 1자리 (예: 2427.9)
      r.denOk = r.kgm3 >= DEN_MIN;
    }
    if (ss.length) {
      r.slump = Math.round(ss.reduce((a, b) => a + b, 0) / ss.length);
      r.slOk = Math.abs(r.slump - SL_BASE) <= SL_TOL;
    }
    return r;
  }

  /* 카톡 보고 문구 — 예시 양식 그대로. 분자는 **실제 계산에 쓰인 값(r.w)** */
  function report(r) {
    const wTxt = (r.w != null) ? String(r.w) : '';
    const lines = [];
    lines.push('몰탈 무게 ' + wTxt + 'g, 시료실린더 부피 ' + VOL + 'ml');
    lines.push('밀도 : ' + wTxt + '/' + VOL + '=' + r.gml + 'g/ml=' + r.kgm3 + 'kg/㎥');
    lines.push('밀도기준 : ' + DEN_MIN + 'kg/㎥ 이상');
    if (r.slump != null) {
      lines.push('슬럼프 ' + r.slump + 'mm');
      lines.push('슬럼프기준 ' + SL_BASE + '±' + SL_TOL + 'mm');
    }
    return lines.join('\n');
  }

  function badge(ok) {
    return '<b class="bang-badge ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '합격' : '기준 미달') + '</b>';
  }

  /* ---------------- 화면 ---------------- */
  function fieldEls() { return { w: $('#bf-w'), s1: $('#bf-s1'), s2: $('#bf-s2'), fl: $('#bf-fl') }; }

  function renderFields() {
    const els = fieldEls();
    $('#bv-w').textContent = wclean(draft.w) || '0';   // 무게: 친 그대로(자율 — 사용자 지시)
    $('#bv-s1').textContent = fmtInt(draft.s1);        // 슬럼프: 정수
    $('#bv-s2').textContent = fmtInt(draft.s2);
    $('#bv-fl').textContent = digitsOf(draft.fl) ? (fmtInt(draft.fl) + '층') : '—';
    ['w', 's1', 's2', 'fl'].forEach((f) => els[f].classList.toggle('on', active === f));
    const mi = $('#bang-memo');
    if (mi && mi.value !== (draft.memo || '')) mi.value = draft.memo || '';
  }

  /* 결과 카드 HTML — 방통 화면과 작업 편집기(방통 모드)가 같이 쓴다 */
  function resultHTML(r) {
    if (r.gml == null && r.slump == null) {
      return '<p class="bang-empty">몰탈 무게와 슬럼프를 입력하세요</p>';
    }
    let h = '';
    if (r.gml != null) {
      h += '<div class="bang-row"><span>밀도</span><b>' + r.gml + ' g/ml = ' + r.kgm3 + ' kg/㎥</b>' +
           badge(r.denOk) + '</div>' +
           '<div class="bang-std">기준 ' + DEN_MIN + 'kg/㎥ 이상 · 실린더 ' + VOL + 'ml</div>';
    }
    if (r.slump != null) {
      h += '<div class="bang-row"><span>슬럼프 평균</span><b>' + r.slump + ' mm</b>' + badge(r.slOk) + '</div>' +
           '<div class="bang-std">기준 ' + SL_BASE + '±' + SL_TOL + 'mm</div>';
    }
    return h;
  }

  function renderResult() {
    const r = calc(draftVals());
    const el = $('#bang-result');
    if (!el) return;
    el.innerHTML = resultHTML(r);
    $('#bang-copy').disabled = (r.gml == null);
    $('#bang-save').disabled = (r.gml == null);
  }

  function renderSup() {
    const t = draft.supervisor ? draft.supervisor : '담당 감리 선택';
    $('#bang-sup-txt').textContent = t;
    $('#bang-sup').classList.toggle('set', !!draft.supervisor);
    $('#bang-dong-txt').textContent = draft.dong || '동 선택';
    $('#bang-dong').classList.toggle('set', !!draft.dong);
  }

  async function renderPhotos() {
    const grid = $('#bang-photos');
    grid.innerHTML = '';
    const ids = draft.photos.slice();
    if (!ids.length) return;
    let rows = [];
    try { rows = await Store.getPhotos(ids); } catch (e) {}
    const byId = {}; rows.forEach((p) => { byId[p.id] = p; });
    ids.forEach((pid, i) => {
      const cell = U.el('div', 'photo-cell');
      const p = byId[pid];
      if (p) {
        const img = new Image();
        img.src = U.thumbUrl(p.id, p.thumb || p.full);
        cell.appendChild(img);
      } else { cell.classList.add('loading'); cell.textContent = '…'; }
      const del = U.el('button', 'del');
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        U.dropUrl(draft.photos[i]);
        draft.photos.splice(i, 1);
        renderPhotos();
      });
      cell.appendChild(del);
      grid.appendChild(cell);
    });
  }

  function renderAll() { renderFields(); renderResult(); renderSup(); renderPhotos(); saveDraft(); }

  /* ---------------- 키패드 ----------------
     무게 칸은 소수점(.)까지 자율 입력(사용자 지시), 슬럼프·층은 정수만. */
  function press(k) {
    let s = (active === 'w') ? wclean(draft[active]) : digitsOf(draft[active]);
    if (k === 'del') s = s.slice(0, -1);
    else if (k === 'clr') s = '';
    else if (k === '.') {
      if (active !== 'w') return;                       // 정수 칸에선 무시
      if (s.indexOf('.') >= 0) return;
      s = (s === '' ? '0.' : s + '.');
    } else if (/^[0-9]$/.test(k)) {
      s = (s === '0') ? k : (s + k);
      const max = (active === 'w') ? 10 : (active === 'fl' ? 2 : 4);  // 무게는 넉넉히·슬럼프 9999·층 99
      if (s.length > max) return;
    }
    draft[active] = s;
    renderFields(); renderResult(); saveDraft();
    U.buzz(4);
  }

  /* ---------------- 초안 저장(재시작 대비) ----------------
     수정 중엔 저장하지 않는다 — 새 입력 초안(stash)이 덮이면 안 된다 */
  function saveDraft() {
    if (editing) return;
    try { localStorage.setItem(K_SAVE, JSON.stringify(draft)); } catch (e) {}
  }
  function loadDraft() {
    try {
      const j = JSON.parse(localStorage.getItem(K_SAVE) || 'null');
      if (j && typeof j === 'object') {
        draft = Object.assign(EMPTY(), {
          w: j.w || '', s1: j.s1 || '', s2: j.s2 || '', fl: j.fl || '',
          memo: j.memo || '',
          dong: j.dong || '', supervisor: j.supervisor || '', supPhone: j.supPhone || '',
          photos: Array.isArray(j.photos) ? j.photos.slice() : []
        });
      }
    } catch (e) {}
  }
  function resetDraft() {
    draft = EMPTY();
    active = 'w';
    saveDraft();
  }

  /* ---------------- 동 · 담당 감리 ----------------
     싱크 규칙(사용자 지시, 공시체 편집기와 동일): **빈 칸일 때만 자동으로 따라 채운다.**
     이미 채워져 있으면 반대편을 건드리지 않는다 — 커스텀 짝을 허용한다. */
  function pickDong() {
    const list = Contacts.dongs();
    const items = list.map((d) => {
      const sups = Contacts.byDong(d).map((c) => Contacts.label(c)).join(', ');
      return { label: d, sub: sups, cls: (draft.dong === d) ? 'strong' : '',
               onPick: () => {
        draft.dong = d;
        if (!draft.supervisor) {                       // 미지정 → 지정일 때만 싱크
          const cs = Contacts.byDong(d);
          if (cs.length === 1) { draft.supervisor = Contacts.label(cs[0]); draft.supPhone = cs[0].phone || ''; }
        }
        renderSup(); saveDraft();
      } };
    });
    items.unshift({ label: '직접 입력', sub: '명부에 없는 동·장소',
      onPick: () => {
        const v = prompt('동 이름 (예: 220동, A9, 옥탑)', draft.dong || '');
        if (v === null) return;
        draft.dong = v.trim();
        renderSup(); saveDraft();
      } });
    items.unshift({ label: '지정 안 함', onPick: () => { draft.dong = ''; renderSup(); saveDraft(); } });
    U.sheet('동수 고르기', items);
  }

  function pickSup() {
    const rows = Contacts.search('');
    const items = [{ label: '지정 안 함', onPick: () => { draft.supervisor = ''; draft.supPhone = ''; renderSup(); saveDraft(); } }];
    items.push({ label: '직접 입력', sub: '명부에 없는 감리',
      onPick: () => {
        const name = prompt('감리 이름·직급 (예: 홍길동 소장)', draft.supervisor || '');
        if (name === null || !name.trim()) return;
        const phone = prompt('전화번호 (선택 — 비워도 됩니다)', draft.supPhone || '');
        draft.supervisor = name.trim();
        draft.supPhone = (phone === null) ? '' : phone.trim();
        renderSup(); saveDraft();
      } });
    rows.forEach((c) => {
      items.push({
        label: Contacts.label(c),
        sub: Contacts.where(c) + ' · ' + c.phone,
        onPick: () => {
          draft.supervisor = Contacts.label(c); draft.supPhone = c.phone || '';
          if (!draft.dong) {                           // 미지정 → 지정일 때만 싱크
            const ds = Contacts.dongsOf(c);
            if (ds.length === 1) draft.dong = ds[0];
          }
          renderSup(); saveDraft();
        }
      });
    });
    U.sheet('담당 감리 (' + (U.jugu() === '1' ? '1주구' : '2·4주구') + ')', items);
  }

  /* ---------------- 사진 ----------------
     네이티브 촬영은 Native.shoot 이 원본을 갤러리(SD 설정 시 SD)에도 남긴다 — 공시체와 동일.
     아이폰 PWA 의 <input capture> 촬영본은 사진 앱에 안 남으므로 공유 토스트로 저장 기회를 준다. */
  async function addFiles(fileList, fromCamera) {
    const files = Array.prototype.slice.call(fileList || []).filter((f) => f && f.size);
    if (!files.length) return;
    const shareFiles = [];
    const wantShare = fromCamera && !Native.isNative() &&
                      typeof navigator.share === 'function' && !!navigator.canShare;
    U.toast('사진 처리 중…', 60000);
    let ok = 0, fail = 0;
    try {
      for (const f of files) {
        const id = U.uid();
        try {
          const img = await U.processImage(f, { maxSide: 1600, thumbSide: 320, quality: 0.82 });
          await Store.putPhoto(Object.assign({ id: id }, img));
          if (wantShare) {
            try { shareFiles.push(new File([img.full], 'bang_' + id + '.jpg', { type: 'image/jpeg' })); }
            catch (e) {}
          }
          draft.photos.push(id); ok++;
        } catch (e) { console.error('[bang photo]', e); fail++; }
      }
      saveDraft();
      await renderPhotos();
    } finally {
      const done = ok ? (ok + '장 추가했습니다' + (fail ? ' · ' + fail + '장 실패' : ''))
                      : '사진을 불러오지 못했습니다';
      if (ok && shareFiles.length && navigator.canShare({ files: shareFiles })) {
        U.toast(done + '\n촬영본은 앱 안에만 있습니다', 8000, {
          label: '사진 앱에 저장',
          onClick: () => { navigator.share({ files: shareFiles }).catch(() => {}); }
        });
      } else {
        U.toast(done);
      }
    }
  }

  /* ---------------- 저장 / 목록 ---------------- */
  async function saveBang() {
    const vals = draftVals();
    const r = calc(vals);
    if (r.gml == null) { U.toast('몰탈 무게를 먼저 입력하세요'); return; }
    const rec = {
      day: editing ? editing.day : U.dayKey(Date.now()),   // 수정은 원래 날짜를 지킨다
      dong: draft.dong, floor: digitsOf(draft.fl),
      memo: (draft.memo || '').trim(),
      supervisor: draft.supervisor, supPhone: draft.supPhone,
      jugu: U.jugu(),
      photos: draft.photos.slice(),
      w: vals.w, s1: vals.s1, s2: vals.s2
    };
    if (editing) {
      rec.id = editing.id;
      rec.order = editing.order;
      rec.createdAt = editing.createdAt;
    }
    try {
      await Store.putBang(rec);
    } catch (e) { console.error(e); U.toast('저장하지 못했습니다'); return; }
    U.toast((editing ? '방통시험을 수정했습니다' : '방통시험을 저장했습니다') +
            (draft.supervisor ? ' · ' + draft.supervisor : ''));
    if (editing) { endEdit(); }
    else { resetDraft(); }
    renderAll();
    renderSaved();
    refreshOutside();
  }

  /* 홈·작업 탭의 방통 구간도 같이 갱신한다 — 어디서 열었든 목록이 낡으면 안 된다 */
  function refreshOutside() {
    try { Home.refresh(); } catch (e) {}
    try { if (Nav.current() === 'tasks') Tasks.refresh(); } catch (e) {}
  }

  /* 수정 마침 — 보관해 둔 새 입력 초안으로 되돌린다 */
  function endEdit() {
    editing = null;
    draft = stash || EMPTY();
    stash = null;
    active = 'w';
    const go = $('#bang-save');
    if (go) go.textContent = '이 방통시험 저장';
  }

  /* 저장된 기록 수정 — 숫자를 키패드 문자열로 되돌려 싣는다 */
  function openEdit(b) {
    if (!editing) stash = draft;                       // 쓰던 새 입력은 잠시 보관
    editing = { id: b.id, day: b.day, order: b.order, createdAt: b.createdAt };
    draft = {
      w: (b.w != null) ? String(b.w) : '',               // 자율 입력 — 저장값 그대로 되싣는다
      s1: (b.s1 != null) ? String(b.s1) : '',
      s2: (b.s2 != null) ? String(b.s2) : '',
      fl: digitsOf(b.floor),
      memo: b.memo || '',
      dong: b.dong || '', supervisor: b.supervisor || '', supPhone: b.supPhone || '',
      photos: (b.photos || []).slice()
    };
    active = 'w';
    $('#view-bang').classList.remove('hidden');
    const go = $('#bang-save');
    if (go) go.textContent = '수정 저장';
    renderFields(); renderResult(); renderSup(); renderPhotos();
    renderSaved();
  }

  function bangStats(b) {
    const r = calc({ w: b.w, s1: b.s1, s2: b.s2 });
    return r;
  }

  /* 제목은 **동이 먼저**다(사용자 지시) — 목록 윗줄 = 동+층, 감리는 아랫줄 메타로 내려간다.
     (작업 목록이 동수를 제목으로 쓰는 것과 같은 규칙) */
  function bangPlace(b) {
    return [b.dong, b.floor ? (b.floor + '층') : ''].filter(Boolean).join(' ') || '동 미지정';
  }
  /* 카톡 머리글 — "201동 3층 · 감리" (동 먼저) */
  function bangTitle(b) {
    return [bangPlace(b) !== '동 미지정' ? bangPlace(b) : '', b.supervisor]
      .filter(Boolean).join(' · ') || '방통시험';
  }

  async function renderSaved() {
    const box = $('#bang-saved');
    if (!box) return;
    box.innerHTML = '';
    let rows = [];
    try { rows = await Store.allBangs(); } catch (e) {}
    // 현재 주구만 (주구 표식 없는 옛 기록은 어디서나 보인다)
    rows = rows.filter((b) => !b.jugu || b.jugu === U.jugu());
    if (!rows.length) return;
    rows.sort((a, b) => (b.day < a.day ? -1 : b.day > a.day ? 1 : (b.createdAt || 0) - (a.createdAt || 0)));

    box.appendChild(U.el('div', 'bang-saved-cap', '저장된 방통시험'));

    let curDay = '';
    rows.forEach((b) => {
      if (b.day !== curDay) {
        curDay = b.day;
        box.appendChild(U.el('div', 'bang-day-head', U.dayLabel(new Date(b.day + 'T00:00:00').getTime())));
      }
      const r = bangStats(b);
      const card = U.el('div', 'bang-saved-item' + (editing && editing.id === b.id ? ' editing' : ''));
      const main = U.el('div', 'bang-si-main');
      main.appendChild(U.el('span', 'bang-si-sup', bangPlace(b)));   // 윗줄 = 동(사용자 지시)
      const sub = [b.supervisor,
                   (r.kgm3 != null ? (r.kgm3 + 'kg/㎥') : ''),
                   (r.slump != null ? '슬럼프 ' + r.slump + 'mm' : ''),
                   ((b.photos || []).length ? '사진 ' + b.photos.length + '장' : ''),
                   (b.memo || '')]
        .filter(Boolean).join(' · ');
      main.appendChild(U.el('span', 'bang-si-sub', sub));
      // 본문을 탭하면 수정 모드로 싣는다(사용자 지시)
      main.addEventListener('click', () => openEdit(b));
      card.appendChild(main);

      const send = U.el('button', 'bang-si-btn');
      send.textContent = '보내기';
      send.addEventListener('click', () => exportBang(b));
      card.appendChild(send);

      const del = U.el('button', 'bang-si-del');
      del.textContent = '×';
      del.setAttribute('aria-label', '삭제');
      del.addEventListener('click', () => {
        U.confirmSheet('이 방통시험 기록을 지울까요?\n사진도 함께 지워집니다', '삭제', async () => {
          try { await Store.deleteBang(b.id); } catch (e) {}
          if (editing && editing.id === b.id) { endEdit(); renderFields(); renderResult(); renderSup(); renderPhotos(); }
          renderSaved();
          refreshOutside();
          U.toast('삭제했습니다');
        }, true);
      });
      card.appendChild(del);
      box.appendChild(card);
    });
  }

  /* 저장된 한 건을 카톡으로 — 문구 + 사진 묶어서 */
  async function exportBang(b) {
    const r = bangStats(b);
    const head = bangTitle(b);
    const text = (head !== '감리 미지정' ? (head + '\n') : '') + report(r) +
                 (b.memo ? ('\n' + b.memo) : '');
    let blobs = [];
    if ((b.photos || []).length) {
      U.toast('사진 준비 중…', 60000);
      try {
        const rows = await Store.getPhotos(b.photos);
        const byId = {}; rows.forEach((p) => { byId[p.id] = p; });
        for (const id of b.photos) {
          const blob = byId[id] ? await Store.fullBlob(byId[id]) : null;
          if (blob) blobs.push(blob);
        }
      } catch (e) { console.error(e); }
    }
    let copied = false;
    try { copied = await U.copyText(text); } catch (e) {}
    const base = U.safeName((b.dong || b.supervisor || '방통'), '방통') + '_' + (b.day || '').replace(/-/g, '');
    let how = 'download';
    try {
      how = await Share.exportItems({ blobs: blobs, text: text, title: '방통시험', baseName: base });
    } catch (e) { U.toast('내보내기에 실패했습니다'); return; }
    if (how === 'cancel') U.toast('내보내기를 취소했습니다');
    else if (how === 'fail') U.toast(copied ? '공유 실패 — 문구는 복사했습니다' : '공유에 실패했습니다');
    else if (how === 'download') U.toast('공유 기능이 없어 파일로 저장했습니다');
    else if (how === 'download-multi') U.toast('파일로 저장합니다 — 브라우저가 여러 장을 막으면 허용을 눌러 주세요', 4000);
    else if (blobs.length) U.toast('사진을 보낸 뒤 문구를 붙여넣으세요', 3500);
    else U.toast('공유할 앱에서 카카오톡을 선택하세요');
  }

  /* 저장 없이 문구만 복사 */
  function copyReport() {
    const r = calc(draftVals());
    if (r.gml == null) { U.toast('몰탈 무게를 먼저 입력하세요'); return; }
    U.copyText(report(r)).then((ok) => {
      U.toast(ok ? '보고 문구를 복사했습니다 — 카톡에 붙여넣으세요' : '복사에 실패했습니다', 3000);
    });
  }

  /* ---------------- 열기/닫기 ---------------- */
  function open() {
    if (editing) { endEdit(); }          // 새로 열면 수정 모드는 버린다(저장 안 한 수정은 폐기)
    $('#view-bang').classList.remove('hidden');
    active = 'w';
    renderAll();
    renderSaved();
  }
  function close() {
    if (editing) { endEdit(); }          // 저장 안 한 수정은 폐기 — 원본은 그대로다
    $('#view-bang').classList.add('hidden');
    refreshOutside();
  }
  function isOpen() { return !$('#view-bang').classList.contains('hidden'); }

  function init() {
    loadDraft();
    const hb = $('#home-bang');
    if (hb) hb.addEventListener('click', open);
    $('#bang-back').addEventListener('click', close);

    // 칸 고르기 (층 포함 — 키패드로 채우는 네 칸)
    ['w', 's1', 's2', 'fl'].forEach((f) => {
      $('#bf-' + f).addEventListener('click', () => { active = f; renderFields(); U.buzz(4); });
    });
    // 키패드
    $('#bang-keypad').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bk]');
      if (!btn) return;
      press(btn.getAttribute('data-bk'));
    });
    // 지우기(전체)
    $('#bang-clear').addEventListener('click', () => {
      // 사진은 유지, 값만 지운다 — 실수로 전부 날리지 않게
      draft.w = ''; draft.s1 = ''; draft.s2 = '';
      active = 'w';
      renderFields(); renderResult(); saveDraft();
    });

    $('#bang-dong').addEventListener('click', pickDong);
    $('#bang-sup').addEventListener('click', pickSup);
    const mi = $('#bang-memo');
    if (mi) mi.addEventListener('input', () => { draft.memo = mi.value; saveDraft(); });
    $('#bang-save').addEventListener('click', saveBang);
    $('#bang-copy').addEventListener('click', copyReport);

    // 사진 — 네이티브 카메라 우선, 없으면 파일 입력 폴백
    const shootInput = $('#bang-file-shoot'), pickInput = $('#bang-file-pick');
    shootInput.addEventListener('change', (e) => { addFiles(e.target.files, true); e.target.value = ''; });
    pickInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    $('#bang-shoot').addEventListener('click', async () => {
      const files = await Native.shoot();
      if (files === null) { shootInput.click(); return; }
      if (files.length) addFiles(files, true);
    });
    $('#bang-pick').addEventListener('click', async () => {
      const files = await Native.pick();
      if (files === null) { pickInput.click(); return; }
      if (files.length) addFiles(files);
    });
  }

  global.Bangtong = { init: init, open: open, close: close, isOpen: isOpen,
                      openEdit: openEdit, exportRec: exportBang,
                      titleOf: bangTitle, placeOf: bangPlace, supOf: (b) => b.supervisor || '',
                      statsOf: bangStats, resultHTML: resultHTML,
                      _calc: calc, _report: report };
})(window);

;
/* ===== js/home.js ===== */
/* ============ home.js — 메인(홈) 화면 ============
   하루의 출발점.
     인사 · 날씨 · 안내멘트 / 기준날짜 · 시계 · 근무시간 /
     깨야 할 공시체 / 할 일 / 빠른 실행

   기준날짜(base)는 좌우 화살표로 바꾼다. 기본값은 오늘.
   깨야 할 공시체와 할 일이 이 날짜를 함께 따른다.
   인터넷이 없어도 날씨 칸만 "n시간 전 기준"이 되고 나머지는 그대로 돈다.
============================================================ */
(function (global) {
  'use strict';

  /* 근무 시간 (분 단위) — 오전은 11:30 까지(사용자 지시) */
  const SHIFTS = [
    { name: '오전근무', from: 7 * 60, to: 11 * 60 + 30 },
    { name: '오후근무', from: 13 * 60, to: 17 * 60 }
  ];

  let clockTimer = null;
  let base = Spec.atMidnight(new Date());   // 기준 날짜
  let emptyNode = null;

  const isToday = () => Spec.sameDay(base, new Date());

  /* ---------------- 인사 ---------------- */
  function greeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return '매니저님, 좋은 아침입니다';
    if (h >= 11 && h < 17) return '매니저님, 안녕하세요';
    if (h >= 17 && h < 22) return '매니저님, 오늘도 수고하셨습니다';
    return '매니저님, 안녕하세요';
  }

  /* ---------------- 기준 날짜 ---------------- */
  function renderDayNav() {
    const d = base;
    const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    const label = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + w + ')';
    const el = U.$('#day-label');
    el.innerHTML = '';
    el.appendChild(U.el('span', 'day-text', label));
    if (isToday()) el.appendChild(U.el('span', 'day-badge', '오늘'));
    else if (Spec.isSunday(d)) el.appendChild(U.el('span', 'day-badge off', '휴무'));
    el.classList.toggle('is-today', isToday());

    // 오늘이 아니면 시계·근무시간은 의미가 없다
    U.$('#clock-wrap').classList.toggle('hidden', !isToday());
  }

  function goDay(delta) {
    base = delta === 0 ? Spec.atMidnight(new Date()) : Spec.addDays(base, delta);
    renderDayNav();
    renderTasks();
    U.buzz(6);
  }

  /* ---------------- 시계 · 근무 ---------------- */
  function fmtLeft(min) {
    if (min <= 0) return '';
    const h = Math.floor(min / 60), m = min % 60;
    if (h && m) return h + '시간 ' + m + '분';
    if (h) return h + '시간';
    return m + '분';
  }

  function shiftState(now) {
    const cur = now.getHours() * 60 + now.getMinutes();
    if (Spec.isSunday(now)) return { on: false, name: '일요일 휴무', progress: 0 };
    for (let i = 0; i < SHIFTS.length; i++) {
      const s = SHIFTS[i];
      if (cur >= s.from && cur < s.to) {
        return { on: true, name: s.name, left: s.to - cur,
                 progress: (cur - s.from) / (s.to - s.from), endLabel: pad(s.to) };
      }
    }
    for (let i = 0; i < SHIFTS.length; i++) {
      if (cur < SHIFTS[i].from) {
        return { on: false, name: (i === 1 ? '휴게 시간' : '근무 전'),
                 next: SHIFTS[i].name, wait: SHIFTS[i].from - cur,
                 startLabel: pad(SHIFTS[i].from), progress: 0 };
      }
    }
    return { on: false, name: '오늘 근무 종료', progress: 1 };
  }

  function pad(min) { return U.pad2(Math.floor(min / 60)) + ':' + U.pad2(min % 60); }

  function renderClock() {
    const now = new Date();
    U.$('#clock').textContent = U.pad2(now.getHours()) + ':' + U.pad2(now.getMinutes());

    const st = shiftState(now);
    const nameEl = U.$('#shift-name');
    const leftEl = U.$('#shift-left');
    const bar = U.$('#shift-bar');

    nameEl.textContent = st.on ? (st.name + ' 중') : st.name;
    nameEl.classList.toggle('on', !!st.on);

    if (st.on) leftEl.textContent = st.endLabel + '까지 ' + fmtLeft(st.left) + ' 남음';
    else if (st.next) leftEl.textContent = st.startLabel + ' ' + st.next + '까지 ' + fmtLeft(st.wait);
    else leftEl.textContent = '';

    bar.style.width = Math.round(Math.max(0, Math.min(1, st.progress)) * 100) + '%';
    bar.classList.toggle('on', !!st.on);

    // 근무 중이면 남은 시간이 이미 있으니 시간표는 접는다
    const hint = U.$('.shift-hint');
    if (hint) hint.classList.toggle('hidden', !!st.on);

  }

  /* ---------------- 저장공간 ---------------- */
  async function renderStorage() {
    const el = U.$('#home-storage');
    if (!el) return;
    let vols = [];
    try { vols = await Native.storage(); } catch (e) {}
    if (!vols.length) { el.textContent = ''; return; }
    el.innerHTML = vols.map((v) => {
      const low = v.total > 0 && (v.free / v.total) < 0.1;
      return (v.label || '저장소') + ' <b class="' + (low ? 'low' : '') + '">' +
             U.fmtBytes(v.free) + '</b>';
    }).join(' · ') + ' 남음';
    renderSdRow(vols);
  }

  /* ---------------- 설정 ----------------
     스위치는 켜고 끈 결과가 그 자리에 그대로 보인다 — 토스트를 띄우지 않는다. */
  function renderSdRow(vols) {
    const row = U.$('#opt-sd-row');
    if (!row) return;
    // 촬영 플러그인이 있고(웹엔 없다) 카드가 실제로 꽂혀 있을 때만 보여 준다.
    // 남은 용량은 위 저장공간 줄에 이미 있으니 여기서 또 적지 않는다.
    const sd = (vols || []).some((v) => v.removable);
    const can = !!(Native.hasShot && Native.hasShot()) && sd;
    row.classList.toggle('hidden', !can);
    if (!can) return;
    const box = U.$('#opt-sd');
    if (box) box.checked = (Native.galleryPref() === 'sd');
  }

  /* 스위치 상태를 현재 설정에 맞춘다. 화면을 다시 그릴 때마다 부른다 —
     한 번만 맞춰 두면 다른 경로로 테마가 바뀌었을 때 스위치가 거짓말을 한다. */
  function syncSettings() {
    const dark = U.$('#opt-dark');
    if (dark) dark.checked = (U.theme() === 'dark');
    const seg = U.$('#opt-jugu');
    if (seg) {
      const j = U.jugu();
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b.dataset.j === j);
      });
    }
  }

  /* ---------------- 수동 백업 파일 (아이폰 증발 대응) ----------------
     아이폰(PWA)은 웹뷰 밖 자동 사본(SharedPreferences·파일백업)이 없다 — 오리진 저장소가
     통째로 날아가면(아이콘 재설치·저장공간 축출) 미러까지 같이 죽는다. 그래서 **오리진 밖**
     (파일 앱·iCloud·카톡)으로 내보내는 수동 백업이 아이폰의 유일한 진짜 안전판이다. */
  async function openBackupSheet() {
    // 진단 — 다음 사고 때 원인을 좁힐 수 있게 상태를 보여준다
    let diag = '';
    try {
      const per = (navigator.storage && navigator.storage.persisted)
        ? await navigator.storage.persisted() : null;
      const est = await Store.estimate();
      const bits = [];
      if (per != null) bits.push('영구저장 ' + (per ? '승인' : '미승인'));
      if (est && est.usage != null) bits.push(U.fmtBytes(est.usage) + ' 사용');
      diag = bits.join(' · ');
    } catch (e) {}

    const stamp = U.dayKey(Date.now()).replace(/-/g, '');
    const items = [];
    items.push({
      label: '백업 내보내기 (.json)', cls: 'strong',
      sub: '작업·방통 전체(사진 제외) — 파일 앱·카톡으로 보관',
      onPick: async () => {
        try {
          const info = await Store.fullSnapshot();
          if (!info.tasks.length && !info.bangs.length) { U.toast('백업할 데이터가 없습니다'); return; }
          const blob = new Blob([JSON.stringify(info)], { type: 'application/json' });
          const name = '공시체백업_' + stamp + '.json';
          const how = await Share.exportFile(blob, name, '공시체 백업');
          U.toast(how === 'cancel' ? '취소했습니다'
                : how === 'fail' ? '내보내기에 실패했습니다'
                : '백업 파일을 내보냈습니다 — 파일 앱·카톡 나에게 보내기로 보관하세요', 4000);
        } catch (e) { console.error(e); U.toast('백업을 만들지 못했습니다'); }
      }
    });
    items.push({
      label: '전체 백업 내보내기 (.zip — 사진 포함)',
      sub: '사진 원본까지 담습니다 — 장수가 많으면 오래 걸립니다',
      onPick: async () => {
        U.toast('전체 백업 만드는 중…', 120000);
        try {
          const info = await Store.fullSnapshot();
          if (!info.tasks.length && !info.bangs.length) { U.toast('백업할 데이터가 없습니다'); return; }
          // 참조되는 사진 id 전부(작업 두 칸 + 방통)
          const ids = [];
          const mark = Object.create(null);
          const add = (p) => { if (p && !mark[p]) { mark[p] = 1; ids.push(p); } };
          info.tasks.forEach((t) => {
            (t.photos || []).forEach(add);
            if (t.sub) Spec.SUBS.forEach((s) => (((t.sub[s.key] || {}).photos) || []).forEach(add));
          });
          (info.bangs || []).forEach((b) => (b.photos || []).forEach(add));
          const entries = [{ name: 'backup.json', data: new TextEncoder().encode(JSON.stringify(info)) }];
          let got = 0;
          for (const id of ids) {
            try {
              const p = await Store.getPhoto(id);
              const b = p ? await Store.fullBlob(p) : null;
              if (b) { entries.push({ name: 'photos/' + id + '.jpg', data: new Uint8Array(await b.arrayBuffer()) }); got++; }
            } catch (e) {}
          }
          const zip = Share.makeZip(entries);
          const zname = '공시체백업_' + stamp + '.zip';
          const how = await Share.exportFile(zip, zname, '공시체 전체 백업');
          U.toast(how === 'cancel' ? '취소했습니다'
                : how === 'fail' ? '내보내기에 실패했습니다'
                : '전체 백업(사진 ' + got + '장)을 내보냈습니다 — 보관할 곳을 고르세요', 4000);
        } catch (e) { console.error(e); U.toast('백업을 만들지 못했습니다'); }
      }
    });
    items.push({ sep: true });
    items.push({
      label: '백업 파일 불러오기',
      sub: '.json 또는 .zip — 같은 작업은 파일 내용으로 덮어씁니다',
      onPick: () => { const f = U.$('#bak-file'); if (f) { f.value = ''; f.click(); } }
    });
    U.sheet('백업 파일' + (diag ? '\n' + diag : ''), items);
  }

  /* 백업 파일 불러오기 — .json(메타) / .zip(사진 포함, makeZip 산출물) */
  async function importBackupFile(file) {
    if (!file) return;
    U.toast('백업 읽는 중…', 120000);
    let info = null, photoEntries = [];
    try {
      if (/\.zip$/i.test(file.name)) {
        const entries = Share.parseZip(await file.arrayBuffer());
        const bj = entries.find((e) => e.name === 'backup.json');
        if (!bj) { U.toast('backup.json 이 없는 압축입니다'); return; }
        info = JSON.parse(new TextDecoder().decode(bj.data));
        photoEntries = entries.filter((e) => /^photos\/.+\.jpg$/i.test(e.name));
      } else {
        info = JSON.parse(await file.text());
      }
    } catch (e) { console.error(e); U.toast('백업 파일을 읽지 못했습니다'); return; }
    if (!info || (!Array.isArray(info.tasks) && !Array.isArray(info.bangs))) {
      U.toast('공시체 백업 형식이 아닙니다'); return;
    }
    const n = (info.tasks || []).length, nb = (info.bangs || []).length;
    U.confirmSheet(
      '백업을 불러올까요?\n작업 ' + n + '건 · 방통 ' + nb + '건' +
      (photoEntries.length ? ' · 사진 ' + photoEntries.length + '장' : '') +
      '\n같은 작업은 파일 내용으로 덮어씁니다', '불러오기',
      async () => {
        U.toast('복원 중…', 120000);
        try {
          // 사진 먼저 되살린다(있는 id 는 건너뜀) — 그래야 restoreBackup 세척에서 살아남는다
          for (const pe of photoEntries) {
            const id = pe.name.slice('photos/'.length).replace(/\.jpg$/i, '');
            try {
              const exist = await Store.getPhoto(id);
              if (exist) continue;
              const img = await U.processImage(new Blob([pe.data], { type: 'image/jpeg' }),
                                               { maxSide: 1600, thumbSide: 320, quality: 0.82 });
              await Store.putPhoto(Object.assign({ id: id }, img));
            } catch (e) { console.warn('[bak photo]', e); }
          }
          const k = await Store.restoreBackup(info);
          U.toast('작업 ' + k + '건을 복원했습니다');
          refresh();
        } catch (e) { console.error(e); U.toast('복원하지 못했습니다'); }
      });
  }

  function bindSettings() {
    const bakRow = U.$('#opt-bak-row');
    if (bakRow) bakRow.addEventListener('click', openBackupSheet);
    const bakFile = U.$('#bak-file');
    if (bakFile) bakFile.addEventListener('change', (e) => {
      importBackupFile(e.target.files && e.target.files[0]);
    });
    const dark = U.$('#opt-dark');
    if (dark) dark.addEventListener('change', () => U.setTheme(dark.checked ? 'dark' : 'light'));
    const sd = U.$('#opt-sd');
    if (sd) {
      sd.addEventListener('change', () => {
        Native.setGalleryPref(sd.checked ? 'sd' : 'phone');
      });
    }
    const seg = U.$('#opt-jugu');
    if (seg) {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || U.jugu() === b.dataset.j) return;
        U.setJugu(b.dataset.j);
        syncSettings();
        renderTasks();       // 목록의 동/감리 추정 표기가 명부를 따라간다
      });
    }
    syncSettings();
  }

  /* ---------------- 날씨 ---------------- */
  async function renderWeather(force) {
    const card = U.$('#wx-card');
    const adv = U.$('#wx-advice');
    U.$('#hello').textContent = greeting();
    if (force) U.$('#wx-text').textContent = '날씨 불러오는 중…';

    let r = null;
    try { r = await Weather.get(!!force); } catch (e) { console.warn(e); }

    if (!r) {
      card.classList.add('wx-empty');
      U.$('#wx-temp').textContent = '–';
      U.$('#wx-text').textContent = '날씨를 가져오지 못했습니다';
      U.$('#wx-feels').textContent = '';
      U.$('#wx-sub').textContent = '탭하면 다시 시도합니다';
      U.$('#wx-place').textContent = '';
      adv.innerHTML = '';
      return;
    }

    card.classList.remove('wx-empty');
    const w = r.data;
    const info = Weather.codeInfo(w.code);
    U.$('#wx-icon').firstElementChild.setAttribute('href', '#ic-' + info.icon);
    U.$('#wx-temp').textContent = (typeof w.temp === 'number') ? w.temp.toFixed(1) : '–';
    U.$('#wx-text').textContent = info.text;
    U.$('#wx-feels').textContent =
      (typeof w.feels === 'number') ? ('체감 ' + w.feels.toFixed(1) + '℃') : '';

    const parts = [];
    if (typeof w.tmin === 'number' && typeof w.tmax === 'number') {
      parts.push(w.tmin.toFixed(1) + ' / ' + w.tmax.toFixed(1) + '℃');
    }
    if (typeof w.pop === 'number') parts.push('강수확률 ' + w.pop + '%');
    if (typeof w.wind === 'number') parts.push('바람 ' + w.wind.toFixed(1) + 'm/s');
    U.$('#wx-sub').textContent = parts.join(' · ');

    U.$('#wx-place').textContent =
      (r.name || '') + ' · ' + Weather.ago(r.at) + (r.stale ? ' 기준(오프라인)' : '');

    // 안내 멘트 — 카드 안에 한 줄씩
    adv.innerHTML = '';
    Weather.advice(w).forEach((a) => {
      const row = U.el('div', 'advice-row ' + a.level);
      row.appendChild(U.icon(a.level === 'info' ? 'check' : 'alert'));
      row.appendChild(U.el('span', '', a.text));
      adv.appendChild(row);
    });
  }

  /* ---------------- 작업 ---------------- */
  let taskSeq = 0;      // 낡은 조회가 최신 목록을 덮지 않게 (작업 탭 load 와 같은 가드)

  async function renderTasks() {
    const my = ++taskSeq;
    const list = U.$('#task-list');
    const day = U.dayKey(base.getTime());
    if (!emptyNode) emptyNode = U.el('p', 'todo-empty', '등록된 작업이 없습니다');

    U.$('#task-title').textContent = (isToday() ? '오늘' : Spec.shortDate(base)) + ' 작업';

    let tasks = [], bangs = [], failed = null;
    try { tasks = await Task.list(day); } catch (e) { console.error(e); failed = e || true; }
    // 그날 방통시험도 따로 보여준다(사용자 지시) — 실패해도 작업 목록은 그대로 산다
    try {
      bangs = (await Store.bangsOf(day)).filter((b) => !b.jugu || b.jugu === U.jugu());
    } catch (e) { console.warn('[home bangs]', e); }
    if (my !== taskSeq) return;      // 그 사이 날짜가 또 바뀌었다 — 지나간 조회는 버린다

    list.innerHTML = '';
    // 읽기 실패를 "작업 없음"으로 보여주면 데이터가 다 날아간 걸로 오인한다(실제 사고).
    // 실패는 실패라고 말하고, 탭 한 번으로 다시 읽게 한다.
    // 구버전 설치(VersionError) 같은 건 원인 문구(userMsg)를 그대로 보여준다.
    if (failed) {
      U.$('#task-count').textContent = '–';
      const err = U.el('p', 'todo-empty',
        (failed.userMsg || '목록을 불러오지 못했습니다') + ' — 탭해서 다시 시도');
      err.addEventListener('click', () => renderTasks());
      list.appendChild(err);
      return;
    }
    const c = Task.counts(tasks);
    U.$('#task-count').textContent = c.done + '/' + c.all;
    if (!tasks.length && !bangs.length) { list.appendChild(emptyNode); return; }
    if (!tasks.length) { appendBangRows(list, bangs); return; }   // 작업이 없어도 방통은 보인다

    /* 만들 땐 하나씩이지만 수행은 감리별로 몰아서 한다 → 감리별로 묶고,
       끝난 작업은 맨 아래로 내린다. */
    const supKey = (t) => (t.supervisor || '￿감리 미지정');
    const sorted = tasks.slice().sort((a, b) => {
      const da = Task.isDone(a) ? 1 : 0, db = Task.isDone(b) ? 1 : 0;
      if (da !== db) return da - db;
      const sa = supKey(a), sb = supKey(b);
      if (sa !== sb) return sa.localeCompare(sb, 'ko');
      return (a.order - b.order) || (a.createdAt - b.createdAt);
    });

    let lastHead = null;
    sorted.forEach((t) => {
      const done = Task.isDone(t);
      // 미완료 구간에서만 감리 헤더를 세운다. 완료는 '완료' 한 덩어리.
      const head = done ? ' done' : supKey(t);
      if (head !== lastHead) {
        lastHead = head;
        const h = U.el('div', 'grp-head' + (done ? ' done' : ''));
        h.appendChild(U.el('span', '', done ? '완료' : (t.supervisor || '감리 미지정')));
        list.appendChild(h);
      }

      const row = U.el('button', 'task-row' + (done ? ' done' : ''));

      const sp = Spec.byKey(t.specKey);
      row.appendChild(U.el('span', 'due-spec' + (sp ? ' sp-' + sp.key : ''), Task.label(t)));

      const body = U.el('div', 'task-body');
      // 동수와 담당 감리는 한 줄에 같이 간다(사용자 지시) — 짝으로 봐야 뜻이 있다
      const title = U.el('div', 'task-part', Task.dongOf(t) || '동 미지정');
      if (t.supervisor) title.appendChild(U.el('span', 'row-sup', t.supervisor));
      if (t.photoMark) title.appendChild(U.el('span', 'photo-mark', '사진'));   // 표시 전용 배지
      // 28일은 수중·봉함 중 남은 칸을 이름으로 알린다
      const note = Task.doneNote(t);
      if (note) title.appendChild(U.el('span', 'sub-left', note));
      body.appendChild(title);
      // 사진 장수·계산값은 여기 안 적는다(사용자 지시) — 목록은 "뭘 깨야 하나"만 본다.
      // 끝났는지는 오른쪽 체크 표시로 이미 안다.
      const meta = [];
      if (t.part) meta.push(t.part);
      if (t.castDay) meta.push('타설 ' + Spec.shortDate(new Date(t.castDay + 'T00:00:00')));
      body.appendChild(U.el('div', 'task-meta', meta.join(' · ')));
      row.appendChild(body);

      const flag = U.el('span', 'task-flag' + (done ? ' on' : ''));
      if (done) flag.appendChild(U.icon('check'));
      row.appendChild(flag);

      row.addEventListener('click', () => TaskUI.open(t, day));
      list.appendChild(row);
    });

    appendBangRows(list, bangs);
  }

  /* 그날의 방통시험 — 작업 아래 별도 구간(사용자 지시). 탭하면 방통 화면에서 수정 */
  function appendBangRows(list, bangs) {
    if (!bangs || !bangs.length || !global.Bangtong) return;
    const h = U.el('div', 'grp-head');
    h.appendChild(U.el('span', '', '방통시험'));
    list.appendChild(h);
    bangs.forEach((b) => {
      const row = U.el('button', 'task-row');
      row.appendChild(U.el('span', 'due-spec', '방통'));
      const body = U.el('div', 'task-body');
      const title = U.el('div', 'task-part', Bangtong.placeOf(b));
      if (b.supervisor) title.appendChild(U.el('span', 'row-sup', b.supervisor));
      body.appendChild(title);
      const r = Bangtong.statsOf(b);
      const meta = [];
      if (r.kgm3 != null) meta.push(r.kgm3 + 'kg/㎥');
      if (r.slump != null) meta.push('슬럼프 ' + r.slump + 'mm');
      if ((b.photos || []).length) meta.push('사진 ' + b.photos.length + '장');
      if (b.memo) meta.push(b.memo);
      body.appendChild(U.el('div', 'task-meta', meta.join(' · ')));
      row.appendChild(body);
      row.addEventListener('click', () => Bangtong.openEdit(b));
      list.appendChild(row);
    });
  }

  /* ---------------- 바인딩 ---------------- */
  function bind() {
    U.$('#wx-card').addEventListener('click', () => renderWeather(true));

    // 숨김 장난감(몰래 파우더) — 인사말을 빠르게 5번 탭(사용자 요청)
    let eggN = 0, eggT = 0;
    U.$('#hello').addEventListener('click', () => {
      const now = Date.now();
      if (now - eggT > 1600) eggN = 0;
      eggT = now;
      if (++eggN >= 5) { eggN = 0; if (global.Powder) Powder.open(); }
    });
    bindSettings();
    U.$('#day-prev').addEventListener('click', () => goDay(-1));
    U.$('#day-next').addEventListener('click', () => goDay(1));
    U.$('#day-label').addEventListener('click', () => goDay(0));   // 탭하면 오늘로

    U.$('#task-add').addEventListener('click', () => {
      TaskUI.open(null, U.dayKey(base.getTime()));
    });

  }

  function refresh() {
    // 날짜가 바뀐 채로 앱을 다시 열면 오늘로 되돌린다
    if (!isToday() && Spec.sameDay(base, new Date()) === false) { /* 사용자가 넘긴 상태는 유지 */ }
    renderDayNav();
    renderClock();
    renderStorage();
    syncSettings();
    renderTasks();
    renderWeather(false);
  }

  function init() {
    bind();
    renderDayNav();
    renderClock();
    clearInterval(clockTimer);
    clockTimer = setInterval(renderClock, 1000);
  }

  global.Home = {
    init: init, refresh: refresh,
    _shiftState: shiftState, _base: () => base, _goDay: goDay, _greeting: greeting
  };
})(window);

;
/* ===== js/main.js ===== */
/* ============ main.js — 화면 전환 · 부팅 ============ */
(function (global) {
  'use strict';

  let current = 'home';
  let lightboxCloser = null;
  let zoomable = false;

  const TABS = ['home', 'calc', 'tasks'];

  const Nav = {
    go: function (tab) {
      if (TABS.indexOf(tab) < 0) return;
      current = tab;
      TABS.forEach((t) => U.$('#view-' + t).classList.toggle('hidden', t !== tab));
      U.$$('#tabbar .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
      if (tab === 'home') Home.refresh();
      if (tab === 'tasks') Tasks.refresh();
      // 숨어 있는 동안엔 높이가 0이라 맞출 수 없다. 보이는 순간 다시 잰다.
      if (tab === 'calc') Calc.fit();
    },
    showSup: function (on) {
      U.$('#view-sup').classList.toggle('hidden', !on);
      if (!on) { try { document.activeElement && document.activeElement.blur(); } catch (e) {} }
    },
    isSupOpen: function () { return !U.$('#view-sup').classList.contains('hidden'); },
    showTask: function (on) {
      U.$('#view-task').classList.toggle('hidden', !on);
      if (!on) { try { document.activeElement && document.activeElement.blur(); } catch (e) {} }
    },
    isTaskOpen: function () { return !U.$('#view-task').classList.contains('hidden'); },
    showAI: function (on) {
      U.$('#view-ai').classList.toggle('hidden', !on);
      if (!on) { try { document.activeElement && document.activeElement.blur(); } catch (e) {} }
    },
    isAIOpen: function () { return !U.$('#view-ai').classList.contains('hidden'); },
    showAudit: function (on) {
      U.$('#view-audit').classList.toggle('hidden', !on);
      if (!on) { try { document.activeElement && document.activeElement.blur(); } catch (e) {} }
    },
    isAuditOpen: function () { return !U.$('#view-audit').classList.contains('hidden'); },
    setLightboxCloser: function (fn) { lightboxCloser = fn; },
    /* 앱 전체는 확대를 막아야 키패드 오조작이 없지만, 사진을 볼 때는 확대가 필요하다
       (균열·표면 확인이 이 앱의 목적). 라이트박스에서만 잠깐 풀어준다. */
    setZoomable: function (on) {
      const m = document.querySelector('meta[name="viewport"]');
      if (!m) return;
      m.setAttribute('content', on
        ? 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5, user-scalable=yes'
        : 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no');
      zoomable = on;
    },
    current: function () { return current; }
  };
  global.Nav = Nav;

  /* 뒤로가기 한 단계 처리. 더 이상 물러설 곳이 없으면 false */
  function goBack() {
    if (global.Powder && Powder.isOpen()) { Powder.close(); return true; }
    if (global.Bangtong && Bangtong.isOpen()) { Bangtong.close(); return true; }
    if (!U.$('#sheet-back').classList.contains('hidden')) {
      if (U.sheet.close) U.sheet.close();
      return true;
    }
    if (!U.$('#lightbox').classList.contains('hidden')) {
      if (lightboxCloser) lightboxCloser(); else U.$('#lightbox').classList.add('hidden');
      return true;
    }
    if (Nav.isAuditOpen()) { AuditUI.close(); return true; }
    if (Nav.isAIOpen()) { AIUI.close(); return true; }
    if (Nav.isSupOpen()) { Nav.showSup(false); return true; }
    if (Nav.isTaskOpen()) { TaskUI.tryClose(); return true; }
    if (current !== 'home') { Nav.go('home'); return true; }   // 최종 목적지는 홈
    return false;
  }

  function bindShell() {
    U.$('#tabbar').addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (b) Nav.go(b.dataset.tab);
    });

    U.$('#lightbox-close').addEventListener('click', (e) => {
      e.stopPropagation();
      if (lightboxCloser) lightboxCloser(); else U.$('#lightbox').classList.add('hidden');
    });

    // 입력창 밖에서 ESC = 뒤로
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (goBack()) e.preventDefault();
    });

    // 안드로이드 하드웨어 뒤로가기
    try {
      const App = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
      if (App && App.addListener) {
        App.addListener('backButton', () => {
          if (!goBack() && App.exitApp) App.exitApp();
        });
      }
    } catch (e) { /* 웹에서는 무시 */ }

    // 브라우저 뒤로가기
    try {
      history.replaceState({ depth: 0 }, '');
      window.addEventListener('popstate', () => {
        if (goBack()) history.pushState({ depth: 1 }, '');
      });
      history.pushState({ depth: 1 }, '');
    } catch (e) {}

    // iOS 핀치 확대 차단 — 단 라이트박스에서는 사진 확대를 허용한다.
    // 더블탭 차단은 키패드 연타를 씹으므로 넣지 않는다
    // (안드로이드는 viewport meta 의 user-scalable=no 로 이미 막힌다)
    document.addEventListener('gesturestart', (e) => { if (!zoomable) e.preventDefault(); });
  }

  function boot() {
    bindShell();
    Calc.init();
    Tasks.init();
    TaskUI.init();
    AIUI.init();
    AuditUI.init();
    OCRUI.init();
    if (global.Sync) Sync.init();     // 관리자 서버 백업 (beta)
    if (global.Bangtong) Bangtong.init();
    Home.init();
    Nav.go('home');
    // 네이티브 스플래시 → 부팅 화면 → 앱. 색이 같아 이음매가 안 보인다.
    if (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.SplashScreen) {
      try { global.Capacitor.Plugins.SplashScreen.hide(); } catch (e) {}
    }
    const boot = U.$('#boot');
    if (boot) {
      // 네이티브 스플래시(250ms)가 이미 지나간 뒤라 여기서 또 오래 붙들면
      // 시작이 통째로 느리게 느껴진다. 로고 모션은 사라지면서 이어 보인다.
      const MIN_SHOW = 260;
      const since = performance.now();
      const hide = () => {
        boot.classList.add('gone');
        setTimeout(() => { if (boot.parentNode) boot.parentNode.removeChild(boot); }, 420);
      };
      setTimeout(hide, Math.max(0, MIN_SHOW - since));
    }
    if (navigator.storage && navigator.storage.persist) {
      try { navigator.storage.persist(); } catch (e) {}
    }

    // 데이터 안전판 — 부팅이 자리 잡은 뒤에(1.5초) 하루 한 번 작업 메타를 백업한다.
    // DB 는 비었는데 백업이 남아 있으면(증발 사고) 그냥 덮지 말고 복원을 권한다.
    setTimeout(() => {
      Store.taskCount().then(async (n) => {
        if (!n) {
          // 상시 미러(가장 최신) → localStorage 일일 백업 → 파일 백업 순으로 찾는다
          let bak = null;
          try { bak = await Store.mirrorInfo(); } catch (e) {}
          if (!bak) bak = Store.backupInfo();
          if (!bak) { try { bak = await Store.fileBackupInfo(); } catch (e) { bak = null; } }
          if (!bak) return;
          // 사용자가 이미 다른 시트·오버레이를 보고 있으면 치환하지 않는다(잘못 누름 방지).
          // 시트뿐 아니라 작업 편집기·AI·검수·감리선택 오버레이 위로도 뜨면 안 된다(반대심문 확인).
          // DB 가 빈 상태면 다음 부팅에 다시 제안된다.
          if (!U.$('#sheet-back').classList.contains('hidden')) return;
          if (Nav.isTaskOpen() || Nav.isAIOpen() || Nav.isAuditOpen() || Nav.isSupOpen()) return;
          if (global.Powder && Powder.isOpen()) return;
          if (global.Bangtong && Bangtong.isOpen()) return;
          if (!U.$('#lightbox').classList.contains('hidden')) return;
          U.confirmSheet(
            '저장된 작업이 하나도 없는데\n' + U.dayLabel(bak.at) + ' 백업(' + bak.n + '건)이 있습니다\n' +
            '복원할까요? (파일로 남은 사진은 함께 살립니다)', '복원',
            async () => {
              const k = await Store.restoreBackup(bak);
              U.toast('작업 ' + k + '건을 복원했습니다');
              try { Home.refresh(); } catch (e) {}
            });
          return;
        }
        Store.backupDaily();            // localStorage (즉시 계층)
        Store.backupToFileDaily();      // 파일 계층 (DATA + 공용문서, 7세대)
        Store.mirrorSoon();             // 상시 미러 씨딩 — 첫 저장 전에 죽어도 미러가 있게
        // 기존 blob 사진을 파일로 이전(P2) — 조용히, 조금씩. 중단돼도 다음 부팅에 이어서.
        Store.migratePhotosToFiles().then((m) => { if (m) console.log('[사진 파일 이전]', m + '장'); });
      }).catch(() => {});
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);

