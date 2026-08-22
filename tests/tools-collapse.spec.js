// 阅读工具条一体收缩 + 番茄钟入口（2026-08-22）
// 手机端：工具条默认折叠成单个圆钮，点开展开全部工具（字号/主题/顶部/番茄钟）；
// 番茄钟悬浮球手机端隐藏（运行中保留显示剩余时间），入口移到工具条内。
const { test, expect } = require('@playwright/test');

test.describe('阅读工具条一体收缩（手机端）', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('手机端默认折叠：只显示切换钮，点开展开全部工具，再点收起', async ({ page }) => {
    await page.goto('/');
    const tools = page.locator('.reading-tools');
    await expect(tools).toHaveClass(/reading-tools--collapsed/);
    await expect(page.locator('.reading-tools__toggle')).toBeVisible();
    await expect(page.locator('.reading-tools__button--tomato')).toBeHidden();
    await expect(page.locator('.reading-tools__button--top')).toBeHidden();
    await page.locator('.reading-tools__toggle').click();
    await expect(tools).not.toHaveClass(/reading-tools--collapsed/);
    await expect(page.locator('.reading-tools__button--tomato')).toBeVisible();
    await expect(page.locator('.reading-tools__button--top')).toBeVisible();
    await page.locator('.reading-tools__toggle').click();
    await expect(tools).toHaveClass(/reading-tools--collapsed/);
  });

  test('手机端番茄钟：悬浮球隐藏，工具条按钮可开关面板', async ({ page }) => {
    await page.goto('/');
    const ball = page.locator('.tomato-timer__toggle');
    const panel = page.locator('.tomato-timer__panel');
    await expect(ball).toBeHidden();
    await page.locator('.reading-tools__toggle').click();
    await expect(page.locator('.reading-tools__button--tomato')).toBeVisible();
    await page.locator('.reading-tools__button--tomato').click();
    await expect(panel).toHaveClass(/is-open/);
    await page.locator('.tomato-timer__close').click();
    await expect(panel).not.toHaveClass(/is-open/);
  });

  test('手机端番茄钟开始后：悬浮球恢复显示剩余时间', async ({ page }) => {
    await page.goto('/');
    const ball = page.locator('.tomato-timer__toggle');
    await expect(ball).toBeHidden();
    await page.locator('.reading-tools__toggle').click();
    await page.locator('.reading-tools__button--tomato').click();
    await page.locator('.tomato-timer__start').click();
    await expect(ball).toBeVisible();
    await expect(ball).toHaveClass(/is-running/);
  });
});

test.describe('阅读工具条（桌面端）', () => {
  test('桌面端保持展开，不折叠', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/');
    const tools = page.locator('.reading-tools');
    await expect(tools).not.toHaveClass(/reading-tools--collapsed/);
    // 番茄钟入口去重：桌面端工具条隐藏 🍅、右下角浮标可见（只保留一个入口）
    await expect(page.locator('.reading-tools__button--tomato')).toBeHidden();
    await expect(page.locator('.tomato-timer__toggle')).toBeVisible();
    await expect(page.locator('.reading-tools__button--top')).toBeVisible();
  });
});
