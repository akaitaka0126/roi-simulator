/* ROI Simulator — Service Worker（オフライン対応）
 * 方式: 版ごとのキャッシュ + キャッシュ優先。
 * ★アプリを更新したら VERSION を上げる（js/app.js の APP_VERSION と同じ値）。
 *   新しい版が入ると古い版のキャッシュは自動で消え、開いている画面は 1 回だけ読み直される。
 */
const VERSION = '1.0.1';
const CACHE_PREFIX = 'roi-simulator-';            // 同じ住所に置く他のアプリのキャッシュとは名前で分ける
const CACHE_NAME = CACHE_PREFIX + VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/calc.js',
  './js/format.js',
  './js/app.js',
  './img/okinawa-sea.webp',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' … 配信側の HTTP キャッシュ（GitHub Pages は 10 分）を通さず最新を取る
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      // 自分の古い版だけ消す（他のアプリのキャッシュには触れない）
      .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(self.registration.scope)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === 'navigate') {
        const page = await cache.match('./index.html');
        if (page) return page;
      }
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
