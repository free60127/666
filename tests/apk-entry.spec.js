// APK 双入口：主页与跑腿页的「下载安卓版 App」链接
const { test, expect } = require('@playwright/test');

test.use({ launchOptions: { args: ['--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:8788'] } });

test('主页：install-apk 链接指向 share APK Release 下载', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('a.install-apk');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://free60127.top/apk/waiyuan-share.apk');
  await expect(link).toHaveAttribute('download', '外院知识分享站.apk');
  await expect(link.locator('.install-apk-text b')).toContainText('下载安卓版 App');
  await expect(link.locator('.install-apk-btn')).toContainText('下载 APK');
});

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

test('主页：install-site iOS 专用（iOS UA 显示 + 徽标 + 引导文案）', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: IOS_UA });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('#install-site')).toBeVisible();
  await expect(page.locator('.ios-badge')).toHaveText('iOS 专用');
  await expect(page.locator('#install-hint')).toContainText('仅 iOS 可用');
  await ctx.close();
});

test('主页：install-site 安卓 UA 下隐藏（走 APK 下载）', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: ANDROID_UA });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('#install-site')).toBeHidden();
  await expect(page.locator('a.install-apk')).toBeVisible();
  await ctx.close();
});

test('跑腿页：install-site iOS 专用入口', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: IOS_UA });
  const page = await ctx.newPage();
  await page.goto('/' + encodeURI('paotui/index.html'));
  await expect(page.locator('#install-site')).toBeVisible();
  await expect(page.locator('.ios-badge')).toHaveText('iOS 专用');
  await ctx.close();
});

test('跑腿页：install-apk 链接指向 paotui APK Release 下载', async ({ page }) => {
  await page.goto('/' + encodeURI('paotui/index.html'));
  const link = page.locator('a.install-apk');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://free60127.top/apk/waiyuan-paotui.apk');
  await expect(link).toHaveAttribute('download', '外院互助.apk');
});
