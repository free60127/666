const welcome = document.getElementById('welcome');
const sponsor = document.getElementById('sponsor');
const printShop = document.getElementById('print-shop');
const feedback = document.getElementById('feedback');
const welcomeStorageKey = 'waiyuan-knowledge-share-welcome-seen-v2';
const legacyWelcomeSessionKey = 'waiyuan-knowledge-share-welcome-seen-v1';

const hasSeenWelcome = () => {
  try {
    return localStorage.getItem(welcomeStorageKey) === '1' || sessionStorage.getItem(legacyWelcomeSessionKey) === '1';
  } catch (_) {
    return false;
  }
};

if (hasSeenWelcome()) welcome.classList.add('hidden');

const closeWelcome = () => {
  welcome.classList.add('hidden');
  try {
    localStorage.setItem(welcomeStorageKey, '1');
  } catch (_) {
    try { sessionStorage.setItem(legacyWelcomeSessionKey, '1'); } catch (_) {}
  }
};

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action], [data-area]');
  if (!button) return;
  if (button.dataset.action === 'close') closeWelcome();
  if (button.dataset.action === 'sponsor') sponsor.classList.remove('hidden');
  if (button.dataset.action === 'close-pay') sponsor.classList.add('hidden');
  if (button.dataset.action === 'print-shop') printShop.classList.remove('hidden');
  if (button.dataset.action === 'close-print-shop') printShop.classList.add('hidden');
  if (button.dataset.action === 'feedback') feedback.classList.remove('hidden');
  if (button.dataset.action === 'close-feedback') feedback.classList.add('hidden');
  if (button.dataset.action === 'copy-share') copyShareLink(button);
  if (button.dataset.area) alert(`${button.dataset.area}专区正在整理中，敬请期待喵。`);
});

// 分享链接复制（微信分享卡片的入口）
let shareResetTimer = null;
const copyShareLink = async button => {
  const url = location.href;
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch (_) {}
  if (!ok) {
    try {
      const area = document.createElement('textarea');
      area.value = url;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      ok = document.execCommand('copy');
      area.remove();
    } catch (_) {}
  }
  button.textContent = ok ? '已复制 ✓' : '复制失败，请手动复制地址栏链接';
  clearTimeout(shareResetTimer);
  shareResetTimer = setTimeout(() => { button.textContent = '复制链接'; }, 2600);
};

// 继续学习区块：从本地学习数据渲染「继续上次学习 / 复习错题 / 背单词」入口，
// 无任何学习数据时整块保持隐藏，不打扰新用户。
(function renderContinueLearning() {
  const section = document.getElementById('continue-learning');
  if (!section) return;
  const readJson = key => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  };
  const unified = readJson('waiyuan-unified-web-study-v1');
  const vocabulary = readJson('waiyuan-vocabulary-progress-v1');
  const progress = unified && unified.progress ? Object.values(unified.progress) : [];
  const answered = progress.filter(item => item.answered);
  const wrong = progress.filter(item => item.wrong);
  const setText = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
  const todayStamp = new Date().toISOString().slice(0, 10);
  const todayCount = answered.filter(item => {
    const t = new Date(item.updatedAt);
    return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === todayStamp;
  }).length;
  const vocabHistory = vocabulary && vocabulary.history ? vocabulary.history[todayStamp] : null;
  const vocabToday = vocabHistory && Number.isFinite(vocabHistory.reviews) ? vocabHistory.reviews : 0;
  const vocabGoal = vocabulary && vocabulary.settings && vocabulary.settings.dailyGoal ? vocabulary.settings.dailyGoal : 10;
  if (!answered.length && !wrong.length && !vocabToday) return;  // 无数据不打扰

  const last = [...answered].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const lastLink = document.getElementById('continue-last');
  if (lastLink && last) {
    const path = String(last.path || '');
    const target = path.startsWith('/') && !path.startsWith('//') ? path : '学习中心/index.html';
    const separator = target.includes('?') ? '&' : '?';
    lastLink.href = `${target}${separator}focus=${encodeURIComponent(last.key || '')}#quiz-focus`;
    const title = String(last.title || '上次未完成的题目');
    setText('continue-last-text', title.length > 22 ? `${title.slice(0, 22)}…` : title);
  }
  setText('continue-today', `今日已答 ${todayCount} 题 · 背词 ${vocabToday}/${vocabGoal}`);
  setText('continue-mistakes', `${wrong.length} 道错题待复习`);
  setText('continue-vocab', `今日 ${vocabToday} / ${vocabGoal} 词`);
  section.hidden = false;
})();
// // 添加到主屏幕（PWA 安装引导，兼容各类浏览器：iOS Safari / 安卓 Chrome·Edge /
// 国产浏览器 / 微信内置浏览器——无安装能力时给出对应菜单路径）
const installSite = document.getElementById('install-site');
const installBtn = document.getElementById('install-btn');
const installHint = document.getElementById('install-hint');
let deferredPrompt = null;
if (installSite && installBtn) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent || '');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (!isStandalone) {
    if (isIOS) {
      // iOS Safari 无 beforeinstallprompt 事件，直接显示引导文案
      installSite.hidden = false;
      installHint.textContent = '用 Safari 打开，点底部「分享」→「添加到主屏幕」';
    } else if (isWeChat) {
      // 微信内置浏览器无法安装，引导到系统浏览器
      installSite.hidden = false;
      installHint.textContent = '点右上角「···」→「在浏览器打开」，再从浏览器菜单添加到桌面';
    }
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredPrompt = event;
      installSite.hidden = false;
      installHint.textContent = '像 App 一样从桌面直接打开';
    });
    window.addEventListener('appinstalled', () => { installSite.hidden = true; });

    installBtn.addEventListener('click', async () => {
      if (isIOS && !deferredPrompt) {
        alert('请打开 Safari 浏览器访问本站，点底部「分享」按钮，选择「添加到主屏幕」即可。');
        return;
      }
      if (isWeChat && !deferredPrompt) {
        alert('微信内置浏览器不支持添加到桌面：请点微信右上角「···」，选择「在浏览器打开」，再从浏览器菜单（右上角 ⋮）选择「添加到主屏幕/桌面」。');
        return;
      }
      if (!deferredPrompt) {
        alert('当前浏览器未显示安装按钮。请在浏览器菜单（右上角 ⋮ 或 ⌄）中找「添加到主屏幕」或「添加到桌面」；Chrome、Edge 通常会自动出现安装图标（首次访问可能需再次访问后出现）。');
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      installSite.hidden = true;
    });
  }
}
