/* 공시체 계산기 PWA — 오프라인 캐시. 본업(계산·작업)은 지하에서도 떠야 한다 */
const VER = 'gsc-b6dfceef25';
const FILES = ["./css/app.css","./icon-192.png","./icon-512.png","./icon.svg","./index.html","./js/app.bundle.js","./manifest.json","./robots.txt"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
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
