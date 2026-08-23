/* scripts/verify-playwright-exit.mjs：以真实子进程退出码验证 Playwright 套件是否完整结束。
   2026-08-23 审查第 2 轮第 2 项：替代 `| tail; echo EXIT=$?` 的假证据。
   不设置 shell:true（Windows 用 npx.cmd 直接拉起 playwright），所以记录的 code/signal 是真实进程树根进程的；
   超时（240s）时按平台终止整个进程树（Windows taskkill /T /F，POSIX kill SIGKILL）并退出 124。
   用法：node scripts/verify-playwright-exit.mjs   （内部在 tests/ 目录执行 npx playwright test）
   成功时不保留临时日志 tests/_pw-exit.log；失败时保留便于诊断。 */
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.resolve(here, '..', 'tests');
const logPath = path.join(testsDir, '_pw-exit.log');
try { unlinkSync(logPath); } catch (_) {}
const started = Date.now();
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(npxBin, ['playwright', 'test'], { cwd: testsDir, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
const collect = chunk => {
  const s = String(chunk);
  out += s;
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
  console.error('WRAPPER_TIMEOUT: 240s 未退出，终止进程树');
  killTree(child.pid);
  setTimeout(() => process.exit(124), 2000);
}, 240000);

child.on('close', (code, signal) => {
  clearTimeout(killer);
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
