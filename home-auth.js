/* ============================================================
   主页账号入口（2026-08-22）：登录 / 注册 / 退出 + 恢复码保险箱
   依赖：学习中心/auth.js（window.WaiyuanAuth）、学习中心/cloud-sync.js（window.WaiyuanCloudSync）
   逻辑与学习中心/app.js 的 doAuthSubmit 保持一致（P0-2 自动绑定恢复码、保险箱异常保护）
   ============================================================ */
(() => {
  if (window.__WAIYUAN_HOME_AUTH__) return;
  window.__WAIYUAN_HOME_AUTH__ = true;
  const $ = id => document.getElementById(id);
  const auth = () => window.WaiyuanAuth;
  const cloud = () => window.WaiyuanCloudSync;
  let authMode = 'login';

  const setHint = (msg, isError) => {
    const hint = $('auth-hint');
    if (!hint) return;
    hint.textContent = msg;
    hint.style.color = isError ? '#b3261e' : '';
  };
  const showPanel = hide => { const p = $('auth-panel'); if (p) p.classList.toggle('hidden', !!hide); };  // 主页 modal 用 .hidden class 控制
  const setAuthMode = mode => {
    authMode = mode;
    document.querySelectorAll('[data-auth-tab]').forEach(t => t.classList.toggle('active', t.dataset.authTab === mode));
    const nickname = $('auth-nickname-input');
    if (nickname) nickname.hidden = mode !== 'register';
    const submit = $('auth-submit-btn');
    if (submit) submit.textContent = mode === 'register' ? '注册' : '登录';
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
      email.textContent = '👤 ' + (session.user.nickname || session.user.email);
      logoutBtn.hidden = false;
      showPanel(true);
    } else {
      openBtn.hidden = false;
      email.hidden = true;
      logoutBtn.hidden = true;
    }
  };
  /** 登录/注册后：把旧匿名恢复码数据迁移到账号（无数据/账号已有数据则跳过，静默） */
  const tryMigrate = async code => {
    try {
      const c = cloud();
      if (!c || !c.migrateAnonymous) return '';
      const result = await c.migrateAnonymous(code || c.loadCode());
      return result && result.status === 'migrated' ? '原匿名数据已自动迁移到账号。' : '';
    } catch (_) { return ''; }
  };
  const doAuthSubmit = async () => {
    if (!auth()) { setHint('账号模块未加载，请刷新页面重试。', true); return; }
    const email = ($('auth-email-input')?.value || '').trim();
    const password = $('auth-password-input')?.value || '';
    const nickname = ($('auth-nickname-input')?.value || '').trim();
    if (!email || !password) { setHint('请输入邮箱和密码。', true); return; }
    const submit = $('auth-submit-btn');
    if (submit) submit.disabled = true;
    try {
      let migratedNote = '';
      if (authMode === 'register') {
        let code = cloud() && cloud().loadCode ? cloud().loadCode() : '';
        if (!code && cloud() && cloud().createCode) {
          code = cloud().createCode();
          cloud().saveCode(code);
        }
        const recovery = code ? await auth().lockRecovery(password, code) : null;
        const result = await auth().register({ email, password, nickname: nickname || undefined, recovery });
        auth().saveSession(result);
        if (cloud() && cloud().setAuth) cloud().setAuth(result.token, result.user.id);
        migratedNote = await tryMigrate(code);
        setHint('注册成功，已登录。' + (recovery ? '本机恢复码已加密存入账号，换设备登录即可解锁云端数据。' : '建议到学习中心做一次云端备份以生成恢复码。') + migratedNote);
      } else {
        const result = await auth().login({ email, password });
        auth().saveSession(result);
        if (cloud() && cloud().setAuth) cloud().setAuth(result.token, result.user.id);
        let unlocked = false, broken = false;
        let localCode = cloud() && cloud().loadCode ? cloud().loadCode() : '';
        if (result.recovery) {
          try {
            const code = await auth().unlockRecovery(password, result.recovery);
            if (cloud() && cloud().saveCode) cloud().saveCode(code);
            localCode = code;
            unlocked = true;
            migratedNote = await tryMigrate(code);
          } catch (_) {
            broken = true;  // 密码已通过服务端验证，解不开 = 保险箱数据异常，与「未绑定」严格区分
          }
        } else {
          // 账号从未绑定保险箱：用登录密码把本机恢复码（没有则新生成）绑定到账号
          if (!localCode && cloud() && cloud().createCode) {
            localCode = cloud().createCode();
            cloud().saveCode(localCode);
          }
          if (localCode) {
            try {
              const box = await auth().lockRecovery(password, localCode);
              await auth().setRecovery(result.token, box);
            } catch (_) { /* 绑定失败不阻断登录；备份时若账号云端无数据仍可继续 */ }
          }
        }
        if (broken) {
          setHint('登录成功，但恢复码保险箱异常（解密失败），已暂停自动备份以防覆盖云端数据。请到学习中心「导出学习数据」保存本机数据，并联系管理员检查账号。', true);
        } else {
          setHint('登录成功。' + (unlocked ? '云端恢复码已解锁，到学习中心可点「云端恢复」取回学习数据。' : '该账号尚未绑定恢复码，可到学习中心做一次云端备份。') + migratedNote);
        }
      }
      showPanel(true);
      refreshAuthBar();
      ['auth-email-input', 'auth-password-input', 'auth-nickname-input'].forEach(id => { const n = $(id); if (n) n.value = ''; });
    } catch (error) {
      setHint('操作失败：' + (error && error.message ? error.message : '网络错误') + '。', true);
    } finally {
      if (submit) submit.disabled = false;
    }
  };
  const doAuthLogout = async () => {
    const session = auth() && auth().getSession ? auth().getSession() : null;
    try { if (session && auth()) await auth().logout(session.token); } catch (_) {}
    if (auth()) auth().clearSession();
    if (cloud() && cloud().clearAuth) cloud().clearAuth();
    refreshAuthBar();
    setHint('已退出登录。');
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'auth-open') { setAuthMode('login'); setHint(''); showPanel(false); }
    else if (action === 'close-auth') showPanel(true);
    else if (action === 'auth-submit') doAuthSubmit();
    else if (action === 'auth-logout') doAuthLogout();
  });
  document.querySelectorAll('[data-auth-tab]').forEach(t => t.addEventListener('click', () => setAuthMode(t.dataset.authTab)));
  refreshAuthBar();
})();
