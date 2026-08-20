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
  // 本地日期（非 UTC）：跨日统计/导出文件名/提醒去重都用中国时区当天，
  // 否则 00:00-08:00 之间会把今天算成昨天。
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
  const date = time => {
    if (!time) return '';
    const value = new Date(time);
    if (!Number.isFinite(value.getTime())) return '';  // 手改/损坏的时间戳不再崩渲染
    return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(value);
  };
  let view = new URLSearchParams(location.search).get('view') || 'overview';

  function itemCard(item, kind) {
    return `<article class="item"><div class="item-head"><h2>${escape(item.title || '未命名题目')}</h2><span class="source">${escape(sourceName(item))}${item.updatedAt ? ` · ${escape(date(item.updatedAt))}` : ''}</span></div>${item.answer ? `<div class="answer"><b>参考答案</b><br>${escape(item.answer)}</div>` : ''}<div class="item-actions"><a href="${escape(sourceUrl(item))}">返回原题页面</a>${kind === 'mistake' ? `<a class="practice-link" href="${escape(practiceUrl(item))}">重新练习</a>` : ''}${kind === 'favorite' ? `<button class="remove" data-remove="${escape(item.key)}">取消收藏</button>` : ''}</div></article>`;
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
    const viewed = progress.filter(item => item.viewed && !item.answered);
    const answered = progress.filter(item => item.answered);
    const correct = answered.filter(item => item.ok === true).length;
    const review = progress.filter(item => item.wrong === true || item.result === 'partial');
    const selfOk = answered.filter(item => item.result === 'correct').length;
    const selfPartial = answered.filter(item => item.result === 'partial').length;
    const recent = [...progress].sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0,5);
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
    const days = last7Days(progress);
    const maxDay = Math.max(1, ...days.map(d => d.count));
    const bars = days.map(d => `<div class="bar" title="${d.day} 答题 ${d.count}"><div class="bar-inner" ${barStyle(d.count, maxDay)}></div><small>${d.day}</small></div>`).join('');
    const streak = computeStreak(progress);
    const goalPct = dailyGoal ? Math.min(100, Math.round(todayCount / dailyGoal * 100)) : 0;
    app.innerHTML = `<section class="stats"><div class="stat"><small>已浏览</small><b>${viewed.length}</b></div><div class="stat"><small>已作答</small><b>${answered.length}</b></div><div class="stat"><small>答对</small><b>${correct}</b></div><div class="stat"><small>待复习</small><b>${review.length}</b></div></section>${selfOk || selfPartial ? `<p class="note">自评：答对 ${selfOk} · 部分掌握 ${selfPartial}（简答/论述/材料/翻译类题目展开答案后可自评）</p>` : ''}
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
    app.innerHTML = items.length ? `<section class="practice-panel"><div><b>准备复习错题？</b><small>${items.length} 道题待练习</small></div><a href="${escape(practiceUrl(items[0]))}">开始复习错题</a></section><div class="items">${items.map(item => itemCard(item,'mistake')).join('')}</div>` : empty('暂无待复习题目','作答错误或自评「需要复习」「部分掌握」的题目会自动汇总到这里，答对后会移出。');
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
  render();

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
