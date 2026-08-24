export function createCloudPanel({ cloud, setStatus, validateBackup, download, createBackup, render, date, dateStamp,
  key, vocabularyKey, extraKeys }) {
  const cloudPanel = () => document.getElementById('cloud-panel');
  const renderCloudPanel = show => {
    const panel = cloudPanel();
    if (panel) panel.hidden = !show;
    return panel;
  };
  const showCloudPanel = show => renderCloudPanel(show);
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
      if (authed && window.WaiyuanAuthUI && window.WaiyuanAuthUI.isInsuranceBroken()) {
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
        localStorage.setItem(key, JSON.stringify(merged.data.webQuiz));
        localStorage.setItem(vocabularyKey, JSON.stringify(merged.data.vocabulary));
        for (const itemKey of extraKeys) localStorage.removeItem(itemKey);
        for (const itemKey of Object.keys(merged.data.extra || {})) localStorage.setItem(itemKey, JSON.stringify(merged.data.extra[itemKey]));
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
      localStorage.setItem(key, JSON.stringify(merged.data.webQuiz));
      localStorage.setItem(vocabularyKey, JSON.stringify(merged.data.vocabulary));
      for (const itemKey of extraKeys) localStorage.removeItem(itemKey);
      for (const itemKey of Object.keys(merged.data.extra || {})) localStorage.setItem(itemKey, JSON.stringify(merged.data.extra[itemKey]));
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

  return { renderCloudPanel, showCloudPanel, refreshCloudCodeBox, copyCloudCode, doCloudBackup, doCloudRestore, doCloudClear };
}
