(() => {
  // 内容展示页渲染（泛读系列/基英系列共用）：
  // 数据 = window.CONTENT_BOOKS（books[].units[].questions[]），由 source/*.json 构建。
  // 题目卡片结构与思政系列一致，自动获得统一引擎的收藏/进度/随机/错题记录能力。
  const data = (window.CONTENT_BOOKS || {}).books || [];
  const pageTitle = (document.getElementById('app')?.dataset.pageTitle) || '教材系列';
  const app = document.getElementById('app');
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
  const letterOf = i => String.fromCharCode(65 + i);
  const kindLabel = kind => ({word:'单词', fill:'填空', grammar:'语法', vocabulary:'词汇', wordFill:'选词填空', translation:'汉译英', '':''}[kind] || kind);
  const unitKindLabel = unit => unit.kindLabel || kindLabel(unit.kind) || '';
  let bookKey = '';
  const getBook = key => data.find(b => b.key === key);
  const unitOf = key => { const b = getBook(bookKey); return b && b.units.find(u => u.key === key); };
  const totalQ = book => book.units.reduce((n, u) => n + u.questions.length, 0);

  function card(question, unitKey, index) {
    const hasOptions = Array.isArray(question.options) && question.options.length;
    const multi = hasOptions && (String(question.answer || '').match(/[A-E]/g) || []).length > 1;
    const options = hasOptions ? question.options.map((opt, i) =>
      `<button class="option" data-action="choose" data-u="${unitKey}" data-index="${index}" data-opt="${i}"><span class="radio"></span><span>${letterOf(i)}．${escape(opt)}</span></button>`).join('') : '';
    return `<article class="card" id="${unitKey}-q${index}">
      <div class="qrow"><span class="qindex">${index + 1}</span><div><h2>${question.q || ''}</h2><span class="tag">${question.type === 'choice' ? (multi ? '多选' : '选择') : '填空/翻译'}</span></div></div>
      ${options ? `<div class="options">${options}</div>` : ''}
      <button class="answer-toggle" data-action="answer" data-u="${unitKey}" data-index="${index}">点击展开答案</button>
      <div class="answer" hidden></div>
    </article>`;
  }

  function renderHome() {
    app.innerHTML = `<button class="back hub-back" data-action="hub">‹ 返回英语系</button><header class="brand"><div class="mark">R</div><div><strong>${escape(pageTitle)}</strong><small>CONTENT LIBRARY / 2026</small></div></header>
      <section class="hero"><small>READING LIBRARY</small><h1>选择你的<span>教材系列。</span></h1><p>题目按单元组织，支持查词、收藏与答题进度记录。</p></section>
      <section class="bank-list">${data.map(book => `<button class="bank-card" data-action="book" data-book="${book.key}"><div><b>${escape(book.name)}</b><em>进入</em></div><h2>${escape(book.name)}</h2><p>${totalQ(book)} 题 · ${book.units.length} 个单元</p><small>展开单元即可刷题，选择题自动判题</small></button>`).join('')}</section>`;
  }

  function renderBook(key) {
    const book = getBook(key);
    if (!book) return renderHome();
    bookKey = key;
    // 按题型分组（基英按 kindLabel：选词填空/汉译英/词汇；泛读按 kind：单词/填空），组序保持数据顺序
    const groups = [];
    const groupMap = new Map();
    book.units.forEach(unit => {
      const label = unitKindLabel(unit);
      if (!groupMap.has(label)) { groupMap.set(label, []); groups.push({ label, units: groupMap.get(label) }); }
      groupMap.get(label).push(unit);
    });
    const unitDetails = unit => `<details class="unit" data-unit="${unit.key}"><summary><span>${escape(unit.name)}</span><small>${unit.questions.length} 题${unitKindLabel(unit) ? ' · ' + unitKindLabel(unit) : ''}</small></summary><div class="unit-body"></div></details>`;
    app.innerHTML = `<button class="back" data-action="home">‹ 返回教材列表</button><section class="hero compact"><small>${escape(book.name)}</small><div class="stats"><span><b>${book.units.length}</b>单元</span><span><b>${totalQ(book)}</b>题目</span></div></section>
      <div class="actions"><button data-action="export">导出全部题目 A4 PDF</button><button data-action="export-opened">导出已展开单元 PDF</button></div>
      <p class="notice">按题型展开单元；选择题点击选项判题，其余题型展开参考答案。</p>
      <section class="unit-list">${groups.map(group => (group.label ? `<div class="module-title">${escape(group.label)}</div>` : '') + group.units.map(unitDetails).join('')).join('')}</section>`;
  }

  function renderUnit(detailsEl) {
    const unit = unitOf(detailsEl.dataset.unit);
    if (!unit) return;
    const body = detailsEl.querySelector('.unit-body');
    const modules = (unit.modules || []).map(m => `<div class="module-title">${escape(m)}</div>`).join('');
    const instruction = unit.instruction ? `<p class="module-instruction">${escape(unit.instruction)}</p>` : '';
    body.innerHTML = modules + instruction + unit.questions.map((q, i) => card(q, unit.key, i)).join('');
  }

  function showAnswer(cardNode, q, right) {
    const ansNode = cardNode.querySelector('.answer');
    const toggle = cardNode.querySelector('.answer-toggle');
    if (ansNode && toggle) {
      ansNode.hidden = false;
      ansNode.textContent = '正确答案：' + right.map(i => `${letterOf(i)}．${q.options[i]}`).join('；');
      toggle.textContent = '收起答案';
    }
  }

  function choose(unitKey, index, optIndex) {
    const unit = unitOf(unitKey);
    const q = unit && unit.questions[index];
    if (!q || q.type !== 'choice' || !q.options) return;
    const right = [...String(q.answer || '').match(/[A-E]/g) || []].map(l => l.charCodeAt(0) - 65);
    const cardNode = document.getElementById(`${unitKey}-q${index}`);
    if (!cardNode) return;
    const buttons = [...cardNode.querySelectorAll('.option')];
    // 单选：点击即判定
    if (right.length <= 1) {
      buttons.forEach((btn, i) => {
        if (right.includes(i)) btn.classList.add('correct');
        else if (i === optIndex) btn.classList.add('wrong');
        btn.disabled = true;
      });
      showAnswer(cardNode, q, right);
      return;
    }
    // 多选（答案含多个字母，如 "CD"）：点击切换选中态，
    // 选中数量达到答案数时自动判定，避免逐一猜选。
    const btn = buttons[optIndex];
    if (!btn || btn.disabled) return;
    btn.classList.toggle('selected');
    const picked = buttons.map((b, i) => b.classList.contains('selected') ? i : -1).filter(i => i >= 0);
    if (picked.length < right.length) return;
    buttons.forEach((b, i) => {
      if (right.includes(i)) b.classList.add('correct');
      else if (picked.includes(i)) b.classList.add('wrong');
      b.disabled = true;
    });
    showAnswer(cardNode, q, right);
  }

  function toggleAnswer(unitKey, index) {
    const unit = unitOf(unitKey);
    const q = unit && unit.questions[index];
    const cardNode = document.getElementById(`${unitKey}-q${index}`);
    if (!cardNode) return;
    const ansNode = cardNode.querySelector('.answer');
    const toggle = cardNode.querySelector('.answer-toggle');
    if (!ansNode || !toggle) return;
    if (!ansNode.hidden) { ansNode.hidden = true; toggle.textContent = '点击展开答案'; return; }
    ansNode.hidden = false;
    if (q && q.type === 'choice' && q.options) {
      const letters = [...String(q.answer || '').match(/[A-E]/g) || []];
      ansNode.textContent = '正确答案：' + letters.map(l => `${l}．${q.options[l.charCodeAt(0) - 65]}`).join('；');
    } else {
      ansNode.textContent = (q && q.answer) || '原文未提供标准答案，请结合教材复习。';
    }
    toggle.textContent = '收起答案';
  }

  // 题目 → PDF 行映射（全部/已展开单元共用）
  function buildExportQuestions(units) {
    const questions = [];
    for (const unit of units) for (const q of unit.questions) {
      questions.push({
        question: clean(q.q),
        options: (q.options || []).map(clean),
        answer: q.type === 'choice' ? [...String(q.answer || '').match(/[A-E]/g) || []].map(l => `${l}. ${q.options[l.charCodeAt(0) - 65] || ''}`).join('\n') : (q.answer || ''),
        type: q.type === 'choice' ? '选择' : '填空/翻译'
      });
    }
    return questions;
  }
  function exportBook() {
    const book = getBook(bookKey);
    if (!book) return;
    const questions = buildExportQuestions(book.units);
    window.A4QuestionPrint?.open({ title: book.name, subtitle: `${questions.length} 题`, questions });
  }
  // 只导出当前展开的单元：范围可按需选择，避免整本书 PDF 过大
  function exportOpened() {
    const book = getBook(bookKey);
    if (!book) return;
    const details = [...app.querySelectorAll('details.unit[open]')];
    if (!details.length) {
      alert('请先展开需要导出的单元（点击单元标题展开），再点击「导出已展开单元 PDF」。');
      return;
    }
    const units = details.map(d => unitOf(d.dataset.unit)).filter(Boolean);
    if (!units.length) return;
    const questions = buildExportQuestions(units);
    window.A4QuestionPrint?.open({ title: `${book.name} · 已展开 ${units.length} 个单元`, subtitle: `${questions.length} 题`, questions });
  }

  app.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'hub') location.href = '../../index.html';
    else if (action === 'home') renderHome();
    else if (action === 'book') renderBook(target.dataset.book);
    else if (action === 'export') exportBook();
    else if (action === 'export-opened') exportOpened();
    else if (action === 'choose') choose(target.dataset.u, Number(target.dataset.index), Number(target.dataset.opt));
    else if (action === 'answer') toggleAnswer(target.dataset.u, Number(target.dataset.index));
  });
  // 单元折叠展开时惰性渲染题目：toggle 是 click 事件的默认动作，在事件传播
  // 结束后才更新 details.open——若在 click 冒泡时读 open 会拿到点击前的旧值，
  // 导致「首次点击展开不渲染、收回后再点才有内容」。改为不依赖 open 当前值：
  // 只要单元尚未渲染就渲染（渲染幂等，收起时提前渲染也无副作用），
  // 首次点击即可正常显示题目。
  app.addEventListener('click', event => {
    const details = event.target.closest('details.unit');
    if (details && !details.dataset.rendered) {
      details.dataset.rendered = '1';
      renderUnit(details);
    }
  });

  renderHome();
})();
