/* scripts/verify-playwright-exit.mjs：以真实子进程退出码验证 Playwright 是否完整结束。
   2026-08-23 审查第 2 轮第 2 项 + 第 3 轮第 3 项：
   - 不设置 shell:true（Windows 用 npx.cmd 直接拉 playwright），记录的是真实进程树根进程的 code/signal；
   - 超时（240s）终止进程树后，close 事件不得把 124 覆盖成子进程的 code（timedOut 标志守卫）；
   - 可选传参：node scripts/verify-playwright-exit.mjs <test-file...> 只跑定向套件（如 errand.spec.js）；
   - 禁止用管道取退出码——只看本脚本打印的 WRAPPER_EXIT（真实 code/signal）；
   - 成功不留 tests/_pw-exit.log；失败保留便于诊断。
   用法：node scripts/verify-playwright-exit.mjs   （全量）
         node scripts/verify-playwright-exit.mjs errand.spec.js  （定向） */
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.resolve(here, '..', 'tests');
const logPath = path.join(testsDir, '_pw-exit.log');
try { unlinkSync(logPath); } catch (_) {} // 开始时清理旧日志，避免把上次结果误当本次证据
const started = Date.now();
// 直接拉起 playwright CLI 的 node 入口（tests/node_modules/playwright/cli.js），不经过 npx/.cmd：
// Windows 上 spawn(npx.cmd, ..., {shell:false}) 在 Node 24 报 spawn EINVAL；shell:true 又会引入 cmd 引号转义，
// 且真实退出码会被 cmd 包装。用 process.execPath 跑 CLI 在 win/posix 均稳定、退出码即 Playwright 本身。
const pwCli = path.join(testsDir, 'node_modules', 'playwright', 'cli.js');
const targets = process.argv.slice(2);
const pwArgs = [pwCli, 'test', ...targets]; // 定向：追加 test 文件参数；空=全量
const child = spawn(process.execPath, pwArgs, { cwd: testsDir, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let timedOut = false;
const collect = chunk => {
  const s = String(chunk);
  try { appendFileSync(logPath, s); } catch (_) {}
};
child.stdout.on('data', collect);
child.stderr.on('data', collect);

function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { timeout: 10000, stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch (_) {
    try { child.kill('SIGKILL'); } catch (_) {}
  }
}

const killer = setTimeout(() => {
  timedOut = true;
  console.error('WRAPPER_TIMEOUT: 240s 未退出，终止进程树');
  killTree(child.pid);
  // 若 close 未在 2s 内到达（taskkill 后 npx 父进程死锁等极端情况），兜底退出 124
  setTimeout(() => process.exit(124), 2000).unref();
}, 240000);

child.on('close', (code, signal) => {
  clearTimeout(killer);
  if (timedOut) {
    const summary = 'WRAPPER_EXIT code=' + code + ' signal=' + signal + ' elapsedMs=' + (Date.now() - started) + ' (TIMED_OUT forced 124)';
    console.error(summary);
    try { appendFileSync(logPath, summary + String.fromCharCode(10)); } catch (_) {}
    process.exit(124); // 超时语义覆盖子进程退出码，close 不得抢先把它变成 1
  }
  const elapsedMs = Date.now() - started;
  const summary = 'WRAPPER_EXIT code=' + code + ' signal=' + signal + ' elapsedMs=' + elapsedMs;
  console.log(summary);
  if (code === 0) {
    try { unlinkSync(logPath); } catch (_) {} // 成功不留临时日志
  } else {
    try { appendFileSync(logPath, summary + String.fromCharCode(10)); } catch (_) {}
  }
  process.exit(code === 0 ? 0 : (code == null ? 1 : code));
});

child.on('error', (e) => {
  clearTimeout(killer);
  console.error('WRAPPER_SPAWN_ERROR', e);
  try { appendFileSync(logPath, 'WRAPPER_SPAWN_ERROR ' + e.message + String.fromCharCode(10)); } catch (_) {}
  process.exit(1);
});
