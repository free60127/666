(() => {
  // 词书数据按需加载：index.html 只载入 vocabulary-meta.js（元信息，几 KB），
  // 单本词书（tem4/tem8）由 loadBook 动态加载 vocabulary-data-<key>.js。
  // 累积式全局：window.WAIYUAN_VOCABULARY_BOOKS 始终为同一数组。
  const books = window.WAIYUAN_VOCABULARY_BOOKS = window.WAIYUAN_VOCABULARY_BOOKS || [];
  const meta = window.WAIYUAN_VOCABULARY_META || {books: []};
  const data = {version: 3, books};
  const BOOK_MEMORY_KEY = 'waiyuan-vocabulary-book-v1';
  const loadBook = (key, done) => {
    if (books.some(b => b.key === key)) return done();
    const script = document.createElement('script');
    script.src = `vocabulary-data-${key}.js?v=20260820-2343`;
    // 竞态保护：快速切换词书时，旧回调不得渲染（state.bookKey 已指向新书）
    script.onload = () => { if (state.bookKey === key) done(); };
    script.onerror = () => { if (state.bookKey !== key) return; root.innerHTML = `${brand}<section class="hero"><h1>词库加载失败<span>。</span></h1><p>请检查网络后重新点击词书卡片。</p><button class="primary" data-action="home">返回首页</button></section>`; };
    document.head.appendChild(script);
  };
  const fsrsApi = window.FSRS;
  if (!fsrsApi) {
    // vendor 脚本加载失败时给出可读提示，而不是在启动处抛异常白屏
    document.addEventListener('DOMContentLoaded', () => { const app = document.querySelector('#app'); if (app) app.innerHTML = '<section class="hero"><h1>复习引擎加载失败</h1><p>请刷新页面重试；若仍失败请清除浏览器缓存后重新打开。</p></section>'; });
    throw new Error('FSRS vendor not loaded');
  }
  const scheduler = fsrsApi.fsrs({enable_fuzz: false, enable_short_term: false});
  const root = document.querySelector('#app');
  const storageKey = 'waiyuan-vocabulary-progress-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch (_) { return {}; } };
  const progress = load();
  if (!progress.words) progress.words = {};
  if (!progress.history) progress.history = {};
  if (!progress.sequence) progress.sequence = {};
  if (!progress.settings) progress.settings = {dailyGoal: 10, autoSpeak: true, remindTime: ''};
  if (!progress.settings.dailyGoal) progress.settings.dailyGoal = 10;
  if (!progress.settings.remindTime) progress.settings.remindTime = '';
  if (progress.settings.autoSpeak === undefined) progress.settings.autoSpeak = true;
  const state = {view: 'home', bookKey: '', mode: 'card', queue: [], index: 0, initialTotal: 0, reviewed: 0, correct: 0, filter: 'all', listLimit: 200, listQuery: '', requeue: {}, recordedPositions: {}, advanceTimer: null};
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch (_) {} };
  // 通知权限请求兼容包装：旧 iOS Safari（<16）只支持回调式且不返回 Promise，
  // 直接 .then/.catch 会抛 TypeError 中断交互。
  const requestNotifyPermission = () => {
    try {
      if (!('Notification' in window) || typeof Notification.requestPermission !== 'function') return;
      let settled = false;
      const done = () => { settled = true; };
      const result = Notification.requestPermission(done);  // 回调式（旧 iOS）
      if (result && typeof result.then === 'function') result.then(done).catch(done);  // Promise 式
    } catch (_) {}
  };
  const day = (date = new Date()) => { const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return copy.toISOString().slice(0, 10); };
  const addDays = count => { const date = new Date(); date.setHours(12,0,0,0); date.setDate(date.getDate() + count); return day(date); };
  const shuffle = values => { const list = [...values]; for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
  const reviveCard = state => state && state.fsrs ? {...state.fsrs, due:new Date(state.fsrs.due), last_review:state.fsrs.last_review?new Date(state.fsrs.last_review):undefined} : fsrsApi.createEmptyCard(new Date());
  const serializeCard = card => ({...card, due:card.due instanceof Date?card.due.toISOString():card.due, last_review:card.last_review instanceof Date?card.last_review.toISOString():card.last_review});
  const book = () => data.books.find(item => item.key === state.bookKey);
  const orderedWords = item => [...item.words].sort((left, right) => (left.bookOrder ?? Number.MAX_SAFE_INTEGER) - (right.bookOrder ?? Number.MAX_SAFE_INTEGER));
  const wordState = word => progress.words[`${state.bookKey}:${word.id}`];
  const isLearned = item => !!(item && (item.fsrs || item.lastReviewed || Number(item.reps) > 0));
  const summary = item => {
    const states = item.words.map(word => progress.words[`${item.key}:${word.id}`]);
    const learned = states.filter(isLearned).length;
    return {...item,total:item.words.length,learned,mastered:states.filter(x=>x&&x.mastered).length,due:states.filter(x=>x&&x.due<=day()).length,favorites:states.filter(x=>x&&x.favorite).length,percent:Math.round(learned/item.words.length*100)};
  };
  const brand = '<header class="brand"><span class="mark">W</span><div><strong>外院 · 背单词</strong><small>VOCABULARY / 2026</small></div></header>';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function renderHome() {
    state.view = 'home';
    const cards = meta.books.map(item => {
      const loaded = books.find(b => b.key === item.key);
      const s = loaded ? summary(loaded) : {total: item.total, learned: '—', due: '—', percent: 0};
      return `<button class="book-card" data-action="book" data-book="${item.key}"><span class="book-code">${item.shortName}</span><span class="book-main"><h2>${item.name}</h2><p>${item.description}</p><span class="progress"><i style="width:${s.percent}%"></i></span><span class="meta"><span>共 ${s.total} 词</span><span>已学 ${s.learned}</span><span>待复习 ${s.due}</span></span>${loaded ? '' : '<small class="load-hint">词库未加载 · 点击后自动加载</small>'}</span><span class="arrow">›</span></button>`;
    }).join('');
    root.innerHTML = `${brand}<a class="back" href="../index.html">‹ 返回考证资料</a><section class="hero"><p class="kicker">SPACED REPETITION</p><h1>每天一点，<span>记得更久。</span></h1><div>支持卡片、选义、拼写、浏览器朗读和FSRS智能复习；进度保存在当前设备。</div></section><section class="books">${cards}</section><button class="license-button" data-action="licenses">开源参考与许可 ›</button>`;
  }

  function renderBook() {
    state.view = 'book';
    const s = summary(book());
    root.innerHTML = `${brand}<button class="topline" data-action="home">‹ 返回词书</button><section class="hero"><p class="kicker">${s.shortName}</p><h1>${s.name}<span>核心词汇。</span></h1></section><section class="summary"><button data-action="list" data-filter="all" aria-label="查看全部单词"><b>${s.total}</b><small>总词数</small></button><button data-action="list" data-filter="learned" aria-label="查看已学习单词"><b>${s.learned}</b><small>已学习</small></button><button data-action="list" data-filter="due" aria-label="查看待复习单词"><b>${s.due}</b><small>待复习</small></button><button data-action="list" data-filter="mastered" aria-label="查看已掌握单词"><b>${s.mastered}</b><small>已掌握</small></button></section><section class="goal"><span>每日新词</span><div>${[5,10,20].map(goal=>`<button class="${progress.settings.dailyGoal===goal?'active':''}" data-action="goal" data-goal="${goal}">${goal}</button>`).join('')}</div></section><section class="goal"><span>每日提醒</span><div>${[['','关闭'],['19:00','19:00'],['20:00','20:00'],['21:00','21:00'],['22:00','22:00']].map(([v,label])=>`<button class="${(progress.settings.remindTime||'')===v?'active':''}" data-action="remind" data-time="${v}">${label}</button>`).join('')}</div></section><h2 class="section-title">选择学习方式</h2><section class="modes"><button data-action="study" data-mode="card"><b>卡</b><span>单词卡片</span><small>翻面后自行判断</small></button><button data-action="study" data-mode="choice"><b>选</b><span>看词选义</span><small>四选一即时反馈</small></button><button data-action="study" data-mode="spelling"><b>拼</b><span>中文拼写</span><small>根据释义写单词</small></button></section><section class="tools"><button data-action="list" data-filter="all">全部单词</button><button data-action="list" data-filter="favorite">收藏夹 ${s.favorites}</button><button data-action="stats">学习统计</button></section>`;
  }

  function startStudy(mode) {
    state.mode = mode;
    const words = orderedWords(book());
    if (!progress.sequence[state.bookKey]) progress.sequence[state.bookKey] = {cursor: 0, orderVersion: 2};
    const sequence = progress.sequence[state.bookKey];
    if (sequence.orderVersion !== 2) { sequence.cursor = 0; sequence.orderVersion = 2; }
    const cursor = Math.max(0, Math.min(Number(sequence.cursor) || 0, Math.max(0, words.length - 1)));
    const ordered = [...words.slice(cursor), ...words.slice(0, cursor)];
    const dueAll = words.filter(word => isLearned(wordState(word)) && wordState(word).due <= day());
    // 待复习词可能很多：单次会话封顶 60 个，剩余在列表/下次继续，避免超长会话
    const DUE_SESSION_CAP = 60;
    const due = dueAll.slice(0, DUE_SESSION_CAP);
    state.dueNote = dueAll.length > DUE_SESSION_CAP ? `还有 ${dueAll.length - DUE_SESSION_CAP} 个待复习单词留在列表中，明天继续。` : '';
    const unseen = ordered.filter(word => !isLearned(wordState(word)));
    const remaining = Math.max(0, progress.settings.dailyGoal - due.length);
    state.queue = [...due, ...unseen.slice(0, remaining)];
    if (!state.queue.length) state.queue = ordered.slice(0, Math.min(progress.settings.dailyGoal, words.length));
    state.index = 0; state.initialTotal = state.queue.length; state.reviewed = 0; state.correct = 0; state.requeue = {}; state.recordedPositions = {};
    renderStudy();
  }

  function renderStudy() {
    state.view = 'study';
    if (state.index >= state.queue.length) return renderFinished();
    const current = state.queue[state.index];
    state.current = current;
    state.choices = shuffle([current, ...shuffle(book().words.filter(word=>word.id!==current.id)).slice(0,3)]);
    const favorite = !!(wordState(current) && wordState(current).favorite);
    const question = state.mode === 'spelling' ? `<div class="meaning spelling-clue">${current.meaning}</div><input class="spelling-input" id="spelling" autocomplete="off" autocapitalize="none" placeholder="输入英文单词"><button class="submit" data-action="spell">检查拼写</button><div id="feedback"></div>` : `<div class="word">${current.word}</div><div class="phonetic">${current.phonetic}</div>`;
    const activity = state.mode === 'choice' ? `<div class="choices">${state.choices.map(item=>`<button data-action="choice" data-id="${item.id}">${item.meaning}</button>`).join('')}</div><div id="feedback"></div>` : state.mode === 'card' ? '<button class="reveal" data-action="reveal">显示释义</button><div id="answer"></div>' : '';
    root.innerHTML = `<section class="study-head"><button data-action="book-back" aria-label="退出学习">×</button><button class="previous" data-action="previous" ${state.index===0?'disabled':''} aria-label="上一个单词">‹ 上一个</button><span class="study-progress"><i style="width:${Math.min(state.index+1,state.initialTotal)/state.initialTotal*100}%"></i></span><small>${Math.min(state.index+1,state.initialTotal)} / ${state.initialTotal}</small></section><section class="word-card"><button class="speak" data-action="speak">🔊 朗读</button><button class="favorite" data-action="favorite">${favorite?'★':'☆'}</button>${question}${activity}</section><section id="rating"></section>`;
    if (state.mode === 'spelling') document.querySelector('#spelling').focus();
    if (progress.settings.autoSpeak) setTimeout(speakWord, 160);
  }

  function speakWord() { if (!state.current || !('speechSynthesis' in window)) return; speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(state.current.word); utterance.lang = 'en-US'; utterance.rate = .85; try{const voices=speechSynthesis.getVoices()||[];utterance.voice=voices.find(v=>/en[-_]us/i.test(v.lang)&&/samantha|google us english|microsoft/i.test(v.name||''))||voices.find(v=>/^en/i.test(v.lang))||null}catch(_){} speechSynthesis.speak(utterance); }

  const answerHtml = () => `<div class="answer"><div class="meaning">${state.current.meaning}</div><div class="example">${state.current.example}</div></div>`;
  function reveal() { document.querySelector('#answer').innerHTML = answerHtml(); document.querySelector('.reveal').remove(); document.querySelector('#rating').innerHTML = `<div class="rating">${[['0','忘记','重新学习'],['1','模糊','较短间隔'],['2','认识','标准间隔'],['3','熟练','较长间隔']].map(x=>`<button data-action="rate" data-grade="${x[0]}"><b>${x[1]}</b><small>${x[2]}</small></button>`).join('')}</div>`; }
  function record(grade) {
    clearTimeout(state.advanceTimer);
    if (state.recordedPositions[state.index]) { state.index++; renderStudy(); return; }
    const key = `${state.bookKey}:${state.current.id}`;
    const old = progress.words[key] || {favorite:false};
    const rating = [fsrsApi.Rating.Again,fsrsApi.Rating.Hard,fsrsApi.Rating.Good,fsrsApi.Rating.Easy][grade] || fsrsApi.Rating.Again;
    const card = scheduler.next(reviveCard(old), new Date(), rating).card;
    const interval = Math.max(0, Math.round((card.due.getTime() - Date.now()) / 86400000));
    const reps = card.reps || 0;
    progress.words[key]={...old,fsrs:serializeCard(card),reps,interval,lapses:card.lapses||0,due:day(card.due),lastReviewed:day(),lastGrade:grade,mastered:card.stability>=21||reps>=5};
    const history=progress.history[day()]||{reviews:0,correct:0}; history.reviews++; if(grade>=2)history.correct++; progress.history[day()]=history;
    if(grade===0 && !state.requeue[state.current.id]){state.queue.push(state.current);state.requeue[state.current.id]=1}
    if (!isLearned(old)) {
      const words = orderedWords(book());
      const sourceIndex = words.findIndex(word => word.id === state.current.id);
      if (sourceIndex >= 0) progress.sequence[state.bookKey] = {cursor: (sourceIndex + 1) % words.length, orderVersion: 2};
    }
    state.recordedPositions[state.index] = true;
    state.reviewed++; if(grade>=2)state.correct++; save(); state.index++; renderStudy();
  }
  function feedback(correct, text) { const node=document.querySelector('#feedback'); node.className=`result ${correct?'correct':'wrong'}`; node.textContent=text; document.querySelector('.word-card').insertAdjacentHTML('beforeend',answerHtml()); state.advanceTimer=setTimeout(()=>record(correct?2:0),700); }
  function previousWord() { if (state.index <= 0) return; clearTimeout(state.advanceTimer); state.index--; renderStudy(); }
  function renderFinished(){state.view='finished';root.innerHTML=`${brand}<section class="finish"><div class="finish-icon">✓</div><section class="hero"><h1>今日任务<span>完成。</span></h1></section><section class="summary"><article><b>${state.reviewed}</b><small>复习次数</small></article><article><b>${state.correct}</b><small>记住次数</small></article></section>${state.dueNote ? `<p style="color:var(--muted);font-size:14px;margin:14px 0 0">${escapeHtml(state.dueNote)}</p>` : ''}<button class="primary" data-action="book-back">返回词书</button></section>`}
  function renderList(filter,limit=200){state.view='list';state.filter=filter;state.listLimit=limit;const today=day(),query=state.listQuery.trim().toLowerCase();const rows=orderedWords(book()).map(word=>({...word,state:wordState(word)})).filter(x=>filter==='favorite'?x.state&&x.state.favorite:filter==='learned'?isLearned(x.state):filter==='due'?isLearned(x.state)&&x.state.due<=today:filter==='mastered'?x.state&&x.state.mastered:true).filter(x=>!query||x.word.toLowerCase().includes(query)||x.meaning.toLowerCase().includes(query));const shown=rows.slice(0,limit);root.innerHTML=`${brand}<button class="topline" data-action="book-back">‹ 返回词书</button><section class="hero"><h1>单词<span>列表。</span></h1></section><div class="word-search"><input id="word-search" value="${escapeHtml(state.listQuery)}" placeholder="搜索单词或中文释义"><button data-action="word-search">搜索</button></div><div class="list-count">共 ${rows.length} 词 · 已显示 ${shown.length}</div><div class="filters">${[['all','全部'],['learned','已学习'],['due','待复习'],['favorite','收藏'],['mastered','已掌握']].map(x=>`<button class="${filter===x[0]?'active':''}" data-action="list" data-filter="${x[0]}">${x[1]}</button>`).join('')}</div>${shown.length?shown.map(x=>`<div class="word-row"><div><b>${x.word}</b><small>${x.phonetic} · ${x.meaning}</small>${x.bookPage?`<small>词汇书第 ${x.bookPage} 页 · ${x.levelName||''}</small>`:''}</div><span>${!isLearned(x.state)?'未学习':x.state.mastered?'已掌握':x.state.due<=today?'待复习':'学习中'}</span></div>`).join(''):'<div class="empty">这里还没有单词</div>'}${shown.length<rows.length?'<button class="load-more" data-action="list-more">继续显示200词</button>':''}`}
  function renderStats(){state.view='stats';const s=summary(book()),days=Object.keys(progress.history).sort().slice(-7).map(key=>({day:key.slice(5),...progress.history[key]})),reviews=days.reduce((n,x)=>n+x.reviews,0),correct=days.reduce((n,x)=>n+x.correct,0);root.innerHTML=`${brand}<button class="topline" data-action="book-back">‹ 返回词书</button><section class="hero"><h1>学习<span>统计。</span></h1></section><section class="summary"><article><b>${s.learned}</b><small>累计学习</small></article><article><b>${s.mastered}</b><small>已掌握</small></article><article><b>${reviews}</b><small>近7天复习</small></article><article><b>${reviews?Math.round(correct/reviews*100)+'%':'—'}</b><small>近7天记住率</small></article></section><section class="history"><h2>最近学习记录</h2>${days.length?days.map(x=>`<div class="history-row"><span>${x.day}</span><span><b>${x.reviews}</b> 次复习 · <b>${x.correct}</b> 次记住</span></div>`).join(''):'<div class="empty">完成一次学习后，这里会出现记录</div>'}</section>`}
  function renderLicenses(){state.view='licenses';root.innerHTML=`${brand}<button class="topline" data-action="home">‹ 返回词书</button><section class="hero"><p class="kicker">OPEN SOURCE</p><h1>开源参考与<span>许可。</span></h1></section><section class="license-card"><b>Qwerty Learner</b><strong>RealKai42 及贡献者 · GPL-3.0</strong><p>仅参考交互与功能分类，未复制代码、词库或语音资源。</p></section><section class="license-card"><b>UnlearnableWord（学不会单词）</b><strong>Mint-green 及贡献者 · MIT License</strong><p>参考小程序学习、复习和统计流程；当前实现为独立编写。</p></section><section class="license-card"><b>ts-fsrs 5.4.1</b><strong>Open Spaced Repetition 社区 · MIT License</strong><p>已用于小程序端与网页端的智能间隔复习调度。</p></section><section class="license-card"><b>ECDICT</b><strong>skywind3000 / Linwei 及贡献者 · MIT License</strong><p>已筛选导入4115个专四词条的音标、释义、词形与标签字段。</p></section><p class="license-note">专四收词范围参考用户提供的HY2024版词汇书索引；完整声明保存在项目 THIRD_PARTY_NOTICES.md。</p>`}

  root.addEventListener('click', event => {
    const button=event.target.closest('[data-action]'); if(!button)return; const action=button.dataset.action;
    if(action==='home')renderHome(); else if(action==='licenses')renderLicenses(); else if(action==='book'){const key=button.dataset.book;state.bookKey=key;try{localStorage.setItem(BOOK_MEMORY_KEY,key)}catch(_){}
      if(books.some(b=>b.key===key)){renderBook()}else{root.innerHTML=`${brand}<section class="hero"><h1>正在加载词库<span>…</span></h1><p>${meta.books.find(b=>b.key===key)?.name||key}</p></section>`;loadBook(key,renderBook)}} else if(action==='book-back'){clearTimeout(state.advanceTimer);renderBook()} else if(action==='previous')previousWord(); else if(action==='goal'){progress.settings.dailyGoal=Number(button.dataset.goal);save();renderBook()} else if(action==='remind'){progress.settings.remindTime=button.dataset.time;save();if(button.dataset.time&&'Notification' in window&&Notification.permission==='default')requestNotifyPermission();renderBook()} else if(action==='study')startStudy(button.dataset.mode); else if(action==='reveal')reveal(); else if(action==='rate')record(Number(button.dataset.grade)); else if(action==='choice'){if(document.querySelector('#feedback').textContent)return;feedback(button.dataset.id===state.current.id,button.dataset.id===state.current.id?'回答正确':'再记一次，正确释义见下方')} else if(action==='spell'){const value=document.querySelector('#spelling').value.trim().toLowerCase();if(document.querySelector('#feedback').textContent)return;feedback(value===state.current.word.toLowerCase(),value===state.current.word.toLowerCase()?'拼写正确':`正确答案：${state.current.word}`)} else if(action==='favorite'){const key=`${state.bookKey}:${state.current.id}`,item=progress.words[key]||{reps:0,interval:0,lapses:0,due:day()};item.favorite=!item.favorite;progress.words[key]=item;save();button.textContent=item.favorite?'★':'☆'} else if(action==='list'){state.listQuery='';renderList(button.dataset.filter)} else if(action==='word-search'){state.listQuery=document.querySelector('#word-search').value;renderList(state.filter,200)} else if(action==='list-more')renderList(state.filter,state.listLimit+200); else if(action==='stats')renderStats(); else if(action==='speak')speakWord()
    if (['home','licenses','book','book-back','list','stats'].includes(action)) requestAnimationFrame(() => window.scrollTo(0, 0));
  });
  root.addEventListener('keydown',event=>{if(event.key!=='Enter')return;if(state.view==='study'&&state.mode==='spelling')document.querySelector('[data-action="spell"]')?.click();else if(state.view==='list'&&event.target.id==='word-search')document.querySelector('[data-action="word-search"]')?.click()});
  // 启动：每日提醒检查（到点 && 今日未学习 && 通知权限已授予 → 发系统通知）
  (function checkDailyReminder() {
    const time = progress.settings.remindTime;
    if (!time || !('Notification' in window)) return;
    const history = progress.history[day()];
    if (history && history.reviews > 0) return;
    const now = new Date();
    const [hour, minute] = time.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) return;
    if (Notification.permission === 'granted') {
      try { new Notification('外院 · 背单词', {body: '今天还没背单词，花几分钟复习一下吧 📖'}); } catch (_) {}
    }
  })();
  // 启动：不预加载词书（tem4/tem8 各 2-5MB），进入词书时再按需加载
  renderHome();
})();
