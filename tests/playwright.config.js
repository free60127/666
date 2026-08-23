// Playwright 配置：本地静态服务器 + 浏览器
// 本地默认系统 Edge（免下载浏览器）；CI 设 PW_CHANNEL=chromium 用 Chromium（npx playwright install chromium）
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8788',
    channel: process.env.PW_CHANNEL === 'chromium' ? undefined : 'msedge',
    headless: true,
    locale: 'zh-CN',
    viewport: { width: 390, height: 844 },  // 手机尺寸（真实用户主要场景）
  },
  webServer: {
    command: 'node test-server.js',
    port: 8788,
    reuseExistingServer: !process.env.CI, // 2026-08-23 审查：本地已有 server 时复用；CI 由 playwright 自管生命周期结束自动杀
    timeout: 15000,
  },
  // 2026-08-23 复审：测试结束后幂等清除 8788 残留 test-server（防外部复用场景进程不退出）
  globalTeardown: './teardown-server.cjs',
});
