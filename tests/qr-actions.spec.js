// 二维码通用操作（2026-08-25）：img[data-qr] 长按/右键 → 操作面板
const { test, expect } = require('@playwright/test');

const enc = p => encodeURI(p);

test('主页赞助二维码：右键弹出操作面板，可关闭', async ({ page }) => {
  await page.goto('http://127.0.0.1:8788/index.html');
  await page.locator('button[data-action="sponsor"]').click();
  const qr = page.locator('#sponsor img[data-qr]');
  await expect(qr).toBeVisible();
  await qr.dispatchEvent('contextmenu');
  const sheet = page.locator('#wy-qr-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('二维码操作');
  await sheet.locator('[data-wy-qr="close"]').click();
  await expect(sheet).toBeHidden();
});

test('电子版教材：二维码图片右键弹出操作面板', async ({ page }) => {
  await page.goto('http://127.0.0.1:8788/' + enc('电子版教材/index.html'));
  const qr = page.locator('img[data-qr]');
  await expect(qr).toBeVisible();
  await qr.dispatchEvent('contextmenu');
  await expect(page.locator('#wy-qr-sheet')).toBeVisible();
  await page.locator('#wy-qr-sheet [data-wy-qr="close"]').click();
});

test('考证：英语专四二维码图片右键弹出操作面板', async ({ page }) => {
  await page.goto('http://127.0.0.1:8788/' + enc('考证/英语专四/index.html'));
  const qr = page.locator('img[data-qr]');
  await expect(qr).toBeVisible();
  await qr.dispatchEvent('contextmenu');
  await expect(page.locator('#wy-qr-sheet')).toBeVisible();
  await page.locator('#wy-qr-sheet [data-wy-qr="close"]').click();
});

test('跑腿平台：加载 common.js 后存在原生下载桥与二维码操作组件', async ({ page }) => {
  await page.goto('http://127.0.0.1:8788/' + enc('paotui/index.html'));
  const hasCommon = await page.evaluate(() => !!window.WaiyuanNativeDownload && !!window.WaiyuanQrActions);
  expect(hasCommon).toBe(true);
});
