// 主页账号入口（home-auth.js）：面板开关 / tab 切换 / 注册 / 登录解锁 / 保险箱异常 / 退出 / 刷新保持
const { test, expect } = require('@playwright/test');

test.use({ launchOptions: { args: ['--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:8788'] } });

const BASE = '/';

// 主页账号 mock：注册/登录/登出/setRecovery
async function mockAuth(page, { loginRecovery = null } = {}) {
  await page.route('**/api/auth/**', async route => {
    const url = route.request().url();
    const body = route.request().postDataJSON();
    if (url.includes('/register')) {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
        token: 't'.repeat(64), user: { id: 'u1', email: body.email, nickname: body.nickname || '' }, recovery: null,
      }) });
    }
    if (url.includes('/login')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        token: 't'.repeat(64), user: { id: 'u1', email: body.email, nickname: '小美' }, recovery: loginRecovery,
      }) });
    }
    if (url.includes('/logout')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (url.includes('/recovery')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no mock' }) });
  });
}

test('主页：右上角入口打开面板，tab 切到注册显示昵称输入', async ({ page }) => {
  await mockAuth(page);
  await page.goto(BASE);
  await expect(page.locator('#auth-open-btn')).toBeVisible();
  await page.click('#auth-open-btn');
  await expect(page.locator('#auth-panel')).toBeVisible();
  await expect(page.locator('#auth-nickname-input')).toBeHidden();
  await page.click('[data-auth-tab="register"]');
  await expect(page.locator('#auth-nickname-input')).toBeVisible();
  await expect(page.locator('#auth-submit-btn')).toHaveText('注册');
  // 关闭按钮
  await page.click('[data-action="close-auth"]');
  await expect(page.locator('#auth-panel')).toBeHidden();
});

test('主页：注册成功 → 显示昵称、面板关闭', async ({ page }) => {
  await mockAuth(page);
  await page.goto(BASE);
  await page.click('#auth-open-btn');
  await page.click('[data-auth-tab="register"]');
  await page.fill('#auth-email-input', 'home@test.com');
  await page.fill('#auth-password-input', 'password123');
  await page.fill('#auth-nickname-input', '主页用户');
  await page.click('[data-action="auth-submit"]');
  await expect(page.locator('#auth-hint')).toContainText('注册成功');
  await expect(page.locator('#auth-email')).toHaveText('👤 主页用户');
  await expect(page.locator('#auth-open-btn')).toBeHidden();
  await expect(page.locator('#auth-panel')).toBeHidden();
});

test('主页：登录解锁真实保险箱 → 恢复码写入本地', async ({ page }) => {
  await mockAuth(page);
  await page.goto(BASE);
  // 先造一个真实加密的保险箱（与前端同实现）
  const box = await page.evaluate(async () => {
    await window.WaiyuanAuth.ready;
    return window.WaiyuanAuth.lockRecovery('password123', 'TEST-RECOVERY-CODE');
  });
  await mockAuth(page, { loginRecovery: box });
  await page.click('#auth-open-btn');
  await page.fill('#auth-email-input', 'home@test.com');
  await page.fill('#auth-password-input', 'password123');
  await page.click('[data-action="auth-submit"]');
  await expect(page.locator('#auth-hint')).toContainText('云端恢复码已解锁');
  await expect(page.locator('#auth-email')).toHaveText('👤 小美');
  // 恢复码已写入 cloud-sync 的 localStorage
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('waiyuan-cloud-recovery-code-v1') || 'null'));
  expect(code.code).toBe('TEST-RECOVERY-CODE');
});

test('主页：登录但保险箱解密失败 → 明确异常提示', async ({ page }) => {
  await mockAuth(page, { loginRecovery: { salt: 'fake', iv: 'fake', c: 'fake' } });
  await page.goto(BASE);
  await page.click('#auth-open-btn');
  await page.fill('#auth-email-input', 'home@test.com');
  await page.fill('#auth-password-input', 'password123');
  await page.click('[data-action="auth-submit"]');
  await expect(page.locator('#auth-hint')).toContainText('保险箱异常');
});

test('主页：退出登录 → 恢复未登录状态', async ({ page }) => {
  await mockAuth(page);
  await page.goto(BASE);
  // 先登录
  await page.click('#auth-open-btn');
  await page.fill('#auth-email-input', 'home@test.com');
  await page.fill('#auth-password-input', 'password123');
  await page.click('[data-action="auth-submit"]');
  await expect(page.locator('#auth-email')).toBeVisible();
  // 退出
  await page.click('#auth-logout-btn');
  await expect(page.locator('#auth-open-btn')).toBeVisible();
  await expect(page.locator('#auth-email')).toBeHidden();
});

test('主页：刷新后保持登录态（会话持久化）', async ({ page }) => {
  await mockAuth(page);
  await page.goto(BASE);
  await page.click('#auth-open-btn');
  await page.fill('#auth-email-input', 'home@test.com');
  await page.fill('#auth-password-input', 'password123');
  await page.click('[data-action="auth-submit"]');
  await expect(page.locator('#auth-email')).toHaveText('👤 小美');
  await page.reload();
  await expect(page.locator('#auth-email')).toHaveText('👤 小美');
  await expect(page.locator('#auth-open-btn')).toBeHidden();
});
