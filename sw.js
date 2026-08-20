/* ============================================================
   外院知识分享站 · Service Worker (PWA 离线缓存)
   缓存策略：
   - install：预缓存核心入口资源
   - fetch：导航请求 network-first 回退缓存；
             静态资源（带版本号 URL）cache-first，永不过期；
             任意失败回退缓存。
   版本号：更新本文件 CACHE 常量即可整体换新缓存。
   ============================================================ */
const CACHE = 'waiyuan-v1';

const PRECACHE = [
  './',
  './index.html',
  './favicon.svg',
  './theme.css',
  './reading-tools.css',
  './reading-tools.js',
  './common.js',
  './home.css',
  './home.js',
  './site-search.js',
  './site-search-data.js',
  './manifest.webmanifest',
  './og-image.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求：网络优先，离线回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // 静态资源：缓存优先
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
