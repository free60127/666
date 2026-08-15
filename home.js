const welcome = document.getElementById('welcome');
const sponsor = document.getElementById('sponsor');
const printShop = document.getElementById('print-shop');
const welcomeSessionKey = 'waiyuan-knowledge-share-welcome-seen-v1';

try {
  if (sessionStorage.getItem(welcomeSessionKey) === '1') {
    welcome.classList.add('hidden');
  }
} catch (_) {
  // Storage may be unavailable in a restrictive browser mode; the welcome still works.
}

const closeWelcome = () => {
  welcome.classList.add('hidden');
  try { sessionStorage.setItem(welcomeSessionKey, '1'); } catch (_) {}
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
