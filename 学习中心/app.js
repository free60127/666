(() => {
  const KEY = 'waiyuan-unified-web-study-v1';
  const VOCABULARY_KEY = 'waiyuan-vocabulary-progress-v1';
  // 2026-08-21 统一数据范围：导出/导入/清空覆盖全部学习数据（含思政/计算机答题状态、
  // 查词收藏、当前词书），不再遗漏页面自带的本地存储。
  const POLITICS_KEY = 'politics-h5-state-v1';
  const COMPUTER_KEY = 'computer-h5-state-v1';
  const LOOKUP_KEY = 'waiyuan-lookup-words-v1';
  const BOOK_MEMORY_KEY = 'waiyuan-vocabulary-book-v1';
  const BACKUP_FORMAT = 'waiyuan-study-backup';
  const DATA_VERSION = 2;
  const app = document.getElementById('app');
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const objectOrEmpty = value => isObject(value) ? value : {};
  const readJson = key => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  };
  const EXTRA_KEYS = [POLITICS_KEY, COMPUTER_KEY, LOOKUP_KEY, BOOK_MEMORY_KEY];
  const createBackup = () => {
    const extra = {};
    for (const key of EXTRA_KEYS) {
      const value = readJson(key);
      if (value !== null) extra[key] = value;
    }
    return {
      format:BACKUP_FORMAT,
      version:DATA_VERSION,
      exportedAt:new Date().toISOString(),
      data:{
        webQuiz:{storageKey:KEY,...read()},
        vocabulary:{storageKey:VOCABULARY_KEY,progress:readVocabulary()},
        extra
      }
    };
  };
  const validateBackup = value => {
    if (!isObject(value) || value.format !== BACKUP_FORMAT || !isObject(value.data)) {
      throw new Error('文件格式或版本不受支持');
    }
    // v1 备份没有 version 字段，同样兼容；v2 引入 extra（思政/计算机等附加数据）
    if (value.version !== undefined && value.version !== 1 && value.version !== DATA_VERSION) {
      throw new Error('文件版本不受支持');
    }
    const webQuiz = value.data.webQuiz;
    const vocabulary = value.data.vocabulary;
    if (!isObject(webQuiz) || !isObject(vocabulary)) throw new Error('备份缺少网页题库或背单词数据');
    const extra = isObject(value.data.extra) ? value.data.extra : {};
    return {
      webQuiz:normalizeUnified(webQuiz),
      vocabulary:normalizeVocabulary(vocabulary.progress),
      extra
    };
  };
  const normalizeUnified = value => {
    const state = objectOrEmpty(value);
    return {version:DATA_VERSION, progress:objectOrEmpty(state.progress), favorites:objectOrEmpty(state.favorites), settings:objectOrEmpty(state.settings)};
  };
  const normalizeVocabulary = value => objectOrEmpty(value);
  const read = () => normalizeUnified(readJson(KEY));
  const readVocabulary = () => normalizeVocabulary(readJson(VOCABULARY_KEY));
  const write = state => {
    try { localStorage.setItem(KEY, JSON.stringify(normalizeUnified(state))); }
    catch (error) {
      console.warn('学习中心: 保存失败', error);
      try {
        if (error && error.name === 'QuotaExceededError') setStatus('本地存储空间已满，最新记录未能保存。请先「导出学习数据」备份，再清空或精简记录。', 'error');
      } catch (_) {}
    }
  };
  const setStatus = (message, type = '') => {
    const node = document.getElementById('data-status');
    if (!node) return;
    node.textContent = message;
    node.className = `data-status ${type}`.trim();
  };
  // 通知权限请求兼容包装：旧 iOS Safari（<16）只支持回调式且不返回 Promise，
  // 统一转为 Promise 以安全地使用 .then 反馈结果。
  const requestNotifyPermission = () => new Promise(resolve => {
    if (!('Notification' in window) || typeof Notification.requestPermission !== 'function') { resolve('unsupported'); return; }
    let settled = false;
    const done = result => { if (!settled) { settled = true; resolve(result || 'denied'); } };
    try {
      const result = Notification.requestPermission(done);  // 回调式（旧 iOS）
      if (result && typeof result.then === 'function') result.then(done).catch(() => done('denied'));  // Promise 式
    } catch (_) { done('denied'); }
  });
  // 本地日期（浏览器本地时区，非 UTC）：跨日统计/导出文件名/提醒去重都用设备当天，
  // 与背单词 day() 算法一致；如需固定中国时区可改为 Asia/Shanghai 计算。
  const dateStamp = (date = new Date()) => { const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return copy.toISOString().slice(0, 10); };
  const download = (content, filename) => {
    const blob = new Blob([content], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const exportData = () => {
    try {
      download(JSON.stringify(createBackup(), null, 2), `waiyuan-study-backup-${dateStamp()}.json`);
      setStatus('学习数据已导出为 JSON 文件。', 'success');
    } catch (_) {
      setStatus('导出失败，请检查浏览器下载权限。', 'error');
    }
  };
  const importData = file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = validateBackup(JSON.parse(reader.result));
        if (!window.confirm('导入会覆盖当前的网页题库、背单词、思政/计算机答题状态等全部学习数据，是否继续？')) return;
        localStorage.setItem(KEY, JSON.stringify(backup.webQuiz));
        localStorage.setItem(VOCABULARY_KEY, JSON.stringify(backup.vocabulary));
        let extraCount = 0;
        // 覆盖语义：先清掉全部附加 key，再按备份恢复——避免备份中缺失的 key 残留旧值
        for (const key of EXTRA_KEYS) localStorage.removeItem(key);
        for (const key of EXTRA_KEYS) {
          if (backup.extra[key] !== undefined) {
            localStorage.setItem(key, JSON.stringify(backup.extra[key]));
            extraCount++;
          }
        }
        setStatus(`学习数据导入成功，已恢复网页题库、背单词${extraCount ? `及 ${extraCount} 项附加数据` : ''}记录。`, 'success');
        render();
      } catch (error) {
        setStatus(`导入失败：${error.message || '无法读取文件'}。`, 'error');
      }
    };
    reader.onerror = () => setStatus('导入失败：无法读取文件。', 'error');
    reader.readAsText(file, 'utf-8');
  };
  const clearData = () => {
    if (!window.confirm('确定清空全部本地学习数据吗（网页题库、背单词、思政/计算机答题状态、查词收藏）？此操作无法撤销，建议先导出备份。')) return;
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(VOCABULARY_KEY);
      for (const key of EXTRA_KEYS) localStorage.removeItem(key);
      setStatus('全部本地学习数据已清空。', 'success');
      render();
    } catch (_) {
      setStatus('清空失败，请检查浏览器存储权限。', 'error');
    }
  };

  /* ---------- 云端同步（2026-08-21）：恢复码 + AES-GCM 加密，复用导出备份格式 ---------- */
  const cloud = () => window.WaiyuanCloudSync;
  const cloudPanel = () => document.getElementById('cloud-panel');
  const showCloudPanel = show => { const p = cloudPanel(); if (p) p.hidden = !show; };
  const refreshCloudCodeBox = () => {
    const code = cloud() && cloud().loadCode ? cloud().loadCode() : '';
    const node = document.getElementById('cloud-code');
    const btn = document.getElementById('copy-code-btn');
    if (node) node.textContent = code ? code : '（备份后自动生成）';
    if (btn) btn.disabled = !code;
  };
  const copyCloudCode = () => {
    const code = cloud() && cloud().loadCode ? cloud().loadCode() : '';
    if (!code) return;
    const done = () => setStatus('恢复码已复制，请妥善保存。', 'success');
    const fail = () => setStatus('复制失败，请手动选中恢复码复制。', 'error');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, fail);
    else {
      try {
        const area = document.createElement('textarea');
        area.value = code;
        area.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        done();
      } catch (_) { fail(); }
    }
  };
  const doCloudBackup = async () => {
    if (!cloud()) { setStatus('云端模块未加载，请刷新页面重试。', 'error'); return; }
    try {
      const authed = cloud().isAuthed ? cloud().isAuthed() : false;
      if (authed && insuranceBroken) {
        setStatus('账号恢复码保险箱异常，已暂停备份。请先点「导出学习数据」保存本机数据，再联系管理员。', 'error');
        return;
      }
      let code = cloud().loadCode();
      if (!code) {
        if (authed) {
          // 账号模式：云端已有数据但本机无恢复码 → 禁止覆盖（旧数据将无法解密）
          const remote = await cloud().downloadAccount().catch(() => null);
          if (remote && remote.payload) {
            setStatus('账号云端已有备份，但本机没有恢复码（无法解密旧数据），已取消本次备份以防数据丢失。请先在旧设备登录并备份，或导出本机数据。', 'error');
            return;
          }
          code = cloud().createCode();
          cloud().saveCode(code);
          refreshCloudCodeBox();
        } else {
          code = cloud().createCode();
          cloud().saveCode(code);
          refreshCloudCodeBox();
          showCloudPanel(true);
          setStatus('已生成恢复码，请先点「复制恢复码」保存，再点一次「云端备份」完成上传。', 'success');
          return;
        }
      }
      setStatus('正在加密并上传学习数据（备份=覆盖云端）…', '');
      const payload = await cloud().encrypt(code, createBackup());
      const result = authed ? await cloud().backupAccount(payload) : await cloud().backup(code, payload);
      const at = result.updatedAt ? new Date(result.updatedAt) : new Date();
      const size = result.size ? Math.max(1, Math.round(result.size / 1024)) : 0;
      setStatus('云端备份完成（' + date(at) + '，约 ' + size + ' KB）。' + (authed ? '已存入你的账号，换设备登录后点「云端恢复」即可取回。' : '换设备时用恢复码即可取回。'), 'success');
    } catch (error) {
      setStatus('云端备份失败：' + (error && error.message ? error.message : '网络错误') + '。', 'error');
    }
  };
  const doCloudRestore = async input => {
    if (!cloud()) { setStatus('云端模块未加载，请刷新页面重试。', 'error'); return; }
    const code = String(input || '').trim();
    const authed = cloud().isAuthed ? cloud().isAuthed() : false;
    // 登录态且未输入恢复码 → 直接从账号取数据（恢复码自动解锁，无需手输）
    if (authed && !code) {
      try {
        setStatus('正在从账号云端下载并解密…', '');
        const remote = await cloud().downloadAccount();
        if (!remote || !remote.payload) { setStatus('账号云端还没有备份：先点「☁ 云端备份」上传一次。', 'error'); return; }
        const myCode = cloud().loadCode();
        if (!myCode) { setStatus('账号未绑定恢复码，无法解密数据，请先在旧设备登录并备份。', 'error'); return; }
        const cloudBackup = await cloud().decrypt(myCode, remote.payload);
        validateBackup(cloudBackup);
        download(JSON.stringify(createBackup(), null, 2), 'waiyuan-local-before-restore-' + dateStamp() + '.json');
        const merged = cloud().mergeBackup(createBackup(), cloudBackup);
        localStorage.setItem(KEY, JSON.stringify(merged.data.webQuiz));
        localStorage.setItem(VOCABULARY_KEY, JSON.stringify(merged.data.vocabulary));
        for (const key of EXTRA_KEYS) localStorage.removeItem(key);
        for (const key of Object.keys(merged.data.extra || {})) localStorage.setItem(key, JSON.stringify(merged.data.extra[key]));
        render();
        const when = remote.updatedAt ? '（账号云端 ' + date(new Date(remote.updatedAt)) + ' 的备份）' : '';
        setStatus('账号云端恢复成功' + when + '：已与本地合并，本机数据未丢失。', 'success');
      } catch (error) {
        setStatus('账号云端恢复失败：' + (error && error.message ? error.message : '网络错误') + '。', 'error');
      }
      return;
    }
    if (!code) { setStatus('请先输入恢复码。', 'error'); return; }
    try {
      setStatus('正在从云端下载并解密…', '');
      const remote = await cloud().download(code);
      if (!remote || !remote.payload) { setStatus('云端还没有备份数据：恢复码可能不正确，或从未备份过。', 'error'); return; }
      const cloudBackup = await cloud().decrypt(code, remote.payload);
      validateBackup(cloudBackup);  // 格式校验（throw 则中止）
      // 保险：恢复前先自动导出一份本机备份文件
      download(JSON.stringify(createBackup(), null, 2), 'waiyuan-local-before-restore-' + dateStamp() + '.json');
      const merged = cloud().mergeBackup(createBackup(), cloudBackup);
      localStorage.setItem(KEY, JSON.stringify(merged.data.webQuiz));
      localStorage.setItem(VOCABULARY_KEY, JSON.stringify(merged.data.vocabulary));
      for (const key of EXTRA_KEYS) localStorage.removeItem(key);
      for (const key of Object.keys(merged.data.extra || {})) localStorage.setItem(key, JSON.stringify(merged.data.extra[key]));
      cloud().saveCode(code);  // 记住恢复码，之后备份用同一个
      refreshCloudCodeBox();
      render();
      const when = remote.updatedAt ? '（云端 ' + date(new Date(remote.updatedAt)) + ' 的备份）' : '';
      setStatus('云端恢复成功' + when + '：已与本地合并（重复内容取较新，独有内容两边都保留），本机数据未丢失。', 'success');
    } catch (error) {
      setStatus('云端恢复失败：' + (error && error.message ? error.message : '网络错误或恢复码不正确') + '。', 'error');
    }
  };
  const doCloudClear = async () => {
    if (!cloud()) { setStatus('云端模块未加载，请刷新页面重试。', 'error'); return; }
    const authed = cloud().isAuthed ? cloud().isAuthed() : false;
    if (!authed) {
      const code = cloud().loadCode();
      if (!code) { setStatus('本机没有恢复码（先备份或恢复一次），无法定位云端数据。', 'error'); return; }
      if (!window.confirm('确定删除云端备份吗？删除后无法恢复。此操作只影响云端，不影响本机数据。')) return;
      try { await cloud().remove(code); setStatus('云端备份已删除。', 'success'); }
      catch (error) { setStatus('清除失败：' + (error && error.message ? error.message : '网络错误') + '。', 'error'); }
      return;
    }
    if (!window.confirm('确定删除账号云端备份吗？删除后无法恢复。此操作只影响云端，不影响本机数据。')) return;
    try { await cloud().removeAccount(); setStatus('账号云端备份已删除。', 'success'); }
    catch (error) { setStatus('清除失败：' + (error && error.message ? error.message : '网络错误') + '。', 'error'); }
  };
  /* ---------- 账号登录（2026-08-21，D1）：登录态 + 恢复码保险箱 ---------- */
  const auth = () => window.WaiyuanAuth;
  let authMode = 'login';
  let insuranceBroken = false;  // 账号恢复码保险箱解密失败（防覆盖云端数据）
  const showAuthPanel = show => { const p = document.getElementById('auth-panel'); if (p) p.hidden = !show; };
  /* ---------- 账号管理 UI（2026-08-22）：忘记密码 / 修改密码 / 注销 ---------- */
  const showAuthView = view => {
    const ids = { login: 'auth-login-view', forgot: 'auth-forgot-view', reset: 'auth-reset-view', manage: 'auth-manage-view' };
    Object.keys(ids).forEach(key => {
      const el = document.getElementById(ids[key]);
      if (el) el.hidden = key !== view;
    });
  };
  const doAuthForgotSend = async () => {
    if (!auth()) { setStatus('账号模块未加载，请刷新页面重试。', 'error'); return; }
    const email = (document.getElementById('auth-forgot-email')?.value || '').trim();
    if (!email) { setStatus('请输入注册邮箱。', 'error'); return; }
    const btn = document.getElementById('auth-forgot-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
    try {
      await auth().forgot(email);
      setStatus('验证码已发送（若该邮箱已注册）。请查收邮件。', 'success');
      const resetEmail = document.getElementById('auth-reset-email');
      if (resetEmail) resetEmail.value = email;
      showAuthView('reset');
      document.getElementById('auth-reset-code')?.focus();
    } catch (error) {
      setStatus('发送失败：' + (error && error.message ? error.message : '网络错误') + '。', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '发送验证码'; }
    }
  };
  const doAuthResetSubmit = async () => {
    if (!auth()) { setStatus('账号模块未加载，请刷新页面重试。', 'error'); return; }
    const email = (document.getElementById('auth-reset-email')?.value || '').trim();
    const code = (document.getElementById('auth-reset-code')?.value || '').trim();
    const newPassword = document.getElementById('auth-reset-password')?.value || '';
    const recoveryInput = (document.getElementById('auth-reset-recovery')?.value || '').trim();
    if (!email || !code || !newPassword) { setStatus('请填写邮箱、验证码和新密码。', 'error'); return; }
    if (newPassword.length < 8) { setStatus('新密码至少 8 位。', 'error'); return; }
    let recovery;
    if (recoveryInput) {
      try { recovery = await auth().lockRecovery(newPassword, recoveryInput); }
      catch (_) { setStatus('恢复码格式无效（可留空跳过，但云端数据将需原恢复码解锁）。', 'error'); return; }
    }
    const btn = document.getElementById('auth-reset-submit-btn');
    if (btn) btn.disabled = true;
    try {
      const result = await auth().resetPassword({ email, code, newPassword, recovery });
      if (result && result.recoveryReset) {
        setStatus('密码已重置。注意：云端数据需原恢复码才能解锁——请用原恢复码做云端恢复，或联系管理员。', 'success');
      } else {
        setStatus('密码已重置，请用新密码登录。', 'success');
      }
      if (recoveryInput && window.WaiyuanCloudSync && window.WaiyuanCloudSync.saveCode) window.WaiyuanCloudSync.saveCode(recoveryInput);
      showAuthView('login');
      ['auth-reset-email', 'auth-reset-code', 'auth-reset-password', 'auth-reset-recovery'].forEach(id => { const n = document.getElementById(id); if (n) n.value = ''; });
    } catch (error) {
      setStatus('重置失败：' + (error && error.message ? error.message : '网络错误') + '。', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
  const doAuthChangePassword = async () => {
    if (!auth()) { setStatus('账号模块未加载，请刷新页面重试。', 'error'); return; }
    const session = auth().getSession ? auth().getSession() : null;
    if (!session || !session.token) { setStatus('请先登录。', 'error'); return; }
    const oldPassword = document.getElementById('auth-old-password')?.value || '';
    const newPassword = document.getElementById('auth-new-password')?.value || '';
    if (!oldPassword || !newPassword) { setStatus('请输入当前密码和新密码。', 'error'); return; }
    if (newPassword.length < 8) { setStatus('新密码至少 8 位。', 'error'); return; }
    const btn = document.getElementById('auth-change-submit-btn');
    if (btn) btn.disabled = true;
    try {
      let recovery;
      const meData = await auth().me(session.token);
      if (meData && meData.recovery) {
        try {
          const code = await auth().unlockRecovery(oldPassword, meData.recovery);
          recovery = await auth().lockRecovery(newPassword, code);
        } catch (_) {
          setStatus('恢复码保险箱解锁失败：请确认当前密码正确，或先在旧设备导出数据。', 'error');
          return;
        }
      }
      await auth().changePassword(session.token, { oldPassword, newPassword, recovery });
      setStatus('密码已修改，其他设备已退出登录。', 'success');
      ['auth-old-password', 'auth-new-password'].forEach(id => { const n = document.getElementById(id); if (n) n.value = ''; });
      showAuthPanel(false);
    } catch (error) {
      setStatus('修改失败：' + (error && error.message ? error.message : '网络错误') + '。', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
  const doAuthDeleteAccount = async () => {
    if (!auth()) { setStatus('账号模块未加载，请刷新页面重试。', 'error'); return; }
    const session = auth().getSession ? auth().getSession() : null;
    if (!session || !session.token) { setStatus('请先登录。', 'error'); return; }
    const password = document.getElementById('auth-delete-password')?.value || '';
    if (!password) { setStatus('请输入密码确认注销。', 'error'); return; }
    if (!window.confirm('确定注销账号吗？账号、云端备份与学习记录将全部删除，且无法恢复！')) return;
    const btn = document.getElementById('auth-delete-submit-btn');
    if (btn) btn.disabled = true;
    try {
      const result = await auth().deleteAccount(session.token, { password });
      if (auth()) auth().clearSession();
      if (window.WaiyuanCloudSync) {
        if (window.WaiyuanCloudSync.clearAuth) window.WaiyuanCloudSync.clearAuth();
        if (window.WaiyuanCloudSync.clearCode) window.WaiyuanCloudSync.clearCode();
      }
      refreshAuthBar();
      setStatus(result && result.cleanupPending
        ? '账号已注销，云端备份删除任务已排队重试。本机学习数据保留，但本机恢复码已清除。'
        : '账号已注销。本机学习数据保留，但本机恢复码已清除。感谢使用！', 'success');
      showAuthPanel(false);
    } catch (error) {
      setStatus('注销失败：' + (error && error.message ? error.message : '网络错误') + '。', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
  const setAuthMode = mode => {
    authMode = mode;
    document.querySelectorAll('[data-auth-tab]').forEach(t => t.classList.toggle('active', t.dataset.authTab === mode));
    const nickname = document.getElementById('auth-nickname-input');
    if (nickname) nickname.hidden = mode !== 'register';
    const submit = document.getElementById('auth-submit-btn');
    if (submit) submit.textContent = mode === 'register' ? '注册' : '登录';
    showAuthView('login');
  };
  const refreshAuthBar = () => {
    const session = auth() && auth().getSession ? auth().getSession() : null;
    const openBtn = document.getElementById('auth-open-btn');
    const email = document.getElementById('auth-email');
    const logoutBtn = document.getElementById('auth-logout-btn');
    if (!openBtn || !email || !logoutBtn) return;
    if (session && session.user) {
      openBtn.hidden = true;
      email.hidden = false;
      email.textContent = '👤 ' + (session.user.nickname || session.user.email);
      logoutBtn.hidden = false;
      showAuthPanel(false);
    } else {
      openBtn.hidden = false;
      email.hidden = true;
      logoutBtn.hidden = true;
    }
  };
  const doAuthSubmit = async () => {
    if (!auth()) { setStatus('账号模块未加载，请刷新页面重试。', 'error'); return; }
    const email = (document.getElementById('auth-email-input')?.value || '').trim();
    const password = document.getElementById('auth-password-input')?.value || '';
    const nickname = (document.getElementById('auth-nickname-input')?.value || '').trim();
    if (!email || !password) { setStatus('请输入邮箱和密码。', 'error'); return; }
    const submit = document.getElementById('auth-submit-btn');
    if (submit) submit.disabled = true;
    try {
      let migratedNote = '';
      if (authMode === 'register') {
        let code = window.WaiyuanCloudSync && window.WaiyuanCloudSync.loadCode ? window.WaiyuanCloudSync.loadCode() : '';
        if (!code && window.WaiyuanCloudSync && window.WaiyuanCloudSync.createCode) {
          code = window.WaiyuanCloudSync.createCode();
          window.WaiyuanCloudSync.saveCode(code);
        }
        const recovery = code ? await auth().lockRecovery(password, code) : null;
        const result = await auth().register({ email, password, nickname: nickname || undefined, recovery });
        auth().saveSession(result);
        if (window.WaiyuanCloudSync && window.WaiyuanCloudSync.setAuth) window.WaiyuanCloudSync.setAuth(result.token, result.user.id);
        migratedNote = await tryMigrate(code);  // 注册前若有匿名备份则搬入账号
        setStatus('注册成功，已登录。' + (recovery ? '本机恢复码已加密保存到账号，换设备登录即可解锁。' : '建议先做一次云端备份以生成恢复码。') + migratedNote, 'success');
        showAuthPanel(false);
        refreshCloudCodeBox();
      } else {
        const result = await auth().login({ email, password });
        auth().saveSession(result);
        if (window.WaiyuanCloudSync && window.WaiyuanCloudSync.setAuth) window.WaiyuanCloudSync.setAuth(result.token, result.user.id);
        let unlocked = false, broken = false;
        let localCode = window.WaiyuanCloudSync && window.WaiyuanCloudSync.loadCode ? window.WaiyuanCloudSync.loadCode() : '';
        if (result.recovery) {
          try {
            const code = await auth().unlockRecovery(password, result.recovery);
            if (window.WaiyuanCloudSync && window.WaiyuanCloudSync.saveCode) window.WaiyuanCloudSync.saveCode(code);
            localCode = code;
            refreshCloudCodeBox();
            unlocked = true;
            migratedNote = await tryMigrate(code);
          } catch (_) {
            broken = true;  // 密码已通过服务端验证，解不开 = 保险箱数据异常，与「未绑定」严格区分
          }
        } else {
          // 账号从未绑定保险箱：用登录密码把本机恢复码（没有则新生成）绑定到账号
          if (!localCode && window.WaiyuanCloudSync && window.WaiyuanCloudSync.createCode) {
            localCode = window.WaiyuanCloudSync.createCode();
            window.WaiyuanCloudSync.saveCode(localCode);
          }
          if (localCode) {
            try {
              const box = await auth().lockRecovery(password, localCode);
              await auth().setRecovery(result.token, box);
              refreshCloudCodeBox();
            } catch (_) { /* 绑定失败不阻断登录；备份时若账号云端无数据仍可继续 */ }
          }
        }
        insuranceBroken = broken;
        if (broken) {
          setStatus('登录成功，但账号恢复码保险箱异常（解密失败）。为防覆盖云端数据已暂停自动备份：请先点「导出学习数据」保存本机数据，并联系管理员检查账号。', 'error');
        } else {
          setStatus('登录成功。' + (unlocked ? '云端恢复码已解锁，可点「云端恢复」取回学习数据。' : '该账号尚未绑定恢复码，可用原恢复码手动恢复或做一次云端备份。') + migratedNote, 'success');
        }
        showAuthPanel(false);
      }
      refreshAuthBar();
      ['auth-email-input', 'auth-password-input', 'auth-nickname-input'].forEach(id => { const n = document.getElementById(id); if (n) n.value = ''; });
    } catch (error) {
      setStatus('操作失败：' + (error && error.message ? error.message : '网络错误') + '。', 'error');
    } finally {
      if (submit) submit.disabled = false;
    }
  };
  const doAuthLogout = async () => {
    const session = auth() && auth().getSession ? auth().getSession() : null;
    try { if (session && auth()) await auth().logout(session.token); } catch (_) {}
    if (auth()) auth().clearSession();
    if (window.WaiyuanCloudSync && window.WaiyuanCloudSync.clearAuth) window.WaiyuanCloudSync.clearAuth();
    refreshAuthBar();
    setStatus('已退出登录。', 'success');
  };
  /** 登录/注册后：把旧匿名恢复码数据迁移到账号（无数据/账号已有数据则跳过，静默） */
  const tryMigrate = async code => {
    try {
      const cloudSync = window.WaiyuanCloudSync;
      if (!cloudSync || !cloudSync.migrateAnonymous) return '';
      const result = await cloudSync.migrateAnonymous(code || cloudSync.loadCode());
      return result && result.status === 'migrated' ? '原恢复码数据已自动迁移到账号。' : '';
    } catch (_) { return ''; }
  };

  const sourceName = item => clean(item.page).replace(/s*[·|-]s*外院知识分享站.*$/i, '') || '网页题库';
  const sourceUrl = item => {
    const path = String(item.path || '');
    return path.startsWith('/') && !path.startsWith('//') ? path : '../index.html';
  };
  const practiceUrl = item => {
    const target = sourceUrl(item);
    const separator = target.includes('?') ? '&' : '?';
    return `${target}${separator}focus=${encodeURIComponent(item.key)}#quiz-focus`;
  };
  const date = time => {
    if (!time) return '';
    const value = new Date(time);
    if (!Number.isFinite(value.getTime())) return '';  // 手改/损坏的时间戳不再崩渲染
    return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(value);
  };
  let view = new URLSearchParams(location.search).get('view') || 'overview';

  function itemCard(item, kind) {
    return `<article class="item"><div class="item-head"><h2>${escape(item.title || '未命名题目')}</h2><span class="source">${escape(sourceName(item))}${item.scope === 'paper' ? ' · <b class="tag-paper">模拟卷</b>' : ''}${item.updatedAt ? ` · ${escape(date(item.updatedAt))}` : ''}${item.attempts && item.attempts > 1 ? ` · 练习 ${item.attempts} 次` : ''}</span></div>${item.answer ? `<div class="answer"><b>参考答案</b><br>${escape(item.answer)}</div>` : ''}<div class="item-actions"><a href="${escape(sourceUrl(item))}">返回原题页面</a>${kind === 'mistake' && item.scope !== 'paper' ? `<a class="practice-link" href="${escape(practiceUrl(item))}">重新练习</a>` : ''}${kind === 'favorite' ? `<button class="remove" data-remove="${escape(item.key)}">取消收藏</button>` : ''}</div></article>`;
  }

  // —— 统计增强（2026-08-21）：按课程进度 / 连续天数 / 近 7 天曲线 / 每日目标 ——
  const dayOf = time => { const v = new Date(time); return Number.isFinite(v.getTime()) ? dateStamp(v) : ''; };
  const courseOf = item => {
    const p = String(item.path || '');
    const page = String(item.page || '');
    if (p.includes('/思政系列/')) return '思政';
    if (p.includes('/计算机系列/')) return '计算机';
    if (p.includes('泛读系列')) return '泛读';
    if (p.includes('基英系列')) return '基英';
    if (page.includes('翻译句子') || p.includes('翻译句子')) return '翻译';
    if (page.includes('改写句子') || p.includes('改写句子')) return '改写';
    if (p.includes('/专业课/')) return '专业课';
    return '其他';
  };
  const computeStreak = progress => {
    const days = new Set();
    for (const item of progress) {
      const d = dayOf(item.updatedAt);
      if (d) days.add(d);
    }
    if (!days.size) return 0;
    // 从今天或昨天开始向前数连续
    const date = new Date();
    const today = dateStamp(date);
    if (!days.has(today)) { date.setDate(date.getDate() - 1); if (!days.has(dateStamp(date))) return 0; }
    let streak = 0;
    while (true) {
      const key = dateStamp(date);
      if (!days.has(key)) break;
      streak++;
      date.setDate(date.getDate() - 1);
    }
    return streak;
  };
  const last7Days = progress => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(); date.setDate(date.getDate() - i);
      const key = dateStamp(date);
      const count = progress.filter(item => dayOf(item.updatedAt) === key && item.answered).length;
      out.push({ day: key.slice(5), count });
    }
    return out;
  };
  const barStyle = (count, max) => count ? `style="height:${Math.max(8, Math.round(count / max * 100))}%"` : '';

  function renderOverview(state) {
    const progress = Object.values(state.progress);
    const bank = progress.filter(item => item.scope !== 'paper');  // 统计口径：普通题库（模拟卷为随机抽题，单独在错题本展示）
    const viewedAll = bank.filter(item => item.viewed);
    const viewedOnly = bank.filter(item => item.viewed && !item.answered);
    const answered = bank.filter(item => item.answered);
    const correct = answered.filter(item => item.ok === true).length;
    const review = bank.filter(item => item.wrong === true || item.result === 'partial');
    const selfOk = answered.filter(item => item.result === 'correct').length;
    const selfPartial = answered.filter(item => item.result === 'partial').length;
    const recent = [...bank].sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0,5);
    const today = dateStamp();
    const todayCount = answered.filter(item => dayOf(item.updatedAt) === today).length;
    const dailyGoal = Number(state.settings.dailyGoal) || 0;
    const vocab = readVocabulary();
    const vocabToday = (vocab.history && vocab.history[today] && vocab.history[today].reviews) || 0;
    // 按课程分组
    const groups = new Map();
    for (const item of answered) {
      const name = courseOf(item);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    }
    const courseRows = [...groups.entries()].sort((a,b) => b[1].length - a[1].length).map(([name, items]) => {
      const ok = items.filter(i => i.ok === true).length;
      const wrongIn = items.filter(i => i.wrong === true || i.result === 'partial').length;
      return `<div class="course-row"><span>${escape(name)}</span><b>${items.length} 题</b><small>答对 ${ok} · 正确率 ${items.length ? Math.round(ok / items.length * 100) : 0}%</small>${wrongIn ? `<em>${wrongIn} 待复习</em>` : ''}</div>`;
    }).join('');
    // 近 7 天
    const days = last7Days(bank);
    const maxDay = Math.max(1, ...days.map(d => d.count));
    const bars = days.map(d => `<div class="bar" title="${d.day} 答题 ${d.count}"><div class="bar-inner" ${barStyle(d.count, maxDay)}></div><small>${d.day}</small></div>`).join('');
    const streak = computeStreak(bank);
    const goalPct = dailyGoal ? Math.min(100, Math.round(todayCount / dailyGoal * 100)) : 0;
    app.innerHTML = `<section class="stats"><div class="stat"><small>已浏览</small><b>${viewedAll.length}</b></div><div class="stat"><small>未作答</small><b>${viewedOnly.length}</b></div><div class="stat"><small>已作答</small><b>${answered.length}</b></div><div class="stat"><small>答对</small><b>${correct}</b></div><div class="stat"><small>待复习</small><b>${review.length}</b></div></section><p class="note">已浏览含已作答；「未作答」= 看过但没答/没自评的题。模拟卷随机抽题不计入上述统计，模拟卷错题在「错题本」中查看。</p>${selfOk || selfPartial ? `<p class="note">自评：答对 ${selfOk} · 部分掌握 ${selfPartial}（简答/论述/材料/翻译类题目展开答案后可自评）</p>` : ''}
<section class="goal-card"><div class="goal-row"><b>每日答题目标</b><input id="daily-goal-input" type="number" min="0" max="500" value="${dailyGoal}" inputmode="numeric" aria-label="每日答题目标"><button type="button" data-action="set-goal">保存</button></div>${dailyGoal ? `<div class="goal-track" role="progressbar" aria-label="今日目标进度" aria-valuenow="${goalPct}" aria-valuemin="0" aria-valuemax="100"><div class="goal-fill" style="width:${goalPct}%"></div></div>` : ''}<small>今日完成 <b>${todayCount}</b> 题 · 背单词复习 <b>${vocabToday}</b> 词${streak ? ` · 连续学习 <b>${streak}</b> 天` : ''}</small></section>
${courseRows ? `<section class="course-progress"><h2 class="section-title">按课程进度</h2>${courseRows}</section>` : ''}
${days.some(d => d.count) ? `<section class="week-card"><h2 class="section-title">最近 7 天</h2><div class="bars">${bars}</div></section>` : ''}
<h2 class="section-title">最近学习</h2>${recent.length ? `<div class="items">${recent.map(item => itemCard(item,'progress')).join('')}</div>` : empty('还没有学习记录','在网页题库中答题或展开答案后，这里会自动记录。')}<p class="note">网页端记录保存在当前浏览器中；更换设备或清理浏览器数据后不会自动同步。导出备份会包含网页题库、背单词、思政/计算机答题状态与查词收藏。</p>`;
  }

  function empty(title, text) { return `<section class="empty"><b>${escape(title)}</b><p>${escape(text)}</p><a href="../index.html">去选择题库</a></section>`; }

  function renderFavorites(state) {
    const items = Object.values(state.favorites).sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    app.innerHTML = items.length ? `<div class="items">${items.map(item => itemCard(item,'favorite')).join('')}</div>` : empty('收藏夹还是空的','在题目下方点击“收藏题目”，之后就能从这里集中复习。');
  }

  function renderMistakes(state) {
    const items = Object.values(state.progress).filter(item => item.wrong || item.result === 'partial').sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    // 复习入口优先取普通题库错题（模拟卷为随机抽题，无法按题定位，需回到对应题库）
    const practiceTarget = items.find(item => item.scope !== 'paper');
    const panel = practiceTarget ? `<section class="practice-panel"><div><b>准备复习错题？</b><small>${items.length} 道题待练习</small></div><a href="${escape(practiceUrl(practiceTarget))}">开始复习错题</a></section>` : (items.length ? `<section class="practice-panel"><div><b>准备复习错题？</b><small>${items.length} 道题待练习</small></div><span>模拟卷错题请进入对应题库页面复习</span></section>` : '');
    app.innerHTML = items.length ? `${panel}<div class="items">${items.map(item => itemCard(item,'mistake')).join('')}</div>` : empty('暂无待复习题目','作答错误或自评「需要复习」「部分掌握」的题目会自动汇总到这里，答对后会移出。');
  }

  function render() {
    const state = read();
    const favoriteCount = Object.keys(state.favorites).length;
    const mistakeCount = Object.values(state.progress).filter(item => item.wrong || item.result === 'partial').length;
    document.getElementById('favorite-count').textContent = favoriteCount;
    document.getElementById('mistake-count').textContent = mistakeCount;
    const remindButton = document.getElementById('remind-toggle');
    if (remindButton) remindButton.textContent = state.settings.remindOn ? '错题提醒：已开启' : '开启错题提醒';
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    if (view === 'favorites') renderFavorites(state); else if (view === 'mistakes') renderMistakes(state); else renderOverview(state);
  }

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-view]');
    if (tab) { view = tab.dataset.view; history.replaceState(null,'',view === 'overview' ? location.pathname : `?view=${view}`); render(); return; }
    const remove = event.target.closest('[data-remove]');
    if (remove) { const state = read(); delete state.favorites[remove.dataset.remove]; write(state); render(); }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'export') exportData();
    if (action === 'import') document.getElementById('import-file')?.click();
    if (action === 'clear') clearData();
    if (action === 'cloud-backup') doCloudBackup();
    if (action === 'cloud-restore') { showCloudPanel(true); refreshCloudCodeBox(); document.getElementById('cloud-code-input')?.focus(); }
    if (action === 'cloud-restore-go') doCloudRestore(document.getElementById('cloud-code-input')?.value);
    if (action === 'cloud-clear') doCloudClear();
    if (action === 'copy-code') copyCloudCode();
    if (action === 'auth-open') {
      showAuthPanel(true);
      const session = auth() && auth().getSession ? auth().getSession() : null;
      if (session && session.token) {
        showAuthView('manage');
        document.getElementById('auth-old-password')?.focus();
      } else {
        setAuthMode('login');
        showAuthView('login');
        document.getElementById('auth-email-input')?.focus();
      }
    }
    if (action === 'auth-logout') doAuthLogout();
    if (action === 'auth-submit') doAuthSubmit();
    if (action === 'auth-forgot') { showAuthPanel(true); showAuthView('forgot'); document.getElementById('auth-forgot-email')?.focus(); }
    if (action === 'auth-forgot-send') doAuthForgotSend();
    if (action === 'auth-forgot-back') { setAuthMode('login'); showAuthView('login'); }
    if (action === 'auth-reset-submit') doAuthResetSubmit();
    if (action === 'auth-change-submit') doAuthChangePassword();
    if (action === 'auth-delete-open') {
      const delBtn = document.getElementById('auth-delete-submit-btn');
      if (delBtn) delBtn.hidden = false;
      document.getElementById('auth-delete-password')?.focus();
    }
    if (action === 'auth-delete-submit') doAuthDeleteAccount();
    const authTab = event.target.closest('[data-auth-tab]');
    if (authTab) setAuthMode(authTab.dataset.authTab);
    if (action === 'set-goal') {
      const state = read();
      const value = parseInt(document.getElementById('daily-goal-input')?.value, 10);
      state.settings.dailyGoal = Number.isFinite(value) ? Math.min(Math.max(value, 0), 500) : 0;
      write(state);
      setStatus(`每日答题目标已设为 ${state.settings.dailyGoal || 0} 题。`, 'success');
      render();
    }
    if (action === 'remind') {
      const state = read();
      state.settings.remindOn = !state.settings.remindOn;
      write(state);
      if (state.settings.remindOn && !('Notification' in window)) {
        setStatus('当前浏览器不支持系统通知，错题提醒只能在本页停留时展示。', 'error');
      } else if (state.settings.remindOn && Notification.permission === 'default') {
        requestNotifyPermission().then(permission => {
          if (permission === 'granted') setStatus('已开启错题提醒，有错题待复习时会通知你。', 'success');
          else setStatus('浏览器未授予通知权限，可在地址栏旁重新授权。', 'error');
        }).catch(() => {});
      } else if (state.settings.remindOn) {
        setStatus('错题提醒已开启，有错题待复习时会通知你。', 'success');
      }
      render();
    }
  });

  document.getElementById('import-file')?.addEventListener('change', event => {
    importData(event.target.files?.[0]);
    event.target.value = '';
  });

  window.addEventListener('pageshow', render);
  window.addEventListener('storage', render);
  refreshCloudCodeBox();
  refreshAuthBar();
  setAuthMode('login');
  render();

  // 页面刷新后恢复账号模式（cloud-sync 的 identity 只在内存，必须从会话重建），
  // 并异步验证 token 有效性——无效则自动登出，避免误传匿名键
  (async function restoreCloudIdentity() {
    try {
      const session = auth() && auth().getSession ? auth().getSession() : null;
      if (!session || !session.token || !session.user || !session.user.id) return;
      if (window.WaiyuanCloudSync && window.WaiyuanCloudSync.setAuth) {
        window.WaiyuanCloudSync.setAuth(session.token, session.user.id);
      }
      try {
        await auth().me(session.token);
      } catch (_) {
        if (auth()) auth().clearSession();
        if (window.WaiyuanCloudSync && window.WaiyuanCloudSync.clearAuth) window.WaiyuanCloudSync.clearAuth();
        refreshAuthBar();
      }
    } catch (_) {}
  })();

  // 错题复习提醒：已开启 && 存在错题 && 今日未提醒过 && 通知权限已授予 → 发系统通知（每日至多一次）
  (function checkMistakeReminder() {
    const state = read();
    if (!state.settings.remindOn || !('Notification' in window) || Notification.permission !== 'granted') return;
    const wrongCount = Object.values(state.progress).filter(item => item.wrong || item.result === 'partial').length;
    if (!wrongCount) return;
    const REMIND_MEMO = 'waiyuan-study-remind-memo-v1';
    let memo = '';
    try { memo = JSON.parse(localStorage.getItem(REMIND_MEMO) || '""'); } catch (_) {}
    const today = dateStamp();
    if (memo === today) return;
    try {
      new Notification('外院 · 学习中心', {body: `你有 ${wrongCount} 道错题待复习，趁热打铁巩固一下吧 ✍️`});
      localStorage.setItem(REMIND_MEMO, JSON.stringify(today));
    } catch (_) {}
  })();
})();
