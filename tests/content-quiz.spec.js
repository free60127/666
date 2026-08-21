// 基英/泛读（内容页）：普通单选 / CF 六选项多选 / A or D / 多空填空 / 同义答案 / 翻译自评
const { test, expect } = require('@playwright/test');

const JIYING = '/专业课/英语系/基英系列/index.html';
const FANDU = '/专业课/英语系/泛读系列/index.html';

// 在页面题库数据中定位满足条件的题（predBody 为 "(q, unit) => boolean" 字符串）
// 注意：必须先 goto 目标页面（数据变量 window.CONTENT_BOOKS 由页面 data.js 注入）
async function locate(page, predBody, path = JIYING) {
  await page.goto(path);
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

// 进入页面 → 打开书 → 展开单元 → 返回卡片选择器
async function openCard(page, loc) {
  await page.click(`[data-action="book"][data-book="${loc.bookKey}"]`);
  await page.click(`details.unit[data-unit="${loc.unitKey}"] summary`);
  const card = `#${loc.unitKey}-q${loc.qIndex}`;
  await expect(page.locator(card)).toBeVisible();
  return card;
}

const unified = () => page => page.evaluate(() => JSON.parse(localStorage.getItem('waiyuan-unified-web-study-v1') || 'null'));

const fillKinds = "['wordFill', 'vocabulary', 'word', 'fill']";
const fillable = (kind) => `q.type === 'text' && ${fillKinds}.includes(u.kind)`;

test('普通单选：点正确选项 → 判题反馈 + 统一进度保存', async ({ page }) => {
  const loc = await locate(page, `(q) => q.type === 'choice' && (q.options || []).length >= 2 && /^[A-Z]$/.test(String(q.answer || '')) && !/\sor\s/i.test(String(q.answer))`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  const rightIndex = loc.q.answer.toUpperCase().charCodeAt(0) - 65;
  await page.click(`${card} .option[data-opt="${rightIndex}"]`);
  await expect(page.locator(`${card} .option.correct`)).toHaveCount(1);
  await expect(page.locator(`${card} .answer`)).not.toBeHidden();
  const state = await unified()(page);
  expect(state && Object.values(state.progress).some(p => p.ok === true)).toBeTruthy();
});

test('CF 六选项多选：点 C+F 自动判定 → 两个 correct + 记录多选', async ({ page }) => {
  const loc = await locate(page, `(q) => q.type === 'choice' && (q.options || []).length >= 6 && /^CF$/i.test(String(q.answer || '').replace(/\s+/g, ''))`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  await page.click(`${card} .option[data-opt="2"]`);
  await page.click(`${card} .option[data-opt="5"]`);
  await expect(page.locator(`${card} .option.correct`)).toHaveCount(2);
  const state = await unified()(page);
  expect(state && Object.values(state.progress).some(p => p.ok === true && p.attempts >= 1)).toBeTruthy();
});

test('A or D 二选一：点任一即判定', async ({ page }) => {
  const loc = await locate(page, `(q) => q.type === 'choice' && /^A\\s+or\\s+D$/i.test(String(q.answer || ''))`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  await page.click(`${card} .option[data-opt="0"]`);
  await expect(page.locator(`${card} .option.correct`)).toHaveCount(1);
});

test('多空填空（逗号答案必须完整）：只填部分判错，完整填写判对', async ({ page }) => {
  const loc = await locate(page, `(q, u) => ${fillable('u.kind')} && /,/.test(String(q.answer || '')) && String(q.answer).split(',').length >= 3`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  // 只填第一个词 → 必须判错
  const partial = loc.q.answer.split(',')[0].trim();
  await page.fill(`${card} .fill-input`, partial);
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.wrong`)).toBeVisible();
  // 完整填写 → 判对
  await page.fill(`${card} .fill-input`, loc.q.answer);
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.correct`)).toBeVisible();
  const state = await unified()(page);
  expect(state && Object.values(state.progress).some(p => p.ok === true)).toBeTruthy();
});

test('多空填空（分号=多空答案）：只填第一空判错，完整逐空填写判对', async ({ page }) => {
  const loc = await locate(page, `(q, u) => ${fillable('u.kind')} && /;/.test(String(q.answer || '')) && (String(q.q || '').match(/_+/g) || []).length >= 2`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  // 只填第一空 → 必须判错（多空题必须逐空完整填写）
  const first = loc.q.answer.split(';')[0].trim();
  await page.fill(`${card} .fill-input`, first);
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.wrong`)).toBeVisible();
  // 完整填写全部空 → 判对
  await page.fill(`${card} .fill-input`, loc.q.answer);
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.correct`)).toBeVisible();
  const state = await unified()(page);
  expect(state && Object.values(state.progress).some(p => p.ok === true)).toBeTruthy();
});

test('同义答案（分号=同义，单空）：填任一即判对', async ({ page }) => {
  const loc = await locate(page, `(q, u) => ${fillable('u.kind')} && /;/.test(String(q.answer || '')) && (String(q.q || '').match(/_+/g) || []).length === 1`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  const variants = loc.q.answer.split(';').map(s => s.trim()).filter(Boolean);
  expect(variants.length).toBeGreaterThanOrEqual(2);
  // 填第一个同义词 → 判对
  await page.fill(`${card} .fill-input`, variants[0]);
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.correct`)).toBeVisible();
  // 填第二个同义词 → 判对
  await page.fill(`${card} .fill-input`, variants[1]);
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.correct`)).toBeVisible();
});

test('多空填空（带序号答案）：不带序号逐空填写判对', async ({ page }) => {
  const loc = await locate(page, `(q, u) => ${fillable('u.kind')} && /^\(\d+\)/.test(String(q.answer || '').trim())`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  const stripped = loc.q.answer.split(';').map(s => s.replace(/^\s*\(\d+\)\s*/, '')).join(';');
  await page.fill(`${card} .fill-input`, stripped);
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.correct`)).toBeVisible();
});

test('翻译题：展开答案 → 自评「我答对了」→ result=correct 保存', async ({ page }) => {
  const loc = await locate(page, `(q, u) => u.kind === 'translation' && q.type === 'text' && String(q.answer || '').trim().length > 5`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  await page.click(`${card} .answer-toggle`);
  await expect(page.locator(`${card} .answer`)).not.toBeHidden();
  await expect(page.locator(`${card} .unified-self-assess`)).toBeVisible();
  await page.click(`${card} [data-self="correct"]`);
  const state = await unified()(page);
  expect(state && Object.values(state.progress).some(p => p.result === 'correct')).toBeTruthy();
});

test('答案展开：toggle 显示/收起参考答案', async ({ page }) => {
  const loc = await locate(page, `(q) => q.type === 'choice' && (q.options || []).length >= 2`);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  await page.click(`${card} .answer-toggle`);
  await expect(page.locator(`${card} .answer`)).not.toBeHidden();
  await page.click(`${card} .answer-toggle`);
  await expect(page.locator(`${card} .answer`)).toBeHidden();
});

test('泛读：单选点正确选项 → correct + 统一进度保存', async ({ page }) => {
  const loc = await locate(page, `(q) => q.type === 'choice' && (q.options || []).length >= 2 && /^[A-Z]$/.test(String(q.answer || '')) && !/\sor\s/i.test(String(q.answer))`, FANDU);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  const rightIndex = loc.q.answer.toUpperCase().charCodeAt(0) - 65;
  await page.click(`${card} .option[data-opt="${rightIndex}"]`);
  await expect(page.locator(`${card} .option.correct`)).toHaveCount(1);
  const state = await unified()(page);
  expect(state && Object.values(state.progress).some(p => p.ok === true)).toBeTruthy();
});

test('泛读：填空填标准答案 → 判对', async ({ page }) => {
  const loc = await locate(page, `(q, u) => u.kind === 'fill' && q.type === 'text' && !Array.isArray(q.options) && String(q.answer || '').trim() && !/[;,，；]/.test(String(q.answer))`, FANDU);
  expect(loc).not.toBeNull();
  const card = await openCard(page, loc);
  await page.fill(`${card} .fill-input`, loc.q.answer);
  await page.click(`${card} .fill-submit`);
  await expect(page.locator(`${card} .fill-feedback.correct`)).toBeVisible();
});
