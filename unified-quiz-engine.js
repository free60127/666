(() => {
  const KEY = 'waiyuan-unified-web-study-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {version:1,progress:{},favorites:{}}; } catch (_) { return {version:1,progress:{},favorites:{}}; } };
  // 本地存储失败提示：隐私模式/空间不足时进度会丢，至少让用户知道（每页一次，不刷屏）
  let saveWarned = false;
  const warnSaveFailed = () => {
    if (saveWarned) return;
    saveWarned = true;
    const notice = document.createElement('div');
    notice.className = 'unified-focus-notice';
    notice.setAttribute('role', 'alert');
    notice.textContent = '⚠ 本地保存失败（浏览器存储不可用或空间不足），答题进度可能无法保存。可到学习中心「导出学习数据」备份。';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '知道了';
    close.addEventListener('click', () => notice.remove());
    notice.appendChild(close);
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 10000);
  };
  const save = state => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (error) { console.warn('统一引擎: 保存失败', error); warnSaveFailed(); }
  };
  const state = load(); if (!state.progress) state.progress = {}; if (!state.favorites) state.favorites = {};
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
  const hash = text => { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return (value >>> 0).toString(36); };
  const pageKey = location.pathname.replace(/\/index\.html$/i, '').replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-');
  const focusKey = new URLSearchParams(location.search).get('focus');
  let focusHandled = false;
  let focusEmitted = false;
  let focusRetryTimer = null;

  // 页面（思政/计算机/泛读/基英/翻译/改写）反查定位时使用同一 key 算法
  const computeKey = (stableId, title) => `${pageKey}-${hash(`${stableId}-${clean(title)}`)}`;
  const cardSelector = '.question-card,.card,.question';
  const findCardByKey = key => [...observeRoot().querySelectorAll(cardSelector)].find(item => item.dataset.unifiedReady === key);

  function copyText(text) {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    else legacyCopy(text);
  }
  function legacyCopy(text) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    } catch (_) {}
  }
  function showFeedbackNotice(message, mailtoHref) {
    const notice = document.createElement('div');
    notice.className = 'unified-feedback-notice';
    notice.setAttribute('role', 'status');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '知道了';
    close.addEventListener('click', () => notice.remove());
    notice.append(message);
    if (mailtoHref) {
      const link = document.createElement('a');
      link.href = mailtoHref;
      link.textContent = '发邮件';
      notice.appendChild(link);
    }
    notice.appendChild(close);
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 8000);
  }

  // 题干提取：翻译题取 .prompt 最后一个 span（排除题号/按钮/答案），改写题取 .question-text，
  // 思政/计算机取 h2/.qbody；兜底取 .question 自身（避免整卡文本含按钮与答案污染 key 与标题）
  const questionNodeOf = card => card.querySelector('.prompt span:last-child,.question-text,.qbody,h2') || card.querySelector('.question');
  const questionText = card => { const node = questionNodeOf(card); return clean(node ? node.textContent : card.textContent); };

  function enhanceCard(card, index) {
    if (card.dataset.unifiedReady) return;
    if (card.dataset.unifiedIgnore) return;  // 页面自身管理进度的卡片（预留）
    const title = questionText(card);
    if (!title) return;
    // 答案提取：<details class="answer"> 的 summary（如「查看参考答案」）不算答案内容，先剥掉
    const answerNode = card.querySelector('.answer');
    let answer = '';
    if (answerNode) {
      const clone = answerNode.cloneNode(true);
      clone.querySelector('summary')?.remove();
      answer = clean(clone.textContent);
    }
    const scope = card.dataset.unifiedScope || 'bank';  // 'bank'（普通题库）| 'paper'（模拟卷）
    // 稳定身份：优先卡片 id（题库题号如 q-single--87）；渲染顺序 index 会随
    // 筛选/加载更多变化，导致同一道题在不同视图下拿到不同 key（进度/收藏碎片化）。
    const stableId = card.id && card.id !== 'main' ? card.id : title;
    const key = `${pageKey}-${hash(`${stableId}-${title}`)}`;
    card.dataset.unifiedReady = key;
    card.dataset.unifiedTitle = title;
    // 纠错反馈：先选问题类型，再复制/提交给站长（有云端 API 时优先提交）
    const submitFeedback = async type => {
      const apiBase = window.WAIYUAN_API_BASE;
      if (apiBase) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(`${apiBase}/api/feedback`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ page: document.title, question: title, answer, type }),
            signal: controller.signal
          });
          clearTimeout(timer);
          if (res.ok) { showFeedbackNotice('纠错信息已提交，感谢反馈！'); return; }
        } catch (_) { /* 云端不可达，走复制兜底 */ }
      }
      const body = `【题目纠错】\n页面：${document.title}\n链接：${location.href}\n问题类型：${type}\n题干：${title}\n当前答案：${answer}\n\n问题描述：`;
      const email = window.WAIYUAN_FEEDBACK_EMAIL || '';
      copyText(body);
      showFeedbackNotice(
        `已复制纠错信息，粘贴发送给站长即可${email ? '，或点「发邮件」直接提交' : ''}。`,
        email ? `mailto:${email}?subject=${encodeURIComponent('题目纠错 · ' + document.title)}&body=${encodeURIComponent(body)}` : null
      );
    };
    if (!card.querySelector('.unified-feedback')) {
      const feedback = document.createElement('button');
      feedback.type = 'button';
      feedback.className = 'unified-feedback';
      feedback.textContent = '⚠ 纠错';
      feedback.addEventListener('click', event => {
        event.stopPropagation();
        const existing = card.querySelector('.unified-feedback-menu');
        if (existing) { existing.remove(); return; }
        const menu = document.createElement('div');
        menu.className = 'unified-feedback-menu';
        menu.setAttribute('role', 'menu');
        const label = document.createElement('span');
        label.className = 'ufm-label';
        label.textContent = '问题类型：';
        menu.appendChild(label);
        ['答案错误', '题目重复', '题干不完整', '排版问题'].forEach(type => {
          const item = document.createElement('button');
          item.type = 'button';
          item.textContent = type;
          item.addEventListener('click', () => { menu.remove(); submitFeedback(type); });
          menu.appendChild(item);
        });
        card.appendChild(menu);
      });
      card.appendChild(feedback);
    }
    if (card.querySelector('.favorite-button,[data-action="favorite"]')) return;
    const button = document.createElement('button');
    button.className = `unified-favorite ${state.favorites[key] ? 'active' : ''}`;
    button.textContent = state.favorites[key] ? '★ 已收藏' : '☆ 收藏题目';
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (state.favorites[key]) delete state.favorites[key];
      else state.favorites[key] = {key,title,answer,page:document.title,path:location.pathname,scope,updatedAt:Date.now()};
      save(state); button.classList.toggle('active', !!state.favorites[key]); button.textContent = state.favorites[key] ? '★ 已收藏' : '☆ 收藏题目';
    });
    card.appendChild(button);
  }

  // —— 浏览记录：题目进入视口停留约 1 秒记为「已浏览」（viewed），
  //    快速划过不算；5 分钟内重复浏览不重复计数 ——
  function markViewed(card) {
    const key = card.dataset.unifiedReady;
    if (!key) return;
    const old = state.progress[key] || {};
    const now = Date.now();
    state.progress[key] = {
      ...old,
      key,
      title: card.dataset.unifiedTitle || questionText(card) || old.title || '',
      page: document.title,
      path: location.pathname,
      scope: card.dataset.unifiedScope || old.scope || 'bank',
      viewed: true,
      viewCount: (old.viewCount || 0) + (old.lastViewedAt && now - old.lastViewedAt < 5 * 60 * 1000 ? 0 : 1),
      lastViewedAt: now,
      updatedAt: now
    };
    save(state);
  }
  const viewTimers = new WeakMap();
  const viewObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const card = entry.target;
      if (!entry.isIntersecting) {
        const timer = viewTimers.get(card);
        if (timer) { clearTimeout(timer); viewTimers.delete(card); }
        continue;
      }
      if (card.dataset.viewRecorded || viewTimers.has(card)) continue;
      viewTimers.set(card, setTimeout(() => {
        card.dataset.viewRecorded = '1';
        markViewed(card);
      }, 1000));
    }
  }, {threshold: 0.6});

  // —— 自评系统：简答/论述/材料/翻译等非选择题，展开答案后可自评 ——
  const SELF_LABELS = {correct: '自评：答对 ✓', partial: '自评：部分掌握', wrong: '自评：需复习'};
  function injectSelfAssess(card) {
    if (card.querySelector('.unified-self-assess')) return;
    if (card.querySelector('.option,.fill-input-wrap')) return;  // 选择题/填空题走自动判题
    const key = card.dataset.unifiedReady;
    const current = key ? state.progress[key] : null;
    const picked = current && current.result ? current.result : '';
    const wrap = document.createElement('div');
    wrap.className = 'unified-self-assess' + (picked ? ' done' : '');
    const label = document.createElement('span');
    label.className = 'usa-label';
    label.textContent = picked ? SELF_LABELS[picked] : '自评：';
    wrap.appendChild(label);
    if (!picked) {
      [['correct', '我答对了'], ['partial', '部分掌握'], ['wrong', '需要复习']].forEach(([value, text]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.self = value;
        button.textContent = text;
        button.addEventListener('click', event => {
          event.stopPropagation();
          record(card, {self: value});
          label.textContent = SELF_LABELS[value];
          wrap.classList.add('done');
          [...wrap.querySelectorAll('button')].forEach(btn => btn.remove());
        });
        wrap.appendChild(button);
      });
    }
    card.appendChild(wrap);
  }
  function prepareCard(card) {
    if (!card || !card.dataset.unifiedReady) return;
    const answerNode = card.querySelector('.answer');
    // 答案是否已展开：改写题 details 看 open；翻译题看 .show（translation-item 标记）；思政/计算机渲染即展开
    const answerShown = answerNode && (
      typeof answerNode.open === 'boolean' ? answerNode.open
      : card.classList.contains('translation-item') ? answerNode.classList.contains('show')
      : true
    );
    if (answerShown || state.progress[card.dataset.unifiedReady]?.result) injectSelfAssess(card);
    if (!card.dataset.viewRecorded) viewObserver.observe(card);
  }
  // 改写题用原生 <details> 展开答案（无按钮可委托），监听 toggle 事件挂自评
  document.addEventListener('toggle', event => {
    const details = event.target;
    if (!details || details.tagName !== 'DETAILS') return;
    const card = details.closest(cardSelector);
    if (!card || !card.dataset.unifiedReady || !details.open) return;
    setTimeout(() => { record(card, undefined); prepareCard(card); }, 0);
  }, true);

  function record(card, result) {
    if (!card?.dataset.unifiedReady) return;
    const key = card.dataset.unifiedReady;
    const old = state.progress[key] || {};
    const now = Date.now();
    const self = result && typeof result === 'object' ? result.self : null;
    const auto = result === true || result === false;
    const answeredNow = auto || !!self;
    state.progress[key] = {
      ...old,
      key,
      title: card.dataset.unifiedTitle || questionText(card) || old.title || '',
      page: document.title,
      path: location.pathname,
      scope: card.dataset.unifiedScope || old.scope || 'bank',
      reviewed: true,
      viewed: old.viewed || answeredNow,  // 看过（视口停留 1s）或本次作答才算已浏览；未看过的题保持未浏览
      answered: answeredNow || old.answered || false,
      ok: auto ? (result === true) : self ? (self === 'correct') : old.ok,
      wrong: auto ? (result === false) : self ? (self === 'wrong') : old.wrong,
      result: self ? self : auto ? undefined : old.result,
      attempts: (old.attempts || 0) + (answeredNow ? 1 : 0),
      updatedAt: now
    };
    save(state);
  }

  function resultFromCard(card) {
    const wrong = card.querySelector('.option.wrong,.wrong.option,[data-state="wrong"]');
    const correct = card.querySelector('.option.correct,.correct.option,[data-state="correct"]');
    if (wrong) return false;
    if (correct) return true;
    return null;
  }

  // —— 填空判题：规范化比较（大小写/全角半角/首尾与连续空白/中英文标点），
  //    题库答案可含多个合法值（用 /；|、或中英文逗号分隔），命中任一即算答对 ——
  const normalizeAnswer = text => String(text || '')
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))  // 全角→半角
    .replace(/\u3000/g, ' ')
    .replace(/[，。；：！？、]/g, ch => ({'，': ',', '。': '.', '；': ';', '：': ':', '！': '!', '？': '?', '、': ','}[ch]))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  function judgeFill(card, inputValue) {
    const raw = card.dataset.fillAnswers || '';
    if (!raw) return null;
    const input = normalizeAnswer(inputValue);
    const whole = normalizeAnswer(raw);
    if (!input || !whole) return null;
    if (whole === input) return true;
    return whole.split(/\s*[\/;|，,、]\s*/).some(part => part && part === input);
  }
  function handleFillSubmit(target) {
    const card = target.closest(cardSelector);
    if (!card) return;
    const input = card.querySelector('.fill-input');
    const value = input ? input.value : '';
    const result = judgeFill(card, value);
    if (result === null) { if (input) input.focus(); return; }
    let feedback = card.querySelector('.fill-feedback');
    if (!feedback) { feedback = document.createElement('div'); feedback.className = 'fill-feedback'; card.appendChild(feedback); }
    if (result) { feedback.textContent = '✓ 回答正确'; feedback.className = 'fill-feedback correct'; }
    else { feedback.textContent = '✗ 未完全正确，可展开答案对照后重试'; feedback.className = 'fill-feedback wrong'; }
    record(card, result);
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button,[data-action]');
    if (!target) return;
    if (target.dataset.action === 'fill-submit') { handleFillSubmit(target); return; }
    const card = target?.closest(cardSelector);
    if (!card || target?.classList.contains('unified-favorite')) return;
    const action = target.dataset.action || '';
    const isAnswer = target.matches('.answer-toggle,[data-action="answer"],[data-action="toggle-answer"]');
    const isAttempt = target.matches('.option,.confirm,[data-action="choose"],[data-action="confirm"]');
    if (!isAnswer && !isAttempt && !/answer|choose|confirm/i.test(action)) return;
    setTimeout(() => {
      const key = card.dataset.unifiedReady;
      const current = [...document.querySelectorAll(cardSelector)].find(item => item.dataset.unifiedReady === key) || card;
      const result = resultFromCard(current);
      record(current, result === null ? undefined : result);
      prepareCard(current);  // 展开答案后挂自评按钮
    }, 0);
  });

  function showFocusNotice() {
    const notice = document.createElement('div');
    notice.className = 'unified-focus-notice';
    notice.setAttribute('role', 'alert');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '知道了';
    close.addEventListener('click', () => notice.remove());
    notice.append('未能定位到要复习的题目：题库可能已更新，旧的学习记录定位已失效。你可以忽略此提示，继续正常刷题。', close);
    document.body.appendChild(notice);
  }

  // —— focus 定位：卡片未渲染时（题库首页/折叠单元）先广播给页面应用，
  //    由页面打开目标题库/单元；随后轮询等待卡片出现（约 12 秒），仍无则提示 ——
  function focusQuestion() {
    if (focusHandled || !focusKey) return;
    const card = findCardByKey(focusKey);
    if (card) {
      focusHandled = true;
      card.classList.add('unified-review-target');
      card.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    if (!focusEmitted) {
      focusEmitted = true;
      window.dispatchEvent(new CustomEvent('waiyuan:focus', {detail: {key: focusKey}}));
    }
    if (!focusRetryTimer) {
      let attempts = 0;
      focusRetryTimer = setInterval(() => {
        attempts++;
        const retry = findCardByKey(focusKey);
        if (retry) {
          clearInterval(focusRetryTimer); focusRetryTimer = null;
          focusHandled = true;
          retry.classList.add('unified-review-target');
          retry.scrollIntoView({behavior:'smooth',block:'center'});
        } else if (attempts >= 6) {
          clearInterval(focusRetryTimer); focusRetryTimer = null;
          focusHandled = true;
          showFocusNotice();
        }
      }, 2000);
    }
  }
  function enhance() {
    const cards = [...observeRoot().querySelectorAll(cardSelector)];
    cards.forEach(card => { enhanceCard(card); prepareCard(card); });
    // Only show the floating random-question button on pages that actually
    // contain question cards (the homepage has none and must not show it).
    randomButton.style.display = cards.length ? '' : 'none';
    focusQuestion();
  }
  function randomQuestion() { const cards = [...observeRoot().querySelectorAll(cardSelector)].filter(card => card.offsetParent !== null); if (!cards.length) return; cards[Math.floor(Math.random()*cards.length)].scrollIntoView({behavior:'smooth',block:'center'}); }

  const style = document.createElement('style');
  style.textContent = '.unified-favorite{margin-top:14px;padding:8px 14px;border:1px solid #d7dce5;border-radius:999px;background:#f7f8fa;color:#697386;cursor:pointer}.unified-favorite.active{background:#fff3c4;border-color:#e4b84a;color:#8a6200}.unified-feedback{margin-top:14px;margin-left:8px;padding:8px 14px;border:1px solid #e8d5c8;border-radius:999px;background:#fdf6f0;color:#a05a3a;cursor:pointer}.question-card,.card,.question{position:relative}.unified-feedback-menu{position:absolute;right:8px;bottom:calc(100% + 6px);z-index:5;display:flex;flex-wrap:wrap;gap:6px;max-width:min(280px,calc(100% - 16px));padding:10px;border-radius:10px;background:#fffefa;border:1px solid #e8d5c8;box-shadow:0 6px 18px rgba(0,0,0,.12)}.unified-feedback-menu .ufm-label{flex-basis:100%;font-size:12px;color:#a05a3a}.unified-feedback-menu button{border:1px solid #e8d5c8;background:#fdf6f0;color:#a05a3a;border-radius:999px;padding:5px 10px;font-size:13px;cursor:pointer}.unified-review-target{outline:3px solid #d97845;outline-offset:5px;scroll-margin-block:24px}.unified-random-web{position:fixed;left:max(16px,env(safe-area-inset-left));right:auto;bottom:max(18px,env(safe-area-inset-bottom));z-index:30;max-width:calc(100vw - 100px);padding:11px 16px;border:0;border-radius:999px;background:#28634f;color:#fff;box-shadow:0 8px 25px rgba(0,0,0,.18);cursor:pointer;white-space:nowrap}@media(max-width:560px){.unified-random-web{left:12px;bottom:14px;padding:10px 13px;font-size:13px}}.unified-focus-notice{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:60;max-width:min(92vw,560px);padding:10px 14px;border-radius:10px;background:#fff8e6;border:1px solid #e4b84a;color:#6b4d00;box-shadow:0 6px 20px rgba(0,0,0,.12);font-size:14px;line-height:1.5;display:flex;gap:10px;align-items:center}.unified-focus-notice button{flex:none;border:0;background:#e4b84a;color:#fff;border-radius:999px;padding:4px 12px;cursor:pointer}.unified-feedback-notice{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:60;max-width:min(92vw,560px);padding:10px 14px;border-radius:10px;background:#fff4ec;border:1px solid #e8b48f;color:#6b3d1d;box-shadow:0 6px 20px rgba(0,0,0,.12);font-size:14px;line-height:1.5;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.unified-feedback-notice a{color:#b05f2e;font-weight:700;text-decoration:none;border-bottom:1px dashed #b05f2e}.unified-feedback-notice button{flex:none;border:0;background:#e8b48f;color:#fff;border-radius:999px;padding:4px 12px;cursor:pointer}.unified-self-assess{margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.unified-self-assess .usa-label{color:#73817b;font-size:14px}.unified-self-assess.done .usa-label{color:#28634f;font-weight:700}.unified-self-assess button{padding:7px 13px;border:1px solid #dfe6df;border-radius:999px;background:#f1f7f3;color:#44584f;cursor:pointer;font-size:13px}.unified-self-assess button:hover{background:#e2efe7}.unified-self-assess.done button{display:none}.fill-input-wrap{margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.fill-input-wrap .fill-input{flex:1;min-width:160px;padding:9px 12px;border:1px solid #c9d6cd;border-radius:10px;background:#fffefa;color:#17211f;font-size:15px}.fill-input-wrap .fill-submit{padding:8px 16px;border:0;border-radius:10px;background:#28634f;color:#fff;cursor:pointer;font-size:14px}.fill-feedback{margin-top:10px;font-size:13px;font-weight:700}.fill-feedback.correct{color:#276545}.fill-feedback.wrong{color:#a04b44}';
  document.head.appendChild(style);
  const randomButton = document.createElement('button'); randomButton.className='unified-random-web'; randomButton.textContent='↻ 随机一题'; randomButton.addEventListener('click',randomQuestion); randomButton.style.display='none'; document.body.appendChild(randomButton);
  // 观察范围限定题库容器（#app），避免全站 body 子树监听；
  // 回调做 80ms 防抖，展开大单元（数百卡片）时不会反复全量扫描。
  const observeRoot = () => document.getElementById('app') || document.body;
  let observeTimer = null;
  const scheduleEnhance = () => {
    if (observeTimer) return;
    observeTimer = setTimeout(() => { observeTimer = null; enhance(); }, 80);
  };
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(observeRoot(), {childList:true, subtree:true});
  enhance(); save(state);
  window.WaiyuanQuizEngine = {state, save, enhance, randomQuestion, record, computeKey, focusKey};
})();
