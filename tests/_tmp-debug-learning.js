// 临时调试：学习中心页 load 挂起诊断
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'test-server.js')], { stdio: 'pipe' });
  await new Promise(res => server.stdout.once('data', res));
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  page.on('console', m => console.log('[console]', m.type(), String(m.text()).slice(0, 200)));
  page.on('requestfailed', r => console.log('[failed]', r.url().slice(0, 120), r.failure()?.errorText));
  page.on('response', r => { if (r.status() >= 400) console.log('[http>400]', r.status(), r.url().slice(0, 120)); });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  page.on('request', r => { if (!r.url().includes('127.0.0.1')) console.log('[external]', r.url().slice(0, 120)); });
  const t = Date.now();
  try {
    await page.goto('http://127.0.0.1:8788/学习中心/index.html', { waitUntil: 'load', timeout: 20000 });
    console.log('goto OK in', Date.now() - t, 'ms');
  } catch (e) {
    console.log('goto ERR:', e.message.split('\n')[0], 'elapsed', Date.now() - t, 'ms');
    await page.waitForTimeout(5000);
  }
  console.log('=== title:', await page.title());
  await browser.close();
  server.kill();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
