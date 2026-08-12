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
    processImage: processImage
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
  const DB_VER = 3;          // v2: todos / v3: tasks (기존 스토어는 그대로 보존)
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
    });
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
    return tx(['records', 'tasks', 'photos'], 'readwrite', (t) => {
      const rs = t.objectStore('records').getAll();
      const ts = t.objectStore('tasks').getAll();
      let got = 0;
      const ready = () => {
        if (++got < 2) return;
        const all = rs.result || [], tasks = ts.result || [];
        const target = all.filter((r) => r.id === id)[0];
        const mine = (target && target.photos) || [];
        const used = {};
        all.forEach((r) => { if (r.id !== id) (r.photos || []).forEach((p) => { used[p] = 1; }); });
        tasks.forEach((k) => refPhotos(k, used));
        orphan = mine.filter((p) => !used[p]);
        t.objectStore('records').delete(id);
        const ps = t.objectStore('photos');
        orphan.forEach((pid) => ps.delete(pid));
      };
      rs.onsuccess = ready;
      ts.onsuccess = ready;
    }).then(() => {
      if (orphan.length) {
        if (global.Native && Native.photoRemove) Native.photoRemove(orphan);
        opfsRemove(orphan);
      }
    });
  }

  /* 기록에도 작업에도 속하지 않은 사진 정리 (저장 안 하고 나간 편집기 잔여물).
     ※ 사진을 쓰는 스토어가 늘어나면 반드시 여기에도 추가할 것 — 빠지면 남의 사진을 지운다.
     - 읽기·계산·삭제를 **한 트랜잭션**으로 (스냅숏 일관성 — TOCTOU 차단)
     - 24시간 미만 사진은 안 지운다 (커밋됐지만 아직 어느 작업에도 안 붙은 진행 중 사진 보호) */
  function gc(protectIds) {
    const keep = {};
    (protectIds || []).forEach((id) => { keep[id] = 1; });
    const now = Date.now();
    let dead = [];
    return tx(['records', 'tasks', 'photos'], 'readwrite', (t) => {
      const rs = t.objectStore('records').getAll();
      const ts = t.objectStore('tasks').getAll();
      const ph = t.objectStore('photos');
      const ks = ph.getAllKeys();
      let got = 0;
      const ready = () => {
        if (++got < 3) return;
        (rs.result || []).forEach((r) => (r.photos || []).forEach((p) => { keep[p] = 1; }));
        (ts.result || []).forEach((k) => refPhotos(k, keep));
        (ks.result || []).forEach((key) => {
          if (keep[key]) return;
          if (now - uidTime(key) < GC_GRACE) return;   // 오늘 찍은 건 건드리지 않는다
          dead.push(key);
          ph.delete(key);
        });
      };
      rs.onsuccess = ready;
      ts.onsuccess = ready;
      ks.onsuccess = ready;
    }).then(() => {
      if (dead.length) {
        if (global.Native && Native.photoRemove) Native.photoRemove(dead);
        opfsRemove(dead);
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

  /* 작업 → 저장할 레코드(정규화). putTask 와 persist28 이 같이 쓴다 */
  function taskRec(t) {
    liftDong(t);
    const now = Date.now();
    const isSub = Spec.hasSubs(t.specKey);
    const sub = isSub ? normalizeSub(t) : null;
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
      // 28일은 두 칸의 사진이 곧 이 작업의 사진이다(gc 가 여기만 본다)
      photos: isSub ? mergedPhotos(t, sub) : (t.photos || []).slice(),
      sets: isSub ? [] : normalizeSets(t),
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

  function mirrorSoon() {
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(() => {
      run((db) => reqp(db.transaction('tasks').objectStore('tasks').getAll()))
        .then((rows) => {
          rows = rows || [];
          if (!rows.length) return;              // 빈 DB 로 미러를 덮지 않는다
          const body = JSON.stringify({
            at: Date.now(), day: U.dayKey(Date.now()), n: rows.length, tasks: rows
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
        return (j && Array.isArray(j.tasks) && j.tasks.length) ? j : null;
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
    return tx(['tasks', 'records', 'photos'], 'readwrite', (t) => {
      const ts = t.objectStore('tasks').getAll();
      const rs = t.objectStore('records').getAll();
      let got = 0;
      const ready = () => {
        if (++got < 2) return;
        const tasks = ts.result || [], recs = rs.result || [];
        const target = tasks.filter((k) => k.id === id)[0];
        const mineMark = {};
        if (target) refPhotos(target, mineMark);
        const used = {};
        tasks.forEach((k) => { if (k.id !== id) refPhotos(k, used); });
        recs.forEach((r) => (r.photos || []).forEach((p) => { used[p] = 1; }));
        orphan = Object.keys(mineMark).filter((p) => !used[p]);
        t.objectStore('tasks').delete(id);
        const ps = t.objectStore('photos');
        orphan.forEach((pid) => ps.delete(pid));
      };
      ts.onsuccess = ready;
      rs.onsuccess = ready;
    }).then(() => {
      if (orphan.length) {
        if (global.Native && Native.photoRemove) Native.photoRemove(orphan);
        opfsRemove(orphan);
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
      .then((arr) => (arr || []).map(liftDong));
  }

  function bakInfo(key) {
    try {
      const j = JSON.parse(localStorage.getItem(key));
      return (j && Array.isArray(j.tasks) && j.tasks.length) ? j : null;
    } catch (e) { return null; }
  }
  function backupInfo() { return bakInfo(K_BAK); }

  function backupNow() {
    return run((db) => reqp(db.transaction('tasks').objectStore('tasks').getAll()))
      .then((rows) => {
        rows = rows || [];
        if (!rows.length) return 0;          // 빈 DB 로 멀쩡한 백업을 덮지 않는다
        try {
          const prev = backupInfo();
          // 건수가 백업보다 줄었다 = 부분 유실일 수 있다 — 좋은 백업을 그냥 덮지 말고
          // 한 세대 옆에 보관한다(감사 지적: 완전 증발만 막고 부분 유실은 못 막던 구멍)
          if (prev && rows.length < prev.n) {
            localStorage.setItem(K_BAK2, localStorage.getItem(K_BAK));
          }
          localStorage.setItem(K_BAK, JSON.stringify({
            at: Date.now(), day: U.dayKey(Date.now()), n: rows.length, tasks: rows
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
    return run((db) => reqp(db.transaction('tasks').objectStore('tasks').getAll()))
      .then((rows) => {
        rows = rows || [];
        if (!rows.length) return false;
        const name = 'gsc-' + today.replace(/-/g, '') + '.json';
        const body = JSON.stringify({ at: Date.now(), day: today, n: rows.length, tasks: rows });
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
        for (const t of info.tasks) {
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
        return n;
      });
  }

  global.Store = {
    open: open,
    putPhoto: putPhoto, getPhoto: getPhoto, getPhotos: getPhotos, deletePhotos: deletePhotos,
    fullBlob: fullBlob,
    putRecord: putRecord, getRecord: getRecord, allRecords: allRecords, deleteRecord: deleteRecord,
    putTodo: putTodo, todosOf: todosOf, deleteTodo: deleteTodo,
    putTask: putTask, tasksOf: tasksOf, getTask: getTask, deleteTask: deleteTask,
    allTasks: allTasks,
    normalizeSets: normalizeSets,
    taskCount: taskCount, backupInfo: backupInfo, backupNow: backupNow,
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

  function downloadBlobs(blobs, baseName, text) {
    blobs.forEach((b, i) => {
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = baseName + '_' + (i + 1) + '.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
    if (text) {   // 사진과 함께 내려받을 때도 메모를 버리지 않는다
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = baseName + '.txt';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    return 'download';
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

  global.Share = {
    exportItems: exportItems,
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
    try {
      const res = await fetch(buildUrl(loc.lat, loc.lon), { cache: 'no-store' });
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
      if (cache) {
        return { data: cache.data, at: cache.at, source: cache.source,
                 name: cache.name, stale: true };
      }
      return null;
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
      let dong = '', dongMain = '';
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
                   derived: derived, offAge: offAge });
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

    lines.forEach((l) => {
      const txt = l.text.replace(/[|l]/g, '1');   // 손글씨 1 의 흔한 오독
      const re = /(\d{1,2})\s*[.,]\s*(\d{2})(?!\d)/g;
      let m, hit = false;
      while ((m = re.exec(txt))) { hit = true; push(parseFloat(m[1] + '.' + m[2]), l); }
      if (hit) return;
      // 소수점이 사라진 줄 — 통째로 숫자일 때만 되살린다
      const whole = txt.trim();
      let w4 = whole.match(/^(\d{2})(\d{2})$/);          // "4403"
      if (!w4) w4 = whole.match(/^(\d{1,2})\s+(\d{2})$/); // "42 69"
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
   생성: 2026-08-05 · 57명
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

  function list(day) { return Store.tasksOf(day || today()); }
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

  /* 완료 — 보통은 사진 한 장이면 끝.
     28일은 **수중·봉함 둘 다** 찍어야 끝이다(사용자 지시) — 한쪽만 찍고 넘어가는 걸 막는다. */
  function isDone(t) {
    if (hasSubs(t)) return Spec.SUBS.every((s) => subPhotos(t, s.key).length >= 1);
    return ((t && t.photos) || []).length >= 1;
  }

  /* 아직 사진이 없는 칸 이름들. 28일이 아니면 빈 배열.
     "미완료"만 뜨면 뭘 더 찍어야 하는지 모른다 — 어느 칸이 비었는지 이름으로 말해 준다. */
  function pendingSubs(t) {
    if (!hasSubs(t)) return [];
    return Spec.SUBS.filter((s) => subPhotos(t, s.key).length === 0).map((s) => s.name);
  }

  /* 목록에 붙일 한마디: '봉함 미완료' · '수중·봉함 미완료' · 끝났으면 '' */
  function doneNote(t) {
    const left = pendingSubs(t);
    if (!left.length) return '';
    return left.join('·') + ' 미완료';
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
     지저분한 것이 섞여 있어 앞의 「숫자+동」만 뽑는다. 없으면 적힌 그대로. */
  function dongText(d) {
    const s = String(d || '').trim();
    if (!s) return '';
    const m = s.match(/(\d+\s*동)/);
    return m ? m[1].replace(/\s+/g, '') : s;
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
                         items: [], photoIds: [] };
          order.push(g.key);
        }
        const box = map[g.key];
        if (box.items.indexOf(pc.t) < 0) box.items.push(pc.t);
        pc.photos.forEach((id) => { if (box.photoIds.indexOf(id) < 0) box.photoIds.push(id); });
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
    testDayOf: testDayOf, dongText: dongText, dongOf: dongOf,
    hasSubs: hasSubs, subOf: subOf, subPhotos: subPhotos, pieces: pieces,
    pendingSubs: pendingSubs, doneNote: doneNote,
    setsOf: setsOf, allSets: allSets, setName: setName, setStats: setStats,
    filledSets: filledSets, setsBrief: setsBrief,
    actualAge: actualAge, label: label, summary: summary,
    autoReportDay: autoReportDay, reportDayOf: reportDayOf, exportLabel: exportLabel,
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
  const DEFAULT_FACTOR = 0.97;

  let digits = '';
  let entries = [];        // [{v:Number, d:'2453'}]
  let autoReg = true;
  let factor = DEFAULT_FACTOR;   // 보정계수 (평균 × factor)
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
    U.$('#chip-count').textContent = s.n;
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
     입력된 값을 기준으로 비슷한 값을 만들어 3개(한 세트) 또는 9개(판 전체)까지 채운다.
     직접 입력한 **마지막 값은 항상 맨 끝자리**(3번 또는 9번)로 옮긴다(사용자 지시).
     퍼짐: 입력값들의 표본편차(1개뿐이면 값의 1.5%), 최소 0.35 — 판에 적힌 값처럼 흩어진다. */
  function fillRandom(target) {
    const n = entries.length;
    if (!n) { U.toast('기준이 될 값을 먼저 입력하세요'); return; }
    if (n >= target) {
      U.toast('이미 ' + n + '개가 있습니다 — ' + target + '개보다 적을 때 채워집니다');
      return;
    }
    const s = stats();
    // 퍼짐: 입력값들의 표본편차(1개뿐이면 값의 1.5%), 최소 0.35.
    // 처음(±1.5×0.15)엔 값들이 너무 몰렸다(사용자 피드백) — 전형 편차가 spread 수준이 되게 ×3.
    const spread = Math.max(
      (s.sd != null && isFinite(s.sd)) ? s.sd : s.avg * 0.015, 0.35);
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

  function linkTo(taskId, setId, label, values, f, subKey) {
    linkedId = taskId || null;
    linkedSet = setId || null;
    linkedSub = subKey || null;
    entries = (values || []).slice();
    factor = (typeof f === 'number' && isFinite(f) && f > 0) ? f : DEFAULT_FACTOR;
    digits = '';
    save(); render();
    const bar = U.$('#calc-link');
    U.$('#calc-link-name').textContent = label || '';
    bar.classList.toggle('hidden', !linkedId);
    const fin = U.$('#factor');
    if (fin) fin.value = factorText(factor);
    fit();   // 연결바(약 59px)가 생기면 남는 높이가 그만큼 줄어든다
  }

  function unlink() {
    linkedId = null;
    linkedSet = null;
    linkedSub = null;
    U.$('#calc-link').classList.add('hidden');
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
    try { tasks = await Store.tasksOf(day); } catch (e) { console.error(e); }

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
    U.$('#btn-fill3').addEventListener('click', () => fillRandom(3));
    U.$('#btn-fill9').addEventListener('click', () => fillRandom(9));

    U.$('#calc-menu-btn').addEventListener('click', () => {
      U.sheet('계산 옵션', [
        { label: '결과 복사', sub: '카카오톡에 붙여넣기용 텍스트', onPick: copySummary },
        { label: '작업에 넣기', sub: '새 작업 또는 오늘 등록한 작업', onPick: attachToRecord },
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

  async function load() {
    // 날짜를 빠르게 넘기면 먼저 시작한 조회가 나중에 끝나 새 날짜 목록을 덮어쓴다.
    // 조회 시작 시점의 날짜를 붙들고, 그 사이 바뀌었으면 결과를 버린다.
    const want = U.dayKey(base.getTime());
    let rows = [], fail = null;
    try { rows = await Store.tasksOf(want); } catch (e) { console.error(e); fail = e || true; }
    if (want !== U.dayKey(base.getTime())) return;      // 지나간 조회 — 버린다
    loadFail = fail;
    all = rows;
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
    const q = searchQ.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) => {
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
          ? '조건에 맞는 작업이 없습니다.'
          : '이 날짜에 작업이 없습니다.<br>오른쪽 위 <b>+</b> 로 등록하세요.');
      list.appendChild(emptyNode);
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
    updateBar();
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
    const off = (n === 0 || p === 0);
    // 축마다 묶음 수가 다르다 — 누르기 전에 몇 번 보내야 하는지 보여 준다.
    // 봉함은 감리축으로 안 나가므로 봉함만 골랐으면 감리별은 0 이 된다.
    const rows = n ? selected() : [];
    const gd = n ? Task.groupByDay(rows).filter((x) => x.photos > 0).length : 0;
    const gs = n ? Task.groupForExport(rows).filter((x) => x.photos > 0).length : 0;
    btn.disabled = off || gd === 0;
    btn.classList.toggle('off', btn.disabled);
    if (btnSup) {
      btnSup.disabled = off || gs === 0;
      btnSup.classList.toggle('off', btnSup.disabled);
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
      for (const id of ids) {
        const b = byId[id] ? await Store.fullBlob(byId[id]) : null;   // 파일로 옮겨진 원본 포함
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
    else if (how === 'copied') U.toast('「' + g.label + '」를 복사했습니다');
    else if (copied) U.toast('사진을 보낸 뒤 붙여넣기\n「' + g.label + '」', 4000);
    else U.toast('공유할 앱에서 카카오톡을 선택하세요');
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

    // 홈뿐 아니라 여기서도 등록한다. 보고 있는 날짜에 그대로 만든다.
    U.$('#tasks-add').addEventListener('click', () => {
      TaskUI.open(null, U.dayKey(base.getTime()));
    });

    U.$('#tasks-all').addEventListener('click', () => {
      const rows = visible();
      if (rows.length && selected().length === rows.length) sel = Object.create(null);
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
    $('#tk-heading').textContent = task ? '작업' : '새 작업';
    $('#tk-delete').classList.toggle('hidden', !task);
    renderSpecs();
    $('#tk-cast').value = tk.castDay || '';
    $('#tk-day').value = Task.testDayOf(tk);
    $('#tk-part').value = tk.part || '';
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
        tk.specKey = s.key;
        // 분류를 바꾸면 타설일 기본값도 따라간다 (직접 고친 값은 덮어쓴다)
        tk.castDay = Task.defaultCast(s.key, Task.testDayOf(tk));
        $('#tk-cast').value = tk.castDay;
        dirty = true;
        renderSpecs(); renderAge(); renderReport();
        renderSubTabs(); renderValues(); renderPhotos();
      });
      wrap.appendChild(b);
    });

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
    if (!tk) return;
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
  function pickDong(dong) {
    if (!tk) return;
    tk.dong = dong || '';
    dirty = true;
    renderDong();
    renderReport();
    clearHints();

    const sups = Contacts.byDong(dong);
    // 지금 감리가 이 동 담당이 아니면 비운다 —
    // 남겨 두면 동만 바꿨을 때 엉뚱한 감리에게 카톡이 간다.
    const keep = !!tk.supervisor && sups.some((c) => Contacts.label(c) === tk.supervisor);
    if (!keep) { tk.supervisor = ''; tk.supPhone = ''; }

    if (!keep && sups.length === 1) { pickSup(sups[0], true); return; }
    renderSup();
    if (!keep && sups.length > 1) {
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

  /* 감리 → 동. 그 감리가 맡은 동이 하나면 바로 붙이고, 여럿이면 다 띄운다.
     (예: 이원일 이사는 305동과 214동B 둘 다 맡는다)
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

    const ds = c ? Contacts.dongsOf(c) : [];
    // 이미 그 감리가 맡은 동이면 그대로 둔다
    if (tk.dong && ds.indexOf(tk.dong) >= 0) { $('#tk-dong-hint').classList.add('hidden'); return; }
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

  /* ---------------- 사진 ---------------- */
  async function renderPhotos() {
    if (!tk) return;
    const owner = tk;
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
    if (tk !== owner) return;
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
      } else { cell.classList.add('loading'); cell.textContent = '불러오기 실패'; }
      const del = U.el('button', 'del');
      del.appendChild(U.icon('close'));
      del.setAttribute('aria-label', (i + 1) + '번 사진 삭제');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!tk) return;
        bag().photos.splice(i, 1); dirty = true; renderPhotos(); renderSubTabs();
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
    const rec = await save(true);
    if (!rec) return;
    const title = Task.summary(rec);
    const n = (rec.photos || []).length;
    const items = [];
    if (n) {
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
        for (const id of rec.photos) {
          const b = byId[id] ? await Store.fullBlob(byId[id]) : null;   // 파일로 옮겨진 원본 포함
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
    else if (copied) U.toast('사진을 보낸 뒤 대화창에 붙여넣기', 3500);
    else U.toast('공유할 앱에서 카카오톡을 선택하세요');
  }

  /* ---------------- 바인딩 ---------------- */
  function bind() {
    $('#tk-back').addEventListener('click', tryClose);
    $('#tk-delete').addEventListener('click', removeTask);
    $('#tk-save').addEventListener('click', () => { save(false); });
    $('#tk-export').addEventListener('click', () => { exportTask(); });

    $('#tk-part').addEventListener('input', () => { dirty = true; });
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
  const MAX_PHOTOS = 2;

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
    const ids = (t.photos || []).slice(0, MAX_PHOTOS);
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
      if (!imgs.length) return item;
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

  const LV = { bad: '확인', warn: '확인', info: '참고' };

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

    if (!r.issues.length) {
      c.appendChild(U.el('div', 'audit-line ok', '이상 없음'));
    } else {
      r.issues.forEach((x) => {
        const line = U.el('div', 'audit-line ' + x.level);
        line.appendChild(U.el('b', '', LV[x.level] || '확인'));
        line.appendChild(U.el('span', '', x.text + (x.fromPhoto ? ' (사진)' : '')));
        c.appendChild(line);
      });
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
      try { existing = await Store.allTasks(); } catch (e) {}
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

  function bindSettings() {
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

    let tasks = [], failed = null;
    try { tasks = await Task.list(day); } catch (e) { console.error(e); failed = e || true; }
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
    if (!tasks.length) { list.appendChild(emptyNode); return; }

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
  }

  /* ---------------- 바인딩 ---------------- */
  function bind() {
    U.$('#wx-card').addEventListener('click', () => renderWeather(true));
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
          // 사용자가 이미 다른 시트를 보고 있으면 치환하지 않는다(잘못 누름 방지).
          // DB 가 빈 상태면 다음 부팅에 다시 제안된다.
          if (!U.$('#sheet-back').classList.contains('hidden')) return;
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

