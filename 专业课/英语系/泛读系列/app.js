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
  const kindLabel = kind => ({word:'单词', fill:'填空', grammar:'语法', '':''}[kind] || kind);
  let bookKey = '';
  const getBook = key => data.find(b => b.key === key);
  const unitOf = key => { const b = getBook(bookKey); return b && b.units.find(u => u.key === key); };
  const totalQ = book => book.units.reduce((n, u) => n + u.questions.length, 0);

  function card(question, unitKey, index) {
    const hasOptions = Array.isArray(question.options) && question.options.length;
    const options = hasOptions ? question.options.map((opt, i) =>
      `<button class="option" data-action="choose" data-u="${unitKey}" data-index="${index}" data-opt="${i}"><span class="radio"></span><span>${letterOf(i)}．${escape(opt)}</span></button>`).join('') : '';
    return `<article class="card" id="${unitKey}-q${index}">
      <div class="qrow"><span class="qindex">${index + 1}</span><div><h2>${question.q || ''}</h2><span class="tag">${question.type === 'choice' ? '选择' : '填空/翻译'}</span></div></div>
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
    app.innerHTML = `<button class="back" data-action="home">‹ 返回教材列表</button><section class="hero compact"><small>${escape(book.name)}</small><div class="stats"><span><b>${book.units.length}</b>单元</span><span><b>${totalQ(book)}</b>题目</span></div></section>
      <div class="actions"><button data-action="export">导出全部题目 A4 PDF</button></div>
      <p class="notice">点击单元展开题目；选择题点击选项判题，其余题型展开参考答案。</p>
      <section class="unit-list">${book.units.map(unit => `<details class="unit" data-unit="${unit.key}"><summary><span>${escape(unit.name)}</span><small>${unit.questions.length} 题${unit.kind ? ' · ' + kindLabel(unit.kind) : ''}</small></summary><div class="unit-body"></div></details>`).join('')}</section>
      <button class="to-top" data-action="top">↑<small>顶部</small></button>`;
  }

  function renderUnit(detailsEl) {
    const unit = unitOf(detailsEl.dataset.unit);
    if (!unit) return;
    const body = detailsEl.querySelector('.unit-body');
    const modules = (unit.modules || []).map(m => `<div class="module-title">${escape(m)}</div>`).join('');
    const instruction = unit.instruction ? `<p class="module-instruction">${escape(unit.instruction)}</p>` : '';
    body.innerHTML = modules + instruction + unit.questions.map((q, i) => card(q, unit.key, i)).join('');
  }

  function choose(unitKey, index, optIndex) {
    const unit = unitOf(unitKey);
    const q = unit && unit.questions[index];
    if (!q || q.type !== 'choice' || !q.options) return;
    const right = [...String(q.answer || '').match(/[A-E]/g) || []].map(l => l.charCodeAt(0) - 65);
    const cardNode = document.getElementById(`${unitKey}-q${index}`);
    if (!cardNode) return;
    const buttons = [...cardNode.querySelectorAll('.option')];
    buttons.forEach((btn, i) => {
      if (right.includes(i)) btn.classList.add('correct');
      else if (i === optIndex) btn.classList.add('wrong');
      btn.disabled = true;
    });
    // 展开答案反馈
    const ansNode = cardNode.querySelector('.answer');
    const toggle = cardNode.querySelector('.answer-toggle');
    if (ansNode && toggle) {
      ansNode.hidden = false;
      ansNode.textContent = '正确答案：' + right.map(i => `${letterOf(i)}．${q.options[i]}`).join('；');
      toggle.textContent = '收起答案';
    }
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

  function exportBook() {
    const book = getBook(bookKey);
    if (!book) return;
    const questions = [];
    for (const unit of book.units) for (const q of unit.questions) {
      questions.push({
        question: clean(q.q),
        options: (q.options || []).map(clean),
        answer: q.type === 'choice' ? [...String(q.answer || '').match(/[A-E]/g) || []].map(l => `${l}. ${q.options[l.charCodeAt(0) - 65] || ''}`).join('\n') : (q.answer || ''),
        type: q.type === 'choice' ? '选择' : '填空/翻译'
      });
    }
    window.A4QuestionPrint?.open({ title: book.name, subtitle: `${questions.length} 题`, questions });
  }

  app.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'hub') location.href = '../../index.html';
    else if (action === 'home') renderHome();
    else if (action === 'book') renderBook(target.dataset.book);
    else if (action === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (action === 'export') exportBook();
    else if (action === 'choose') choose(target.dataset.u, Number(target.dataset.index), Number(target.dataset.opt));
    else if (action === 'answer') toggleAnswer(target.dataset.u, Number(target.dataset.index));
  });
  // 单元折叠展开时惰性渲染题目（details.open 在 click 冒泡时已更新，兼容旧 Safari 无 toggle 事件）
  app.addEventListener('click', event => {
    const details = event.target.closest('details.unit');
    if (details && details.open && !details.dataset.rendered) {
      details.dataset.rendered = '1';
      renderUnit(details);
    }
  });

  renderHome();
})();
