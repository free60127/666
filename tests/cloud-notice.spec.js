// 云同步 + 首页公告 测试（2026-08-21）
// 云同步涉及 Web Crypto（AES-GCM），本地 http 需要把 127.0.0.1:8788 视为安全源
const { test, expect } = require('@playwright/test');

test.use({
  launchOptions: { args: ['--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:8788'] },
});

// 内存 KV：模拟 Worker /api/sync（deviceId -> {payload, updatedAt}）
function makeSyncMock(page) {
  const store = new Map();
  let lastUpload = null;
  let deleteCount = 0;
  page.route('**/api/sync**', route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'POST') {
      const body = req.postDataJSON();
      store.set(body.deviceId, { payload: body.payload, updatedAt: '2026-08-21T12:00:00.000Z' });
      lastUpload = body;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, size: JSON.stringify(body.payload).length, updatedAt: '2026-08-21T12:00:00.000Z' }) });
    }
    const deviceId = url.searchParams.get('deviceId');
    if (method === 'GET') {
      const hit = store.get(deviceId);
      return hit ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, payload: hit.payload, updatedAt: hit.updatedAt }) })
                 : route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
    }
    if (method === 'DELETE') {
      store.delete(deviceId);
      deleteCount++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({ status: 405, body: 'no' });
  });
  return { store, get lastUpload() { return lastUpload; }, get deleteCount() { return deleteCount; } };
}

const SEED = {
  'waiyuan-unified-web-study-v1': {
    version: 1,
    progress: { pCloudNewer: { key: 'pCloudNewer', title: '云端较新题', lastViewedAt: 3000, viewed: true, answered: true, ok: true },
               pLocalOnly: { key: 'pLocalOnly', title: '本地独有题', lastViewedAt: 4000, viewed: true } },
    favorites: { fCloud: { key: 'fCloud', title: '云端收藏', updatedAt: 5000 } },
    settings: { dailyGoal: 20 },
  },
  'waiyuan-vocabulary-progress-v1': {
    words: { wCloud: { due: 1 }, wShared: { due: 1 } },
    history: { '2026-08-21': { reviews: 2, correct: 1 } },
    sequence: { x: 1 },
    settings: { dailyGoal: 10 },
  },
  'politics-h5-state-v1': { version: 1, progress: { q1: { ok: false } } },
};

const SEED2 = {
  'waiyuan-unified-web-study-v1': {
    version: 1,
    progress: { pCloudNewer: { key: 'pCloudNewer', title: '云端较新题', lastViewedAt: 1000, viewed: true, answered: true, ok: false },  // 本地旧 -> 应取云端
               pLocal2: { key: 'pLocal2', title: '第二台设备新题', lastViewedAt: 6000, viewed: true } },
    favorites: { fLocal2: { key: 'fLocal2', title: '新设备收藏', updatedAt: 7000 } },
    settings: { dailyGoal: 30 },
  },
  'waiyuan-vocabulary-progress-v1': { words: { wLocal2: { due: 2 } }, history: {}, sequence: {}, settings: { dailyGoal: 10 } },
};

async function seedLocal(page, data) {
  await page.addInitScript(seed => {
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
  }, data);
}

test('首页公告：有内容时显示，无内容时隐藏', async ({ page }) => {
  // 有公告
  await page.route('**/api/notice', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '📢 测试公告：期中复习资料已更新', updatedAt: '2026-08-21T10:00:00Z' }) }));
  await page.goto('/');
  const notice = page.locator('#site-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveText('📢 测试公告：期中复习资料已更新');

  // 无公告（空文本）-> 隐藏
  await page.route('**/api/notice', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '', updatedAt: null }) }), { times: 1 });
  await page.reload();
  await expect(notice).toBeHidden();
});

test('云同步：备份 → 换设备恢复合并 → 清除云端', async ({ page }) => {
  const sync = makeSyncMock(page);
  await seedLocal(page, SEED);
  await page.goto('/' + encodeURI('学习中心/index.html'));

  // ---- 备份：第一次点击生成恢复码，第二次上传 ----
  await page.click('[data-action="cloud-backup"]');
  await expect(page.locator('#cloud-panel')).toBeVisible();
  const codeText = await page.locator('#cloud-code').textContent();
  expect(codeText).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(page.locator('#copy-code-btn')).toBeEnabled();
  await expect(page.locator('#data-status')).toContainText('已生成恢复码');

  await page.click('[data-action="cloud-backup"]');
  await expect(page.locator('#data-status')).toContainText('云端备份完成', { timeout: 15000 });

  // 上传内容检查：deviceId 为 64 位 hex；payload 加密（无明文、有 v/s/i/c）
  const upload = sync.lastUpload;
  expect(upload.deviceId).toMatch(/^[0-9a-f]{64}$/);
  expect(upload.payload.v).toBe(1);
  expect(typeof upload.payload.s).toBe('string');
  expect(typeof upload.payload.i).toBe('string');
  expect(upload.payload.c.length).toBeGreaterThan(100);
  expect(JSON.stringify(upload.payload)).not.toContain('waiyuan-study-backup');

  // ---- 换设备：清空本地 → 云端恢复（输入恢复码）----
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('[data-action="cloud-restore"]');
  await expect(page.locator('#cloud-panel')).toBeVisible();
  await page.fill('#cloud-code-input', codeText.trim());
  await page.click('[data-action="cloud-restore-go"]');
  await expect(page.locator('#data-status')).toContainText('云端恢复成功', { timeout: 15000 });

  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('waiyuan-unified-web-study-v1')));
  expect(restored.progress.pCloudNewer).toBeTruthy();
  expect(restored.progress.pLocalOnly.title).toBe('本地独有题');   // 云端数据完整取回
  expect(restored.favorites.fCloud.title).toBe('云端收藏');
  expect(restored.settings.dailyGoal).toBe(20);
  const vocab = await page.evaluate(() => JSON.parse(localStorage.getItem('waiyuan-vocabulary-progress-v1')));
  expect(vocab.words.wCloud).toBeTruthy();
  expect(vocab.words.wShared).toBeTruthy();
  const extra = await page.evaluate(() => JSON.parse(localStorage.getItem('politics-h5-state-v1')));
  expect(extra.progress.q1.ok).toBe(false);
  // 恢复码被记住
  await expect(page.locator('#cloud-code')).toHaveText(codeText.trim());
});

test('云同步：合并语义（本地独有保留、云端独有加入、冲突取较新）', async ({ page }) => {
  const sync = makeSyncMock(page);
  await seedLocal(page, SEED);   // 设备 A 备份
  await page.goto('/' + encodeURI('学习中心/index.html'));
  await page.click('[data-action="cloud-backup"]');
  const codeText = (await page.locator('#cloud-code').textContent()).trim();
  await page.click('[data-action="cloud-backup"]');
  await expect(page.locator('#data-status')).toContainText('云端备份完成');

  // 设备 B：不同数据 + 冲突旧值（pCloudNewer lastViewedAt=1000 比云端的 3000 旧）
  await page.evaluate(() => localStorage.clear());
  await seedLocal(page, SEED2);
  await page.reload();
  await page.click('[data-action="cloud-restore"]');
  await page.fill('#cloud-code-input', codeText);
  await page.click('[data-action="cloud-restore-go"]');
  await expect(page.locator('#data-status')).toContainText('云端恢复成功', { timeout: 15000 });

  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('waiyuan-unified-web-study-v1')));
  expect(st.progress.pLocal2.title).toBe('第二台设备新题');          // B 独有保留
  expect(st.progress.pCloudNewer.ok).toBe(true);                     // 冲突取较新（云端 true）
  expect(st.progress.pCloudNewer.answered).toBe(true);
  expect(st.progress.pLocalOnly.title).toBe('本地独有题');            // A 独有也保留（并集）
  expect(st.favorites.fCloud.title).toBe('云端收藏');
  expect(st.favorites.fLocal2.title).toBe('新设备收藏');
  expect(st.settings.dailyGoal).toBe(20);                            // 云端 settings 优先（Object.assign local, cloud）
});

test('云同步：清除云端', async ({ page }) => {
  const sync = makeSyncMock(page);
  await seedLocal(page, SEED);
  await page.goto('/' + encodeURI('学习中心/index.html'));
  await page.click('[data-action="cloud-backup"]');
  await page.click('[data-action="cloud-backup"]');
  await expect(page.locator('#data-status')).toContainText('云端备份完成');
  expect(sync.store.size).toBe(1);

  page.on('dialog', d => d.accept());
  await page.click('[data-action="cloud-clear"]');
  await expect(page.locator('#data-status')).toContainText('云端备份已删除');
  expect(sync.deleteCount).toBe(1);
  expect(sync.store.size).toBe(0);
});

test('云同步：恢复码错误时给出可读错误', async ({ page }) => {
  const sync = makeSyncMock(page);
  await page.goto('/' + encodeURI('学习中心/index.html'));
  await page.click('[data-action="cloud-restore"]');
  await page.fill('#cloud-code-input', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  await page.click('[data-action="cloud-restore-go"]');
  await expect(page.locator('#data-status')).toContainText('云端还没有备份数据', { timeout: 15000 });
});
