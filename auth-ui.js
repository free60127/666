/* ============================================================
   WaiyuanAuthUI —— 账号 UI 共享模块（2026-08-23 抽取）
   来源：学习中心/app.js 认证块 + home-auth.js（消除两处 500+ 行重复）
   依赖：学习中心/auth.js（window.WaiyuanAuth）、学习中心/cloud-sync.js（window.WaiyuanCloudSync）
   用法（页面在 auth.js/cloud-sync.js 之后加载本文件）：
     window.WaiyuanAuthUI.init({
       hint: (msg, isError) => { ... },        // 提示输出，必传（两页机制不同）
       panelMode: 'attribute' | 'class',       // auth-panel 显隐方式：hidden 属性（学习中心）或 .hidden class（主页）
       onCloudCodeRefresh: () => {},           // 可选：登录/注册后刷新云端恢复码展示
     });
     window.WaiyuanAuthUI.bindActions();        // 绑定 document 委托（data-action=auth-* / data-auth-tab）
   ============================================================ */
(() => {
  if (window.__WAIYUAN_AUTH_UI__) return;
  window.__WAIYUAN_AUTH_UI__ = true;

  const $ = id => document.getElementById(id);
  const auth = () => window.WaiyuanAuth;
  const cloud = () => window.WaiyuanCloudSync;

  let cfg = {
    hint: (msg, isError) => {
      const hint = $('auth-hint');
      if (!hint) return;
      hint.textContent = msg;
      hint.style.color = isError ? '#b3261e' : '';
    },
    panelMode: 'attribute',   // 默认：hidden 属性（学习中心）；主页传 'class'
    onCloudCodeRefresh: null,
    migrateNote: '原恢复码数据已自动迁移到账号。',
  };
  let authMode = 'login';
  let insuranceBroken = false;  // 账号恢复码保险箱解密失败（防覆盖云端数据）

  const setHint = (msg, isError) => { if (cfg.hint) cfg.hint(msg, isError); };
  /** show 语义：show=true 显示面板，false 隐藏（学习中心原版语义） */
  const showPanel = show => {
    const p = $('auth-panel');
    if (!p) return;
    if (cfg.panelMode === 'class') p.classList.toggle('hidden', !show);
    else p.hidden = !show;
  };
  const showAuthView = view => {
    const ids = { login: 'auth-login-view', forgot: 'auth-forgot-view', reset: 'auth-reset-view', manage: 'auth-manage-view' };
    Object.keys(ids).forEach(key => {
      const el = $(ids[key]);
      if (el) el.hidden = key !== view;
    });
  };
  const setAuthMode = mode => {
    authMode = mode;
    document.querySelectorAll('[data-auth-tab]').forEach(t => t.classList.toggle('active', t.dataset.authTab === mode));
    const nickname = $('auth-nickname-input');
    if (nickname) nickname.hidden = mode !== 'register';
    const submit = $('auth-submit-btn');
    if (submit) submit.textContent = mode === 'register' ? '注册' : '登录';
    showAuthView('login');
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
    } else {
      openBtn.hidden = false;
      email.hidden = true;
      logoutBtn.hidden = true;
    }
  };
  const notifyCloudCodeRefresh = () => { if (cfg.onCloudCodeRefresh) cfg.onCloudCodeRefresh(); };

  /** 登录/注册后：把旧匿名恢复码数据迁移到账号（无数据/账号已有数据则跳过，静默） */
  const tryMigrate = async code => {
    try {
      const c = cloud();
      if (!c || !c.migrateAnonymous) return '';
      const result = await c.migrateAnonymous(code || c.loadCode());
      return result && result.status === 'migrated' ? cfg.migrateNote : '';
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
        migratedNote = await tryMigrate(code);  // 注册前若有匿名备份则搬入账号
        setHint('注册成功，已登录。' + (recovery ? '本机恢复码已加密保存到账号，换设备登录即可解锁。' : '建议到学习中心做一次云端备份以生成恢复码。') + migratedNote);
        showPanel(false);
        notifyCloudCodeRefresh();
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
            notifyCloudCodeRefresh();
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
              notifyCloudCodeRefresh();
            } catch (_) { /* 绑定失败不阻断登录；备份时若账号云端无数据仍可继续 */ }
          }
        }
        insuranceBroken = broken;
        if (broken) {
          setHint('登录成功，但账号恢复码保险箱异常（解密失败）。为防覆盖云端数据已暂停自动备份：请先点「导出学习数据」保存本机数据，并联系管理员检查账号。', true);
        } else {
          setHint('登录成功。' + (unlocked ? '云端恢复码已解锁，可点「云端恢复」取回学习数据。' : '该账号尚未绑定恢复码，可用原恢复码手动恢复或做一次云端备份。') + migratedNote);
        }
        showPanel(false);
      }
      refreshAuthBar();
      ['auth-email-input', 'auth-password-input', 'auth-nickname-input'].forEach(id => { const n = $(id); if (n) n.value = ''; });
    } catch (error) {
      setHint('操作失败：' + (error && error.message ? error.message : '网络错误') + '。', true);
    } finally {
      if (submit) submit.disabled = false;
    }
  };

  const doAuthForgotSend = async () => {
    if (!auth()) { setHint('账号模块未加载，请刷新页面重试。', true); return; }
    const email = ($('auth-forgot-email')?.value || '').trim();
    if (!email) { setHint('请输入注册邮箱。', true); return; }
    const btn = $('auth-forgot-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
    try {
      await auth().forgot(email);
      setHint('验证码已发送（若该邮箱已注册）。请查收邮件。');
      const resetEmail = $('auth-reset-email');
      if (resetEmail) resetEmail.value = email;
      showAuthView('reset');
      $('auth-reset-code')?.focus();
    } catch (error) {
      setHint('发送失败：' + (error && error.message ? error.message : '网络错误') + '。', true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '发送验证码'; }
    }
  };

  const doAuthResetSubmit = async () => {
    if (!auth()) { setHint('账号模块未加载，请刷新页面重试。', true); return; }
    const email = ($('auth-reset-email')?.value || '').trim();
    const code = ($('auth-reset-code')?.value || '').trim();
    const newPassword = $('auth-reset-password')?.value || '';
    const recoveryInput = ($('auth-reset-recovery')?.value || '').trim();
    if (!email || !code || !newPassword) { setHint('请填写邮箱、验证码和新密码。', true); return; }
    if (newPassword.length < 8) { setHint('新密码至少 8 位。', true); return; }
    let recovery;
    if (recoveryInput) {
      try { recovery = await auth().lockRecovery(newPassword, recoveryInput); }
      catch (_) { setHint('恢复码格式无效（可留空跳过，但云端数据将需原恢复码解锁）。', true); return; }
    }
    const btn = $('auth-reset-submit-btn');
    if (btn) btn.disabled = true;
    try {
      const result = await auth().resetPassword({ email, code, newPassword, recovery });
      if (result && result.recoveryReset) {
        setHint('密码已重置。注意：云端数据需原恢复码才能解锁——请用原恢复码做云端恢复，或联系管理员。');
      } else {
        setHint('密码已重置，请用新密码登录。');
      }
      if (recoveryInput && cloud() && cloud().saveCode) cloud().saveCode(recoveryInput);
      showAuthView('login');
      ['auth-reset-email', 'auth-reset-code', 'auth-reset-password', 'auth-reset-recovery'].forEach(id => { const n = $(id); if (n) n.value = ''; });
    } catch (error) {
      setHint('重置失败：' + (error && error.message ? error.message : '网络错误') + '。', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  const doAuthChangePassword = async () => {
    if (!auth()) { setHint('账号模块未加载，请刷新页面重试。', true); return; }
    const session = auth().getSession ? auth().getSession() : null;
    if (!session || !session.token) { setHint('请先登录。', true); return; }
    const oldPassword = $('auth-old-password')?.value || '';
    const newPassword = $('auth-new-password')?.value || '';
    if (!oldPassword || !newPassword) { setHint('请输入当前密码和新密码。', true); return; }
    if (newPassword.length < 8) { setHint('新密码至少 8 位。', true); return; }
    const btn = $('auth-change-submit-btn');
    if (btn) btn.disabled = true;
    try {
      let recovery;
      const meData = await auth().me(session.token);
      if (meData && meData.recovery) {
        try {
          const code = await auth().unlockRecovery(oldPassword, meData.recovery);
          recovery = await auth().lockRecovery(newPassword, code);
        } catch (_) {
          setHint('恢复码保险箱解锁失败：请确认当前密码正确，或先在旧设备导出数据。', true);
          return;
        }
      }
      await auth().changePassword(session.token, { oldPassword, newPassword, recovery });
      setHint('密码已修改，其他设备已退出登录。');
      ['auth-old-password', 'auth-new-password'].forEach(id => { const n = $(id); if (n) n.value = ''; });
      showPanel(false);
    } catch (error) {
      setHint('修改失败：' + (error && error.message ? error.message : '网络错误') + '。', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  const doAuthDeleteAccount = async () => {
    if (!auth()) { setHint('账号模块未加载，请刷新页面重试。', true); return; }
    const session = auth().getSession ? auth().getSession() : null;
    if (!session || !session.token) { setHint('请先登录。', true); return; }
    const password = $('auth-delete-password')?.value || '';
    if (!password) { setHint('请输入密码确认注销。', true); return; }
    if (!window.confirm('确定注销账号吗？账号、云端备份与学习记录将全部删除，且无法恢复！')) return;
    const btn = $('auth-delete-submit-btn');
    if (btn) btn.disabled = true;
    try {
      const result = await auth().deleteAccount(session.token, { password });
      if (auth()) auth().clearSession();
      if (cloud()) {
        if (cloud().clearAuth) cloud().clearAuth();
        if (cloud().clearCode) cloud().clearCode();
      }
      refreshAuthBar();
      setHint(result && result.cleanupPending
        ? '账号已注销，云端备份删除任务已排队重试。本机学习数据保留，但本机恢复码已清除。'
        : '账号已注销。本机学习数据保留，但本机恢复码已清除。感谢使用！');
      showPanel(false);
    } catch (error) {
      setHint('注销失败：' + (error && error.message ? error.message : '网络错误') + '。', true);
    } finally {
      if (btn) btn.disabled = false;
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

  /** 统一事件处理：data-action="auth-*" 与 data-auth-tab（供 bindActions/页面委托复用） */
  const handleAction = action => {
    switch (action) {
      case 'auth-open':
        setAuthMode('login');
        setHint('');
        showPanel(true);
        {
          const session = auth() && auth().getSession ? auth().getSession() : null;
          if (session && session.token) { showAuthView('manage'); if ($('auth-old-password')) $('auth-old-password').focus(); }
          else { showAuthView('login'); if ($('auth-email-input')) $('auth-email-input').focus(); }
        }
        break;
      case 'close-auth': showPanel(false); break;
      case 'auth-submit': doAuthSubmit(); break;
      case 'auth-logout': doAuthLogout(); break;
      case 'auth-forgot': setHint(''); showAuthView('forgot'); break;
      case 'auth-forgot-send': doAuthForgotSend(); break;
      case 'auth-forgot-back': setAuthMode('login'); showAuthView('login'); break;
      case 'auth-reset-submit': doAuthResetSubmit(); break;
      case 'auth-change-submit': doAuthChangePassword(); break;
      case 'auth-delete-open': { const db = $('auth-delete-submit-btn'); if (db) db.hidden = false; $('auth-delete-password')?.focus(); break; }
      case 'auth-delete-submit': doAuthDeleteAccount(); break;
    }
  };

  const bindActions = () => {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (action && action.indexOf('auth') !== -1) handleAction(action); // 'close-auth' 不以 'auth-' 开头
    });
    document.addEventListener('click', e => {
      const tab = e.target.closest('[data-auth-tab]');
      if (tab) setAuthMode(tab.dataset.authTab);
    });
  };

  const init = options => {
    if (options && typeof options.hint === 'function') cfg.hint = options.hint;
    if (options && (options.panelMode === 'attribute' || options.panelMode === 'class')) cfg.panelMode = options.panelMode;
    if (options && typeof options.onCloudCodeRefresh === 'function') cfg.onCloudCodeRefresh = options.onCloudCodeRefresh;
    if (options && typeof options.migrateNote === 'string' && options.migrateNote) cfg.migrateNote = options.migrateNote;
    refreshAuthBar();
  };

  window.WaiyuanAuthUI = {
    init,
    bindActions,
    handleAction,
    setAuthMode,
    showAuthView,
    refreshAuthBar,
    isInsuranceBroken: () => insuranceBroken,
    doAuthSubmit,
    doAuthForgotSend,
    doAuthResetSubmit,
    doAuthChangePassword,
    doAuthDeleteAccount,
    doAuthLogout,
  };
})();
