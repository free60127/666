(() => {
  const banks = window.COMPUTER_BANKS || [];
  const labels = {all: '全部', single: '单选题', multi: '多选题', theory: '基本理论观点', short: '简答题', essay: '论述题', material: '材料分析题'};
  // Bump whenever the source data is corrected so saved mock papers rebuild.
  const PAPER_VERSION = 1;
  const storeKey = 'computer-h5-state-v1';
  const paymentQr = window.PAYMENT_QR_DATA_URL || '../payment-qr.jpg';
  const welcomeCat = window.WELCOME_CAT_DATA_URL || '../welcome-cat.jpg';
  const app = document.getElementById('app');
  // Handles both /栏目/index.html and a directory-style /栏目 URL on GitHub Pages.
  // The latter otherwise makes ../index.html jump outside a project Pages site.
  const goToHub = () => {
    const parts = location.pathname.replace(/\/+$/, '').split('/');
    if (parts[parts.length - 1]?.toLowerCase() === 'index.html') parts.pop();
    parts.pop();
    parts.push('index.html');
    location.href = `${location.protocol}//${location.host}${parts.join('/')}`;
  };
  let saved = (() => { try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch (_) { return {}; } })();
  let screen = 'home';
  let bankKey = '';
  let paper = null;
  let mistakes = false;
  let filter = 'all';
  let displayLimit = 30;
  let accessDialog = '';

  let persistWarned = false;
  const showPersistWarning = () => {
    if (persistWarned) return;
    persistWarned = true;
    const bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:70;max-width:min(92vw,560px);padding:10px 14px;border-radius:10px;background:#fff8e6;border:1px solid #e4b84a;color:#6b4d00;box-shadow:0 6px 20px rgba(0,0,0,.12);font-size:14px;line-height:1.5';
    bar.textContent = '⚠ 本地保存失败（浏览器存储不可用或空间不足），答题进度可能无法保存。';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '知道了';
    close.style.cssText = 'border:0;background:#e4b84a;color:#fff;border-radius:999px;padding:4px 12px;margin-left:10px;cursor:pointer';
    close.addEventListener('click', () => bar.remove());
    bar.appendChild(close);
    document.body.appendChild(bar);
    setTimeout(() => bar.remove(), 10000);
  };
  const persist = () => { try { localStorage.setItem(storeKey, JSON.stringify(saved)); } catch (error) { console.warn('计算机刷题: 保存失败', error); showPersistWarning(); } };
  const getBank = key => banks.find(bank => bank.key === key);
  const bankQuestions = () => paper ? paper.questions : (getBank(bankKey)?.questions || []);
  const questionKey = question => paper ? `paper-${paper.key}-${question.id}` : `${bankKey}-${question.type}-${question.id}`;
  const questionToken = question => paper ? `${paper.key}--${question.id}` : `${question.type}--${question.id}`;
  const stateFor = question => saved.progress?.[questionKey(question)] || {};
  const ensure = () => { if (!saved.progress) saved.progress = {}; if (!saved.papers) saved.papers = {}; };
  // First-time visitors have no localStorage state yet.  Initialize it before
  // any option/answer interaction so the very first tap can be persisted.
  ensure();
  persist();
  const escape = text => String(text || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const displayText = text => escape(text).replace(/\n/g, '<br>');
  // Remove source-document answer blanks such as "（ ）" only when they
  // appear at the very end of an option; normal brackets in the text remain.
  const optionText = text => String(text || '').replace(/\s*[（(]\s*[）)]\s*$/, '');
  const answerMarker = /([（(]\s*[一二三四五六七八九十\d]+\s*[）)]|[一二三四五六七八九十]+、|[①②③④⑤⑥⑦⑧⑨⑩])/g;
  const answerLine = text => escape(text).replace(/([（(]\s*\d+\s*分\s*[）)])/g, '<span class="score">$1</span>');
  // Only numbered outline markers with explicit punctuation are candidates.
  // This deliberately excludes prose such as “第一次”“第一位”.
  // Deliberately accept only formal enumerators, never words such as
  // “第一次”“第一粒扣子”“第一阶段”.
  const wordAnswerMarker = /(第[一二三四五六七八九十]+(?:、|，|,|：|:)|[一二三四五六七八九十]+是(?:、|，|,|：|:))/g;
  const repeatedLead = '(?:意味着|表明|说明|体现|要求|有利于|必须|需要|坚持|促进|推动|反映|标志着|关键是|核心是|根本是)';
  const allAnswerMarkers = new RegExp(`${answerMarker.source}|${wordAnswerMarker.source}`, 'g');
  const answerStartMarker = new RegExp(`^(?:${answerMarker.source}|${wordAnswerMarker.source})`);
  // Short labels such as “内容：”“意义：”“教训：” are answer section
  // headings, even where the source document omitted a number before them.
  const sectionHeadingNames = '根本原因|主要原因|直接原因|原因|内容|意义|教训|启示|结论|特点|表现|作用|要求|原则|措施|途径|本质|实质|内涵|关系|影响|任务|目标|重点|关键|基础|保证';
  const sectionHeadingAtStart = new RegExp(`^(${sectionHeadingNames})：$`);
  const sectionHeadingAfterScore = new RegExp(`([（(]\\s*\\d+\\s*分\\s*[）)])\\s*(${sectionHeadingNames})：`, 'g');
  const repeatedStartMarker = new RegExp(`^(${repeatedLead})`);
  const repeatedAfterSemicolon = new RegExp(`([；;])\\s*(?=${repeatedLead})`, 'g');
  const scorePrefix = /^[（(]\s*\d+\s*分\s*[）)]\s*/;
  const parallelLead = /^(是|要|应|必须|坚持|通过|以|把|从|在|由|对于|实现|促进|推动|反映|体现|表明|说明|意味着|有利于|需要|要求)/;
  function findParallelSemicolonLead(source) {
    const leads = source.split(/[；;]/).map(part => part.trim().replace(scorePrefix, '')).map(part => part.match(parallelLead)?.[1]).filter(Boolean);
    return [...new Set(leads)].find(lead => leads.filter(item => item === lead).length >= 2) || '';
  }
  // Detect repeated sentence-openers such as “马克思主义是…” or
  // “法治思维以…”.  A prefix must occur at least twice after a sentence
  // boundary, preventing ordinary long prose from being split.
  function findRepeatedPhraseLead(source) {
    const clauses = source.split(/[。；;]/).map(part => part.trim().replace(scorePrefix, '')).filter(Boolean);
    const candidates = clauses.map(part => {
      const matched = part.match(/^([\u4e00-\u9fff]{2,10}(?:是|以|要|应当|必须|需要|具有|坚持|通过|反映|体现|表明|意味着))/);
      return matched?.[1] || '';
    }).filter(Boolean);
    return [...new Set(candidates)].find(lead => candidates.filter(item => item === lead).length >= 2) || '';
  }
  const regexEscape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasParallelWordOutline = source => {
    const first = /第[一二三四五六七八九十]+(?:、|，|,|：|:)/.test(source) && /第[二三四五六七八九十]+(?:、|，|,|：|:)/.test(source);
    const second = /[一二三四五六七八九十]是(?:、|，|,|：|:)/.test(source) && /[二三四五六七八九十]是(?:、|，|,|：|:)/.test(source);
    return first || second;
  };
  function formatAnswer(answer) {
    const source = String(answer || '').replace(/\r/g, '').trim();
    if (!source) return '<p class="answer-lead">原文未提供标准答案，请结合教材复习。</p>';
    const hasRepeatedLead = (source.match(new RegExp(repeatedLead, 'g')) || []).length > 1;
    const markerPattern = hasParallelWordOutline(source) ? allAnswerMarkers : answerMarker;
    const startPattern = hasParallelWordOutline(source) ? answerStartMarker : new RegExp(`^(?:${answerMarker.source})`);
    const semicolonLead = findParallelSemicolonLead(source);
    const phraseLead = findRepeatedPhraseLead(source);
    const semicolonSeparator = semicolonLead ? new RegExp(`([；;])\\s*(([（(]\\s*\\d+\\s*分\\s*[）)])\\s*)?(?=${semicolonLead})`, 'g') : /$^/;
    const phraseSeparator = phraseLead ? new RegExp(`([。；;])\\s*(([（(]\\s*\\d+\\s*分\\s*[）)])\\s*)?(?=${phraseLead})`, 'g') : /$^/;
    const phraseStart = phraseLead ? new RegExp(regexEscape(phraseLead), 'g') : /$^/;
    const prepared = source.replace(markerPattern, match => `\n${match}`).replace(hasRepeatedLead ? repeatedAfterSemicolon : /$^/, '$1\n').replace(sectionHeadingAfterScore, '$1\n@@SECTION@@$2：\n').replace(semicolonSeparator, '$2\n').replace(phraseSeparator, '$2\n').replace(phraseStart, match => `\n${match}`);
    return prepared.split('\n').map(part => part.trim()).filter(Boolean).map(part => {
      const section = part.replace('@@SECTION@@', '');
      if (sectionHeadingAtStart.test(section)) return `<p class="answer-section">${escape(section)}</p>`;
      const matched = part.match(startPattern);
      const repeated = !matched && hasRepeatedLead ? part.match(repeatedStartMarker) : null;
      const parallel = !matched && !repeated && semicolonLead && part.replace(scorePrefix, '').startsWith(semicolonLead);
      const phrase = !matched && !repeated && !parallel && phraseLead && part.replace(scorePrefix, '').startsWith(phraseLead);
      if (!matched && !repeated && !parallel && !phrase) return `<p class="answer-lead">${answerLine(part)}</p>`;
      if (parallel) {
        const prefix = part.match(scorePrefix)?.[0] || '';
        const text = part.slice(prefix.length);
        const content = (prefix + text.slice(semicolonLead.length).trim()).replace(/[；;](?=\s*(?:[（(]\s*\d+\s*分|$))/, '');
        return `<div class="answer-item level-one parallel-item"><span class="answer-marker">${escape(semicolonLead)}</span><span class="answer-content">${answerLine(content)}</span></div>`;
      }
      if (phrase) {
        const prefix = part.match(scorePrefix)?.[0] || '';
        const text = part.slice(prefix.length);
        const content = (prefix + text.slice(phraseLead.length).trim()).replace(/[。；;](?=\s*(?:[（(]\s*\d+\s*分|$))/, '');
        return `<div class="answer-item level-one parallel-item"><span class="answer-marker">${escape(phraseLead)}</span><span class="answer-content">${answerLine(content)}</span></div>`;
      }
      const marker = (matched || repeated)[0]; const body = part.slice(marker.length).trim();
      const level = matched && /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(marker) ? 'level-two' : 'level-one';
      return `<div class="answer-item ${level}"><span class="answer-marker">${escape(marker)}</span><span class="answer-content">${answerLine(body)}</span></div>`;
    }).join('');
  }
  const shuffle = list => { const copy = [...list]; for (let i = copy.length - 1; i; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
  function accessOverlay() {
    if (accessDialog !== 'pay') return '';
    return `<div class="modal-mask" role="dialog" aria-modal="true"><section class="access-modal pay-modal"><button class="modal-x" data-action="modal-close" aria-label="关闭">×</button><p class="access-kicker">SUPPORT</p><h2>感谢你的赞助</h2><p>本题库永久免费使用。若它对你有帮助，欢迎微信扫码自愿赞助。</p><img class="payment-qr" src="${escape(paymentQr)}" alt="微信收款码"><p class="payment-note">赞助完全自愿，不影响题库、模拟卷和错题本的全部使用。</p></section></div>`;
  }

  function summary(bank) {
    const counts = bank.questions.reduce((out, question) => (out[question.type] = (out[question.type] || 0) + 1, out), {});
    // 只统计普通题库进度：模拟卷使用独立 key（paper-…），不得混入
    const progress = Object.entries(saved.progress || {}).filter(([key]) => key.startsWith(`${bank.key}-`) && !key.startsWith('paper-'));
    const correct = progress.filter(([, item]) => item.ok).length;
    return {...counts, total: bank.questions.length, done: progress.length, mistakes: progress.filter(([, item]) => item.wrong).length, accuracy: progress.length ? `${Math.round(correct / progress.length * 100)}%` : '—'};
  }

  // 题库内容指纹：任一题题干/答案变化都会改变指纹，
  // 使旧模拟卷自动重建（随机抽题结果不变时仍可保留进度）。
  const bankFingerprint = bank => { let value = 2166136261; for (const question of bank.questions) { const t = String(question.title || '') + String(question.answer || ''); for (const char of t) value = Math.imul(value ^ char.charCodeAt(0), 16777619); } return (value >>> 0).toString(36); };

  function paperPlan(bank) {
    const defaults = {single: 20, multi: 20, short: 5, essay: 2, material: 2};
    return Object.fromEntries(Object.entries(defaults).map(([type, count]) => [type, Math.min(count, bank.questions.filter(question => question.type === type).length)]).filter(([, count]) => count));
  }

  function createPaper(bank, number) {
    let id = 0;
    const plan = paperPlan(bank);
    return {key: `${bank.key}-${number}`, bankKey: bank.key, number, version: PAPER_VERSION, fingerprint: bankFingerprint(bank), questions: Object.entries(plan).flatMap(([type, count]) => shuffle(bank.questions.filter(question => question.type === type)).slice(0, count).map(question => ({...question, id: ++id, sourceId: question.id, sourceType: type})))};
  }

  function loadPaper(key, number) {
    ensure();
    const bank = getBank(key);
    const old = saved.papers[`${key}-${number}`];
    paper = old && old.version === PAPER_VERSION && old.fingerprint === bankFingerprint(bank) ? old : createPaper(bank, number);
    saved.papers[paper.key] = paper;
    persist(); bankKey = key; screen = 'questions'; mistakes = false; filter = 'all'; displayLimit = 30; render();
  }

  // 模拟卷自身统计（与普通题库进度分离）
  function paperSummary() {
    if (!paper) return null;
    const entries = Object.entries(saved.progress || {}).filter(([key]) => key.startsWith(`paper-${paper.key}-`));
    const attempted = entries.filter(([, item]) => item.answered || item.ok || item.wrong);
    const correct = entries.filter(([, item]) => item.ok).length;
    return {total: paper.questions.length, done: attempted.length, accuracy: attempted.length ? `${Math.round(correct / attempted.length * 100)}%` : '—', mistakes: entries.filter(([, item]) => item.wrong).length};
  }

  function card(question) {
    const state = stateFor(question);
    const choices = question.options || [];
    const answer = question.answer || '';
    const token = questionToken(question);
    const options = choices.map((option, index) => {
      const feedback = state.feedback?.[index] || '';
      const selected = state.selected?.includes(index) ? 'selected' : '';
      return `<button class="option ${feedback} ${selected}" data-action="choose" data-id="${token}" data-index="${index}"><span class="${question.type === 'multi' ? 'check' : 'radio'} ${selected}"></span><span>${String.fromCharCode(65 + index)}．${displayText(optionText(option))}</span></button>`;
    }).join('');
    return `<article class="card" id="q-${token}"${paper ? ' data-unified-scope="paper"' : ''}>
      <div class="qrow"><span class="qindex">${question.displayNumber || question.id}</span><div><h2>${displayText(question.title)}</h2><span class="tag">${labels[question.type] || question.type}</span>${question.hint ? `<span class="hint">记忆 · ${escape(question.hint)}</span>` : ''}</div></div>
      ${choices.length ? `<div class="options">${options}${question.type === 'multi' && answer ? `<button class="confirm" data-action="confirm" data-id="${token}">确认答案</button>` : ''}</div>` : ''}
      <button class="answer-toggle" data-action="answer" data-id="${token}">${state.showAnswer ? '收起答案' : '点击展开答案'}</button>
      ${state.showAnswer ? `<div class="answer">${escape(answer || '原文未提供标准答案，请结合教材复习。')}</div>` : ''}
    </article>`;
  }

  function renderHome() {
    app.innerHTML = `<button class="back hub-back" data-action="hub">‹ 返回知识分享站</button><header class="brand"><div class="mark">C</div><div><strong>计算机 · 刷题站</strong><small>COMPUTING REVIEW / 2026</small></div></header>
      <section class="hero"><small>COMPUTER QUESTION BANKS</small><h1>选择你的<span>计算机题库。</span></h1><p>题库进度保存在本机，可随时继续练习。</p></section>
      <section class="bank-list">${banks.map(bank => { const s = summary(bank); return `<button class="bank-card" data-action="bank" data-bank="${bank.key}"><div><b>${escape(bank.shortName)}</b><em>进入</em></div><h2>${escape(bank.name)}</h2><p>${escape(bank.subtitle)}</p><small>${s.total} 题　已完成 ${s.done}　正确率 ${s.accuracy}</small><footer>${['single','multi','theory','short','essay','material'].filter(type => s[type]).map(type => `<i>${labels[type]} ${s[type]}</i>`).join('')}</footer></button>`; }).join('')}</section>
      <button class="entry mistake-entry" data-action="mistakes"><b>错</b><span><strong>错题本</strong><small>按题库归类，反复训练直到答对</small></span><em>进入</em></button>
      <section class="practice-qr"><div><strong>计算机实操题</strong><small>提取密码：FREE</small></div><img src="computer-practice-qr.png" alt="计算机实操题资料二维码"></section>`;
  }

  function renderPapers() {
    app.innerHTML = `<button class="back" data-action="home">‹ 返回题库</button><section class="hero"><small>MOCK EXAMS</small><h1>开始一套<span>模拟卷。</span></h1><p>题目随机抽取；再次打开会保留同一套卷子。</p></section>${banks.map(bank => { const plan = paperPlan(bank); const description = Object.entries(plan).map(([type, count]) => `${count} ${labels[type].replace('题','')}`).join(' · '); return `<section class="paper-bank"><h2>${escape(bank.shortName)}</h2><p>${description}</p><div>${[1,2,3,4,5].map(number => `<button data-action="paper" data-bank="${bank.key}" data-paper="${number}">模拟卷${number}${saved.papers?.[`${bank.key}-${number}`] ? '<small>已生成</small>' : ''}</button>`).join('')}</div></section>`; }).join('')}`;
  }

  function renderMistakes() {
    app.innerHTML = `<button class="back" data-action="home">‹ 返回题库</button><section class="hero"><small>MISTAKE REVIEW</small><h1>集中攻克<span>错题。</span></h1><p>答对后会自动从错题本移除。</p></section><section class="bank-list">${banks.map(bank => { const s = summary(bank); return `<button class="bank-card ${s.mistakes ? '' : 'disabled'}" data-action="mistake-bank" data-bank="${bank.key}"><div><b>${escape(bank.shortName)}</b><em>${s.mistakes ? '练习' : '暂无错题'}</em></div><h2>${escape(bank.name)}</h2><small>错题 ${s.mistakes}　已完成 ${s.done}</small></button>`; }).join('')}</section>`;
  }

  function renderQuestions() {
    const bank = getBank(bankKey); const source = bankQuestions();
    const questions = source.filter(question => !mistakes || stateFor(question).wrong);
    const types = ['all', ...Object.keys(labels).filter(type => type !== 'all' && questions.some(question => question.type === type))];
    const matching = questions.filter(question => filter === 'all' || question.type === filter);
    const visible = matching.slice(0, displayLimit);
    const s = paper ? paperSummary() : summary(bank);
    let previousSection = '';
    const cards = visible.map(question => {
      const notices = filter === 'all' && question.beforeSections ? question.beforeSections.map(title => `<h3 class="section-heading section-heading-empty">${escape(title)}</h3><p class="section-empty-note">原文在此标题后未提供可录入的题目。</p>`).join('') : '';
      const heading = question.section && question.section !== previousSection ? `<h3 class="section-heading">${escape(question.section)}</h3>` : '';
      previousSection = question.section || previousSection;
      return notices + heading + card(question);
    }).join('');
    app.innerHTML = `<button class="back" data-action="back">‹ 返回题库</button><section class="hero compact"><small>${mistakes ? '错题本 · ' : ''}${escape(paper ? `${bank.name} · 模拟卷${paper.number}` : bank.name)}</small><div class="stats"><span><b>${paper || mistakes ? questions.length : s.total}</b>题目</span><span><b>${s.done}</b>已完成</span><span><b>${s.accuracy}</b>正确率</span></div></section>
      <nav class="tabs">${types.map(type => `<button class="${filter === type ? 'active' : ''}" data-action="filter" data-filter="${type}">${labels[type]}</button>`).join('')}</nav>
      <div class="actions"><button data-action="random">↻ 随机一题</button><button data-action="export">导出当前题目 A4 PDF</button>${paper ? '<button data-action="clear-paper">清空本模拟卷进度</button>' : (!mistakes ? '<button data-action="clear">清除本题库进度</button>' : '')}</div><p class="notice">${mistakes ? '错题答对后将自动移出错题本。' : '选择题支持判题；简答、论述和材料题可展开参考答案。'}</p>
      ${visible.length ? cards : '<p class="empty">本题库暂无错题，继续保持。</p>'}${visible.length < matching.length ? `<div class="actions"><button data-action="more">加载更多（剩余 ${matching.length - visible.length} 题）</button></div>` : ''}`;
  }

  function render() { if (screen === 'home') renderHome(); else if (screen === 'papers') renderPapers(); else if (screen === 'mistakes') renderMistakes(); else renderQuestions(); document.querySelectorAll('.answer').forEach(node => { node.innerHTML = formatAnswer(node.textContent); }); app.insertAdjacentHTML('beforeend', accessOverlay()); }
  function findQuestion(id) { return bankQuestions().find(question => questionToken(question) === String(id)); }
  function printableQuestion(question) {
    return question.title || '';
  }
  function printableAnswer(question) {
    const answer = String(question.answer || '').trim();
    // 支持 A-Z（按 options.length 过滤越界字母），当前题库为 A-E
    const letters = (answer.match(/^[A-Z]+/i)?.[0].toUpperCase().split('') || []).filter(l => l.charCodeAt(0) - 65 < (question.options || []).length);
    if (!letters.length || !(question.options || []).length) return answer || '原文未提供标准答案，请结合教材复习。';
    const choices = letters.map(letter => {
      const option = question.options[letter.charCodeAt(0) - 65];
      return option === undefined ? letter : `${letter}. ${optionText(option)}`;
    }).join('\n');
    const explanation = answer.slice(letters.length).trim();
    return explanation ? `${choices}\n${explanation}` : choices;
  }
  function exportCurrentQuestions() {
    const bank = getBank(bankKey);
    const questions = bankQuestions().filter(question => !mistakes || stateFor(question).wrong).filter(question => filter === 'all' || question.type === filter);
    const title = paper ? `${bank.name} · 模拟卷${paper.number}` : (mistakes ? `${bank.name} · 错题本` : bank.name);
    window.A4QuestionPrint?.open({
      title,
      subtitle: `${labels[filter] || labels.all} · ${questions.length} 题`,
      questions: questions.map(question => ({question: printableQuestion(question), options: (question.options || []).map(optionText), answer: printableAnswer(question), type: labels[question.type] || question.type})),
    });
  }
  function judge(question) { const key = questionKey(question); const item = saved.progress[key] || {}; const right = (String(question.answer).match(/^[A-Z]+/i)?.[0].toUpperCase().split('').map(letter => letter.charCodeAt(0) - 65) || []).filter(index => index < (question.options || []).length); const picked = item.selected || []; item.feedback = question.options.map((_, index) => right.includes(index) ? 'correct' : picked.includes(index) ? 'wrong' : ''); item.ok = right.length === picked.length && right.every(index => picked.includes(index)); item.wrong = !item.ok; saved.progress[key] = item; persist(); }

  app.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const {action, bank, paper: paperNo, id, index, filter: nextFilter} = button.dataset;
    if (action === 'sponsor') { accessDialog = 'pay'; render(); return; }
    if (action === 'modal-close') { accessDialog = ''; render(); return; }
    if (action === 'hub') { goToHub(); return; }
    if (action === 'home') { screen = 'home'; bankKey = ''; paper = null; mistakes = false; }
    if (action === 'bank') { bankKey = bank; screen = 'questions'; paper = null; mistakes = false; filter = 'all'; displayLimit = 30; }
    if (action === 'papers') screen = 'papers';
    if (action === 'paper') return loadPaper(bank, Number(paperNo));
    if (action === 'mistakes') screen = 'mistakes';
    if (action === 'mistake-bank') { if (!summary(getBank(bank)).mistakes) return; bankKey = bank; screen = 'questions'; paper = null; mistakes = true; filter = 'all'; displayLimit = 30; Object.keys(saved.progress || {}).filter(key => key.startsWith(`${bank}-`) && saved.progress[key].wrong).forEach(key => { saved.progress[key] = {...saved.progress[key], selected: [], feedback: [], showAnswer: false}; delete saved.progress[key].ok; }); persist(); }
    if (action === 'back') { screen = paper ? 'papers' : (mistakes ? 'mistakes' : 'home'); paper = null; }
    if (action === 'filter') { filter = nextFilter; displayLimit = 30; render(); document.querySelector('.card')?.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
    if (action === 'more') { displayLimit += 30; render(); return; }
    if (action === 'export') { exportCurrentQuestions(); return; }
    if (action === 'random') { const list = bankQuestions().filter(question => (filter === 'all' || question.type === filter) && (!mistakes || stateFor(question).wrong)); if (!list.length) return; const question = list[Math.floor(Math.random() * list.length)]; document.getElementById(`q-${questionToken(question)}`)?.scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
    if (action === 'clear') { if (confirm('确定清除这个题库的答题进度吗？')) { Object.keys(saved.progress || {}).filter(key => key.startsWith(`${bankKey}-`)).forEach(key => delete saved.progress[key]); persist(); } }
    if (action === 'clear-paper') { if (confirm('确定清空这套模拟卷的答题进度吗？题目不会重新随机。')) { Object.keys(saved.progress || {}).filter(key => key.startsWith(`paper-${paper.key}-`)).forEach(key => delete saved.progress[key]); persist(); } }
    if (action === 'answer') { const question = findQuestion(id); const key = questionKey(question); saved.progress[key] = {...(saved.progress[key] || {}), showAnswer: !stateFor(question).showAnswer}; persist(); }
    if (action === 'choose') { const question = findQuestion(id); if (!question?.answer) return; const key = questionKey(question); const item = {...(saved.progress[key] || {})}; const choice = Number(index); const picked = [...(item.selected || [])]; if (question.type === 'multi') { const at = picked.indexOf(choice); at < 0 ? picked.push(choice) : picked.splice(at, 1); item.feedback = []; } else { picked.splice(0, picked.length, choice); } item.selected = picked; saved.progress[key] = item; if (question.type !== 'multi') judge(question); persist(); }
    if (action === 'confirm') { const question = findQuestion(id); judge(question); }
    render();
  });

  // focus 定位：统一引擎在目标题卡未渲染时广播 waiyuan:focus（学习中心「重新练习」跳转），
  // 这里反查题目所在题库并直接打开（目标题可能在第 30 题之后，需扩大显示范围）
  window.addEventListener('waiyuan:focus', event => {
    const targetKey = event.detail && event.detail.key;
    const compute = window.WaiyuanQuizEngine && window.WaiyuanQuizEngine.computeKey;
    if (!targetKey || !compute) return;
    for (const bank of banks) {
      for (const question of bank.questions) {
        if (compute(`q-${question.type}--${question.id}`, question.title) !== targetKey) continue;
        if (screen !== 'questions' || bankKey !== bank.key || paper || mistakes) {
          bankKey = bank.key; screen = 'questions'; paper = null; mistakes = false; filter = 'all';
          displayLimit = Math.max(30, bank.questions.indexOf(question) + 1);
        }
        render();
        return;
      }
    }
  });
  render();
})();
