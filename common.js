/* ============================================================
   外院知识分享站 · 全站公共脚本（由 scripts/inject-common.js 注入到每个页面）
   职责：① GoatCounter 访问统计 ② Service Worker(PWA) 注册
   幂等：window.__WAIYUAN_COMMON__ 防重入
   ============================================================ */
(() => {
  if (window.__WAIYUAN_COMMON__) return;
  window.__WAIYUAN_COMMON__ = true;

  /* ---------- GoatCounter 访问统计 ----------
     使用前需注册 GoatCounter 账号（https://www.goatcounter.com），
     把子域名设为 free60127，或把下方 GC_SITE 改成你的子域名。
     未注册时统计不会上报，但绝不影响站点功能。 */
  const GC_SITE = 'https://free60127.goatcounter.com/count';
  const injectGoatCounter = () => {
    try {
      const s = document.createElement('script');
      s.setAttribute('data-goatcounter', GC_SITE);
      s.async = true;
      s.src = '//gc.zgo.at/count.js';
      document.head.appendChild(s);
    } catch (e) { /* 统计失败不影响页面 */ }
  };
  // 统计脚本必须等 window load 后再注入：async 脚本的下载/连接失败会推迟
  // load 事件（网络差时页面白等），先完成页面加载再异步补挂统计。
  if (document.readyState === 'complete') injectGoatCounter();
  else window.addEventListener('load', injectGoatCounter, { once: true });

  /* ---------- 云端 API 配置 ----------
     指向 Cloudflare Worker 自定义域 api.free60127.top（2026-08-21 绑定）；
     回退值保留 workers.dev 地址，域名未生效时 API 静默降级不影响功能 */
  window.WAIYUAN_API_BASE = window.WAIYUAN_API_BASE || 'https://api.free60127.top';

  /* ---------- 首页公告（读云端 /api/notice）----------
     页面内有 #site-notice 才生效；云端不可达时静默隐藏，不影响任何功能 */
  (function loadNotice() {
    const el = document.getElementById('site-notice');
    if (!el) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    fetch(window.WAIYUAN_API_BASE + '/api/notice', { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { clearTimeout(timer); if (data && data.text) { el.textContent = data.text; el.hidden = false; } })
      .catch(() => clearTimeout(timer));
  })();

  /* ---------- GitHub Pages 直连通道统计（2026-08-22）----------
     主域 free60127.top 的 PV/UV 由 Worker 反代后端统计；
     此段仅当直接从 free60127.github.io 访问时补报，两通道互不重叠、不会双计。
     路径去掉 /666 前缀与主域口径对齐；UV 用 localStorage 设备 id（跨域无法与主域 Cookie 共享，UV 口径两通道各计）。 */
  (function reportGhVisit() {
    try {
      if (!window.WAIYUAN_API_BASE) return;
      if (location.hostname !== 'free60127.github.io' && !window.WAIYUAN_GH_STATS) return;  // WAIYUAN_GH_STATS 仅供本地测试
      const VID_KEY = 'waiyuan_vid_gh';
      let vid = localStorage.getItem(VID_KEY);
      if (!vid) {
        vid = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(VID_KEY, vid);
      }
      let path = location.pathname;
      if (path.startsWith('/666')) path = path.slice(4) || '/';
      const payload = JSON.stringify({ vid, path });
      const api = window.WAIYUAN_API_BASE.replace(/\/$/, '');
      if (navigator.sendBeacon) {
        navigator.sendBeacon(api + '/api/visit', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(api + '/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
    } catch (_) { /* 统计失败静默 */ }
  })();

  /* ---------- 原生 App 下载通道（Capacitor WebView） ----------
     WebView 默认不处理 <a download>：http(s) 由 MainActivity 的
     DownloadListener（DownloadManager）接管；blob:/data: 内容由
     NativeSave 桥（MainActivity @JavascriptInterface）保存到手机「下载」目录。 */
  window.WaiyuanNativeDownload = {
    isNative() {
      return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    },
    saveBlob(name, blob) {
      if (!this.isNative() || !window.NativeSave || !blob) return Promise.resolve(false);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const base64 = String(reader.result).split(',')[1] || '';
            if (!base64) return resolve(false);
            window.NativeSave.saveBase64(name || 'file', base64);
            resolve(true);
          } catch (e) { reject(e); }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    },
    saveDataUrl(name, dataUrl) {
      if (!this.isNative() || !window.NativeSave) return false;
      try {
        const base64 = String(dataUrl || '').split(',')[1] || '';
        if (!base64) return false;
        window.NativeSave.saveBase64(name || 'file', base64);
        return true;
      } catch (e) { return false; }
    },
  };

  /* ---------- Service Worker (PWA 离线缓存) ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const tag = document.querySelector('script[data-common-injected]');
    const src = tag && tag.src;
    if (src) {
      const swUrl = new URL('sw.js', src);
      window.addEventListener('load', () => {
        navigator.serviceWorker.register(swUrl).catch(err => { console.warn('Service Worker 注册失败（不影响页面使用）：', err); });
      });
    }
  }
})();
