// Playwright globalTeardown：兜底清除 8788 残留 test-server 进程
// 2026-08-23 复审：标准流程 Playwright 自启 server 会正常退出；
// 残留只发生在「测试前已有外部 server 被 reuseExistingServer 复用」时，此处幂等清理。
const { execSync } = require('child_process');
module.exports = async () => {
  try {
    const out = execSync('netstat -ano -p tcp | findstr :8788').toString().split(/\r?\n/);
    const pids = new Set();
    for (const line of out) {
      if (!/LISTENING/i.test(line)) continue;
      const m = line.match(/\s(\d+)\s*$/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      try { execSync('taskkill /F /PID ' + pid + ' /T', { stdio: 'ignore' }); console.log('[teardown] 清除残留 test-server pid ' + pid); } catch (_) {}
    }
  } catch (_) {
    // 8788 未占用：无残留，正常
  }
};