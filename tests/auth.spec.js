// 账号登录（D1 账号体系）测试（2026-08-22）
// 学习中心登录/注册 UI + 恢复码保险箱解锁；mock /api/auth，真实 Web Crypto 闭环
const { test, expect } = require('@playwright/test');
const crypto = require('crypto');

test.use({
  launchOptions: { args: ['--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:8788'] },
});

const BASE = 'http://127.0.0.1:8788/' + encodeURI('学习中心/index.html');

// 与前端一致的恢复码保险箱加密（Node 侧生成合法密文供 mock login 返回）
async function lockRecoveryNode(password, code) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, baseKey, 256);
  const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(code)));
  const b64 = b => Buffer.from(b).toString('base64url');
  return { salt: b64(salt), iv: b64(iv), c: b64(new Uint8Array(ct)) };
}

// mock /api/auth/*：内存用户 + 会话；CORS 头必须有（页面 127.0.0.1:8788 跨域）
function mockAuthApi(page, users) {
  const calls = [];
  page.route('**/api/auth/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    const ok = body => route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
    const fail = (status, error) => route.fulfill({ status, headers, body: JSON.stringify({ error }) });
    const json = () => route.request().postDataJSON();
    calls.push({ path: url.pathname, method });

    if (url.pathname === '/api/auth/register') {
      const body = json();
      if (users.some(u => u.email === body.email)) return fail(409, '该邮箱已注册，请直接登录');
      const user = { id: 'u' + users.length, email: body.email, password: body.password, nickname: body.nickname || '', recovery: body.recovery || null };
      users.push(user);
      return ok({ ok: true, token: 'tok-reg', user });
    }
    if (url.pathname === '/api/auth/login') {
      const body = json();
      const user = users.find(u => u.email === body.email && u.password === body.password);
      if (!user) return fail(401, '邮箱或密码不正确');
      return ok({ ok: true, token: 'tok-login', user: { id: user.id, email: user.email, nickname: user.nickname }, recovery: user.recovery });
    }
    if (url.pathname === '/api/auth/logout') return ok({ ok: true });
    if (url.pathname === '/api/auth/me') return ok({ ok: true, user: { id: 'u0', email: 'me@test.com', nickname: '我' }, recovery: null });
    return fail(404, 'no');
  });
  return calls;
}

test('注册流程：面板切换 → 注册 → 登录态显示 → 退出', async ({ page }) => {
  const users = [];
  mockAuthApi(page, users);
  await page.goto(BASE);
  await expect(page.locator('#auth-open-btn')).toBeVisible();
  await expect(page.locator('#auth-open-btn')).toHaveText(/登录 \/ 注册/);

  await page.locator('#auth-open-btn').click();
  await expect(page.locator('#auth-panel')).toBeVisible();
  await expect(page.locator('#auth-nickname-input')).toBeHidden(); // 默认登录 tab

  await page.locator('[data-auth-tab="register"]').click();
  await expect(page.locator('#auth-nickname-input')).toBeVisible();
  await expect(page.locator('#auth-submit-btn')).toHaveText('注册');

  await page.fill('#auth-email-input', 'stu@example.com');
  await page.fill('#auth-password-input', 'password123');
  await page.fill('#auth-nickname-input', '小红');
  await page.locator('#auth-submit-btn').click();

  // 登录态：昵称 + 退出按钮，面板关闭
  await expect(page.locator('#auth-email')).toBeVisible();
  await expect(page.locator('#auth-email')).toHaveText('👤 小红');
  await expect(page.locator('#auth-logout-btn')).toBeVisible();
  await expect(page.locator('#auth-panel')).toBeHidden();

  // 注册时本地无恢复码 → 前端自动生成并绑定（mock 收到 recovery 密文）
  expect(users[0]).toBeTruthy();
  expect(users[0].recovery).toBeTruthy();
  expect(users[0].recovery.salt && users[0].recovery.iv && users[0].recovery.c).toBeTruthy();

  // 退出
  await page.locator('#auth-logout-btn').click();
  await expect(page.locator('#auth-open-btn')).toBeVisible();
  await expect(page.locator('#auth-email')).toBeHidden();
});

test('登录流程：账号绑定恢复码 → 登录自动解锁云端恢复码', async ({ page }) => {
  const code = 'TESTCODE'.padEnd(43, 'X');
  const box = await lockRecoveryNode('password123', code);
  const users = [{ id: 'u1', email: 'old@example.com', password: 'password123', nickname: '学长', recovery: box }];
  mockAuthApi(page, users);

  await page.goto(BASE);
  await page.locator('#auth-open-btn').click();
  await page.fill('#auth-email-input', 'old@example.com');
  await page.fill('#auth-password-input', 'password123');
  await page.locator('#auth-submit-btn').click();

  // 登录态显示
  await expect(page.locator('#auth-email')).toHaveText('👤 学长');
  // 恢复码已解锁并写入 cloud-sync 本地存储（存储格式 {code, updatedAt}）
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('waiyuan-cloud-recovery-code-v1'));
    try { return raw ? JSON.parse(raw).code : ''; } catch (_) { return raw; }
  }).toBe(code);
  // 恢复码输入框展示
  await page.locator('[data-action="cloud-restore"]').click();
  await expect(page.locator('#cloud-code')).toHaveText(code);
  // 状态提示
  await expect(page.locator('#data-status')).toContainText('云端恢复码已解锁');
});

test('登录失败：密码错误显示错误信息', async ({ page }) => {
  const users = [{ id: 'u1', email: 'old@example.com', password: 'password123', nickname: '学长', recovery: null }];
  mockAuthApi(page, users);
  await page.goto(BASE);
  await page.locator('#auth-open-btn').click();
  await page.fill('#auth-email-input', 'old@example.com');
  await page.fill('#auth-password-input', 'wrong-password');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#data-status')).toContainText('邮箱或密码不正确');
  await expect(page.locator('#auth-email')).toBeHidden(); // 未登录
});
