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

test('主页：install-site 手动添加主屏幕入口仍保留', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#install-site')).toBeVisible(); // 桌面浏览器显示菜单引导（beforeinstallprompt 后升级为立即安装）
  await expect(page.locator('#install-hint')).toContainText('添加到主屏幕');
});

test('跑腿页：install-apk 链接指向 paotui APK Release 下载', async ({ page }) => {
  await page.goto('/' + encodeURI('paotui/index.html'));
  const link = page.locator('a.install-apk');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://free60127.top/apk/waiyuan-paotui.apk');
  await expect(link).toHaveAttribute('download', '外院跑腿.apk');
});
