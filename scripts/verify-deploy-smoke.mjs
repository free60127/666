import crypto from 'node:crypto';

// 线上 Worker 部署冒烟测试：/api/health + 云同步匿名闭环（上传→下载→删除）
// 用法: node scripts/verify-deploy-smoke.mjs  [BASE]
const BASE = (process.argv[2] || 'https://api.free60127.top').replace(/\/$/, '');
let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log('✓ ' + name); }
  else { failures++; console.error('✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
async function jfetch(path, init) {
  const res = await fetch(BASE + path, Object.assign({ signal: AbortSignal.timeout(15000) }, init));
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) {}
  return { status: res.status, body, text };
}
async function main() {
  const h = await jfetch('/api/health');
  check('health 200 ok:true', h.status === 200 && h.body && h.body.ok === true, h.text);
  const deviceId = crypto.randomBytes(32).toString('hex');
  const payload = { v: 1, s: 'smoke', i: Date.now(), c: {} };
  const up = await jfetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, payload }) });
  check('sync upload 200', up.status === 200 && up.body && up.body.ok === true, up.text);
  const dl = await jfetch('/api/sync?deviceId=' + deviceId);
  check('sync download 200 且 payload 一致', dl.status === 200 && dl.body && dl.body.payload && dl.body.payload.s === 'smoke', dl.text);
  const del = await jfetch('/api/sync?deviceId=' + deviceId, { method: 'DELETE' });
  check('sync delete 200', del.status === 200 && del.body && del.body.ok === true, del.text);
  const gone = await jfetch('/api/sync?deviceId=' + deviceId);
  check('sync delete 后 404（数据已清）', gone.status === 404, gone.text);
  if (failures) { console.error('\n' + failures + ' 项冒烟失败'); process.exit(1); }
  console.log('\n冒烟全部通过');
}
main().catch(e => { console.error('冒烟异常:', e && e.message || e); process.exit(1); });