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
  if (button.dataset.area) alert(`${button.dataset.area}专区正在整理中，敬请期待喵。`);
});
