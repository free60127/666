// Playwright globalTeardown：兜底清除「本测试启动后残留」的 8788 test-server 进程。
// 2026-08-23 审查第 2 轮第 2 项 + 第 3 轮第 2 项：
//   1. 所有外部命令一律 execFileSync + timeout(10s)，不会无限阻塞 globalTeardown；
//   2. 只清理「明确监听本项目端口 8788 且进程名为 node.exe」的进程——先按端口过滤（parseListenerPids），
//      再按进程名过滤，绝不做全端口扫描误杀；
//   3. netstat/tasklist 任一不可用时安全跳过并打印原因（不误杀未知进程）；
//   4. 非 Windows（CI Linux）跳过——Playwright 自己启动并回收 server。
// 自检：node tests/teardown-server.cjs --self-test（单元级验证端口解析/过滤逻辑）。
const { execFileSync } = require('child_process');

const TIMEOUT_MS = 10000;
const isWin = process.platform === 'win32';

function run(cmd, args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { timeout: TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }) };
  } catch (e) {
    // 命令不存在/超时/退出码非 0：调用方必须按「不可用」处理（返回 null），绝不静默当空、也绝不抛到 teardown 阻塞收尾。
    return { ok: false, out: '', error: String((e && e.message) || e) };
  }
}

/** 纯函数：从 netstat -ano -p tcp 输出中解析「明确监听指定端口」的 PID 列表（可单测）。
    只匹配 LISTENING 行，且本地地址需包含 :<port> 后缀；其他端口一律忽略。 */
function parseListenerPids(text, port) {
  const target = String(port || 8788);
  const pids = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!/listening/i.test(line)) continue;
    if (!line.includes(':' + target)) continue; // 端口不过滤 = 重大风险（会扫到其他监听服务）——严禁
    const m = line.match(/\s(\d+)\s*$/);
    if (m) pids.add(m[1]);
  }
  return [...pids];
}

function listenersOn8788() {
  const r = run('netstat', ['-ano', '-p', 'tcp']);
  if (!r.ok) { console.log('[teardown] netstat 不可用，安全跳过清理：' + r.error.slice(0, 120)); return null; }
  return parseListenerPids(r.out, 8788);
}

function nodePids() {
  const r = run('tasklist', ['/FO', 'CSV', '/NH']);
  if (!r.ok) { console.log('[teardown] tasklist 不可用，安全跳过清理（不误杀未知进程）：' + r.error.slice(0, 120)); return null; }
  const pids = new Set();
  for (const row of r.out.split(/\r?\n/)) {
    // CSV 行如: "node.exe","1234","Console","1","80,000 K"
    const m = row.match(/^"node\.exe","(\d+)"/i);
    if (m) pids.add(m[1]);
  }
  return pids;
}

module.exports = async () => {
  if (!isWin) return;
  const listeners = listenersOn8788();
  if (listeners === null) return;
  if (!listeners.length) { console.log('[teardown] 无 8788 监听（已正常退出或无残留）'); return; }
  const nodeSet = nodePids();
  if (nodeSet === null) return;
  let killed = 0;
  for (const pid of listeners) {
    if (!nodeSet.has(pid)) {
      console.log('[teardown] 跳过非 node.exe 的 8788 监听进程 pid ' + pid + '（避免误杀外部进程）');
      continue;
    }
    const r = run('taskkill', ['/F', '/PID', pid]);
    if (r.ok) { killed++; console.log('[teardown] 清除残留 test-server pid ' + pid); }
    else { console.log('[teardown] 清理 pid ' + pid + ' 失败（已在其他调用中被终止？）：' + r.error.slice(0, 120)); }
  }
  if (killed === 0) console.log('[teardown] 无 8788 node 残留（已正常退出）');
};

// --self-test：最小自检（node tests/teardown-server.cjs --self-test）
if (require.main === module && process.argv.includes('--self-test')) {
  const assert = require('assert');
  const sample = [
    'TCP    0.0.0.0:8788   0.0.0.0:0   LISTENING   4321',
    'TCP    0.0.0.0:8787   0.0.0.0:0   LISTENING   5555',
    'TCP    [::]:8788      [::]:0      LISTENING   7321',
    'TCP    0.0.0.0:9999   0.0.0.0:0   LISTENING   7777',
    'TCP    0.0.0.0:8080   0.0.0.0:0   ESTABLISHED 8888', // 非 LISTENING 必须忽略
  ].join('\n');
  assert.deepStrictEqual(parseListenerPids(sample, 8788).sort(), ['4321', '7321']);
  assert.deepStrictEqual(parseListenerPids(sample, 8787), ['5555']);
  assert.deepStrictEqual(parseListenerPids(sample, 9999), ['7777']);
  assert.deepStrictEqual(parseListenerPids(sample, 8080), []);
  console.log('[teardown self-test] 端口解析/过滤逻辑 OK：仅命中 :8788 的 LISTENING PID（4321/7321）');
  process.exit(0);
}
