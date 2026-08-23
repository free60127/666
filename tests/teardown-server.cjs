// Playwright globalTeardown：兜底清除「本测试启动后残留」的 8788 test-server 进程。
// 2026-08-23 审查第 2 轮第 2 项加固：
//   1. 所有外部命令一律 execFileSync + timeout(10s)，不会无限阻塞全局 teardown；
//   2. 只清理「监听 8788 且进程名为 node.exe」的进程（本项目测试服务器专用端口+运行环境），
//      不无条件 taskkill /T，避免误杀任意占用 8788 或同时监听的其他程序；
//   3. 非 Windows（CI Linux）跳过——Playwright 自己启动并回收 server，reuseExistingServer 仅 !CI。
const { execFileSync } = require('child_process');

const TIMEOUT_MS = 10000;
const isWin = process.platform === 'win32';

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { timeout: TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  } catch (e) {
    // 命令不存在/超时/退出码非 0：按无输出处理，绝不抛到 globalTeardown 阻塞收尾
    return '';
  }
}

function listenersOn8788() {
  const out = run('netstat', ['-ano', '-p', 'tcp']);
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const m = line.match(/\s(\d+)\s*$/);
    if (m) pids.add(m[1]);
  }
  return [...pids];
}

function nodePids() {
  const out = run('tasklist', ['/FO', 'CSV', '/NH']);
  const pids = new Set();
  for (const row of out.split(/\r?\n/)) {
    // CSV 行如: "node.exe","1234","Console","1","80,000 K"
    const m = row.match(/^"node\.exe","(\d+)"/i);
    if (m) pids.add(m[1]);
  }
  return pids;
}

module.exports = async () => {
  if (!isWin) return;
  const nodeSet = nodePids();
  let killed = 0;
  for (const pid of listenersOn8788()) {
    if (!nodeSet.has(pid)) {
      console.log('[teardown] 跳过非 node.exe 的 8788 监听进程 pid ' + pid + '（避免误杀外部进程）');
      continue;
    }
    const code = run('taskkill', ['/F', '/PID', pid]);
    if (code !== '') { killed++; console.log('[teardown] 清除残留 test-server pid ' + pid); }
    else { console.log('[teardown] 清理 pid ' + pid + ' 失败（已在其他调用中被终止？）'); }
  }
  if (killed === 0) console.log('[teardown] 无 8788 node 残留（已正常退出）');
};
