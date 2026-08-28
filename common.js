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
  // 2026-08-29 质量修复：原生环境判断只实现一次，三处（下载桥/打开桥/SW 分支）共用
  const isNativeApp = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  window.WaiyuanNativeDownload = {
    isNative: isNativeApp,
    saveBlob(name, blob) {
      if (!this.isNative() || !window.NativeSave || !blob) return Promise.resolve(false);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const base64 = String(reader.result).split(',')[1] || '';
            if (!base64) return resolve(false);
            // 2026-08-23 审查：原生桥返回 boolean（保存成功/失败），失败不再谎报成功
            const ok = window.NativeSave.saveBase64(name || 'file', base64);
            resolve(ok === true);
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
        return window.NativeSave.saveBase64(name || 'file', base64) === true;
      } catch (e) { return false; }
    },
  };

  /* 2026-08-25：NativeOpen 桥——App 内长按二维码唤起系统「打开链接」/微信扫一扫；
     外部浏览器无此桥时退化为 window.open（可能被拦截）。
     2026-08-29 安全加固：仅放行 http/https/weixin 协议（与原生桥白名单逐字一致，
     必须带 //，拒绝 javascript:/data:/intent:/http:xxx 等任意形式），
     浏览器兜底打开后清除 opener，防新窗口反向控制本页（reverse tabnabbing）。 */
  const EXTERNAL_SCHEME_RE = /^(?:https?|weixin):\/\//i;
  window.WaiyuanNativeBridge = {
    isNative: isNativeApp,
    openExternal: function (url) {
      const target = String(url == null ? '' : url).trim();
      if (!target || !EXTERNAL_SCHEME_RE.test(target)) return false;
      try {
        if (window.NativeOpen && window.NativeOpen.openExternal) {
          return window.NativeOpen.openExternal(target) === true;
        }
      } catch (e) { /* 桥异常时走浏览器兜底 */ }
      try {
        const w = window.open(target, '_blank');
        if (w) { try { w.opener = null; } catch (e) { /* 跨域下置空失败不影响打开 */ } }
        return !!w;
      } catch (e) {
        return false;
      }
    }
  };

  /* ---------- 二维码通用操作（2026-08-25） ----------
     给任意页面 <img data-qr> 的二维码图统一绑定「右键 / 长按」：
     弹出底部操作面板（保存图片 / 用微信扫一扫 / 关闭）。
     - App 内保存走 NativeSave 桥（MainActivity @JavascriptInterface），
       外部浏览器回退 <a download>。
     - 「用微信扫一扫」走 NativeOpen 桥（仅 App 内可靠），外部环境提示复制/保存。 */
  window.WaiyuanQrActions = (function () {
    let panel = null;
    let imgRef = null;
    let styleInjected = false;

    function injectStyle() {
      if (styleInjected) return;
      styleInjected = true;
      const css = [
        '#wy-qr-sheet{position:fixed;left:0;right:0;bottom:0;z-index:10001;background:var(--card,#fdfaf3);border-top:1px solid var(--line,#e5ded2);border-radius:16px 16px 0 0;padding:14px 16px calc(14px + env(safe-area-inset-bottom,0));box-shadow:0 -4px 20px rgba(0,0,0,.12);display:flex;flex-direction:column;gap:10px;max-width:520px;margin:0 auto}',
        '#wy-qr-sheet[hidden]{display:none!important}',
        '#wy-qr-sheet .wy-qr-title{font-weight:700;font-size:15px;color:var(--ink,#17211f)}',
        '#wy-qr-sheet .wy-qr-btn{border:0;background:var(--cream,#f6f1e6);color:var(--ink,#17211f);padding:11px 12px;border-radius:10px;font-size:15px;text-align:center;cursor:pointer;width:100%}',
        '#wy-qr-sheet .wy-qr-btn:active{opacity:.85}',
        '#wy-qr-sheet .wy-qr-close{background:transparent;color:var(--muted,#6b7a73)}',
        'html[data-theme=dark] #wy-qr-sheet{background:#1e2426;border-color:#333c3f}',
        'html[data-theme=dark] #wy-qr-sheet .wy-qr-btn{background:#2a3437;color:#e8ece9}',
        'html[data-theme=dark] #wy-qr-sheet .wy-qr-title{color:#e8ece9}',
        'html[data-theme=dark] #wy-qr-sheet .wy-qr-close{color:#9aa9a4}'
      ].join('');
      const style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }

    function ensurePanel() {
      if (panel) return panel;
      injectStyle();
      panel = document.createElement('div');
      panel.id = 'wy-qr-sheet';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.hidden = true;
      panel.innerHTML = [
        '<div class="wy-qr-title">🔍 二维码操作</div>',
        '<button type="button" class="wy-qr-btn" data-wy-qr="save">💾 保存图片</button>',
        '<button type="button" class="wy-qr-btn" data-wy-qr="wechat">📱 用微信扫一扫</button>',
        '<button type="button" class="wy-qr-btn wy-qr-close" data-wy-qr="close">关闭</button>'
      ].join('');
      panel.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-wy-qr]');
        if (!btn) return;
        const act = btn.dataset.wyQr;
        if (act === 'close') { panel.hidden = true; return; }
        if (act === 'save') saveImage(); else if (act === 'wechat') wechatScan();
      });
      document.body.appendChild(panel);
      return panel;
    }

    function toast(msg, isError) {
      let t = document.getElementById('wy-qr-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'wy-qr-toast';
        t.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:10002;background:rgba(23,33,31,.9);color:#fff;padding:9px 14px;border-radius:10px;font-size:14px;max-width:80%;text-align:center;pointer-events:none';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.background = isError ? 'rgba(179,38,30,.92)' : 'rgba(23,33,31,.9)';
      clearTimeout(toast._t);
      toast._t = setTimeout(() => { t.hidden = true; }, 3200);
      t.hidden = false;
    }

    function saveImage() {
      if (!imgRef || !imgRef.src) return;
      const src = imgRef.src;
      // 2026-08-29 安全加固：与原生 MainActivity.safeFileName 对齐，控制字符一并替换
      const name = (imgRef.alt || '二维码').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_') + '.png';
      const nd = window.WaiyuanNativeDownload;
      const save = (blob) => {
        if (blob && nd && nd.isNative && nd.isNative() && nd.saveBlob) {
          nd.saveBlob(name, blob).then(ok => {
            toast(ok ? '已保存到手机「下载」目录' : '保存失败，可长按图片或截图保存', !ok);
          }).catch(() => toast('保存失败，可长按图片或截图保存', true));
          return;
        }
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast('已开始保存图片（未生效可长按图片保存）');
          return;
        }
        toast('图片暂不支持保存，请截图保存', true);
      };
      if (src.indexOf('data:') === 0) {
        if (nd && nd.isNative && nd.isNative() && nd.saveDataUrl) {
          const saved = nd.saveDataUrl(name, src) === true;
          toast(saved ? '已保存到手机「下载」目录' : '保存失败，可长按图片或截图保存', !saved);
          return;
        }
        // 浏览器：a[download] 支持 dataURL
        const a = document.createElement('a');
        a.href = src; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        toast('已开始保存图片（未生效可长按图片保存）');
        return;
      }
      fetch(src).then(r => { if (!r.ok) throw new Error('fetch ' + r.status); return r.blob(); }).then(save).catch(() => toast('图片加载失败，请截图保存', true));
    }

    function wechatScan() {
      const bridge = window.WaiyuanNativeBridge;
      if (bridge && bridge.isNative && bridge.isNative() && bridge.openExternal) {
        if (bridge.openExternal('weixin://scanqrcode')) {
          toast('已尝试打开微信扫一扫；若无反应请保存图片后到微信识别');
          return;
        }
        toast('当前环境无法直接唤起微信扫一扫，请保存图片后到微信识别', true);
        return;
      }
      toast('请保存图片后到微信「扫一扫」→「相册」识别', true);
    }

    function show(img) {
      imgRef = img;
      ensurePanel();
      panel.hidden = false;
    }

    function hide() {
      if (panel) panel.hidden = true;
    }

    function bind(img) {
      if (!img || img.__wyQrBound) return;
      img.__wyQrBound = true;
      let timer = null;
      const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
      img.addEventListener('contextmenu', (ev) => { ev.preventDefault(); show(img); });
      // 具备原生图片长按能力的知识共享 APK 由 MainActivity 接管，
      // 避免同一次长按同时弹出网页面板和原生保存菜单；普通浏览器仍走下方 JS 逻辑。
      let nativeImageLongPress = false;
      try {
        nativeImageLongPress = !!(window.NativeSave
          && typeof window.NativeSave.supportsImageLongPress === 'function'
          && window.NativeSave.supportsImageLongPress());
      } catch (_) {}
      if (nativeImageLongPress) return;
      // 2026-08-25：Android WebView 长按图片默认弹系统菜单（约 500ms 接管），
      // 会抢占我们的 JS 长按计时器 → 必须非 passive + preventDefault 拦截系统长按菜单
      img.addEventListener('touchstart', (ev) => { ev.preventDefault(); cancel(); timer = setTimeout(() => show(img), 600); }, { passive: false });
      ['touchmove', 'touchend', 'touchcancel'].forEach(evt => img.addEventListener(evt, cancel, { passive: true }));
    }

    function autoBind() {
      document.querySelectorAll('img[data-qr]').forEach(bind);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoBind);
    } else {
      autoBind();
    }
    return { bind: bind, show: show, hide: hide, autoBind: autoBind };
  })();

  /* ---------- Service Worker (PWA 离线缓存) ---------- */
  // App 内（Capacitor WebView）不注册 Service Worker：SW 的缓存策略
  // 会让 App 端长期命中旧缓存文件（长按二维码/图片更新一直不生效），
  // 而 App 每次冷启动都会重新拉取线上页面，不需要 PWA 离线缓存。
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    if (isNativeApp()) {
      console.info('[PWA] App 内不注册 Service Worker，内容走网络最新版');
      // 清除 App 内历史遗留的 Service Worker 与缓存（旧版曾注册，导致长期命中旧文件）
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          navigator.serviceWorker.getRegistrations().then(function (list) {
            list.forEach(function (rg) { try { rg.unregister(); } catch (e) {} });
          });
        }
        if (window.caches && caches.keys) {
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          });
        }
      } catch (e) { /* 清理失败不影响使用 */ }
    } else {
      const tag = document.querySelector('script[data-common-injected]');
      const src = tag && tag.src;
      if (src) {
        const swUrl = new URL('sw.js', src);
        window.addEventListener('load', () => {
          navigator.serviceWorker.register(swUrl).catch(err => { console.warn('Service Worker 注册失败（不影响页面使用）：', err); });
        });
      }
    }
  }
})();
