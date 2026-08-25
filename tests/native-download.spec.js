// Capacitor App 内下载：原生桥 NativeSave 通道（blob/data: 内容）与非原生回归
const { test, expect } = require('@playwright/test');

test.use({ launchOptions: { args: ['--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:8788'] } });

// 模拟 Capacitor 原生环境 + inject-common.js 注入的 WaiyuanNativeDownload（本地测试 server 不做注入）
// saveFails=true 时模拟原生桥写入失败（Java 返回 false）→ 前端必须回退，不得谎报成功
async function mockNative(page, saveFails = false) {
  await page.addInitScript(({ fails }) => {
    window.Capacitor = { isNativePlatform: () => true };
    window.__nativeSaves = [];
    window.NativeSave = {
      saveBase64(name, data) {
        window.__nativeSaves.push({ name: String(name), data: String(data) });
        return !fails;
      },
    };
    window.WaiyuanNativeDownload = {
      isNative() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      },
      saveBlob(name, blob) {
        if (!this.isNative() || !window.NativeSave || !blob) return Promise.resolve(false);
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = String(reader.result).split(',')[1] || '';
            if (!base64) return resolve(false);
            const ok = window.NativeSave.saveBase64(name || 'file', base64);
            resolve(ok === true);
          };
          reader.onerror = () => resolve(false);
          reader.readAsDataURL(blob);
        });
      },
      saveDataUrl(name, dataUrl) {
        if (!this.isNative() || !window.NativeSave) return false;
        const base64 = String(dataUrl || '').split(',')[1] || '';
        if (!base64) return false;
        return window.NativeSave.saveBase64(name || 'file', base64) === true;
      },
    };
  }, { fails: saveFails });
}

test('跑腿：App 内分享卡保存走原生桥（NativeSave.saveBase64）', async ({ page }) => {
  await mockNative(page);
  await page.goto('/' + encodeURI('paotui/index.html'));
  await page.click('#share-card-btn');
  await expect(page.locator('#share-modal')).toBeVisible();
  await expect(page.locator('#share-preview img')).toBeVisible();
  await page.click('#share-save');
  await expect(page.locator('#toast')).toContainText('已保存到手机「下载」目录');
  const saves = await page.evaluate(() => window.__nativeSaves);
  expect(saves.length).toBe(1);
  expect(saves[0].name).toBe('外院互助平台卡.jpg');
  expect(saves[0].data.startsWith('/9j/')).toBe(true); // JPEG base64 魔数
  expect(saves[0].data.length).toBeGreaterThan(100);
});

test('跑腿：App 内任务卡保存同样走原生桥', async ({ page }) => {
  await mockNative(page);
  await page.route('**/api/errand/tasks?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ total: 1, items: [{ id: 7, title: '带一份饭', reward: 5, pickup: '食堂', dropoff: '宿舍', deadline: Date.now() + 3600000, status: 'open', publisherName: '测试用户', createdAt: Date.now(), contact: '' }] }),
  }));
  await page.route('**/api/errand/tasks/7', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ task: { id: 7, title: '带一份饭', reward: 5, pickup: '食堂', dropoff: '宿舍', deadline: Date.now() + 3600000, status: 'open', publisherName: '测试用户', createdAt: Date.now(), contact: '' } }),
  }));
  await page.goto('/' + encodeURI('paotui/index.html'));
  // 打开任务详情（设置 currentShareTask），关闭后再开分享面板
  await expect(page.locator('.task-card')).toBeVisible();
  await page.click('.task-card');
  await expect(page.locator('#detail-modal')).toBeVisible();
  await page.click('#detail-body [data-act="close"]');
  await page.click('#share-card-btn');
  await page.click('#share-tabs .tab[data-stype="task"]');
  await expect(page.locator('#share-preview img')).toBeVisible();
  await page.click('#share-save');
  const saves = await page.evaluate(() => window.__nativeSaves);
  expect(saves.length).toBe(1);
  expect(saves[0].name).toBe('外院互助任务卡.jpg');
  expect(saves[0].data.startsWith('/9j/')).toBe(true);
});

test('跑腿：原生保存失败时回退提示（不谎报成功）', async ({ page }) => {
  await mockNative(page, true);
  await page.goto('/' + encodeURI('paotui/index.html'));
  await page.click('#share-card-btn');
  await expect(page.locator('#share-preview img')).toBeVisible();
  await page.click('#share-save');
  await expect(page.locator('#toast')).toContainText('保存失败，请截图或长按图片保存');
  const saves = await page.evaluate(() => window.__nativeSaves);
  expect(saves.length).toBe(1); // 桥被调用过，但返回 false
});

test('跑腿：非原生浏览器保持原保存提示', async ({ page }) => {
  await page.goto('/' + encodeURI('paotui/index.html'));
  await page.click('#share-card-btn');
  await expect(page.locator('#share-preview img')).toBeVisible();
  await page.click('#share-save');
  await expect(page.locator('#toast')).toContainText('已开始保存图片（未生效可长按图片保存）');
});

test('题库导入：App 内 import.json 走原生桥且命令照常生成', async ({ page }) => {
  await mockNative(page);
  await page.goto('/' + encodeURI('题库导入.html'));
  await page.click('#sample');
  await page.click('#run');
  await expect(page.locator('#report')).toContainText('已保存到手机「下载」目录：import.json');
  await expect(page.locator('#command-hint')).toBeVisible();
  await expect(page.locator('#cmd-main')).toContainText('node scripts/import-quiz.js');
  const saves = await page.evaluate(() => window.__nativeSaves);
  expect(saves.length).toBe(1);
  expect(saves[0].name).toBe('import.json');
  // 缩进 JSON 的 base64 不是 W3s 开头；解码后应含题目字段
  const text = await page.evaluate(d => atob(d), saves[0].data);
  expect(text.startsWith('[\n  {')).toBe(true);
  expect(text).toContain('"type"');
  expect(text).toContain('"title"');
});
