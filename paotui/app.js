/* 外院跑腿 - app.js（依赖 ../学习中心/auth.js 的 WaiyuanAuth） */
(function () {
  const auth = window.WaiyuanAuth;
  const API = (window.WAIYUAN_API_BASE || 'https://api.free60127.top');
  let me = null;            // {token, id, nickname}
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
      me = session.user && session.user.id ? { token: session.token, id: session.user.id, nickname: session.user.nickname } : null;
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

  /* ---------- 列表渲染 ---------- */
  function taskParams() {
    if (tab === 'open' || tab === 'doing' || tab === 'done') return 'status=' + tab;
    return null; // mine-posted / mine-taken
  }
  async function loadList(append) {
    const listEl = $('task-list');
    if (!append) { listEl.innerHTML = '<div class="loading">加载中…</div>'; page = 1; }
    try {
      let path = '/api/errand/tasks?page=' + page + '&pageSize=' + PAGE_SIZE;
      const p = taskParams();
      if (p) path += '&' + p;
      else path = '/api/errand/mine?role=' + (tab === 'mine-posted' ? 'posted' : 'taken') + '&page=' + page + '&pageSize=' + PAGE_SIZE;
      const data = await api(path);
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
      if (!append) bindCardClicks(listEl);
    } catch (e) {
      if (page === 1) listEl.innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
      else toast(e.message, true);
    }
  }
  function cardHtml(t) {
    const st = STATUS[t.status] || ['未知', ''];
    const loc = (t.pickup || t.dropoff) ? '📍 ' + esc(t.pickup) + (t.dropoff ? ' → ' + esc(t.dropoff) : '') : '';
    const who = t.status === 'done' || t.status === 'doing' ? (t.takerName ? '👤 ' + esc(t.takerName) : '') : '👤 ' + esc(t.publisherName);
    return '<div class="task-card" data-id="' + t.id + '">' +
      '<div class="tc-top"><span class="badge ' + st[1] + '">' + st[0] + '</span>' +
      '<span class="reward">¥' + esc(t.reward) + '</span></div>' +
      '<div class="tc-title">' + esc(t.title) + '</div>' +
      (loc ? '<div class="tc-meta">' + loc + '</div>' : '') +
      '<div class="tc-foot"><span>' + who + '</span><span>' + fmtTime(t.createdAt) + '</span></div>' +
      '</div>';
  }
  function bindCardClicks(listEl) {
    listEl.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', () => openDetail(Number(card.dataset.id)));
    });
  }

  /* ---------- 详情 ---------- */
  async function openDetail(id) {
    const bodyEl = $('detail-body');
    bodyEl.innerHTML = '<div class="loading">加载中…</div>';
    openModal('detail-modal');
    try {
      const data = await api('/api/errand/tasks/' + id);
      renderDetail(data.task);
    } catch (e) {
      bodyEl.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    }
  }
  function renderDetail(t) {
    const bodyEl = $('detail-body');
    const st = STATUS[t.status] || ['未知', ''];
    const isPublisher = me && me.id && t.publisherId === me.id;
    const isTaker = me && me.id && t.takerId === me.id;
    let actions = '';
    if (t.status === 'open') {
      if (isPublisher) actions += '<button class="btn danger" data-act="cancel">取消任务</button>';
      else if (me && me.id) actions += '<button class="btn primary big" data-act="take">立即接单 ¥' + esc(t.reward) + '</button>';
      else actions += '<button class="btn primary big" data-act="need-login">登录后接单</button>';
    } else if (t.status === 'doing') {
      if (isTaker) actions += '<button class="btn primary" data-act="complete">标记完成（已送达）</button><button class="btn danger" data-act="cancel">取消接单</button>';
      else if (isPublisher) actions += '<button class="btn danger" data-act="cancel">取消任务</button>';
      else actions += '<span class="muted">进行中…</span>';
    } else if (t.status === 'done') {
      if (isPublisher && !t.confirmedAt) actions += '<button class="btn primary" data-act="confirm">确认完成（结算）</button>';
      else actions += '<span class="muted">' + (t.confirmedAt ? '✅ 双方确认完成' : '已完成，等待发布者确认') + '</span>';
    } else {
      actions += '<span class="muted">' + esc(t.cancelReason || '已取消') + '</span>';
    }
    bodyEl.innerHTML =
      '<div class="detail-head"><span class="badge ' + st[1] + '">' + st[0] + '</span><span class="reward big">¥' + esc(t.reward) + '</span></div>' +
      '<h3 class="detail-title">' + esc(t.title) + '</h3>' +
      (t.description ? '<p class="detail-desc">' + esc(t.description).replace(/\n/g, '<br>') + '</p>' : '') +
      '<div class="detail-rows">' +
      (t.pickup ? row('📦 取件', t.pickup) : '') +
      (t.dropoff ? row('🏁 送达', t.dropoff) : '') +
      row('👤 发布者', t.publisherName) +
      (t.takerName ? row('🛵 接单者', t.takerName) : '') +
      (t.contact ? row('📞 联系', t.contact) : '') +
      (t.deadline ? row('⏰ 截止', fmtTime(t.deadline)) : '') +
      row('🕐 发布时间', fmtTime(t.createdAt)) +
      (t.completedAt ? row('✅ 完成时间', fmtTime(t.completedAt)) : '') +
      '</div>' +
      '<div class="detail-actions">' + actions + '</div>' +
      '<button class="btn ghost full" data-act="close">关闭</button>';
    bodyEl.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => handleDetailAction(btn.dataset.act, t));
    });
  }
  function row(label, val) {
    return '<div class="drow"><span class="dlabel">' + label + '</span><span class="dval">' + esc(val) + '</span></div>';
  }
  async function handleDetailAction(act, t) {
    if (act === 'close') { closeModal('detail-modal'); return; }
    if (act === 'need-login') { closeModal('detail-modal'); openAuthModal('login'); return; }
    const confirmText = {
      take: '确认接单？接单后请尽快联系发布者。',
      complete: '确认已送达并完成？',
      confirm: '确认任务已完成，与接单者结算？',
      cancel: t.status === 'doing' ? '确定取消？进行中取消请先和对方沟通。' : '确定取消该任务？',
    }[act];
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const data = await api('/api/errand/tasks/' + t.id + '/' + act, { method: 'POST', body: JSON.stringify({}) });
      toast({ take: '接单成功！', complete: '已标记完成，等发布者确认', confirm: '已确认完成，感谢使用！', cancel: '任务已取消' }[act] || '操作成功');
      renderDetail(data.task);
      loadList(true);
    } catch (e) {
      toast(e.message, true);
      openDetail(t.id); // 刷新详情（可能是状态已变化）
    }
  }

  /* ---------- 发布 ---------- */
  function openPublish() {
    if (!me || !me.id) { toast('请先登录', true); openAuthModal('login'); return; }
    $('p-title').value = ''; $('p-desc').value = ''; $('p-reward').value = '';
    $('p-pickup').value = ''; $('p-dropoff').value = ''; $('p-contact').value = ''; $('p-deadline').value = '';
    $('pub-hint').textContent = '';
    openModal('publish-modal');
  }
  async function submitPublish() {
    const title = $('p-title').value.trim();
    const reward = $('p-reward').value.trim();
    const pickup = $('p-pickup').value.trim();
    const dropoff = $('p-dropoff').value.trim();
    const hint = $('pub-hint');
    if (!title) { hint.textContent = '请填写标题'; return; }
    if (!/^\d+$/.test(reward)) { hint.textContent = '赏金需为整数（元）'; return; }
    const payload = {
      title, reward: Number(reward),
      description: $('p-desc').value.trim(),
      pickup, dropoff,
      contact: $('p-contact').value.trim(),
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
      if (authView === 'register') {
        await auth.register({ email, password, nickname: $('auth-nick-input').value.trim() || email.split('@')[0] });
      }
      const result = await auth.login({ email, password });
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
  $('auth-open-btn').addEventListener('click', () => openAuthModal('login'));
  $('auth-email').addEventListener('click', () => { toast('当前登录：' + me.nickname); });
  $('auth-logout-btn').addEventListener('click', doLogout);
  $('auth-close').addEventListener('click', () => closeModal('auth-modal'));
  $('auth-submit').addEventListener('click', submitAuth);
  $('auth-password-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  document.querySelectorAll('#auth-tabs .tab').forEach(b => b.addEventListener('click', () => { authView = b.dataset.aview; renderAuthView(); }));
  $('load-more').addEventListener('click', () => { page++; loadList(true); });
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));

  /* ---------- init ---------- */
  refreshMe().then(() => loadList(false));
})();