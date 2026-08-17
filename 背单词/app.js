(() => {
  const data = window.WAIYUAN_VOCABULARY;
  const root = document.querySelector('#app');
  const storageKey = 'waiyuan-vocabulary-progress-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch (_) { return {}; } };
  const progress = load();
  progress.words ||= {};
  progress.history ||= {};
  progress.settings ||= {dailyGoal: 10};
  progress.settings.dailyGoal ||= 10;
  const state = {view: 'home', bookKey: '', mode: 'card', queue: [], index: 0, initialTotal: 0, reviewed: 0, correct: 0, filter: 'all', requeue: {}};
  const save = () => localStorage.setItem(storageKey, JSON.stringify(progress));
  const day = (date = new Date()) => { const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return copy.toISOString().slice(0, 10); };
  const addDays = count => { const date = new Date(); date.setHours(12,0,0,0); date.setDate(date.getDate() + count); return day(date); };
  const shuffle = values => { const list = [...values]; for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
  const book = () => data.books.find(item => item.key === state.bookKey);
  const wordState = word => progress.words[`${state.bookKey}:${word.id}`];
  const summary = item => {
    const states = item.words.map(word => progress.words[`${item.key}:${word.id}`]);
    const learned = states.filter(Boolean).length;
    return {...item,total:item.words.length,learned,mastered:states.filter(x=>x&&x.mastered).length,due:states.filter(x=>x&&x.due<=day()).length,favorites:states.filter(x=>x&&x.favorite).length,percent:Math.round(learned/item.words.length*100)};
  };
  const brand = '<header class="brand"><span class="mark">W</span><div><strong>外院 · 背单词</strong><small>VOCABULARY / 2026</small></div></header>';

  function renderHome() {
    state.view = 'home';
    root.innerHTML = `${brand}<a class="back" href="../index.html">‹ 返回考证资料</a><section class="hero"><p class="kicker">SPACED REPETITION</p><h1>每天一点，<span>记得更久。</span></h1><div>首版支持卡片、选义、拼写、浏览器朗读和自适应复习；进度保存在当前设备。</div></section><section class="books">${data.books.map(item=>{const s=summary(item);return `<button class="book-card" data-action="book" data-book="${item.key}"><span class="book-code">${item.shortName}</span><span class="book-main"><h2>${item.name}</h2><p>${item.description}</p><span class="progress"><i style="width:${s.percent}%"></i></span><span class="meta"><span>首批 ${s.total} 词</span><span>已学 ${s.learned}</span><span>待复习 ${s.due}</span></span></span><span class="arrow">›</span></button>`}).join('')}</section><button class="license-button" data-action="licenses">开源参考与许可 ›</button>`;
  }

  function renderBook() {
    state.view = 'book';
    const s = summary(book());
    root.innerHTML = `${brand}<button class="topline" data-action="home">‹ 返回词书</button><section class="hero"><p class="kicker">${s.shortName}</p><h1>${s.name}<span>核心词汇。</span></h1></section><section class="summary"><article><b>${s.total}</b><small>总词数</small></article><article><b>${s.learned}</b><small>已学习</small></article><article><b>${s.due}</b><small>待复习</small></article><article><b>${s.mastered}</b><small>已掌握</small></article></section><section class="goal"><span>每日新词</span><div>${[5,10,20].map(goal=>`<button class="${progress.settings.dailyGoal===goal?'active':''}" data-action="goal" data-goal="${goal}">${goal}</button>`).join('')}</div></section><h2 class="section-title">选择学习方式</h2><section class="modes"><button data-action="study" data-mode="card"><b>卡</b><span>单词卡片</span><small>翻面后自行判断</small></button><button data-action="study" data-mode="choice"><b>选</b><span>看词选义</span><small>四选一即时反馈</small></button><button data-action="study" data-mode="spelling"><b>拼</b><span>中文拼写</span><small>根据释义写单词</small></button></section><section class="tools"><button data-action="list" data-filter="all">全部单词</button><button data-action="list" data-filter="favorite">收藏夹 ${s.favorites}</button><button data-action="stats">学习统计</button></section>`;
  }

  function startStudy(mode) {
    state.mode = mode;
    const due = book().words.filter(word => wordState(word) && wordState(word).due <= day());
    const unseen = book().words.filter(word => !wordState(word));
    const remaining = Math.max(0, progress.settings.dailyGoal - due.length);
    state.queue = [...due, ...shuffle(unseen).slice(0, remaining)];
    if (!state.queue.length) state.queue = shuffle(book().words).slice(0, Math.min(progress.settings.dailyGoal, book().words.length));
    state.index = 0; state.initialTotal = state.queue.length; state.reviewed = 0; state.correct = 0; state.requeue = {};
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
    root.innerHTML = `<section class="study-head"><button data-action="book-back">×</button><span class="study-progress"><i style="width:${Math.min(state.index+1,state.initialTotal)/state.initialTotal*100}%"></i></span><small>${Math.min(state.index+1,state.initialTotal)} / ${state.initialTotal}</small></section><section class="word-card"><button class="speak" data-action="speak">🔊 朗读</button><button class="favorite" data-action="favorite">${favorite?'★':'☆'}</button>${question}${activity}</section><section id="rating"></section>`;
    if (state.mode === 'spelling') document.querySelector('#spelling').focus();
  }

  const answerHtml = () => `<div class="answer"><div class="meaning">${state.current.meaning}</div><div class="example">${state.current.example}</div></div>`;
  function reveal() { document.querySelector('#answer').innerHTML = answerHtml(); document.querySelector('.reveal').remove(); document.querySelector('#rating').innerHTML = `<div class="rating">${[['0','忘记','明天'],['1','模糊','较快复习'],['2','认识','正常复习'],['3','熟练','延后复习']].map(x=>`<button data-action="rate" data-grade="${x[0]}"><b>${x[1]}</b><small>${x[2]}</small></button>`).join('')}</div>`; }
  function record(grade) {
    const key = `${state.bookKey}:${state.current.id}`;
    const old = progress.words[key] || {reps:0,interval:0,ease:2.3,lapses:0,favorite:false};
    let interval, ease=old.ease||2.3;
    if(grade===0){interval=1;ease=Math.max(1.3,ease-.2);old.lapses=(old.lapses||0)+1}else if(grade===1){interval=Math.max(1,Math.round((old.interval||1)*1.2));ease=Math.max(1.3,ease-.05)}else if(grade===2){interval=old.reps?Math.max(2,Math.round((old.interval||1)*ease)):2}else{interval=old.reps?Math.max(4,Math.round((old.interval||1)*ease*1.3)):4;ease=Math.min(3,ease+.1)}
    const reps=(old.reps||0)+1; progress.words[key]={...old,reps,interval,ease,due:addDays(interval),lastReviewed:day(),lastGrade:grade,mastered:interval>=21||reps>=5};
    const history=progress.history[day()]||{reviews:0,correct:0}; history.reviews++; if(grade>=2)history.correct++; progress.history[day()]=history;
    if(grade===0 && !state.requeue[state.current.id]){state.queue.push(state.current);state.requeue[state.current.id]=1}
    state.reviewed++; if(grade>=2)state.correct++; save(); state.index++; renderStudy();
  }
  function feedback(correct, text) { const node=document.querySelector('#feedback'); node.className=`result ${correct?'correct':'wrong'}`; node.textContent=text; document.querySelector('.word-card').insertAdjacentHTML('beforeend',answerHtml()); setTimeout(()=>record(correct?2:0),700); }
  function renderFinished(){state.view='finished';root.innerHTML=`${brand}<section class="finish"><div class="finish-icon">✓</div><section class="hero"><h1>今日任务<span>完成。</span></h1></section><section class="summary"><article><b>${state.reviewed}</b><small>复习次数</small></article><article><b>${state.correct}</b><small>记住次数</small></article></section><button class="primary" data-action="book-back">返回词书</button></section>`}
  function renderList(filter){state.view='list';state.filter=filter;const today=day();const rows=book().words.map(word=>({...word,state:wordState(word)})).filter(x=>filter==='favorite'?x.state&&x.state.favorite:filter==='due'?x.state&&x.state.due<=today:filter==='mastered'?x.state&&x.state.mastered:true);root.innerHTML=`${brand}<button class="topline" data-action="book-back">‹ 返回词书</button><section class="hero"><h1>单词<span>列表。</span></h1></section><div class="filters">${[['all','全部'],['due','待复习'],['favorite','收藏'],['mastered','已掌握']].map(x=>`<button class="${filter===x[0]?'active':''}" data-action="list" data-filter="${x[0]}">${x[1]}</button>`).join('')}</div>${rows.length?rows.map(x=>`<div class="word-row"><div><b>${x.word}</b><small>${x.phonetic} · ${x.meaning}</small></div><span>${!x.state?'未学习':x.state.mastered?'已掌握':x.state.due<=today?'待复习':'学习中'}</span></div>`).join(''):'<div class="empty">这里还没有单词</div>'}`}
  function renderStats(){state.view='stats';const s=summary(book()),days=Object.keys(progress.history).sort().slice(-7).map(key=>({day:key.slice(5),...progress.history[key]})),reviews=days.reduce((n,x)=>n+x.reviews,0),correct=days.reduce((n,x)=>n+x.correct,0);root.innerHTML=`${brand}<button class="topline" data-action="book-back">‹ 返回词书</button><section class="hero"><h1>学习<span>统计。</span></h1></section><section class="summary"><article><b>${s.learned}</b><small>累计学习</small></article><article><b>${s.mastered}</b><small>已掌握</small></article><article><b>${reviews}</b><small>近7天复习</small></article><article><b>${reviews?Math.round(correct/reviews*100)+'%':'—'}</b><small>近7天记住率</small></article></section><section class="history"><h2>最近学习记录</h2>${days.length?days.map(x=>`<div class="history-row"><span>${x.day}</span><span><b>${x.reviews}</b> 次复习 · <b>${x.correct}</b> 次记住</span></div>`).join(''):'<div class="empty">完成一次学习后，这里会出现记录</div>'}</section>`}
  function renderLicenses(){state.view='licenses';root.innerHTML=`${brand}<button class="topline" data-action="home">‹ 返回词书</button><section class="hero"><p class="kicker">OPEN SOURCE</p><h1>开源参考与<span>许可。</span></h1></section><section class="license-card"><b>Qwerty Learner</b><strong>RealKai42 及贡献者 · GPL-3.0</strong><p>仅参考交互与功能分类，未复制代码、词库或语音资源。</p></section><section class="license-card"><b>UnlearnableWord（学不会单词）</b><strong>Mint-green 及贡献者 · MIT License</strong><p>参考小程序学习、复习和统计流程；当前实现为独立编写。</p></section><section class="license-card"><b>ts-fsrs</b><strong>Open Spaced Repetition 社区 · MIT License</strong><p>参考间隔复习理念；第一版调度器为独立编写，尚未打包其源码。</p></section><section class="license-card"><b>ECDICT</b><strong>skywind3000 及贡献者 · MIT License</strong><p>后续完整词典数据的候选来源；第一版尚未导入其数据。</p></section><p class="license-note">完整声明保存在项目 THIRD_PARTY_NOTICES.md。首版词库为体验数据，不等同于考试官方完整词表。</p>`}

  root.addEventListener('click', event => {
    const button=event.target.closest('[data-action]'); if(!button)return; const action=button.dataset.action;
    if(action==='home')renderHome(); else if(action==='licenses')renderLicenses(); else if(action==='book'){state.bookKey=button.dataset.book;renderBook()} else if(action==='book-back')renderBook(); else if(action==='goal'){progress.settings.dailyGoal=Number(button.dataset.goal);save();renderBook()} else if(action==='study')startStudy(button.dataset.mode); else if(action==='reveal')reveal(); else if(action==='rate')record(Number(button.dataset.grade)); else if(action==='choice'){if(document.querySelector('#feedback').textContent)return;feedback(button.dataset.id===state.current.id,button.dataset.id===state.current.id?'回答正确':'再记一次，正确释义见下方')} else if(action==='spell'){const value=document.querySelector('#spelling').value.trim().toLowerCase();if(document.querySelector('#feedback').textContent)return;feedback(value===state.current.word.toLowerCase(),value===state.current.word.toLowerCase()?'拼写正确':`正确答案：${state.current.word}`)} else if(action==='favorite'){const key=`${state.bookKey}:${state.current.id}`,item=progress.words[key]||{reps:0,interval:0,ease:2.3,lapses:0,due:day()};item.favorite=!item.favorite;progress.words[key]=item;save();button.textContent=item.favorite?'★':'☆'} else if(action==='list')renderList(button.dataset.filter); else if(action==='stats')renderStats(); else if(action==='speak'&&'speechSynthesis'in window){speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(state.current.word);utterance.lang='en-US';utterance.rate=.85;speechSynthesis.speak(utterance)}
  });
  root.addEventListener('keydown',event=>{if(event.key==='Enter'&&state.view==='study'&&state.mode==='spelling')document.querySelector('[data-action="spell"]')?.click()});
  renderHome();
})();
