// 管理面板（admin.html）测试（2026-08-22）：站点统计 tab 渲染与鉴权提示
const { test, expect } = require('@playwright/test');

test.use({
  launchOptions: { args: ['--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:8788'] },
});

const BASE = 'http://127.0.0.1:8788/admin.html';

test('站点统计：KPI / 趋势 / 热门页面正常渲染', async ({ page }) => {
  await page.route('**/api/stats', route => {
    const auth = route.request().headers()['authorization'] || '';
    if (!auth.includes('Bearer tok')) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        totals: { pv: 12345 },
        today: { pv: 88, uv: 12 },
        daily: [
          { date: '2026-08-22', pv: 88, uv: 12 },
          { date: '2026-08-21', pv: 70, uv: 9 },
        ],
        topPages: [
          { path: '/', pv: 5000 },
          { path: '/学习中心/index.html', pv: 1200 },
        ],
      }),
    });
  });
  await page.goto(BASE);
  await page.fill('#token', 'tok');
  await page.locator('.tabs button[data-tab="stats"]').click();
  await page.locator('#load-stats').click();
  await expect(page.locator('#st-pv-total')).toHaveText('12,345');
  await expect(page.locator('#st-pv-today')).toHaveText('88');
  await expect(page.locator('#st-uv-today')).toHaveText('12');
  await expect(page.locator('#st-daily .day-row')).toHaveCount(2);
  await expect(page.locator('#st-daily .day-row').first()).toContainText('2026-08-22');
  await expect(page.locator('#st-pages .page-row')).toHaveCount(2);
  await expect(page.locator('#st-pages .page-row').first()).toContainText('/');
  await expect(page.locator('#st-pages .page-row').first()).toContainText('5,000');
});

test('站点统计：无令牌 / 令牌错误 → 明确提示', async ({ page }) => {
  await page.route('**/api/stats', route =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) }));
  await page.goto(BASE);
  await page.locator('.tabs button[data-tab="stats"]').click();
  await page.locator('#load-stats').click();
  await expect(page.locator('#msg')).toContainText('令牌无效');
});
