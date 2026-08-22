/* ============================================================
   会员门禁（2026-08-22 路线 C）：页面 <body data-member-only="1"> 时启用
   未登录 → 引导登录；已登录非会员 → 引导开通；会员 → 无操作放行
   用法：在需要收费的页面 body 加 data-member-only="1" 并引入本脚本
        <script defer src="../member-gate.js?v=..."></script>
   依赖：学习中心/auth.js（动态加载，路径按页面层级自动推导）
   ============================================================ */
(() => {
  if (window.__WAIYUAN_MEMBER_GATE__) return;
  window.__WAIYUAN_MEMBER_GATE__ = true;
  const body = document.body;
  if (!body || body.dataset.memberOnly !== '1') return;

  const segs = location.pathname.split('/').filter(Boolean);
  const depth = Math.max(0, segs.length - 1);
  const prefix = depth > 0 ? '../'.repeat(depth) : '';
  const API = (window.WAIYUAN_API_BASE || 'https://api.free60127.top').replace(/\/$/, '');

  const style = document.createElement('style');
  style.textContent = [
    '#member-gate{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;',
    'background:rgba(10,20,16,.82);backdrop-filter:blur(6px);padding:20px}',
    '#member-gate .mg-box{background:#fff;border-radius:18px;padding:26px 24px;max-width:320px;width:100%;text-align:center;color:#1f2d28;',
    'box-shadow:0 10px 40px rgba(0,0,0,.35)}',
    '#member-gate .mg-icon{font-size:44px;line-height:1;margin-bottom:10px}',
    '#member-gate .mg-title{font-size:19px;font-weight:800;margin-bottom:8px}',
    '#member-gate .mg-desc{font-size:13px;color:#6b7a74;line-height:1.7;margin-bottom:18px}',
    '#member-gate .mg-btn{display:block;width:100%;padding:12px;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;',
    'background:#28634f;color:#fff;margin-bottom:10px;text-decoration:none}',
    '#member-gate .mg-btn.ghost{background:#eef4f1;color:#28634f;margin-bottom:0}',
    '#member-gate .mg-link{display:inline-block;margin-top:14px;font-size:12px;color:#9aa8a3;text-decoration:none}',
    'html[data-theme="dark"] #member-gate .mg-box{background:#171c1e;color:#e3e8e6}',
    'html[data-theme="dark"] #member-gate .mg-desc{color:#9aa8a3}',
    'html[data-theme="dark"] #member-gate .mg-btn.ghost{background:#1c2a25;color:#5bb98f}',
  ].join('');
  document.head.appendChild(style);

  const showGate = kind => {
    if (document.getElementById('member-gate')) return;
    const box = document.createElement('div');
    box.id = 'member-gate';
    const inner = document.createElement('div');
    inner.className = 'mg-box';
    inner.innerHTML =
      '<div class="mg-icon">🔒</div>' +
      '<div class="mg-title">会员专享内容</div>' +
      '<div class="mg-desc">' + (kind === 'login'
        ? '该内容需要登录后开通会员才能查看。登录后再次进入本页面即可解锁。'
        : '该内容为会员专享，开通全站会员（30 天）即可解锁全部会员题库。') + '</div>' +
      '<a class="mg-btn" href="' + prefix + '会员中心/index.html">' + (kind === 'login' ? '登录 / 注册' : '立即开通 ¥2') + '</a>' +
      '<a class="mg-btn ghost" href="' + prefix + 'index.html">返回首页</a>';
    box.appendChild(inner);
    document.body.appendChild(box);
  };

  const loadAuth = cb => {
    const s = document.createElement('script');
    s.src = prefix + '学习中心/auth.js?v=20260822-2236';
    s.onload = () => cb(true);
    s.onerror = () => cb(false);
    document.head.appendChild(s);
  };

  const check = () => {
    const auth = window.WaiyuanAuth;
    if (!auth) { showGate('login'); return; }
    const session = auth.getSession ? auth.getSession() : null;
    if (!session || !session.token) { showGate('login'); return; }
    fetch(API + '/api/pay/me', { headers: { Authorization: 'Bearer ' + session.token } })
      .then(r => r.json().catch(() => null))
      .then(data => {
        if (data && data.isMember === true) return; // 会员放行
        if (data && data.error === 'unauthorized' && auth.clearSession) auth.clearSession();
        showGate('buy');
      })
      .catch(() => showGate('buy'));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadAuth(check));
  } else {
    loadAuth(check);
  }
})();
