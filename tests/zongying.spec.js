// 综英系列（商翻）：综合1/综合2 题库（选词填空 wordFill / 汉译英 translation）
const { test, expect } = require('@playwright/test');

const ZONGYING = '/专业课/通用/综英系列（商翻）/index.html';

async function locate(page, predBody) {
  await page.goto(ZONGYING);
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

test('加载：无 JS 错误，渲染综合1/综合2 两张书卡', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(ZONGYING);
  await expect(page.locator('.bank-card')).toHaveCount(2);
  await expect(page.locator('.bank-card', { hasText: '综合1' })).toBeVisible();
  await expect(page.locator('.bank-card', { hasText: '综合2' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('进入综合1：单元按题型分组渲染（选词填空/汉译英）', async ({ page }) => {
  await page.goto(ZONGYING);
  await page.click('[data-action="book"][data-book="zhonghe-1"]');
  await expect(page.locator('.module-title', { hasText: '选词填空' })).toBeVisible();
  await expect(page.locator('.module-title', { hasText: '汉译英' })).toBeVisible();
  const unitCount = await page.locator('details.unit').count();
  expect(unitCount).toBeGreaterThan(3);
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
