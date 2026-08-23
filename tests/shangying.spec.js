// 商英系：商英教程1—3 题库（wordFill 选词填空/介词填空/完形填空 + translation 汉译英/英译汉）
const { test, expect } = require('@playwright/test');

const SHANGYING = '/专业课/商英系/index.html';

async function locate(page, predBody) {
  await page.goto(SHANGYING);
  return page.evaluate((predBody) => {
    const books = (window.CONTENT_BOOKS || {}).books || [];
    for (const book of books) {
      for (const unit of book.units || []) {
        for (let i = 0; i < unit.questions.length; i++) {
          const q = unit.questions[i];
          if (eval('(' + predBody + ')(q, unit)')) return { bookKey: book.key, unitKey: unit.key, qIndex: i, q };
        }
      }
    }
    return null;
  }, predBody);
}

async function openCard(page, loc) {
  await page.click(`[data-action="book"][data-book="${loc.bookKey}"]`);
  await page.click(`details.unit[data-unit="${loc.unitKey}"] summary`);
  const card = `#${loc.unitKey}-q${loc.qIndex}`;
  await expect(page.locator(card)).toBeVisible();
  return card;
}

const unified = () => page => page.evaluate(() => JSON.parse(localStorage.getItem('waiyuan-unified-web-study-v1') || 'null'));

test('加载：无 JS 错误，渲染商英教程1—3 书卡（含整理中的教程4）', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(SHANGYING);
  await expect(page.locator('.bank-card')).toHaveCount(4);
  await expect(page.locator('.bank-card', { hasText: '商英教程1' })).toBeVisible();
  await expect(page.locator('.bank-card', { hasText: '商英教程2' })).toBeVisible();
  await expect(page.locator('.bank-card', { hasText: '商英教程3' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('进入商英教程1：按题型分组（选词填空/介词填空/汉译英/英译汉/完形填空）', async ({ page }) => {
  await page.goto(SHANGYING);
  await page.click('[data-action="book"][data-book="shangying-1"]');
  await expect(page.locator('.module-title', { hasText: '选词填空' })).toBeVisible();
  await expect(page.locator('.module-title', { hasText: '介词填空' })).toBeVisible();
  await expect(page.locator('.module-title', { hasText: '完形填空' })).toBeVisible();
  const unitCount = await page.locator('details.unit').count();
  expect(unitCount).toBeGreaterThan(10);
  await page.locator('details.unit summary').first().click();
  await expect(page.locator('.card').first()).toBeVisible();
});

test('选词填空：填标准答案 → 判对高亮 + 统一进度保存', async ({ page }) => {
  const loc = await locate(page, `(q, u) => u.kind === 'wordFill' && q.type === 'text' && String(q.answer || '').trim() && String(q.answer).trim().length < 40 && !/[;,；，]/.test(String(q.answer))`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  await expect(page.locator(`${card} .fill-input`)).toBeVisible();
  await page.fill(`${card} .fill-input`, loc.q.answer.trim());
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.correct`)).toBeVisible();
  await expect.poll(async () => {
    const state = await unified()(page);
    return !!(state && Object.values(state.progress).some(p => p.ok === true));
  }, { timeout: 5000 }).toBe(true);
});

test('选词填空：填错误答案 → 判错反馈', async ({ page }) => {
  const loc = await locate(page, `(q, u) => u.kind === 'wordFill' && q.type === 'text' && String(q.answer || '').trim().length >= 3 && !/[;,；，]/.test(String(q.answer))`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  await page.fill(`${card} .fill-input`, 'zzz_not_the_answer_zzz');
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.wrong`)).toBeVisible();
});

test('汉译英：展开答案 → 自评「我答对了」→ result=correct 保存', async ({ page }) => {
  const loc = await locate(page, `(q, u) => u.kind === 'translation' && q.type === 'text' && String(q.answer || '').trim().length > 5`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  await page.click(`${card} .answer-toggle`);
  await expect(page.locator(`${card} .answer`)).not.toBeHidden();
  await expect(page.locator(`${card} .unified-self-assess`)).toBeVisible();
  await page.click(`${card} [data-self="correct"]`);
  await expect.poll(async () => {
    const state = await unified()(page);
    return !!(state && Object.values(state.progress).some(p => p.result === 'correct'));
  }, { timeout: 5000 }).toBe(true);
});

test('收藏：点收藏按钮 → active + localStorage favorites', async ({ page }) => {
  const loc = await locate(page, `(q, u) => u.kind === 'wordFill' && q.type === 'text'`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  await expect(page.locator(`${card} .unified-favorite`)).toBeVisible();
  await page.click(`${card} .unified-favorite`);
  await expect(page.locator(`${card} .unified-favorite.active`)).toBeVisible();
  const state = await unified()(page);
  expect(state && Object.keys(state.favorites || {}).length).toBeGreaterThanOrEqual(1);
});

test('返回专业课：hub 按钮跳回 ../index.html', async ({ page }) => {
  await page.goto(SHANGYING);
  await page.click('.hub-back');
  await expect(page).toHaveTitle(/专业课资料/);
  await expect(page).toHaveURL(/index\.html/);
});