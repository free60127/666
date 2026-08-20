/* ============================================================
   外院知识分享站 · Service Worker (PWA 离线缓存)
   缓存策略：
   - install：预缓存核心入口资源（首页 + 6 个子页面入口）
   - fetch：
     ① 导航请求 network-first，离线回退缓存（子页面可离线打开壳）；
     ② 带 ?v= 版本号的静态资源 cache-first（发布即换新 URL，永不过期），
        命中时后台刷新并清理同一文件的旧版本条目（防无限累积）；
     ③ 无版本号资源（theme.css/common.js/manifest/favicon 等）
        stale-while-revalidate：先回缓存立即响应，同时后台拉新，
        下次访问即新版本。
   版本号：更新本文件 CACHE 常量即可整体换新缓存。
   ============================================================ */
const CACHE = 'waiyuan-v3';

const PRECACHE = [
  './',
  './index.html',
  './favicon.svg',
  './theme.css',
  './reading-tools.css',
  './reading-tools.js',
  './tomato-timer.css',
  './tomato-timer.js',
  './common.js',
  './home.css',
  './home.js',
  './site-search.js',
  './site-search-data.js',
  './manifest.webmanifest',
  './og-image.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './背单词/index.html',
  './思政系列/index.html',
  './计算机系列/index.html',
  './学习中心/index.html',
  './考证/index.html',
  './专业课/index.html'
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

// 写入缓存时，先删除同文件（同路径）的旧版本条目，防止 ?v= 条目无限累积
function putWithClean(cache, req, res) {
  return cache.keys().then(keys => {
    const sameFile = keys.filter(k => {
      if (k.url === req.url) return false;
      try { return new URL(k.url).pathname === new URL(req.url).pathname; } catch (e) { return false; }
    });
    return Promise.all(sameFile.map(k => cache.delete(k))).then(() => cache.put(req, res));
  });
}

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

  // 带版本号资源：缓存优先 + 后台刷新 + 清理旧版本
  if (url.searchParams.has('v')) {
    event.respondWith(
      caches.match(req).then(hit => {
        if (hit) {
          fetch(req)
            .then(res => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then(cache => putWithClean(cache, req, copy));
              }
            })
            .catch(() => {});
          return hit;
        }
        return fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => putWithClean(cache, req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // 无版本号静态资源：stale-while-revalidate（先回缓存，后台更新）
  event.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
