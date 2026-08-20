const welcome = document.getElementById('welcome');
const sponsor = document.getElementById('sponsor');
const printShop = document.getElementById('print-shop');
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

// 添加到主屏幕（PWA 安装引导）
const installSite = document.getElementById('install-site');
const installBtn = document.getElementById('install-btn');
const installHint = document.getElementById('install-hint');
let deferredPrompt = null;
if (installSite && installBtn) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (!isStandalone) {
    if (isIOS) {
      // iOS Safari 无 beforeinstallprompt 事件，直接显示引导文案
      installSite.hidden = false;
      installHint.textContent = '用 Safari 打开本站，点底部「分享」→「添加到主屏幕」';
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
        alert('请使用 Safari 浏览器打开本站，点击底部「分享」按钮，选择「添加到主屏幕」即可。');
        return;
      }
      if (!deferredPrompt) {
        alert('浏览器暂未提供安装入口：请确认使用 Chrome / Edge，并访问本站 2 次以上（间隔几分钟）后刷新页面，地址栏右侧会出现安装图标。');
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      installSite.hidden = true;
    });
  }
}
