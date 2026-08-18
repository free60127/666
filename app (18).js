(() => {
  const KEY = 'waiyuan-unified-web-study-v1';
  const app = document.getElementById('app');
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const read = () => { try { const state = JSON.parse(localStorage.getItem(KEY)) || {}; return {progress:state.progress || {},favorites:state.favorites || {}}; } catch (_) { return {progress:{},favorites:{}}; } };
  const write = state => localStorage.setItem(KEY, JSON.stringify({version:1,...state}));
  const sourceName = item => clean(item.page).replace(/\s*[·|-]\s*外院知识分享站.*$/i, '') || '网页题库';
  const sourceUrl = item => {
    const path = String(item.path || '');
    return path.startsWith('/') && !path.startsWith('//') ? path : '../index.html';
  };
  const date = time => time ? new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(time)) : '';
  let view = new URLSearchParams(location.search).get('view') || 'overview';

  function itemCard(item, kind) {
    return `<article class="item"><div class="item-head"><h2>${escape(item.title || '未命名题目')}</h2><span class="source">${escape(sourceName(item))}${item.updatedAt ? ` · ${escape(date(item.updatedAt))}` : ''}</span></div>${item.answer ? `<div class="answer"><b>参考答案</b><br>${escape(item.answer)}</div>` : ''}<div class="item-actions"><a href="${escape(sourceUrl(item))}">返回原题页面</a>${kind === 'favorite' ? `<button class="remove" data-remove="${escape(item.key)}">取消收藏</button>` : ''}</div></article>`;
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
    app.innerHTML = items.length ? `<div class="items">${items.map(item => itemCard(item,'mistake')).join('')}</div>` : empty('暂无统一错题','作答错误的题目会自动汇总到这里，答对后会移出。');
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
  });

  window.addEventListener('pageshow', render);
  window.addEventListener('storage', render);
  render();
})();
