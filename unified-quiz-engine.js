(() => {
  const KEY = 'waiyuan-unified-web-study-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {version:1,progress:{},favorites:{}}; } catch (_) { return {version:1,progress:{},favorites:{}}; } };
  const save = state => localStorage.setItem(KEY, JSON.stringify(state));
  const state = load(); state.progress ||= {}; state.favorites ||= {};
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
  const hash = text => { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return (value >>> 0).toString(36); };
  const pageKey = location.pathname.replace(/\/index\.html$/i, '').replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-');

  function enhanceCard(card, index) {
    if (card.dataset.unifiedReady) return;
    const questionNode = card.querySelector('.question,h2,.qbody');
    if (!questionNode) return;
    const title = clean(questionNode.textContent);
    if (!title) return;
    const answer = clean(card.querySelector('.answer')?.textContent);
    const key = `${pageKey}-${hash(`${index}-${title}`)}`;
    card.dataset.unifiedReady = key;
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

  function enhance() { document.querySelectorAll('.question-card,.card').forEach(enhanceCard); }
  function randomQuestion() { const cards = [...document.querySelectorAll('.question-card,.card')].filter(card => card.offsetParent !== null); if (!cards.length) return; cards[Math.floor(Math.random()*cards.length)].scrollIntoView({behavior:'smooth',block:'center'}); }

  const style = document.createElement('style');
  style.textContent = '.unified-favorite{margin-top:14px;padding:8px 14px;border:1px solid #d7dce5;border-radius:999px;background:#f7f8fa;color:#697386;cursor:pointer}.unified-favorite.active{background:#fff3c4;border-color:#e4b84a;color:#8a6200}.unified-random-web{position:fixed;left:max(16px,env(safe-area-inset-left));right:auto;bottom:max(18px,env(safe-area-inset-bottom));z-index:30;max-width:calc(100vw - 100px);padding:11px 16px;border:0;border-radius:999px;background:#28634f;color:#fff;box-shadow:0 8px 25px rgba(0,0,0,.18);cursor:pointer;white-space:nowrap}@media(max-width:560px){.unified-random-web{left:12px;bottom:14px;padding:10px 13px;font-size:13px}}';
  document.head.appendChild(style);
  const random = document.createElement('button'); random.className='unified-random-web'; random.textContent='↻ 随机一题'; random.addEventListener('click',randomQuestion); document.body.appendChild(random);
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  enhance(); save(state);
  window.WaiyuanQuizEngine = {state, save, enhance, randomQuestion};
})();
