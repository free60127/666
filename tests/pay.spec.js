// 会员中心 + payjs 支付 + 会员门禁（mock API）
const { test, expect } = require('@playwright/test');

test.use({ launchOptions: { args: ['--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:8788'] } });

const BASE = 'http://127.0.0.1:8788/' + encodeURI('会员中心/index.html');

function newStore() {
  return {
    payStatus: 'pending',        // pending | paid | closed
    memberUntil: 0,              // 0 = 非会员
    createCalls: 0,
    meCalls: 0,
  };
}

// 会员中心 mock：auth + pay
async function mockMemberApi(page, store) {
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
        token: 't'.repeat(64), user: { id: 'u1', email: body.email, nickname: '会员用户' }, recovery: null,
      }) });
    }
    if (url.includes('/logout')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no mock' }) });
  });
  await page.route('**/api/pay/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/pay/me')) {
      store.meCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        memberUntil: store.memberUntil, isMember: store.memberUntil > Date.now(),
      }) });
    }
    if (url.includes('/api/pay/create')) {
      store.createCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ok: true, outTradeNo: 'P' + String(Date.now()) + 'ab12', qrcode: 'weixin://wxpay/bizpayurl?pr=mocktest',
        totalFee: 200, product: 'member30', productName: '全站会员 30 天', expiresIn: 600,
      }) });
    }
    if (url.includes('/api/pay/status')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: store.payStatus, memberUntil: store.payStatus === 'paid' ? store.memberUntil : 0,
      }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no mock' }) });
  });
}

test('会员中心：未登录状态 + 注册登录流程', async ({ page }) => {
  const store = newStore();
  await mockMemberApi(page, store);
  await page.goto(BASE);
  await expect(page.locator('#status-value')).toHaveText('未登录');
  await expect(page.locator('#buy-btn')).toHaveText('登录后开通');
  // 打开登录弹窗 → 切注册 → 注册成功
  await page.click('#auth-open-btn');
  await expect(page.locator('#auth-modal')).toBeVisible();
  await page.click('[data-atab="register"]');
  await expect(page.locator('#auth-nickname-input')).toBeVisible();
  await page.fill('#auth-email-input', 'm@test.com');
  await page.fill('#auth-password-input', 'password123');
  await page.fill('#auth-nickname-input', '测试会员');
  await page.click('#auth-submit-btn');
  await expect(page.locator('#auth-email')).toHaveText('👤 测试会员');
  await expect(page.locator('#auth-open-btn')).toBeHidden();
  // 会员状态刷新（me 被调）
  await expect(page.locator('#status-value')).toHaveText('未开通', { timeout: 4000 });
  await expect(page.locator('#buy-btn')).toHaveText('立即开通');
  // 退出
  await page.click('#auth-logout-btn');
  await expect(page.locator('#status-value')).toHaveText('未登录');
});

test('会员中心：购买 → 二维码弹窗 → 支付成功自动开通', async ({ page }) => {
  const store = newStore();
  await mockMemberApi(page, store);
  await page.goto(BASE);
  // 预置登录态
  await page.evaluate(() => {
    localStorage.setItem('waiyuan-auth-v1', JSON.stringify({ token: 't'.repeat(64), user: { id: 'u1', email: 'm@test.com', nickname: '会员用户' } }));
  });
  await page.reload();
  await expect(page.locator('#status-value')).toHaveText('未开通', { timeout: 4000 });
  await page.click('#buy-btn');
  // 支付弹窗 + 二维码
  await expect(page.locator('#pay-modal')).toBeVisible();
  await expect(page.locator('#pay-qr img')).toBeVisible();
  await expect(page.locator('#pay-amount')).toHaveText('¥2.00');
  expect(store.createCalls).toBe(1);
  // 模拟支付成功 → 轮询自动开通
  store.memberUntil = Date.now() + 30 * 24 * 3600 * 1000;
  store.payStatus = 'paid';
  await expect(page.locator('#toast')).toContainText('开通成功', { timeout: 8000 });
  await expect(page.locator('#status-value')).toHaveText('已开通', { timeout: 5000 });
  await expect(page.locator('#buy-btn')).toHaveText('续费 30 天');
  await expect(page.locator('#pay-modal')).toBeHidden();
});

test('会员门禁：未登录拦截 → 登录后非会员引导开通 → 会员放行', async ({ page }) => {
  const store = newStore();
  await mockMemberApi(page, store);
  // 伪造一个受保护页面（data-member-only=1）
  await page.route('**/gate-test/index.html', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body:
      '<!doctype html><html><body data-member-only="1"><h1 id="content">会员测试内容</h1>' +
      '<script src="/member-gate.js"></script></body></html>' }));
  // 1) 未登录 → 遮罩引导登录
  await page.goto('http://127.0.0.1:8788/gate-test/index.html');
  await expect(page.locator('#member-gate')).toBeVisible();
  await expect(page.locator('.mg-btn').first()).toHaveText('登录 / 注册');
  // 2) 登录但非会员 → 遮罩引导开通
  await page.evaluate(() => {
    localStorage.setItem('waiyuan-auth-v1', JSON.stringify({ token: 't'.repeat(64), user: { id: 'u1', email: 'm@test.com', nickname: '会员用户' } }));
  });
  await page.reload();
  await expect(page.locator('.mg-btn').first()).toHaveText('立即开通 ¥2');
  // 3) 已是会员 → 无遮罩，内容可见
  store.memberUntil = Date.now() + 30 * 24 * 3600 * 1000;
  await page.reload();
  await expect(page.locator('#member-gate')).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator('#content')).toBeVisible();
});
