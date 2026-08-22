// 首页：欢迎猫咪弹窗已删除（2026-08-21），其余弹窗（赞助/打印小店/反馈）正常工作
const { test, expect } = require('@playwright/test');

test('首页：无 #welcome 猫咪弹窗，赞助弹窗仍可开关', async ({ page }) => {
  await page.goto('/');
  // 欢迎弹窗（含猫咪图）必须不存在
  await expect(page.locator('#welcome')).toHaveCount(0);
  await expect(page.locator('img[alt="可爱猫咪"]')).toHaveCount(0);
  // 其他弹窗功能不受影响
  await page.click('[data-action="sponsor"]');
  await expect(page.locator('#sponsor')).toBeVisible();
  await page.click('[data-action="close-pay"]');
  await expect(page.locator('#sponsor')).toBeHidden();
  await page.click('[data-action="feedback"]');
  await expect(page.locator('#feedback')).toBeVisible();
  await page.click('[data-action="close-feedback"]');
  await expect(page.locator('#feedback')).toBeHidden();
});

test('首页：打印小店弹窗正常', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-action="print-shop"]');
  await expect(page.locator('#print-shop')).toBeVisible();
  await page.click('[data-action="close-print-shop"]');
  await expect(page.locator('#print-shop')).toBeHidden();
});

test('首页：意见反馈文本框 200 字上限，空输入拦截，提交直达后台', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-action="feedback"]');
  await expect(page.locator('#feedback')).toBeVisible();
  // 无二维码，改为文本框 + 联系文案
  await expect(page.locator('#feedback img')).toHaveCount(0);
  await expect(page.locator('#feedback-text')).toHaveAttribute('maxlength', '200');
  await expect(page.locator('.feedback-contact')).toContainText('f-xuan-r');
  await expect(page.locator('.feedback-contact')).toContainText('360476118@qq.com');
  // 空输入拦截
  await page.click('#feedback-submit');
  await expect(page.locator('#feedback-status')).toHaveText('请先输入反馈内容');
  // mock 云端提交成功
  await page.route('**/api/feedback', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.fill('#feedback-text', '希望增加计算机二级的刷题题库，谢谢！');
  await expect(page.locator('#feedback-count')).toHaveText('18 / 200');
  await page.click('#feedback-submit');
  await expect(page.locator('#feedback-status')).toHaveText('✓ 反馈已提交，感谢你的支持！');
  await expect(page.locator('#feedback-text')).toHaveValue('');
});

test('GitHub 直连统计：强制开关下上报 /api/visit（vid 32hex + 路径去 /666 前缀）', async ({ browser }) => {
  // 阻止 Service Worker 缓存旧 common.js，保证每次导航都执行最新上报逻辑
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const got = [];
  await page.addInitScript(() => { window.WAIYUAN_GH_STATS = true; });
  await page.route('**/api/visit', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    got.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.goto('/');
  await expect.poll(() => got.length >= 1, { timeout: 4000 }).toBe(true);
  const v = got[0];
  expect(v.vid).toMatch(/^[0-9a-f]{32}$/);
  expect(v.path).toBe('/');
  // 再次访问（同一上下文 localStorage 保留）→ vid 不变
  await page.goto('/思政系列/');
  // location.pathname 是百分号编码形式（与主域后端统计口径一致，读取端统一解码）
  await expect.poll(() => got.some(g => decodeURIComponent(g.path) === '/思政系列/'), { timeout: 4000 }).toBe(true);
  expect(got.filter(g => decodeURIComponent(g.path) === '/思政系列/')[0].vid).toBe(v.vid);
  await context.close();
});
