/* 공시체 계산기 PWA — 오프라인 캐시. 본업(계산·작업)은 지하에서도 떠야 한다 */
const VER = 'gsc-fd8e9fe177';
const FILES = ["./css/app.css","./icon-192.png","./icon-512-maskable.png","./icon-512.png","./icon.svg","./index.html","./js/app.bundle.js","./manifest.json","./robots.txt"];
self.addEventListener('install', (e) => {
  // 프리캐시는 HTTP 캐시를 안 거친다(cache:'reload') — 서버가 max-age=600 이라 옛 번들을 새 판 이름으로 담을 수 있었다
  // ?v=VER 로 CDN 엣지 캐시(max-age=600)까지 우회 — 응답은 ignoreSearch 매치라 쿼리 없는 요청에도 맞는다(검수 지적)
  e.waitUntil(caches.open(VER).then((c) =>
    c.addAll(FILES.map((f) => new Request(f + '?v=' + VER, { cache: 'reload' })))
      // 배포 주소는 파일명 없는 루트(…/gongsiche-app/)로도 열린다 — 그것도 캐시해 둔다(안 되는 서버면 그냥 넘어감)
      .then(() => c.add(new Request('./?v=' + VER, { cache: 'reload' })).catch(() => {}))
  ).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;  // 날씨·AI 는 그대로 네트워크
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).catch(() =>
        e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()
      )
    )
  );
});
