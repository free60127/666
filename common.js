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

  /* ---------- 云端 API 配置 ----------
     默认指向 Cloudflare Worker；绑定自定义域名后改为 https://api.free60127.top
     （只需改这一处，全站生效） */
  window.WAIYUAN_API_BASE = window.WAIYUAN_API_BASE || 'https://waiyuan-study.3338095791.workers.dev';

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
