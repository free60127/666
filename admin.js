(() => {
  const $ = s => document.querySelector(s);
  const apiBase = $('#api-base'), token = $('#token');
  const LS = { base: 'waiyuan-admin-api-v1', token: 'waiyuan-admin-token-v1' };
  try {
    apiBase.value = localStorage.getItem(LS.base) || 'https://api.free60127.top';
    token.value = sessionStorage.getItem(LS.token) || '';
  } catch (e) {}
  const base = () => (apiBase.value.trim() || 'https://api.free60127.top').replace(/\/$/, '');
  const auth = () => 'Bearer ' + token.value.trim();
  const showMsg = (text, ok) => {
    const m = $('#msg');
    m.textContent = text;
    m.className = 'msg ' + (ok ? 'ok' : 'err');
    setTimeout(() => { m.className = 'msg'; }, 6000);
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = ts => { try { return new Date(ts).toLocaleString('zh-CN', {hour12:false}); } catch (e) { return ts || ''; } };

  $('#save').addEventListener('click', () => {
    try {
      localStorage.setItem(LS.base, apiBase.value.trim());
      sessionStorage.setItem(LS.token, token.value.trim());
      showMsg('设置已保存到本机浏览器（令牌仅存会话存储，关闭标签页后失效）。', true);
    } catch (e) { showMsg('保存失败：浏览器禁止本地存储。', false); }
  });
  $('#clear-token').addEventListener('click', () => {
    try { sessionStorage.removeItem(LS.token); } catch (e) {}
    token.value = '';
    showMsg('令牌已从本机清除。', true);
  });
  $('#test').addEventListener('click', async () => {
    try {
      const r = await fetch(base() + '/api/health');
      const j = await r.json();
      if (r.ok && j.ok) { showMsg('连接正常：' + j.name + '（' + j.time + '）', true); }
      else showMsg('连接异常：HTTP ' + r.status, false);
    } catch (e) { showMsg('无法连接 API：' + e.message, false); }
  });

  // 标签切换
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('#tab-feedback').hidden = btn.dataset.tab !== 'feedback';
      $('#tab-notice').hidden = btn.dataset.tab !== 'notice';
      $('#tab-stats').hidden = btn.dataset.tab !== 'stats';
      $('#tab-rank').hidden = btn.dataset.tab !== 'rank';
      $('#tab-errand').hidden = btn.dataset.tab !== 'errand';
      $('#tab-logs').hidden = btn.dataset.tab !== 'logs';
    });
  });

  // 反馈列表（分页 / 筛选 / 已处理 / 导出）
  const fbState = { cursor: null, hasMore: false, items: [] };
  const renderFeedback = (items, append) => {
    const list = $('#fb-list');
    if (!append) list.innerHTML = '';
    if (!items.length && !list.children.length) { list.innerHTML = '<div class="empty">暂无反馈。</div>'; $('#fb-more').hidden = true; return; }
    for (const it of items) {
      const el = document.createElement('div');
      el.className = 'fb';
      const meta = document.createElement('div'); meta.className = 'meta';
      const page = document.createElement('span'); page.className = 'page'; page.textContent = it.page || '（无页面）';
      const status = document.createElement('span');
      status.className = 'page';
      status.style.background = it.handled ? '#e4f3e9' : '#fbeae7';
      status.style.color = it.handled ? '#276545' : '#b04a3e';
      status.textContent = it.handled ? '已处理' : '未处理';
      const time = document.createElement('span'); time.className = 'time'; time.textContent = fmt(it.ts);
      meta.append(page, status, time);
      el.append(meta);
      if (it.question) { const q = document.createElement('div'); q.className = 'q'; q.textContent = it.question; el.append(q); }
      if (it.answer) { const d = document.createElement('div'); d.className = 'detail'; d.textContent = '答案：' + it.answer; el.append(d); }
      if (it.type) { const d = document.createElement('div'); d.className = 'detail'; d.textContent = '类型：' + it.type; el.append(d); }
      if (it.note) { const n = document.createElement('div'); n.className = 'note'; n.textContent = '备注：' + it.note; el.append(n); }
      if (it.contact) { const d = document.createElement('div'); d.className = 'detail'; d.textContent = '联系方式：' + it.contact; el.append(d); }
      const actions = document.createElement('div'); actions.className = 'actions';
      const toggle = document.createElement('button');
      toggle.className = 'ghost';
      toggle.textContent = it.handled ? '重新打开' : '标记已处理';
      toggle.addEventListener('click', async () => {
        try {
          const r = await fetch(base() + '/api/feedback?key=' + encodeURIComponent(it.key) + '&handled=' + (it.handled ? '0' : '1'), { method: 'PATCH', headers: { Authorization: auth() } });
          const j = await r.json();
          if (r.ok && j.ok) { showMsg(it.handled ? '已重新打开。' : '已标记为处理。', true); loadFeedback(true); }
          else showMsg('操作失败：' + (j.error || r.status), false);
        } catch (e) { showMsg('操作失败：' + e.message, false); }
      });
      const del = document.createElement('button'); del.className = 'danger'; del.textContent = '删除';
      del.addEventListener('click', async () => {
        if (!confirm('确定删除这条反馈？删除后不可恢复。')) return;
        try {
          const r = await fetch(base() + '/api/feedback?key=' + encodeURIComponent(it.key), { method: 'DELETE', headers: { Authorization: auth() } });
          const j = await r.json();
          if (r.ok && j.ok) { showMsg('已删除。', true); loadFeedback(true); }
          else showMsg('删除失败：' + (j.error || r.status), false);
        } catch (e) { showMsg('删除失败：' + e.message, false); }
      });
      actions.append(toggle, del);
      el.append(actions);
      list.append(el);
    }
  };
  const loadFeedback = async (reset = true) => {
    const btn = $('#load-fb');
    btn.disabled = true; btn.textContent = '加载中…';
    if (reset) { fbState.cursor = null; fbState.items = []; }
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (fbState.cursor) params.set('cursor', fbState.cursor);
      const type = $('#fb-type').value.trim();
      if (type) params.set('type', type);
      const handled = $('#fb-handled').value;
      if (handled !== '') params.set('handled', handled);
      const r = await fetch(base() + '/api/feedback?' + params, { headers: { Authorization: auth() } });
      const j = await r.json();
      if (r.ok && j.ok) {
        fbState.cursor = j.cursor || null;
        fbState.hasMore = !!j.hasMore;
        fbState.items = fbState.items.concat(j.items || []);
        renderFeedback(j.items || [], !reset);
        $('#fb-more').hidden = !fbState.hasMore;
        $('#fb-count').textContent = '已加载 ' + fbState.items.length + ' 条' + (fbState.hasMore ? '（还有更多）' : '');
        if (reset) showMsg('共 ' + fbState.items.length + ' 条反馈。', true);
      }
      else if (r.status === 401) showMsg('令牌无效或未填写，请在上方输入正确令牌后重试。', false);
      else showMsg('加载失败：' + (j.error || r.status), false);
    } catch (e) { showMsg('请求失败：' + e.message, false); }
    btn.disabled = false; btn.textContent = '刷新';
  };
  const fetchAllFeedback = async () => {
    const all = [];
    let cursor = null;
    while (true) {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('cursor', cursor);
      const type = $('#fb-type').value.trim();
      if (type) params.set('type', type);
      const handled = $('#fb-handled').value;
      if (handled !== '') params.set('handled', handled);
      const r = await fetch(base() + '/api/feedback?' + params, { headers: { Authorization: auth() } });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
      all.push(...(j.items || []));
      if (!j.hasMore || !j.cursor) break;
      cursor = j.cursor;
    }
    return all;
  };
  const downloadFile = (name, content, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const csvEscape = v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  $('#export-csv').addEventListener('click', async () => {
    try {
      const items = await fetchAllFeedback();
      if (!items.length) { showMsg('没有可导出的反馈。', false); return; }
      const head = ['时间', '状态', '页面', '题目', '答案', '类型', '备注', '联系方式'];
      const rows = items.map(it => [it.ts, it.handled ? '已处理' : '未处理', it.page, it.question, it.answer, it.type, it.note, it.contact].map(csvEscape).join(','));
      downloadFile('waiyuan-feedback-' + new Date().toISOString().slice(0, 10) + '.csv', '\ufeff' + [head.join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
      showMsg('已导出 ' + items.length + ' 条 CSV。', true);
    } catch (e) { showMsg('导出失败：' + e.message, false); }
  });
  $('#export-json').addEventListener('click', async () => {
    try {
      const items = await fetchAllFeedback();
      downloadFile('waiyuan-feedback-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(items, null, 2), 'application/json');
      showMsg('已导出 ' + items.length + ' 条 JSON。', true);
    } catch (e) { showMsg('导出失败：' + e.message, false); }
  });
  $('#load-fb').addEventListener('click', () => loadFeedback(true));
  $('#fb-filter').addEventListener('click', () => loadFeedback(true));
  $('#fb-more').addEventListener('click', () => loadFeedback(false));

  // 公告
  const loadNotice = async () => {
    try {
      const r = await fetch(base() + '/api/notice');
      const j = await r.json();
      if (r.ok) { $('#notice-text').value = j.text || ''; $('#notice-time').textContent = j.updatedAt ? '上次更新：' + fmt(j.updatedAt) : '（暂无公告）'; }
    } catch (e) { /* 静默，公告可稍后保存时再验证 */ }
  };
  $('#clear-notice').addEventListener('click', async () => {
    if (!window.confirm('确定清除公告吗？清除后首页横幅不再显示。')) return;
    try {
      const r = await fetch(base() + '/api/notice', { method: 'DELETE', headers: { Authorization: auth() } });
      const j = await r.json();
      if (r.ok && j.ok) { showMsg('公告已清除。', true); loadNotice(); }
      else if (r.status === 401) showMsg('令牌无效，无法清除。', false);
      else showMsg('清除失败：' + (j.error || r.status), false);
    } catch (e) { showMsg('请求失败：' + e.message, false); }
  });
  $('#save-notice').addEventListener('click', async () => {
    try {
      const r = await fetch(base() + '/api/notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth() },
        body: JSON.stringify({ text: $('#notice-text').value.trim() }),
      });
      const j = await r.json();
      if (r.ok && j.ok) { showMsg('公告已发布。', true); loadNotice(); }
      else if (r.status === 401) showMsg('令牌无效，公告未发布。', false);
      else showMsg('发布失败：' + (j.error || r.status), false);
    } catch (e) { showMsg('请求失败：' + e.message, false); }
  });

  // 站点统计（2026-08-22）：GET /api/stats → PV/UV/趋势/热门页面
  const bar = (pv, max) => {
    const w = max > 0 ? Math.max(2, Math.round(pv / max * 100)) : 0;
    return '<div class="bar"><i style="width:' + w + '%"></i></div>';
  };
  const loadStats = async () => {
    const btn = $('#load-stats');
    btn.disabled = true; btn.textContent = '加载中…';
    try {
      const r = await fetch(base() + '/api/stats', { headers: { Authorization: auth() } });
      const j = await r.json();
      if (r.ok && j.ok) {
        $('#st-pv-total').textContent = (j.totals && j.totals.pv || 0).toLocaleString();
        $('#st-pv-today').textContent = (j.today.pv || 0).toLocaleString();
        $('#st-uv-today').textContent = (j.today.uv || 0).toLocaleString();
        const daily = j.daily || [];
        const maxPv = Math.max(1, ...daily.map(d => d.pv || 0));
        $('#st-daily').innerHTML = daily.length ? daily.map(d =>
          '<div class="day-row"><span class="d">' + d.date + '</span><span class="v">' + (d.pv || 0).toLocaleString() + '</span><div class="bwrap">' + bar(d.pv, maxPv) + '</div><span class="v" style="color:var(--muted)">UV ' + (d.uv || 0).toLocaleString() + '</span></div>'
        ).join('') : '<div class="empty">暂无数据。</div>';
        const pages = (j.topPages || []).slice(0, 10);
        const maxPage = Math.max(1, ...pages.map(p => p.pv || 0));
        $('#st-pages').innerHTML = pages.length ? pages.map(p =>
          '<div class="page-row"><span class="p">' + esc(p.path) + '</span><span class="n">' + (p.pv || 0).toLocaleString() + '</span><div class="bwrap">' + bar(p.pv, maxPage) + '</div></div>'
        ).join('') : '<div class="empty">暂无页面访问。</div>';
        showMsg('统计已刷新。', true);
      }
      else if (r.status === 401) showMsg('令牌无效或未填写，请在上方输入正确令牌后重试。', false);
      else showMsg('加载失败：' + (j.error || r.status), false);
    } catch (e) { showMsg('请求失败：' + e.message, false); }
    btn.disabled = false; btn.textContent = '刷新';
  };
  $('#load-stats').addEventListener('click', loadStats);

  // 学习排行榜（2026-08-22）：GET /api/rank?period=day|week
  let rankPeriod = 'day';
  const fmtMin = m => {
    m = Number(m) || 0;
    if (m < 60) return m + ' 分钟';
    return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
  };
  const loadRank = async () => {
    const btn = $('#load-rank');
    btn.disabled = true; btn.textContent = '加载中…';
    document.querySelectorAll('#rank-day,#rank-week').forEach(b => b.style.background = b.dataset.period === rankPeriod ? 'var(--green)' : '');
    document.querySelectorAll('#rank-day,#rank-week').forEach(b => b.style.color = b.dataset.period === rankPeriod ? '#fff' : '');
    try {
      const r = await fetch(base() + '/api/rank?period=' + rankPeriod, { headers: { Authorization: auth() } });
      const j = await r.json();
      if (r.ok && j.ok) {
        $('#rank-range').textContent = (rankPeriod === 'day' ? '今日（' : '本周（') + (j.range || '') + '）· Top ' + (j.items || []).length;
        const items = j.items || [];
        $('#rank-list').innerHTML = items.length
          ? '<table class="rank-table"><tr><th>#</th><th>用户</th><th>学习时长</th><th>学习条数</th></tr>' +
            items.map((it, i) =>
              '<tr class="' + (i < 3 ? 'top' + (i + 1) : '') + '"><td class="r">' + (i + 1) + '</td><td class="nm">' + esc(it.name) + '</td><td>' + fmtMin(it.minutes) + '</td><td>' + (it.learned || 0).toLocaleString() + '</td></tr>'
            ).join('') + '</table>'
          : '<div class="empty">暂无数据——题库页面打开后会开始采集。</div>';
        showMsg('排行榜已刷新。', true);
      }
      else if (r.status === 401) showMsg('令牌无效或未填写，请在上方输入正确令牌后重试。', false);
      else showMsg('加载失败：' + (j.error || r.status), false);
    } catch (e) { showMsg('请求失败：' + e.message, false); }
    btn.disabled = false; btn.textContent = '刷新';
  };
  $('#load-rank').addEventListener('click', loadRank);
  $('#rank-day').addEventListener('click', () => { rankPeriod = 'day'; loadRank(); });
  $('#rank-week').addEventListener('click', () => { rankPeriod = 'week'; loadRank(); });

  // 跑腿订单管理（2026-08-22）：任务列表 / 物理删除 / 申诉处理
  const ER_STATUS = {
    open: ['待接单', '#eef5f0', 'var(--green)'],
    doing: ['进行中', '#fff7ed', '#c98a2e'],
    done: ['已完成', '#e4f3e9', '#276545'],
    cancelled: ['已取消', '#fbeae7', '#b04a3e'],
  };
  const erState = { page: 1, hasMore: false };
  const erStatusHtml = st => {
    const s = ER_STATUS[st] || ['未知', '#eef5f0', 'var(--muted)'];
    return '<span class="page" style="background:' + s[1] + ';color:' + s[2] + '">' + s[0] + '</span>';
  };
  const renderErrandTasks = (items, append) => {
    const list = $('#er-list');
    if (!append) list.innerHTML = '';
    if (!items.length && !list.children.length) { list.innerHTML = '<div class="empty">暂无订单。</div>'; return; }
    for (const t of items) {
      const el = document.createElement('div');
      el.className = 'fb';
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.append(erStatusHtml(t.status));
      const id = document.createElement('span'); id.className = 'page'; id.textContent = '#' + t.id;
      const time = document.createElement('span'); time.className = 'time'; time.textContent = fmt(t.createdAt);
      meta.append(id, time);
      el.append(meta);
      const title = document.createElement('div'); title.className = 'q'; title.textContent = t.title;
      el.append(title);
      const info = document.createElement('div'); info.className = 'detail';
      info.textContent = '赏金 ¥' + t.reward + ' · 发布 ' + (t.publisherName || '?') + (t.takerName ? ' · 接单 ' + t.takerName : '') + (t.contact ? ' · 联系 ' + t.contact : '');
      el.append(info);
      if (t.cancelReason) { const n = document.createElement('div'); n.className = 'note'; n.textContent = '取消原因：' + t.cancelReason; el.append(n); }
      const actions = document.createElement('div'); actions.className = 'actions';
      const del = document.createElement('button'); del.className = 'danger'; del.textContent = '删除订单';
      del.addEventListener('click', async () => {
        if (!window.confirm('确定删除订单 #' + t.id + '「' + t.title + '」？将同时删除其评价与申诉记录，且不可恢复。')) return;
        try {
          const r = await fetch(base() + '/api/errand/admin/tasks/' + t.id, { method: 'DELETE', headers: { Authorization: auth() } });
          const j = await r.json();
          if (r.ok && j.ok) { showMsg('订单 #' + t.id + ' 已删除。', true); loadErrand(true); loadDisputesAdmin(); }
          else if (r.status === 401) showMsg('令牌无效，请重新填写。', false);
          else showMsg('删除失败：' + (j.error || r.status), false);
        } catch (e) { showMsg('删除失败：' + e.message, false); }
      });
      actions.append(del);
      el.append(actions);
      list.append(el);
    }
  };
  const loadErrand = async (reset = true) => {
    const btn = $('#load-errand');
    btn.disabled = true; btn.textContent = '加载中…';
    if (reset) { erState.page = 1; erState.hasMore = false; }
    try {
      const status = $('#er-status').value;
      const params = new URLSearchParams({ page: String(erState.page), pageSize: '50' });
      if (status !== 'all') params.set('status', status);
      const r = await fetch(base() + '/api/errand/admin/tasks?' + params, { headers: { Authorization: auth() } });
      const j = await r.json();
      if (r.ok) {
        const items = j.items || [];
        renderErrandTasks(items, !reset);
        erState.hasMore = (j.total || 0) > erState.page * 50;
        $('#er-more').hidden = !erState.hasMore;
        $('#er-count').textContent = '共 ' + (j.total || 0) + ' 单';
        if (reset) showMsg('订单已刷新。', true);
      }
      else if (r.status === 401) showMsg('令牌无效或未填写，请在上方输入正确令牌后重试。', false);
      else showMsg('加载失败：' + (j.error || r.status), false);
    } catch (e) { showMsg('请求失败：' + e.message, false); }
    btn.disabled = false; btn.textContent = '刷新';
  };
  $('#load-errand').addEventListener('click', () => loadErrand(true));
  $('#er-filter').addEventListener('click', () => loadErrand(true));
  $('#er-more').addEventListener('click', () => { erState.page++; loadErrand(false); });

  const DP_STATUS = {
    open: ['待处理', '#fff7ed', '#c98a2e'],
    resolved: ['已解决', '#e4f3e9', '#276545'],
    rejected: ['已驳回', '#fbeae7', '#b04a3e'],
  };
  const renderDisputes = items => {
    const list = $('#dp-list');
    list.innerHTML = '';
    if (!items.length) { list.innerHTML = '<div class="empty">暂无申诉。</div>'; return; }
    for (const d of items) {
      const el = document.createElement('div');
      el.className = 'fb';
      const meta = document.createElement('div'); meta.className = 'meta';
      const s = DP_STATUS[d.status] || ['未知', '#eef5f0', 'var(--muted)'];
      const stSpan = document.createElement('span');
      stSpan.className = 'page';
      stSpan.style.background = s[1];
      stSpan.style.color = s[2];
      stSpan.textContent = s[0];
      meta.append(stSpan);
      const who = document.createElement('span'); who.className = 'page'; who.textContent = '#' + d.taskId + ' · ' + (d.userName || '匿名') + '（' + (d.role === 'publisher' ? '发布者' : '接单者') + '）';
      const time = document.createElement('span'); time.className = 'time'; time.textContent = fmt(d.createdAt);
      meta.append(who, time);
      el.append(meta);
      const reason = document.createElement('div'); reason.className = 'q'; reason.textContent = d.reason;
      el.append(reason);
      if (d.detail) { const det = document.createElement('div'); det.className = 'detail'; det.textContent = d.detail; el.append(det); }
      if (d.adminNote) { const n = document.createElement('div'); n.className = 'note'; n.textContent = '管理员备注：' + d.adminNote; el.append(n); }
      const actions = document.createElement('div'); actions.className = 'actions';
      const evBtn = document.createElement('button'); evBtn.className = 'ghost'; evBtn.textContent = '查看证据';
      evBtn.addEventListener('click', async () => {
        const box = el.querySelector('.di-evidence');
        if (box) { box.hidden = !box.hidden; return; }
        const box2 = document.createElement('div'); box2.className = 'di-evidence'; box2.hidden = false;
        box2.textContent = '加载中…';
        el.append(box2);
        try {
          const r = await fetch(base() + '/api/errand/disputes/' + d.id + '/evidence', { headers: { Authorization: auth() } });
          const j = await r.json();
          if (r.ok) {
            const evs = j.evidence || [];
            box2.textContent = '';
            if (!evs.length) { const sp = document.createElement('span'); sp.className = 'hint'; sp.textContent = '该申诉没有上传证据。'; box2.append(sp); }
            else for (const v of evs) {
              try {
                const rb2 = await fetch(base() + '/api/errand/evidence/' + v.id, { headers: { Authorization: auth() } });
                if (!rb2.ok) { const sp = document.createElement('span'); sp.className = 'hint'; sp.textContent = '证据 ' + v.id + ' 加载失败：' + rb2.status; box2.append(sp); continue; }
                const blob = await rb2.blob();
                const img = document.createElement('img'); img.className = 'ev-img'; img.src = URL.createObjectURL(blob); img.alt = '证据'; img.loading = 'lazy'; box2.append(img);
              } catch (e2) { const sp = document.createElement('span'); sp.className = 'hint'; sp.textContent = '证据 ' + v.id + ' 请求失败：' + e2.message; box2.append(sp); }
            }
          } else { box2.textContent = '加载失败：' + (j.error || r.status); }
        } catch (e) { box2.textContent = '请求失败：' + e.message; }
      });
      actions.append(evBtn);
      if (d.status === 'open') {
        const resolveBtn = document.createElement('button'); resolveBtn.textContent = '标记解决';
        resolveBtn.addEventListener('click', () => resolveDispute(d, 'resolved'));
        const rejectBtn = document.createElement('button'); rejectBtn.className = 'danger'; rejectBtn.textContent = '驳回';
        rejectBtn.addEventListener('click', () => resolveDispute(d, 'rejected'));
        actions.append(resolveBtn, rejectBtn);
      }
      el.append(actions);
      list.append(el);
    }
  };
  const resolveDispute = async (d, status) => {
    const note = status === 'rejected'
      ? (window.prompt('驳回原因（将展示给申诉双方，必填）', '') || '').trim()
      : (window.prompt('处理备注（选填，将展示给双方）', '') || '').trim();
    if (status === 'rejected' && !note) { showMsg('驳回必须填写原因。', false); return; }
    try {
      const r = await fetch(base() + '/api/errand/admin/disputes/' + d.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: auth() },
        body: JSON.stringify({ status, note }),
      });
      const j = await r.json();
      if (r.ok && j.ok) { showMsg('申诉 #' + d.id + ' 已处理。', true); loadDisputesAdmin(); }
      else if (r.status === 401) showMsg('令牌无效，请重新填写。', false);
      else showMsg('处理失败：' + (j.error || r.status), false);
    } catch (e) { showMsg('处理失败：' + e.message, false); }
  };
  const loadDisputesAdmin = async () => {
    try {
      const r = await fetch(base() + '/api/errand/disputes', { headers: { Authorization: auth() } });
      const j = await r.json();
      if (r.ok) renderDisputes(j.disputes || []);
      else if (r.status === 401) { /* 令牌无效，稍后重试 */ }
    } catch (e) { /* 静默 */ }
  };
  $('#load-disputes').addEventListener('click', loadDisputesAdmin);

  // 管理操作审计（2026-08-22）：GET /api/errand/admin/logs
  const loadLogs = async () => {
    const btn = $('#load-logs');
    btn.disabled = true; btn.textContent = '加载中…';
    try {
      const r = await fetch(base() + '/api/errand/admin/logs?pageSize=50', { headers: { Authorization: auth() } });
      const j = await r.json();
      if (r.ok) {
        const logs = j.logs || [];
        $('#logs-count').textContent = '共 ' + (j.total || 0) + ' 条（显示最近 ' + logs.length + ' 条）';
        $('#logs-list').innerHTML = logs.length
          ? logs.map(l =>
              '<div class="fb"><div class="meta"><span class="page">' + esc(l.action) + '</span>' +
              '<span class="time">' + fmt(l.createdAt) + ' · 操作者 ' + esc(l.admin) + '</span></div>' +
              (l.detail ? '<div class="detail">' + esc(l.detail) + '</div>' : '') + '</div>'
            ).join('')
          : '<div class="empty">暂无审计记录。</div>';
      }
      else if (r.status === 401) showMsg('令牌无效或未填写，请在上方输入正确令牌后重试。', false);
      else showMsg('加载失败：' + (j.error || r.status), false);
    } catch (e) { showMsg('请求失败：' + e.message, false); }
    btn.disabled = false; btn.textContent = '刷新';
  };
  $('#load-logs').addEventListener('click', loadLogs);

  loadNotice();
})();
