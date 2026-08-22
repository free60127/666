/* ============================================================
   会员中心（2026-08-22 路线 C：payjs 微信扫码支付）
   依赖：学习中心/auth.js（window.WaiyuanAuth）、qrcode.js（window.qrcode）
   流程：登录 → 点开通 → /api/pay/create 得二维码 → 轮询 /api/pay/status → 自动开通
   ============================================================ */
(() => {
  if (window.__WAIYUAN_MEMBER_APP__) return;
  window.__WAIYUAN_MEMBER_APP__ = true;
  const $ = id => document.getElementById(id);
  const API = (window.WAIYUAN_API_BASE || 'https://api.free60127.top').replace(/\/$/, '');
  const auth = () => window.WaiyuanAuth;
  let authMode = 'login';
  let pollTimer = null;

  const toast = msg => {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 3200);
  };

  const apiFetch = async (path, options) => {
    const token = auth() && auth().getSession ? auth().getSession() : null;
    const headers = options && options.headers ? options.headers : {};
    if (token && token.token) headers.Authorization = 'Bearer ' + token.token;
    const res = await fetch(API + path, Object.assign({ headers }, options));
    const body = await res.json().catch(() => null);
    if (res.status === 401 && body && body.error === 'unauthorized' && auth() && auth().clearSession) {
      auth().clearSession();
      refreshAuthBar();
    }
    return { status: res.status, body };
  };

  /* ---------- 登录 ---------- */
  const setAuthMode = mode => {
    authMode = mode;
    document.querySelectorAll('[data-atab]').forEach(t => t.classList.toggle('active', t.dataset.atab === mode));
    const nickname = $('auth-nickname-input');
    if (nickname) nickname.hidden = mode !== 'register';
    const submit = $('auth-submit-btn');
    if (submit) submit.textContent = mode === 'register' ? '注册' : '登录';
  };
  const showAuthModal = show => { const p = $('auth-modal'); if (p) p.hidden = !show; };
  const setHint = (msg, isError) => {
    const h = $('auth-hint');
    if (!h) return;
    h.textContent = msg;
    h.style.color = isError ? 'var(--danger)' : '';
  };
  const refreshAuthBar = () => {
    const session = auth() && auth().getSession ? auth().getSession() : null;
    const openBtn = $('auth-open-btn');
    const email = $('auth-email');
    const logoutBtn = $('auth-logout-btn');
    if (!openBtn || !email || !logoutBtn) return;
    if (session && session.user) {
      openBtn.hidden = true;
      email.hidden = false;
      email.textContent = '👤 ' + (session.user.nickname || session.user.email || '');
      logoutBtn.hidden = false;
      showAuthModal(false);
    } else {
      openBtn.hidden = false;
      email.hidden = true;
      logoutBtn.hidden = true;
    }
  };
  const doAuthSubmit = async () => {
    const email = ($('auth-email-input') && $('auth-email-input').value || '').trim();
    const password = ($('auth-password-input') && $('auth-password-input').value) || '';
    const nickname = ($('auth-nickname-input') && $('auth-nickname-input').value || '').trim();
    if (!email || !password) { setHint('请输入邮箱和密码。', true); return; }
    const submit = $('auth-submit-btn');
    if (submit) submit.disabled = true;
    try {
      const result = authMode === 'register'
        ? await auth().register({ email, password, nickname: nickname || undefined })
        : await auth().login({ email, password });
      auth().saveSession(result);
      setHint(authMode === 'register' ? '注册成功，已登录。' : '登录成功。');
      refreshAuthBar();
      loadMember();
      setTimeout(() => showAuthModal(false), 600);
    } catch (err) {
      const msg = err && err.message ? err.message : '操作失败，请重试';
      setHint(msg, true);
    } finally {
      if (submit) submit.disabled = false;
    }
  };
  const doLogout = async () => {
    try {
      const session = auth() && auth().getSession ? auth().getSession() : null;
      if (session && session.token && auth().logout) await auth().logout(session.token);
    } catch (_) {}
    if (auth() && auth().clearSession) auth().clearSession();
    refreshAuthBar();
    loadMember();
  };

  /* ---------- 会员状态 ---------- */
  const fmtDate = ts => {
    if (!ts) return '—';
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  const loadMember = async () => {
    const statusValue = $('status-value');
    const statusSub = $('status-sub');
    const buyBtn = $('buy-btn');
    const session = auth() && auth().getSession ? auth().getSession() : null;
    if (!session || !session.token) {
      if (statusValue) statusValue.textContent = '未登录';
      if (statusSub) statusSub.textContent = '登录后即可开通会员';
      if (buyBtn) buyBtn.textContent = '登录后开通';
      return;
    }
    const r = await apiFetch('/api/pay/me');
    if (r.status === 200 && r.body) {
      const isMember = r.body.isMember === true;
      if (statusValue) {
        statusValue.textContent = isMember ? '已开通' : '未开通';
        statusValue.style.color = isMember ? 'var(--green)' : 'var(--danger)';
      }
      if (statusSub) {
        statusSub.textContent = isMember
          ? '有效期至 ' + fmtDate(r.body.memberUntil) + '（续费自动顺延）'
          : '开通后 30 天有效，全站会员专享内容畅享';
      }
      if (buyBtn) buyBtn.textContent = isMember ? '续费 30 天' : '立即开通';
      $('plan-card').hidden = false;
    } else if (r.status === 401) {
      if (statusValue) statusValue.textContent = '未登录';
    }
  };

  /* ---------- 支付 ---------- */
  const renderQr = content => {
    const box = $('pay-qr');
    if (!box) return;
    box.innerHTML = '';
    if (!window.qrcode) { box.textContent = '二维码组件加载失败'; return; }
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
    const q = window.qrcode(0, 'M');
    q.addData(content);
    q.make();
    box.innerHTML = q.createImgTag(6, 12);
  };
  const stopPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
  const pollPayment = outTradeNo => {
    stopPoll();
    let tries = 0;
    pollTimer = setInterval(async () => {
      tries++;
      try {
        const r = await apiFetch('/api/pay/status?out_trade_no=' + encodeURIComponent(outTradeNo));
        if (r.status === 200 && r.body && r.body.status === 'paid') {
          stopPoll();
          $('pay-modal').hidden = true;
          toast('🎉 开通成功！有效期至 ' + fmtDate(r.body.memberUntil));
          loadMember();
          return;
        }
        if (r.status === 200 && r.body && r.body.status === 'closed') {
          stopPoll();
          $('pay-modal').hidden = true;
          toast('订单已过期，请重新发起支付');
          return;
        }
      } catch (_) {}
      if (tries >= 150) { // 5 分钟上限
        stopPoll();
        $('pay-modal').hidden = true;
        toast('等待支付超时，若已付款请点击「我已支付 / 取消」重新查询');
        loadMember();
      }
    }, 2000);
  };
  const doBuy = async () => {
    const session = auth() && auth().getSession ? auth().getSession() : null;
    if (!session || !session.token) { showAuthModal(true); setHint('请先登录后再开通会员。', true); return; }
    const btn = $('buy-btn');
    if (btn) btn.disabled = true;
    try {
      const r = await apiFetch('/api/pay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'member30' }),
      });
      if (r.status === 200 && r.body && r.body.qrcode) {
        $('pay-amount').textContent = '¥' + (r.body.totalFee / 100).toFixed(2);
        renderQr(r.body.qrcode);
        $('pay-modal').hidden = false;
        pollPayment(r.body.outTradeNo);
      } else {
        toast((r.body && r.body.error) || '下单失败，请稍后再试');
      }
    } catch (_) {
      toast('网络异常，请稍后再试');
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  /* ---------- 事件 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const open = $('auth-open-btn');
    if (open) open.addEventListener('click', () => { setAuthMode('login'); setHint(''); showAuthModal(true); });
    const logoutBtn = $('auth-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
    const submit = $('auth-submit-btn');
    if (submit) submit.addEventListener('click', doAuthSubmit);
    document.querySelectorAll('[data-atab]').forEach(t => t.addEventListener('click', () => setAuthMode(t.dataset.atab)));
    const emailInput = $('auth-email-input');
    const pwdInput = $('auth-password-input');
    if (emailInput) emailInput.addEventListener('keydown', e => { if (e.key === 'Enter' && submit) submit.click(); });
    if (pwdInput) pwdInput.addEventListener('keydown', e => { if (e.key === 'Enter' && submit) submit.click(); });
    const buy = $('buy-btn');
    if (buy) buy.addEventListener('click', doBuy);
    const cancel = $('pay-cancel');
    if (cancel) cancel.addEventListener('click', () => {
      stopPoll();
      $('pay-modal').hidden = true;
      loadMember(); // 兜底：已支付但轮询被关 → 刷新状态（服务端查单）
    });
    const mask = $('auth-modal');
    if (mask) mask.addEventListener('click', e => { if (e.target === mask) showAuthModal(false); });
    refreshAuthBar();
    loadMember();
  });
})();
