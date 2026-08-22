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

// mock /api/sync：账号模式（带 Bearer）与匿名（deviceId）内存存储；避免测试打真实网络
function mockSyncApi(page, store) {
  page.route('**/api/sync**', route => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    const req = route.request();
    const method = req.method();
    const auth = req.headers()['authorization'] || '';
    const url = new URL(req.url());
    const deviceId = url.searchParams.get('deviceId');
    const key = auth ? 'user:' + (store.authUser || 'u0') : deviceId;
    if (!key) return route.fulfill({ status: 400, headers, body: JSON.stringify({ error: 'deviceId required' }) });
    if (method === 'POST') {
      const body = req.postDataJSON();
      store[key] = { payload: body.payload, updatedAt: '2026-08-22T00:00:00.000Z' };
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true, size: 10, updatedAt: store[key].updatedAt }) });
    }
    if (method === 'GET') {
      const hit = store[key];
      return hit ? route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true, payload: hit.payload, updatedAt: hit.updatedAt }) })
                 : route.fulfill({ status: 404, headers, body: JSON.stringify({ error: 'not found' }) });
    }
    if (method === 'DELETE') { delete store[key]; return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) }); }
    return route.fulfill({ status: 405, headers, body: 'no' });
  });
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
    if (url.pathname === '/api/auth/me') {
      const target = users[users.length - 1] || users[0] || { id: 'u0', email: 'me@test.com', nickname: '我', recovery: null };
      return ok({ ok: true, user: { id: target.id, email: target.email, nickname: target.nickname }, recovery: target.recovery });
    }
    if (url.pathname === '/api/auth/recovery') { calls.recoveryCount = (calls.recoveryCount || 0) + 1; return ok({ ok: true }); }
    if (url.pathname === '/api/auth/change-password') {
      const body = json();
      const target = users[users.length - 1] || users[0];
      if (!target || body.oldPassword !== target.password) return fail(401, '旧密码不正确');
      if (!body.newPassword || body.newPassword.length < 8) return fail(400, '密码至少 8 位');
      if (body.recovery) { calls.newRecovery = body.recovery; }
      return ok({ ok: true });
    }
    if (url.pathname === '/api/auth/delete-account') {
      const body = json();
      const target = users[users.length - 1] || users[0];
      if (!target || body.password !== target.password) return fail(401, '密码不正确');
      users.length = 0;
      return ok({ ok: true });
    }
    if (url.pathname === '/api/auth/forgot') return ok({ ok: true });
    if (url.pathname === '/api/auth/reset-password') {
      const body = json();
      if (body.code !== '12345678') return fail(400, '验证码错误或已过期');
      return ok({ ok: true, recoveryReset: !body.recovery });
    }
    return fail(404, 'no');
  });
  return calls;
}

test('注册流程：面板切换 → 注册 → 登录态显示 → 退出', async ({ page }) => {
  const users = [];
  mockAuthApi(page, users);
  mockSyncApi(page, {});
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
  mockSyncApi(page, {});

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
  mockSyncApi(page, {});
  await page.goto(BASE);
  await page.locator('#auth-open-btn').click();
  await page.fill('#auth-email-input', 'old@example.com');
  await page.fill('#auth-password-input', 'wrong-password');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#data-status')).toContainText('邮箱或密码不正确');
  await expect(page.locator('#auth-email')).toBeHidden(); // 未登录
});

test('登录后云端备份走账号模式（带 Bearer，无 deviceId）', async ({ page }) => {
  const users = [{ id: 'acc1', email: 'acc@example.com', password: 'password123', nickname: '账号用户', recovery: null }];
  const syncStore = { authUser: 'acc1' };
  mockAuthApi(page, users);
  mockSyncApi(page, syncStore);
  await page.goto(BASE);

  // 登录
  await page.locator('#auth-open-btn').click();
  await page.fill('#auth-email-input', 'acc@example.com');
  await page.fill('#auth-password-input', 'password123');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#auth-email')).toHaveText('👤 账号用户');

  // 云端备份 → 应写入账号键（带 Authorization）
  await page.locator('[data-action="cloud-backup"]').click();
  await expect(page.locator('#data-status')).toContainText('云端备份完成');
  expect(syncStore['user:acc1']).toBeTruthy();  // 账号键有数据
  // 匿名键不存在（64 hex deviceId 未出现）
  expect(Object.keys(syncStore).some(k => k.length === 64)).toBe(false);

  // 云端恢复（登录态无输入框内容）→ 从账号取回
  await page.locator('[data-action="cloud-restore"]').click();
  await page.locator('[data-action="cloud-restore-go"]').click();
  await expect(page.locator('#data-status')).toContainText('账号云端恢复成功');
});

test('刷新页面后账号模式保持（P0-1）', async ({ page }) => {
  const users = [{ id: 'r1', email: 'refresh@example.com', password: 'password123', nickname: '刷新用户', recovery: null }];
  const syncStore = { authUser: 'r1' };
  mockAuthApi(page, users);
  mockSyncApi(page, syncStore);
  await page.goto(BASE);
  await page.locator('#auth-open-btn').click();
  await page.fill('#auth-email-input', 'refresh@example.com');
  await page.fill('#auth-password-input', 'password123');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#auth-email')).toHaveText('👤 刷新用户');

  // 刷新：cloud-sync 的 identity 在内存，必须从 localStorage 会话重建
  await page.reload();
  await expect(page.locator('#auth-email')).toHaveText('👤 刷新用户');

  // 备份 → 必须仍走账号模式（带 Bearer，键 user:r1）
  await page.locator('[data-action="cloud-backup"]').click();
  await expect(page.locator('#data-status')).toContainText('云端备份完成');
  expect(syncStore['user:r1']).toBeTruthy();
  expect(Object.keys(syncStore).some(k => k.length === 64)).toBe(false);
});

test('登录时自动绑定恢复码保险箱（P0-2）', async ({ page }) => {
  const users = [{ id: 'b1', email: 'bind@example.com', password: 'password123', nickname: '绑定用户', recovery: null }];
  const calls = mockAuthApi(page, users);
  mockSyncApi(page, { authUser: 'b1' });
  await page.goto(BASE);
  await page.locator('#auth-open-btn').click();
  await page.fill('#auth-email-input', 'bind@example.com');
  await page.fill('#auth-password-input', 'password123');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#auth-email')).toHaveText('👤 绑定用户');

  // 账号无保险箱 → 前端应生成恢复码并调用 /api/auth/recovery 绑定
  expect(calls.recoveryCount).toBe(1);
  const stored = await page.evaluate(() => {
    try { const raw = JSON.parse(localStorage.getItem('waiyuan-cloud-recovery-code-v1')); return raw ? raw.code : ''; } catch (_) { return ''; }
  });
  expect(stored.length).toBeGreaterThan(0);
});

test('保险箱解密失败 → 明确提示并暂停备份（P0-3）', async ({ page }) => {
  // box 用 real-password 加密，但登录用 other-password（服务端校验通过，前端解不开 → 保险箱异常）
  const box = await lockRecoveryNode('real-password', 'CODE'.padEnd(43, 'X'));
  const users = [{ id: 'x1', email: 'broken@example.com', password: 'other-password', nickname: '异常用户', recovery: box }];
  const syncStore = { authUser: 'x1' };
  mockAuthApi(page, users);
  mockSyncApi(page, syncStore);
  await page.goto(BASE);
  await page.locator('#auth-open-btn').click();
  await page.fill('#auth-email-input', 'broken@example.com');
  await page.fill('#auth-password-input', 'other-password');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#auth-email')).toHaveText('👤 异常用户');
  // 明确提示保险箱异常
  await expect(page.locator('#data-status')).toContainText('保险箱异常');
  // 备份被暂停，账号键无数据
  await page.locator('[data-action="cloud-backup"]').click();
  await expect(page.locator('#data-status')).toContainText('已暂停备份');
  expect(syncStore['user:x1']).toBeFalsy();
});
test('忘记密码：发送验证码 → 重置密码 → 回登录视图', async ({ page }) => {
  const users = [{ id: 'u0', email: 'fg@example.com', password: 'secret123', nickname: '', recovery: null }];
  mockAuthApi(page, users);
  mockSyncApi(page, {});
  await page.goto(BASE);
  await page.locator('#auth-open-btn').click();
  await page.locator('#auth-forgot-link').click();
  await expect(page.locator('#auth-forgot-view')).toBeVisible();
  await expect(page.locator('#auth-login-view')).toBeHidden();
  await page.fill('#auth-forgot-email', 'fg@example.com');
  await page.locator('#auth-forgot-send-btn').click();
  await expect(page.locator('#auth-reset-view')).toBeVisible();
  await expect(page.locator('#auth-reset-email')).toHaveValue('fg@example.com');
  await page.fill('#auth-reset-code', '12345678');
  await page.fill('#auth-reset-password', 'new-pass-1');
  await page.locator('#auth-reset-submit-btn').click();
  await expect(page.locator('#data-status')).toContainText('密码已重置');
  await expect(page.locator('#auth-login-view')).toBeVisible();
});

test('修改密码：登录 → 账号管理 → 保险箱自动重加密', async ({ page }) => {
  const box = await lockRecoveryNode('secret123', 'NEWCODE'.padEnd(43, 'X'));
  const users = [{ id: 'cp1', email: 'cp@example.com', password: 'secret123', nickname: '小明', recovery: box }];
  const calls = mockAuthApi(page, users);
  mockSyncApi(page, {});
  await page.goto(BASE);
  await page.locator('#auth-open-btn').click();
  await page.fill('#auth-email-input', 'cp@example.com');
  await page.fill('#auth-password-input', 'secret123');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#auth-email')).toHaveText('👤 小明');
  // 点击昵称打开账号管理
  await page.locator('#auth-email').click();
  await expect(page.locator('#auth-manage-view')).toBeVisible();
  await page.fill('#auth-old-password', 'secret123');
  await page.fill('#auth-new-password', 'new-pass-1');
  await page.locator('#auth-change-submit-btn').click();
  await expect(page.locator('#data-status')).toContainText('密码已修改');
  // 保险箱用新密码重加密后上传（旧密码解不开新密文）
  await expect.poll(() => calls.newRecovery ? Promise.resolve(calls.newRecovery.c) : null).toBeTruthy();
  const box2 = calls.newRecovery;
  const oldThrows = await page.evaluate(async ({ b }) => {
    try { await window.WaiyuanAuth.unlockRecovery('secret123', b); return false; } catch (_) { return true; }
  }, { b: box2 });
  expect(oldThrows).toBe(true);
  const code = await page.evaluate(async ({ b }) => window.WaiyuanAuth.unlockRecovery('new-pass-1', b), { b: box2 });
  expect(code).toBe('NEWCODE'.padEnd(43, 'X'));
});

test('注销账号：确认后删除并回到未登录态', async ({ page }) => {
  const users = [{ id: 'del1', email: 'del@example.com', password: 'secret123', nickname: '注销用户', recovery: null }];
  mockAuthApi(page, users);
  mockSyncApi(page, {});
  await page.goto(BASE);
  await page.locator('#auth-open-btn').click();
  await page.fill('#auth-email-input', 'del@example.com');
  await page.fill('#auth-password-input', 'secret123');
  await page.locator('#auth-submit-btn').click();
  await expect(page.locator('#auth-email')).toHaveText('👤 注销用户');
  await page.locator('#auth-email').click();
  await expect(page.locator('#auth-manage-view')).toBeVisible();
  await page.fill('#auth-delete-password', 'secret123');
  await page.locator('#auth-delete-open-btn').click();
  await expect(page.locator('#auth-delete-submit-btn')).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.locator('#auth-delete-submit-btn').click();
  await expect(page.locator('#auth-open-btn')).toBeVisible();
  await expect(page.locator('#auth-email')).toBeHidden();
});
