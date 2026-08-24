/* 外院互助 - app.js（依赖 ../学习中心/auth.js 的 WaiyuanAuth） */
(function () {
  const auth = window.WaiyuanAuth;
  const shareCard = window.WaiyuanErrandShareCard;
  const API = (window.WAIYUAN_API_BASE || 'https://api.free60127.top');
  let me = null;            // {token, id, nickname}
  let currentShareTask = null; // 最近打开的详情任务（分享任务卡用）
  let detailReady;
  let shareType = 'platform';   // platform | task
  let pubCategory = '';       // 发布弹窗已选分类（pickup-food/pickup-parcel/sell-item/request-info/other）
  let pubImages = [];         // 发布弹窗已选图片 dataURL（≤3 张）
  const CAT_LABELS = { 'pickup-food': '取外卖', 'pickup-parcel': '取快递', 'sell-item': '出闲置', 'request-info': '求资料', other: '其他' };
  window.errandCatLabels = CAT_LABELS; // 详情模块共享
  let tab = 'open';
  let page = 1;
  let total = 0;
  const PAGE_SIZE = 20;
  const $ = (id) => document.getElementById(id);

  const STATUS = {
    open: ['待接单', 'st-open'],
    doing: ['进行中', 'st-doing'],
    done: ['已完成', 'st-done'],
    cancelled: ['已取消', 'st-cancelled'],
  };

  /* ---------- 暗色主题（与主站同键 waiyuan-web-theme-v1） ---------- */
  const THEME_KEY = 'waiyuan-web-theme-v1';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
  }
  function initTheme() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  let toastTimer = null;
  function toast(msg, isErr) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }
  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }

  /* ---------- 会话 ---------- */
  async function refreshMe() {
    const session = auth.getSession();
    if (!session || !session.token) { me = null; renderAuthBar(); return; }
    try {
      const data = await auth.me(session.token);
      const u = data && (data.user || data);
      me = u && u.id ? { token: session.token, id: u.id, nickname: u.nickname || u.email } : { token: session.token, id: null, nickname: null };
    } catch (_) {
      me = null; // token 失效/网络失败：不信任旧缓存，视为未登录
    }
    renderAuthBar();
  }
  function renderAuthBar() {
    const openBtn = $('auth-open-btn'), emailBtn = $('auth-email'), logoutBtn = $('auth-logout-btn');
    if (me && me.id) {
      openBtn.classList.add('hidden');
      emailBtn.textContent = '👤 ' + me.nickname;
      emailBtn.classList.remove('hidden');
      logoutBtn.classList.remove('hidden');
    } else {
      openBtn.classList.remove('hidden');
      emailBtn.classList.add('hidden');
      logoutBtn.classList.add('hidden');
    }
  }

  /* ---------- API ---------- */
  async function api(path, opts) {
    const headers = { 'Content-Type': 'application/json' };
    if (me && me.token) headers['Authorization'] = 'Bearer ' + me.token;
    const res = await fetch(API + path, Object.assign({ headers }, opts || {}));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && body && body.error === 'unauthorized') {
        auth.clearSession(); me = null; renderAuthBar();
      }
      throw new Error(body && body.error ? body.error : 'HTTP ' + res.status);
    }
    return body;
  }

  /* 受保护二进制端点（证据图片）：带 Bearer 拉 blob，供 img.src objectURL 展示（2026-08-23 审查第 6 项闭环） */
  async function apiBlob(path) {
    const headers = {};
    if (me && me.token) headers['Authorization'] = 'Bearer ' + me.token;
    const res = await fetch(API + path, { headers });
    if (!res.ok) {
      if (res.status === 401) { auth.clearSession(); me = null; renderAuthBar(); }
      throw new Error('HTTP ' + res.status);
    }
    return res.blob();
  }

  /* 证据图片 objectURL 生命周期（2026-08-23 审查第 2 轮第 4 项）：
     登记创建的所有 objectURL；容器被重新渲染/更新时 revoke 其中不再使用的 URL；
     页面卸载（pagehide/beforeunload）统一 revoke，避免 WebView/Safari 内存泄漏。
     仅隐藏（wrap.hidden=true）不撤销——图片仍会再次显示。 */
  const liveObjectUrls = new Set();
  function registerObjectUrl(u) { if (u) liveObjectUrls.add(u); }
  function revokeContainerUrls(container) {
    if (!container) return;
    container.querySelectorAll('img[data-obj-url]').forEach(img => {
      const u = img.getAttribute('data-obj-url');
      if (u && liveObjectUrls.has(u)) {
        try { URL.revokeObjectURL(u); } catch (_) {}
        liveObjectUrls.delete(u);
      }
    });
  }
  function revokeAllObjectUrls() {
    for (const u of liveObjectUrls) { try { URL.revokeObjectURL(u); } catch (_) {} }
    liveObjectUrls.clear();
  }
  window.addEventListener('pagehide', revokeAllObjectUrls);
  window.addEventListener('beforeunload', revokeAllObjectUrls);

  /* ---------- 列表渲染 ---------- */
  function taskParams() {
    if (tab === 'open' || tab === 'doing' || tab === 'done') return 'status=' + tab;
    return null; // mine-posted / mine-taken
  }
  let listRequestId = 0;
  let loadingMore = false;
  async function loadList(append) {
    const listEl = $('task-list');
    const rid = ++listRequestId; // 2026-08-23：切 tab/刷新时旧响应作废，防止旧数据覆盖新列表
    if (!append) { listEl.innerHTML = '<div class="loading">加载中…</div>'; page = 1; }
    try {
      let path = '/api/errand/tasks?page=' + page + '&pageSize=' + PAGE_SIZE;
      const p = taskParams();
      if (p) path += '&' + p;
      else path = '/api/errand/mine?role=' + (tab === 'mine-posted' ? 'posted' : 'taken') + '&page=' + page + '&pageSize=' + PAGE_SIZE;
      const data = await api(path);
      if (rid !== listRequestId) return;
      total = data.total || 0;
      const items = data.items || [];
      if (!append) listEl.innerHTML = '';
      if (!items.length && page === 1) {
        $('empty').classList.remove('hidden');
      } else {
        $('empty').classList.add('hidden');
        items.forEach(t => listEl.insertAdjacentHTML('beforeend', cardHtml(t)));
      }
      const hasMore = listEl.children.length < total;
      $('load-more').classList.toggle('hidden', !hasMore);
    } catch (e) {
      if (rid !== listRequestId) return;
      if (page === 1) listEl.innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
      else toast(e.message, true);
    }
  }
  function cardHtml(t) {
    const expired = t.status === 'open' && t.deadline && t.deadline < Date.now();
    const st = expired ? ['已过期', 'st-cancelled'] : (STATUS[t.status] || ['未知', '']);
    const loc = (t.pickup || t.dropoff) ? '📍 ' + esc(t.pickup) + (t.dropoff ? ' → ' + esc(t.dropoff) : '') : '';
    const who = t.status === 'done' || t.status === 'doing' ? (t.takerName ? '👤 ' + esc(t.takerName) : '') : '👤 ' + esc(t.publisherName);
    const catIcon = { 'pickup-food': '🍜', 'pickup-parcel': '📦', 'sell-item': '🛍️', 'request-info': '📚', other: '✨' }[t.category] || '✨';
    const catLabel = (window.errandCatLabels && window.errandCatLabels[t.category]) || CAT_LABELS[t.category] || '其他';
    return '<div class="task-card" data-id="' + t.id + '">' +
      '<div class="tc-top"><span class="badge ' + st[1] + '">' + st[0] + '</span>' +
      '<span class="badge cat-badge">' + catIcon + ' ' + esc(catLabel) + '</span>' +
      '<span class="reward">¥' + esc(t.reward) + '</span></div>' +
      '<div class="tc-title">' + esc(t.title) + '</div>' +
      (loc ? '<div class="tc-meta">' + loc + '</div>' : '') +
      '<div class="tc-foot"><span>' + who + '</span><span>' + fmtTime(t.createdAt) + '</span></div>' +
      '</div>';
  }
  function bindCardClicks() {
    const listEl = $('task-list');
    listEl.addEventListener('click', e => {
      const card = e.target.closest('.task-card');
      if (card) openDetail(Number(card.dataset.id));
    });
  }

  /* ---------- 详情模块 ---------- */
  async function openDetail(id) {
    const detail = await detailReady;
    if (!detail) { toast('详情模块加载失败，请刷新页面重试', true); return; }
    return detail.openDetail(id);
  }

  /* ---------- 发布 ---------- */
  function renderPubCategory() {
    document.querySelectorAll('#cat-chips .cat-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === pubCategory);
    });
  }
  function renderPubThumbs() {
    const box = $('pub-preview');
    box.innerHTML = pubImages.map(function (d, i) {
      return '<div class="dp-thumb"><img src="' + d + '" alt="任务图片"><button type="button" class="dp-x" data-i="' + i + '">×</button></div>';
    }).join('');
    box.querySelectorAll('.dp-x').forEach(function (b) {
      b.addEventListener('click', function () {
        pubImages.splice(Number(b.dataset.i), 1);
        renderPubThumbs();
      });
    });
    $('pub-img-count').textContent = pubImages.length + ' / 3';
  }
  function compressPublishImage(dataUrl, done) {
    const img = new Image();
    img.onload = function () {
      try {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          const r = Math.min(MAX / w, MAX / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        let q = 0.85, out = cv.toDataURL('image/jpeg', q);
        while (out.length > 274400 && q > 0.4) { // 200KB 上限（base64 膨胀约 1.34x）
          q -= 0.15;
          out = cv.toDataURL('image/jpeg', q);
        }
        done(out);
      } catch (_) { toast('图片处理失败', true); }
    };
    img.onerror = function () { toast('图片读取失败', true); };
    img.src = dataUrl;
  }
  function handlePubFiles(e) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      if (pubImages.length >= 3) { toast('最多 3 张图片', true); break; }
      if (!/^image\//.test(f.type)) continue;
      const reader = new FileReader();
      reader.onload = function () {
        compressPublishImage(String(reader.result), function (dataUrl) {
          if (pubImages.length >= 3) return;
          pubImages.push(dataUrl);
          renderPubThumbs();
        });
      };
      reader.readAsDataURL(f);
    }
  }
  function openPublish() {
    if (!me || !me.id) { toast('请先登录', true); openAuthModal('login'); return; }
    pubCategory = '';
    pubImages = [];
    $('p-title').value = ''; $('p-desc').value = ''; $('p-reward').value = '';
    $('p-pickup').value = ''; $('p-dropoff').value = ''; $('p-contact').value = ''; $('p-deadline').value = '';
    $('pub-files').value = '';
    renderPubCategory();
    renderPubThumbs();
    $('pub-hint').textContent = '';
    openModal('publish-modal');
  }
  async function submitPublish() {
    const title = $('p-title').value.trim();
    const reward = $('p-reward').value.trim();
    const pickup = $('p-pickup').value.trim();
    const dropoff = $('p-dropoff').value.trim();
    const hint = $('pub-hint');
    if (!pubCategory) { hint.textContent = '请选择订单分类'; return; }
    if (!title) { hint.textContent = '请填写标题'; return; }
    if (!/^\d+$/.test(reward)) { hint.textContent = '赏金需为整数（元）'; return; }
    if (!pickup) { hint.textContent = '请填写取件地点'; return; }
    if (!dropoff) { hint.textContent = '请填写送达地点'; return; }
    if (!$('p-contact').value.trim()) { hint.textContent = '请填写联系方式（手机号 / 微信号）'; return; }
    const payload = {
      title, reward: Number(reward),
      description: $('p-desc').value.trim(),
      pickup, dropoff,
      contact: $('p-contact').value.trim(),
      category: pubCategory,
      images: pubImages.slice(),
    };
    const dl = $('p-deadline').value;
    if (dl) {
      const ts = new Date(dl).getTime();
      if (!Number.isFinite(ts)) { hint.textContent = '截止时间格式不对'; return; }
      payload.deadline = ts;
    }
    try {
      await api('/api/errand/tasks', { method: 'POST', body: JSON.stringify(payload) });
      closeModal('publish-modal');
      toast('发布成功！');
      if (tab !== 'open') { setTab('open'); } else { loadList(false); }
    } catch (e) { hint.textContent = e.message; }
  }

  /* ---------- 登录 / 注册 ---------- */
  let authView = 'login';
  function openAuthModal(view) {
    authView = view || 'login';
    renderAuthView();
    openModal('auth-modal');
  }
  function renderAuthView() {
    $('auth-title').textContent = authView === 'login' ? '登录' : '注册';
    $('auth-submit').textContent = authView === 'login' ? '登录' : '注册并登录';
    $('nick-field').hidden = authView !== 'register';
    $('auth-hint').textContent = '';
    document.querySelectorAll('#auth-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.aview === authView));
  }
  async function submitAuth() {
    const email = $('auth-email-input').value.trim();
    const password = $('auth-password-input').value;
    const hint = $('auth-hint');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { hint.textContent = '邮箱格式不正确'; return; }
    if (password.length < 8) { hint.textContent = '密码至少 8 位'; return; }
    const btn = $('auth-submit');
    btn.disabled = true;
    try {
      let result;
      if (authView === 'register') {
        // 2026-08-23 审查：注册响应已含会话 token，直接使用（原逻辑再 login 会创建两个会话）
        result = await auth.register({ email, password, nickname: $('auth-nick-input').value.trim() || email.split('@')[0] });
      } else {
        result = await auth.login({ email, password });
      }
      if (!result || !result.token) throw new Error('登录响应异常');
      auth.saveSession(result);
      me = { token: result.token, id: null, nickname: result.user && result.user.nickname ? result.user.nickname : email.split('@')[0] };
      try {
        const data = await auth.me(result.token);
        const u = data && (data.user || data);
        if (u && u.id) me = { token: result.token, id: u.id, nickname: u.nickname || u.email };
      } catch (_) {}
      closeModal('auth-modal');
      toast(authView === 'register' ? '注册成功，欢迎！' : '登录成功');
      renderAuthBar();
      loadList(false);
    } catch (e) {
      hint.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }
  async function doLogout() {
    try { if (me && me.token) await auth.logout(me.token); } catch (_) {}
    auth.clearSession();
    me = null;
    renderAuthBar();
    toast('已退出登录');
    loadList(false);
  }

  /* ---------- tab ---------- */
  function setTab(t) {
    tab = t;
    document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    loadList(false);
  }

  function renderShareTabs() {
    document.querySelectorAll('#share-tabs .tab').forEach(b => {
      b.disabled = b.dataset.stype === 'task' && !currentShareTask;
      b.classList.toggle('active', b.dataset.stype === shareType);
    });
  }
  async function renderSharePreview() {
    const box = $('share-preview');
    box.innerHTML = '<div class="loading">生成中…</div>';
    try {
      const cv = await shareCard.draw(shareType, currentShareTask, fmtTime);
      const img = document.createElement('img');
      img.src = cv.toDataURL('image/png');
      img.alt = '分享卡片';
      box.innerHTML = '';
      box.append(img);
    } catch (e) { box.innerHTML = '<div class="empty">生成失败：' + esc(e.message) + '</div>'; }
  }
  function openShareModal() {
    if (!window.qrcode || !shareCard) { toast('分享卡组件加载失败，请刷新重试', true); return; }
    shareCard.setQrUtf8();
    renderShareTabs();
    openModal('share-modal');
    renderSharePreview();
  }
  function saveShareCard() {
    const img = $('share-preview').querySelector('img');
    if (!img) return;
    const name = shareType === 'task' ? '外院互助任务卡.png' : '外院互助平台卡.png';
    const nd = window.WaiyuanNativeDownload;
    if (nd && nd.isNative && nd.isNative() && nd.saveDataUrl(name, img.src)) {
      toast('已保存到手机「下载」目录');
      return;
    }
    const a = document.createElement('a');
    a.href = img.src;
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    toast('已保存到相册 / 下载目录（未生效可长按图片保存）');
  }


  const _sv = (document.currentScript && document.currentScript.src || '').match(/[?&]v=([^#&]+)/);
  const _smv = _sv ? _sv[1] : '';
  detailReady = import('./detail.js' + (_smv ? '?v=' + encodeURIComponent(_smv) : ''))
    .then(({ createDetail }) => {
      const detail = createDetail({
        $, STATUS, esc, fmtTime, toast, openModal, closeModal, api, apiBlob,
        registerObjectUrl, revokeAllObjectUrls, revokeContainerUrls,
        getMe: () => me,
        openAuthModal,
        loadList,
        setShareTask: task => { currentShareTask = task; },
        apiBase: API,
      });
      detail.bindActions();
      return detail;
    })
    .catch(error => {
      console.error('errand detail module load error:', error);
      return null;
    });

  /* ---------- 事件绑定 ---------- */
  document.querySelectorAll('#tabs .tab').forEach(b => b.addEventListener('click', () => {
    if ((b.dataset.tab === 'mine-posted' || b.dataset.tab === 'mine-taken') && (!me || !me.id)) {
      toast('请先登录', true);
      openAuthModal('login');
      return;
    }
    setTab(b.dataset.tab);
  }));
  $('fab-publish').addEventListener('click', openPublish);
  $('pub-cancel').addEventListener('click', () => closeModal('publish-modal'));
  $('pub-submit').addEventListener('click', submitPublish);
  // 2026-08-24：分类单选 chips + 任务图片（自动压缩 ≤200KB，最多 3 张）
  document.getElementById('cat-chips').addEventListener('click', e => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    pubCategory = chip.dataset.cat;
    renderPubCategory();
  });
  $('pub-files').addEventListener('change', handlePubFiles);
  $('auth-open-btn').addEventListener('click', () => openAuthModal('login'));
  $('auth-email').addEventListener('click', () => { toast('当前登录：' + me.nickname); });
  $('auth-logout-btn').addEventListener('click', doLogout);
  $('auth-close').addEventListener('click', () => closeModal('auth-modal'));
  $('auth-submit').addEventListener('click', submitAuth);
  $('auth-password-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  document.querySelectorAll('#auth-tabs .tab').forEach(b => b.addEventListener('click', () => { authView = b.dataset.aview; renderAuthView(); }));
  $('load-more').addEventListener('click', () => {
    if (loadingMore) return;
    loadingMore = true;
    $('load-more').disabled = true;
    page++;
    loadList(true).then(() => { loadingMore = false; $('load-more').disabled = false; });
  });
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));
  // 分享卡片
  $('share-card-btn').addEventListener('click', openShareModal);
  $('share-cancel').addEventListener('click', () => closeModal('share-modal'));
  $('share-save').addEventListener('click', saveShareCard);
  document.querySelectorAll('#share-tabs .tab').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) { toast('请先打开一个任务详情再生成任务卡', true); return; }
    shareType = b.dataset.stype;
    renderShareTabs(); renderSharePreview();
  }));

  /* ---------- 添加到主屏幕（PWA 安装引导，与主页一致） ---------- */
  const installSite = $('install-site');
  const installBtn = $('install-btn');
  const installHint = $('install-hint');
  let deferredPrompt = null;
  if (installSite && installBtn) {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent || '');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (!isStandalone) {
      if (isIOS) {
        // 2026-08-23：iOS 无 APK 方案，「添加到主屏幕」是唯一近似 App 的入口
        installSite.hidden = false;
        installHint.textContent = isWeChat
          ? '仅 iOS 可用：微信内请先点右上角「···」→「在浏览器打开」，再用 Safari 点底部「分享」→「添加到主屏幕」'
          : '仅 iOS 可用：用 Safari 打开，点底部「分享」→「添加到主屏幕」，像 App 一样从桌面直接打开';
      } else {
        // 安卓/桌面：请用下方「下载安卓版 App」（APK 直装，体验更好）
        installSite.hidden = true;
      }
      window.addEventListener('appinstalled', () => { installSite.hidden = true; });
      installBtn.addEventListener('click', () => {
        alert('请打开 Safari 浏览器访问本站，点底部「分享」按钮，选择「添加到主屏幕」即可。');
      });
    }
  }

  // 2026-08-23：注册根站点 Service Worker（scope=/ 覆盖 /paotui/），满足 Chrome PWA 安装条件
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service Worker 注册失败（不影响使用）：', err));
  }

  /* ---------- init ---------- */
  initTheme();
  bindCardClicks();
  // 2026-08-23：分享卡二维码 ?task=ID 直达任务详情
  const taskParam = new URLSearchParams(location.search).get('task');
  const deepTaskId = taskParam ? Number(taskParam) : NaN;
  refreshMe().then(() => {
    loadList(false);
    if (Number.isInteger(deepTaskId) && deepTaskId > 0) openDetail(deepTaskId);
  });
})();
