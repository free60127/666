/* ============================================================
   外院知识分享站 · Service Worker (PWA 离线缓存)
   缓存策略：
   - install：预缓存核心入口资源（首页 + 6 个子页面入口 + 思政/计算机题库）
   - fetch：
     ① 导航请求 network-first，离线回退缓存（子页面可离线打开壳）；
     ② 题库/词书/词典等数据文件：缓存 key 用「无版本号 URL」——
        页面带 ?v= 请求命中缓存即回，同时后台刷新；离线时预缓存的
        思政/计算机题库、访问过的词书/词典均可使用；
     ③ 其他带 ?v= 静态资源 cache-first（发布即换新 URL，永不过期），
        命中时后台刷新并清理同一文件的旧版本条目（防无限累积）；
     ④ 无版本号资源（theme.css/common.js/manifest/favicon 等）
        stale-while-revalidate：先回缓存立即响应，同时后台拉新。
   版本号：更新本文件 CACHE 常量即可整体换新缓存。
   ============================================================ */
const CACHE = 'waiyuan-v6';

// 导航离线且未缓存时返回的提示页（明确告知「该模块尚未下载」，不再静默回退首页壳）
function offlinePage() {
  return new Response(
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#28634f"><title>离线 · 外院知识分享站</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f7f8f3;color:#17211f;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}h1{font-size:22px;margin:0 0 10px}p{color:#6b7a73;line-height:1.7;margin:0 0 18px}a{display:inline-block;color:#fff;background:#28634f;border-radius:999px;padding:11px 22px;text-decoration:none;font-weight:800}</style></head><body><div><h1>当前处于离线状态</h1><p>这个模块还没有离线缓存，联网后即可正常访问。<br>已打开过的页面（首页、学习中心、题库等）在断网时仍可使用。</p><p><a href="./">返回首页</a></p></div></body></html>',
    {headers: {'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store'}}
  );
}

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
  './背单词/style.css',
  './背单词/licenses.css',
  './背单词/vocabulary-extra.css',
  './背单词/app.js',
  './背单词/vocabulary-meta.js',
  './背单词/vendor/ts-fsrs/index.umd.js?v=5.4.1',
  './思政系列/index.html',
  './计算机系列/index.html',
  './学习中心/index.html',
  './考证/index.html',
  './专业课/index.html',
  // 题库数据：思政/计算机为全站核心，离线可用；其余数据（泛读/基英/
  // 词书/词典）访问过一次后自动进入运行时缓存
  './思政系列/data.js',
  './计算机系列/data.js'
];

// 数据文件：以「无版本号 URL」作为缓存 key，页面带 ?v= 的请求也能命中
function isDataFile(pathname) {
  return /(思政系列|计算机系列|专业课\/英语系\/(泛读|基英)系列)\/data\.js$/.test(pathname)
    || /背单词\/vocabulary-(meta|data-tem[48])\.js$/.test(pathname)
    || /dictionary\/english-lookup-data\.js$/.test(pathname);
}

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

  // 导航请求：网络优先，离线回退到已缓存页面；未缓存页面给出明确提示（不回退首页壳）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || offlinePage()))
    );
    return;
  }

  // 数据文件（题库/词书/词典）：缓存 key = 无版本号 URL
  if (isDataFile(url.pathname)) {
    const cleanUrl = url.origin + url.pathname;  // 去掉 ?v= 版本号
    event.respondWith(
      caches.match(cleanUrl).then(hit => {
        if (hit) {
          fetch(req)
            .then(res => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then(cache => putWithClean(cache, cleanUrl, copy));
              }
            })
            .catch(() => {});
          return hit;
        }
        return fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => putWithClean(cache, cleanUrl, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // 带版本号资源：缓存优先 + 后台刷新 + 清理旧版本。
  // 预缓存条目按「无版本 URL」存放（发布换版本号后不失效），
  // 因此先按完整请求匹配，miss 时再回退到无版本条目。
  if (url.searchParams.has('v')) {
    const cleanUrl = url.origin + url.pathname;
    event.respondWith(
      caches.match(req).then(hit => hit || caches.match(cleanUrl)).then(hit => {
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
