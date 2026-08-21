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
    reuseExistingServer: true,
    timeout: 15000,
  },
});
