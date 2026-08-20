(() => {
  const KEY = 'waiyuan-unified-web-study-v1';
  const VOCABULARY_KEY = 'waiyuan-vocabulary-progress-v1';
  const BACKUP_FORMAT = 'waiyuan-study-backup';
  const DATA_VERSION = 1;
  const app = document.getElementById('app');
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const objectOrEmpty = value => isObject(value) ? value : {};
  const readJson = key => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  };
  const normalizeUnified = value => {
    const state = objectOrEmpty(value);
    return {version:DATA_VERSION, progress:objectOrEmpty(state.progress), favorites:objectOrEmpty(state.favorites)};
  };
  const normalizeVocabulary = value => objectOrEmpty(value);
  const read = () => normalizeUnified(readJson(KEY));
  const readVocabulary = () => normalizeVocabulary(readJson(VOCABULARY_KEY));
  const write = state => { try { localStorage.setItem(KEY, JSON.stringify(normalizeUnified(state))); } catch (_) {} };
  const setStatus = (message, type = '') => {
    const node = document.getElementById('data-status');
    if (!node) return;
    node.textContent = message;
    node.className = `data-status ${type}`.trim();
  };
  const dateStamp = () => new Date().toISOString().slice(0, 10);
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
  const createBackup = () => ({
    format:BACKUP_FORMAT,
    version:DATA_VERSION,
    exportedAt:new Date().toISOString(),
    data:{
      webQuiz:{storageKey:KEY,...read()},
      vocabulary:{storageKey:VOCABULARY_KEY,progress:readVocabulary()}
    }
  });
  const validateBackup = value => {
    if (!isObject(value) || value.format !== BACKUP_FORMAT || value.version !== DATA_VERSION || !isObject(value.data)) {
      throw new Error('文件格式或版本不受支持');
    }
    const webQuiz = value.data.webQuiz;
    const vocabulary = value.data.vocabulary;
    if (!isObject(webQuiz) || !isObject(vocabulary)) throw new Error('备份缺少网页题库或背单词数据');
    return {
      webQuiz:normalizeUnified(webQuiz),
      vocabulary:normalizeVocabulary(vocabulary.progress)
    };
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
        if (!window.confirm('导入会覆盖当前的网页题库记录和背单词记录，是否继续？')) return;
        localStorage.setItem(KEY, JSON.stringify(backup.webQuiz));
        localStorage.setItem(VOCABULARY_KEY, JSON.stringify(backup.vocabulary));
        setStatus('学习数据导入成功，已恢复网页题库和背单词记录。', 'success');
        render();
      } catch (error) {
        setStatus(`导入失败：${error.message || '无法读取文件'}。`, 'error');
      }
    };
    reader.onerror = () => setStatus('导入失败：无法读取文件。', 'error');
    reader.readAsText(file, 'utf-8');
  };
  const clearData = () => {
    if (!window.confirm('确定清空网页题库和背单词的本地学习数据吗？此操作无法撤销。')) return;
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(VOCABULARY_KEY);
      setStatus('本地学习数据已清空。', 'success');
      render();
    } catch (_) {
      setStatus('清空失败，请检查浏览器存储权限。', 'error');
    }
  };
  const sourceName = item => clean(item.page).replace(/\s*[·|-]\s*外院知识分享站.*$/i, '') || '网页题库';
  const sourceUrl = item => {
    const path = String(item.path || '');
    return path.startsWith('/') && !path.startsWith('//') ? path : '../index.html';
  };
  const practiceUrl = item => {
    const target = sourceUrl(item);
    const separator = target.includes('?') ? '&' : '?';
    return `${target}${separator}focus=${encodeURIComponent(item.key)}#quiz-focus`;
  };
  const date = time => time ? new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(time)) : '';
  let view = new URLSearchParams(location.search).get('view') || 'overview';

  function itemCard(item, kind) {
    return `<article class="item"><div class="item-head"><h2>${escape(item.title || '未命名题目')}</h2><span class="source">${escape(sourceName(item))}${item.updatedAt ? ` · ${escape(date(item.updatedAt))}` : ''}</span></div>${item.answer ? `<div class="answer"><b>参考答案</b><br>${escape(item.answer)}</div>` : ''}<div class="item-actions"><a href="${escape(sourceUrl(item))}">返回原题页面</a>${kind === 'mistake' ? `<a class="practice-link" href="${escape(practiceUrl(item))}">重新练习</a>` : ''}${kind === 'favorite' ? `<button class="remove" data-remove="${escape(item.key)}">取消收藏</button>` : ''}</div></article>`;
  }

  function renderOverview(state) {
    const progress = Object.values(state.progress);
    const answered = progress.filter(item => item.answered);
    const correct = answered.filter(item => item.ok === true).length;
    const wrong = answered.filter(item => item.wrong === true).length;
    const accuracy = answered.length ? `${Math.round(correct / answered.length * 100)}%` : '—';
    const recent = [...progress].sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0,5);
    app.innerHTML = `<section class="stats"><div class="stat"><small>已学习</small><b>${progress.length}</b></div><div class="stat"><small>答对</small><b>${correct}</b></div><div class="stat"><small>统一错题</small><b>${wrong}</b></div><div class="stat"><small>正确率</small><b>${accuracy}</b></div></section><h2 class="section-title">最近学习</h2>${recent.length ? `<div class="items">${recent.map(item => itemCard(item,'progress')).join('')}</div>` : empty('还没有学习记录','在网页题库中答题或展开答案后，这里会自动记录。')}<p class="note">网页端记录保存在当前浏览器中；更换设备或清理浏览器数据后不会自动同步。</p>`;
  }

  function empty(title, text) { return `<section class="empty"><b>${escape(title)}</b><p>${escape(text)}</p><a href="../index.html">去选择题库</a></section>`; }

  function renderFavorites(state) {
    const items = Object.values(state.favorites).sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    app.innerHTML = items.length ? `<div class="items">${items.map(item => itemCard(item,'favorite')).join('')}</div>` : empty('收藏夹还是空的','在题目下方点击“收藏题目”，之后就能从这里集中复习。');
  }

  function renderMistakes(state) {
    const items = Object.values(state.progress).filter(item => item.wrong).sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    app.innerHTML = items.length ? `<section class="practice-panel"><div><b>准备复习错题？</b><small>${items.length} 道题待练习</small></div><a href="${escape(practiceUrl(items[0]))}">开始复习错题</a></section><div class="items">${items.map(item => itemCard(item,'mistake')).join('')}</div>` : empty('暂无统一错题','作答错误的题目会自动汇总到这里，答对后会移出。');
  }

  function render() {
    const state = read();
    const favoriteCount = Object.keys(state.favorites).length;
    const mistakeCount = Object.values(state.progress).filter(item => item.wrong).length;
    document.getElementById('favorite-count').textContent = favoriteCount;
    document.getElementById('mistake-count').textContent = mistakeCount;
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
  });

  document.getElementById('import-file')?.addEventListener('change', event => {
    importData(event.target.files?.[0]);
    event.target.value = '';
  });

  window.addEventListener('pageshow', render);
  window.addEventListener('storage', render);
  render();
})();
