const sponsor = document.getElementById('sponsor');
const printShop = document.getElementById('print-shop');
const feedback = document.getElementById('feedback');

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action], [data-area]');
  if (!button) return;
  if (button.dataset.action === 'sponsor') sponsor.classList.remove('hidden');
  if (button.dataset.action === 'close-pay') sponsor.classList.add('hidden');
  if (button.dataset.action === 'print-shop') printShop.classList.remove('hidden');
  if (button.dataset.action === 'close-print-shop') printShop.classList.add('hidden');
  if (button.dataset.action === 'feedback') { feedback.classList.remove('hidden'); resetFeedback(); }
  if (button.dataset.action === 'close-feedback') feedback.classList.add('hidden');
  if (button.dataset.action === 'copy-share') shareLink(button);
  if (button.dataset.area) alert(`${button.dataset.area}专区正在整理中，敬请期待喵。`);
});

// 分享：三档策略——
// ① 微信内置浏览器：无 Web Share API，且只有微信原生的「···→分享给朋友」才能生成带图卡片，
//    直接引导用户走原生分享（卡片由微信抓取 og:image 生成）；
// ② 系统浏览器（Safari/Chrome 等）：调起系统分享面板（iOS/安卓分享到微信 = 网页卡片）；
//    取消或失败 → 落到复制；
// ③ 复制兜底：只复制纯 URL（带标题前缀的文本在微信里会被当普通消息，不识别为链接、不出卡片）。
let shareResetTimer = null;
const shareLink = async button => {
  const url = location.href;
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent || '');
  if (isWeChat) {
    alert('微信内请点右上角「···」→「分享给朋友」，对方会直接看到带图的分享卡片。\n\n（网页内无法直接调起微信的卡片分享，这是微信的限制。）');
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({title: '外院知识分享站', text: '课程题库、学习工具与专业资料免费分享，点开即可刷题学习。', url});
      button.textContent = '已分享 ✓';
      clearTimeout(shareResetTimer);
      shareResetTimer = setTimeout(() => { button.textContent = '分享'; }, 2600);
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;  // 用户取消，不打扰
      // 其他失败（如分享面板异常）→ 落到复制链接
    }
  }
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
  button.textContent = ok ? '链接已复制 ✓ 粘贴发送即可' : '复制失败，请长按地址栏手动复制';
  clearTimeout(shareResetTimer);
  shareResetTimer = setTimeout(() => { button.textContent = '分享'; }, 3200);
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
  // 本地日期（背单词 history 用本地日期做 key，统一口径，避免 00:00-08:00 跨日错配）
  const localDay = (date = new Date()) => { const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return copy.toISOString().slice(0, 10); };
  const todayStamp = localDay();
  const todayCount = answered.filter(item => {
    const t = new Date(item.updatedAt);
    return Number.isFinite(t.getTime()) && localDay(t) === todayStamp;
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

// 意见反馈：主页文本框直接提交到云端（/api/feedback），失败给出提示
const feedbackText = document.getElementById('feedback-text');
const feedbackCount = document.getElementById('feedback-count');
const feedbackSubmit = document.getElementById('feedback-submit');
const feedbackStatus = document.getElementById('feedback-status');
const resetFeedback = () => {
  if (feedbackStatus) feedbackStatus.textContent = '';
  if (feedbackText) feedbackText.value = '';
  if (feedbackCount) feedbackCount.textContent = '0 / 200';
  if (feedbackSubmit) feedbackSubmit.disabled = false;
};
if (feedbackText && feedbackSubmit) {
  const MAX = 200;
  feedbackText.addEventListener('input', () => {
    if (feedbackCount) feedbackCount.textContent = `${feedbackText.value.length} / ${MAX}`;
    if (feedbackStatus) feedbackStatus.textContent = '';
  });
  feedbackSubmit.addEventListener('click', async () => {
    const note = feedbackText.value.trim();
    if (!note) {
      if (feedbackStatus) { feedbackStatus.textContent = '请先输入反馈内容'; feedbackStatus.className = 'feedback-status error'; }
      return;
    }
    feedbackSubmit.disabled = true;
    if (feedbackStatus) { feedbackStatus.textContent = '提交中…'; feedbackStatus.className = 'feedback-status'; }
    const apiBase = window.WAIYUAN_API_BASE;
    let ok = false;
    if (apiBase) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${apiBase}/api/feedback`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ page: document.title, note: note.slice(0, 200), type: '主页反馈' }),
          signal: controller.signal
        });
        clearTimeout(timer);
        ok = res.ok;
      } catch (_) { ok = false; }
    }
    feedbackSubmit.disabled = false;
    if (ok) {
      feedbackText.value = '';
      if (feedbackCount) feedbackCount.textContent = `0 / ${MAX}`;
      if (feedbackStatus) { feedbackStatus.textContent = '✓ 反馈已提交，感谢你的支持！'; feedbackStatus.className = 'feedback-status ok'; }
    } else {
      if (feedbackStatus) { feedbackStatus.textContent = '提交失败，请稍后重试，或直接微信联系 f-xuan-r'; feedbackStatus.className = 'feedback-status error'; }
    }
  });
}
