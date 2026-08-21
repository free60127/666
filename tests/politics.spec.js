// 思政/计算机：单选判题 / 多选判题 / 错题本 / 收藏与本地存储
const { test, expect } = require('@playwright/test');

// 在页面题库数据中定位题（bankKey 题库全量；若题在 displayLimit 之外由 openCardAt 点击「加载更多」补渲染）
// 注意：必须先 goto 目标页面（数据变量由页面 data.js 注入）
async function locateBank(page, url, bankKey, predBody) {
  await page.goto(url);
  return page.evaluate(({ bankKey, predBody }) => {
    const banks = window.POLITICS_BANKS || window.COMPUTER_BANKS || [];
    const bank = banks.find(b => b.key === bankKey);
    for (let i = 0; i < (bank?.questions || []).length; i++) {
      const q = bank.questions[i];
      if (eval('(' + predBody + ')(q)')) return { q, index: i };
    }
    return null;
  }, { bankKey, predBody });
}

async function openBank(page, url, bankKey) {
  await page.goto(url);
  await page.click(`[data-action="bank"][data-bank="${bankKey}"]`);
}

// 进入题库视图并确保目标卡片已渲染（超过 30 题/页时自动点「加载更多」）
async function openCardAt(page, loc) {
  const card = cardOf(loc.q);
  if (loc.index >= 30) {
    const clicks = Math.ceil((loc.index + 1) / 30) - 1;
    for (let i = 0; i < clicks; i++) {
      await page.click('[data-action="more"]');
    }
  }
  await expect(page.locator(card)).toBeVisible();
  return card;
}

const cardOf = q => `#q-${q.type}--${q.id}`;
const politicsState = () => page => page.evaluate(() => JSON.parse(localStorage.getItem('politics-h5-state-v1') || 'null'));
const unifiedState = () => page => page.evaluate(() => JSON.parse(localStorage.getItem('waiyuan-unified-web-study-v1') || 'null'));

test('思政单选判题：点正确选项 → correct 反馈 + 页面状态 ok', async ({ page }) => {
  const loc = await locateBank(page, '/思政系列/index.html', 'ethics', `(q) => q.type === 'single' && /^[A-Z]$/.test(String(q.answer || ''))`);
  expect(loc).not.toBeNull();
  await openBank(page, '/思政系列/index.html', 'ethics');
  const card = await openCardAt(page, loc);
  const rightIndex = loc.q.answer.toUpperCase().charCodeAt(0) - 65;
  await page.click(`${card} .option[data-index="${rightIndex}"]`);
  await expect(page.locator(`${card} .option.correct`)).toHaveCount(1);
  const state = await politicsState()(page);
  const key = `ethics-${loc.q.type}-${loc.q.id}`;
  expect(state?.progress?.[key]?.ok).toBe(true);
  // 统一引擎的 record 走 setTimeout(0)，轮询等待写入完成
  await expect.poll(() => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('waiyuan-unified-web-study-v1') || 'null');
    return s ? Object.values(s.progress).some(p => p.ok === true) : false;
  })).toBe(true);
});

test('思政单选判错 → wrong 反馈 + 进入错题本可见', async ({ page }) => {
  const loc = await locateBank(page, '/思政系列/index.html', 'ethics', `(q) => q.type === 'single' && (q.options || []).length >= 3 && /^[A-Z]$/.test(String(q.answer || ''))`);
  expect(loc).not.toBeNull();
  await openBank(page, '/思政系列/index.html', 'ethics');
  const card = cardOf(loc.q);
  await expect(page.locator(card)).toBeVisible();
  const rightIndex = loc.q.answer.toUpperCase().charCodeAt(0) - 65;
  const wrongIndex = rightIndex === 0 ? 1 : 0;
  await page.click(`${card} .option[data-index="${wrongIndex}"]`);
  await expect(page.locator(`${card} .option.wrong`)).toHaveCount(1);
  // 返回题库首页 → 错题本 → ethics 错题列表
  await page.click(`[data-action="back"]`);
  await page.click(`[data-action="mistakes"]`);
  await page.click(`[data-action="mistake-bank"][data-bank="ethics"]`);
  await expect(page.locator(`.card`).first()).toBeVisible();
  await expect(page.locator(`text=${loc.q.title.slice(0, 12)}`).first()).toBeVisible();
});

test('思政多选判题：选正确两项 + 确认 → 判定正确', async ({ page }) => {
  const loc = await locateBank(page, '/思政系列/index.html', 'ethics', `(q) => q.type === 'multi' && /^[A-Z]{2,}$/.test(String(q.answer || ''))`);
  expect(loc).not.toBeNull();
  await openBank(page, '/思政系列/index.html', 'ethics');
  const card = await openCardAt(page, loc);
  const right = loc.q.answer.toUpperCase().split('').map(l => l.charCodeAt(0) - 65);
  for (const idx of right) await page.click(`${card} .option[data-index="${idx}"]`);
  await page.click(`${card} [data-action="confirm"]`);
  await expect(page.locator(`${card} .option.correct`)).toHaveCount(right.length);
  const state = await politicsState()(page);
  expect(state?.progress?.[`ethics-${loc.q.type}-${loc.q.id}`]?.ok).toBe(true);
});

test('收藏：点收藏按钮 → active + localStorage favorites 持久化', async ({ page }) => {
  const loc = await locateBank(page, '/思政系列/index.html', 'ethics', `(q) => q.type === 'single' && /^[A-Z]$/.test(String(q.answer || ''))`);
  expect(loc).not.toBeNull();
  await openBank(page, '/思政系列/index.html', 'ethics');
  const card = cardOf(loc.q);
  await expect(page.locator(`${card} .unified-favorite`)).toBeVisible();
  await page.click(`${card} .unified-favorite`);
  await expect(page.locator(`${card} .unified-favorite.active`)).toBeVisible();
  const state = await unifiedState()(page);
  expect(state && Object.keys(state.favorites || {}).length >= 1).toBeTruthy();
});

test('计算机题库可正常加载并判题', async ({ page }) => {
  const loc = await locateBank(page, '/计算机系列/index.html', 'computer-first-semester', `(q) => q.type === 'single' && /^[A-Z]$/.test(String(q.answer || ''))`);
  expect(loc).not.toBeNull();
  await openBank(page, '/计算机系列/index.html', 'computer-first-semester');
  const card = cardOf(loc.q);
  await expect(page.locator(card)).toBeVisible();
  const rightIndex = loc.q.answer.toUpperCase().charCodeAt(0) - 65;
  await page.click(`${card} .option[data-index="${rightIndex}"]`);
  await expect(page.locator(`${card} .option.correct`)).toHaveCount(1);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('computer-h5-state-v1') || 'null'));
  expect(state?.progress?.[`computer-first-semester-${loc.q.type}-${loc.q.id}`]?.ok).toBe(true);
});
