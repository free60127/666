// 公共功能：随机一题 / 纠错反馈 / 单文件离线版完整流程
const { test, expect } = require('@playwright/test');

test('随机一题：题库页有悬浮按钮，点击不报错', async ({ page }) => {
  await page.goto('/思政系列/index.html');
  await page.click('[data-action="bank"][data-bank="ethics"]');
  await expect(page.locator('.unified-random-web')).toBeVisible();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.click('.unified-random-web');
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('纠错反馈：菜单可选 4 类，提交后出现反馈提示条', async ({ page }) => {
  await page.goto('/思政系列/index.html');
  await page.click('[data-action="bank"][data-bank="ethics"]');
  const card = page.locator('.card').first();
  await expect(card.locator('.unified-feedback')).toBeVisible();
  await card.locator('.unified-feedback').click();
  await expect(page.locator('.unified-feedback-menu')).toBeVisible();
  const count = await page.locator('.unified-feedback-menu button').count();
  expect(count).toBe(4);  // 答案错误/题目重复/题干不完整/排版问题
  await page.locator('.unified-feedback-menu button').first().click();
  // 云端提交失败（测试环境无 Worker）→ 回退复制 → 出现提示条
  await expect(page.locator('.unified-feedback-notice')).toBeVisible({ timeout: 15000 });
});

test('单文件离线版（思政）：完整答题 + 收藏流程，无外部依赖', async ({ page }) => {
  await page.goto('/思政系列/思政刷题-单文件离线版.html');
  // 无任何外部资源请求（单文件自包含）
  const failed = [];
  page.on('requestfailed', req => failed.push(req.url()));
  page.on('response', res => { if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`); });
  await page.click('[data-action="bank"][data-bank="ethics"]');
  const card = page.locator('.card').first();
  await expect(card).toBeVisible();
  // 单选判题
  const q = await page.evaluate(() => {
    const bank = window.POLITICS_BANKS.find(b => b.key === 'ethics');
    return bank.questions[0];
  });
  const rightIndex = String(q.answer).charCodeAt(0) - 65;
  await card.locator(`.option[data-index="${rightIndex}"]`).click();
  await expect(card.locator('.option.correct')).toHaveCount(1);
  // 收藏
  await card.locator('.unified-favorite').click();
  await expect(card.locator('.unified-favorite.active')).toBeVisible();
  // 本地状态写入
  const unified = await page.evaluate(() => JSON.parse(localStorage.getItem('waiyuan-unified-web-study-v1') || 'null'));
  expect(Object.keys(unified.progress || {}).length).toBeGreaterThan(0);
  expect(Object.keys(unified.favorites || {}).length).toBeGreaterThan(0);
  // 单文件版不应有任何失败的内部资源请求
  expect(failed.filter(u => !u.includes('127.0.0.1') || !u.includes('favicon'))).toEqual([]);
});

test('学习中心能读到统一进度（答题 → 概览出现记录）', async ({ page }) => {
  await page.goto('/思政系列/index.html');
  await page.click('[data-action="bank"][data-bank="ethics"]');
  const card = page.locator('.card').first();
  await expect(card).toBeVisible();
  const q = await page.evaluate(() => {
    const bank = window.POLITICS_BANKS.find(b => b.key === 'ethics');
    return bank.questions[0];
  });
  await card.locator(`.option[data-index="${String(q.answer).charCodeAt(0) - 65}"]`).click();
  await expect(card.locator('.option.correct')).toHaveCount(1);
  // 统一引擎 record 走 setTimeout(0)，等写入完成再进学习中心
  await expect.poll(() => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('waiyuan-unified-web-study-v1') || 'null');
    return s ? Object.values(s.progress).some(p => p.ok === true) : false;
  })).toBe(true);
  // 学习中心概览应显示已学习数量
  await page.goto('/学习中心/index.html');
  await expect(page.locator('.stats')).toBeVisible();
  const answeredText = await page.locator('.stats .stat').nth(2).textContent();
  expect(answeredText).toContain('1');
});
