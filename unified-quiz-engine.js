(() => {
  const KEY = 'waiyuan-unified-web-study-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {version:1,progress:{},favorites:{}}; } catch (_) { return {version:1,progress:{},favorites:{}}; } };
  const save = state => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} };
  const state = load(); if (!state.progress) state.progress = {}; if (!state.favorites) state.favorites = {};
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
  const hash = text => { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return (value >>> 0).toString(36); };
  const pageKey = location.pathname.replace(/\/index\.html$/i, '').replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-');
  const focusKey = new URLSearchParams(location.search).get('focus');
  let focusHandled = false;

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

  function enhanceCard(card, index) {
    if (card.dataset.unifiedReady) return;
    const questionNode = card.querySelector('.question,h2,.qbody');
    if (!questionNode) return;
    const title = clean(questionNode.textContent);
    if (!title) return;
    const answer = clean(card.querySelector('.answer')?.textContent);
    // 稳定身份：优先卡片 id（题库题号如 q-single--87）；渲染顺序 index 会随
    // 筛选/加载更多变化，导致同一道题在不同视图下拿到不同 key（进度/收藏碎片化）。
    const stableId = card.id && card.id !== 'main' ? card.id : title;
    const key = `${pageKey}-${hash(`${stableId}-${title}`)}`;
    card.dataset.unifiedReady = key;
    card.dataset.unifiedTitle = title;
    // 纠错反馈：收集题目上下文，复制后发送给站长（零后端方案）
    if (!card.querySelector('.unified-feedback')) {
      const feedback = document.createElement('button');
      feedback.type = 'button';
      feedback.className = 'unified-feedback';
      feedback.textContent = '⚠ 纠错';
      feedback.addEventListener('click', event => {
        event.stopPropagation();
        const body = `【题目纠错】\n页面：${document.title}\n链接：${location.href}\n题干：${title}\n当前答案：${answer}\n\n问题描述：`;
        const email = window.WAIYUAN_FEEDBACK_EMAIL || '';
        copyText(body);
        showFeedbackNotice(
          `已复制纠错信息，粘贴发送给站长即可${email ? '，或点「发邮件」直接提交' : ''}。`,
          email ? `mailto:${email}?subject=${encodeURIComponent('题目纠错 · ' + document.title)}&body=${encodeURIComponent(body)}` : null
        );
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
      else state.favorites[key] = {key,title,answer,page:document.title,path:location.pathname,updatedAt:Date.now()};
      save(state); button.classList.toggle('active', !!state.favorites[key]); button.textContent = state.favorites[key] ? '★ 已收藏' : '☆ 收藏题目';
    });
    card.appendChild(button);
  }

  function record(card, result) {
    if (!card?.dataset.unifiedReady) return;
    const key = card.dataset.unifiedReady;
    const old = state.progress[key] || {};
    const now = Date.now();
    state.progress[key] = {
      ...old,
      key,
      title: card.dataset.unifiedTitle || clean(card.querySelector('.question,h2,.qbody')?.textContent),
      page: document.title,
      path: location.pathname,
      reviewed: true,
      answered: result === true || result === false || old.answered || false,
      ok: result === true ? true : result === false ? false : old.ok,
      wrong: result === false ? true : result === true ? false : old.wrong,
      attempts: (old.attempts || 0) + (result === true || result === false ? 1 : 0),
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

  document.addEventListener('click', event => {
    const target = event.target.closest('button,[data-action]');
    const card = target?.closest('.question-card,.card');
    if (!card || target?.classList.contains('unified-favorite')) return;
    const action = target.dataset.action || '';
    const isAnswer = target.matches('.answer-toggle,[data-action="answer"],[data-action="toggle-answer"]');
    const isAttempt = target.matches('.option,.confirm,[data-action="choose"],[data-action="confirm"]');
    if (!isAnswer && !isAttempt && !/answer|choose|confirm/i.test(action)) return;
    setTimeout(() => {
      const key = card.dataset.unifiedReady;
      const current = [...document.querySelectorAll('.question-card,.card')].find(item => item.dataset.unifiedReady === key) || card;
      const result = resultFromCard(current);
      record(current, result === null ? undefined : result);
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

  function focusQuestion() {
    if (focusHandled || !focusKey) return;
    const card = [...document.querySelectorAll('.question-card,.card')].find(item => item.dataset.unifiedReady === focusKey);
    if (!card) {
      console.warn(`unified-quiz-engine: 未找到 focus 目标题目（${focusKey}）。题库可能已更新，旧的学习记录定位失效。`);
      showFocusNotice();
      focusHandled = true;
      return;
    }
    focusHandled = true;
    card.classList.add('unified-review-target');
    card.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function enhance() {
    const cards = [...document.querySelectorAll('.question-card,.card')];
    cards.forEach(enhanceCard);
    // Only show the floating random-question button on pages that actually
    // contain question cards (the homepage has none and must not show it).
    randomButton.style.display = cards.length ? '' : 'none';
    focusQuestion();
  }
  function randomQuestion() { const cards = [...document.querySelectorAll('.question-card,.card')].filter(card => card.offsetParent !== null); if (!cards.length) return; cards[Math.floor(Math.random()*cards.length)].scrollIntoView({behavior:'smooth',block:'center'}); }

  const style = document.createElement('style');
  style.textContent = '.unified-favorite{margin-top:14px;padding:8px 14px;border:1px solid #d7dce5;border-radius:999px;background:#f7f8fa;color:#697386;cursor:pointer}.unified-favorite.active{background:#fff3c4;border-color:#e4b84a;color:#8a6200}.unified-feedback{margin-top:14px;margin-left:8px;padding:8px 14px;border:1px solid #e8d5c8;border-radius:999px;background:#fdf6f0;color:#a05a3a;cursor:pointer}.unified-review-target{outline:3px solid #d97845;outline-offset:5px;scroll-margin-block:24px}.unified-random-web{position:fixed;left:max(16px,env(safe-area-inset-left));right:auto;bottom:max(18px,env(safe-area-inset-bottom));z-index:30;max-width:calc(100vw - 100px);padding:11px 16px;border:0;border-radius:999px;background:#28634f;color:#fff;box-shadow:0 8px 25px rgba(0,0,0,.18);cursor:pointer;white-space:nowrap}@media(max-width:560px){.unified-random-web{left:12px;bottom:14px;padding:10px 13px;font-size:13px}}.unified-focus-notice{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:60;max-width:min(92vw,560px);padding:10px 14px;border-radius:10px;background:#fff8e6;border:1px solid #e4b84a;color:#6b4d00;box-shadow:0 6px 20px rgba(0,0,0,.12);font-size:14px;line-height:1.5;display:flex;gap:10px;align-items:center}.unified-focus-notice button{flex:none;border:0;background:#e4b84a;color:#fff;border-radius:999px;padding:4px 12px;cursor:pointer}.unified-feedback-notice{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:60;max-width:min(92vw,560px);padding:10px 14px;border-radius:10px;background:#fff4ec;border:1px solid #e8b48f;color:#6b3d1d;box-shadow:0 6px 20px rgba(0,0,0,.12);font-size:14px;line-height:1.5;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.unified-feedback-notice a{color:#b05f2e;font-weight:700;text-decoration:none;border-bottom:1px dashed #b05f2e}.unified-feedback-notice button{flex:none;border:0;background:#e8b48f;color:#fff;border-radius:999px;padding:4px 12px;cursor:pointer}';
  document.head.appendChild(style);
  const randomButton = document.createElement('button'); randomButton.className='unified-random-web'; randomButton.textContent='↻ 随机一题'; randomButton.addEventListener('click',randomQuestion); randomButton.style.display='none'; document.body.appendChild(randomButton);
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  enhance(); save(state);
  window.WaiyuanQuizEngine = {state, save, enhance, randomQuestion, record};
})();
