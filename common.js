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
  try {
    const s = document.createElement('script');
    s.setAttribute('data-goatcounter', GC_SITE);
    s.async = true;
    s.src = '//gc.zgo.at/count.js';
    document.head.appendChild(s);
  } catch (e) { /* 统计失败不影响页面 */ }

  /* ---------- Service Worker (PWA 离线缓存) ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const tag = document.querySelector('script[data-common-injected]');
    const src = tag && tag.src;
    if (src) {
      const swUrl = new URL('sw.js', src);
      window.addEventListener('load', () => {
        navigator.serviceWorker.register(swUrl).catch(() => { /* 注册失败不打扰用户 */ });
      });
    }
  }
})();
