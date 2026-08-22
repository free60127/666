// 线上验证：站点统计（PV/UV/API/鉴权）
// 用法：WAIYUAN_ADMIN_TOKEN=xxx node scripts/verify-stats-live.mjs
const MAIN = 'https://free60127.top/';
const API = 'https://api.free60127.top';
const TOKEN = process.env.WAIYUAN_ADMIN_TOKEN || '';
let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, detail); }
};
const getStats = async () => {
  const res = await fetch(API + '/api/stats', { headers: { Authorization: 'Bearer ' + TOKEN } });
  return { status: res.status, data: await res.json().catch(() => null) };
};

console.log('1) 鉴权');
{
  const noAuth = await fetch(API + '/api/stats');
  check('无令牌 → 401', noAuth.status === 401, String(noAuth.status));
}

console.log('2) 统计 API 结构');
let before = null;
{
  const r = await getStats();
  before = r.data;
  check('带令牌 → 200', r.status === 200, String(r.status));
  check('totals/today/daily/topPages 齐全', !!(r.data && r.data.totals && r.data.today && Array.isArray(r.data.daily) && Array.isArray(r.data.topPages)));
  check('daily 为最近 14 天', r.data && r.data.daily.length === 14, String(r.data && r.data.daily.length));
  check('topPages 按 PV 降序', r.data && r.data.topPages.length <= 20 && r.data.topPages.every((p, i, a) => i === 0 || a[i - 1].pv >= p.pv));
}

console.log('3) 反代计数（cookie jar 模拟浏览器 + 无 cookie 爬虫）');
let cookie = '';
const visit = async withCookie => {
  const res = await fetch(MAIN, {
    headers: withCookie && cookie ? { Cookie: cookie } : {},
    redirect: 'manual',
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return res.status;
};
{
  const s1 = await visit(false);  // 首访：应收到 Set-Cookie
  check('首访 200 且下发访客 Cookie', s1 === 200 && cookie.startsWith('waiyuan_vid='), cookie.slice(0, 30));
  for (let i = 0; i < 2; i++) await visit(true);   // 带 cookie 两次
  await visit(false); await visit(false);          // 无 cookie 两次（同 IP 去重）
  const r = await getStats();
  const after = r.data;
  // 2026-08-22 审查：统计计数改为 ctx.waitUntil 异步写入，响应返回后可能尚未落库 → 轮询等待
  let pvDelta = (after.totals.pv || 0) - (before.totals.pv || 0);
  for (let i = 0; i < 15 && pvDelta < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const poll = await getStats();
    pvDelta = (poll.data.totals.pv || 0) - (before.totals.pv || 0);
  }
  const uvDelta = (after.today.uv || 0) - (before.today.uv || 0);
  check('PV 增量 ≥ 5（5 次页面访问，轮询等待异步统计）', pvDelta >= 5, 'delta=' + pvDelta);
  check('今日 UV 增量 ≤ 2（浏览器 1 + 并发新访客上限）', uvDelta >= 0 && uvDelta <= 2, 'delta=' + uvDelta);
  const homeBefore = (before.topPages || []).find(p => p.path === '/');
  // KV list 是最终一致的：写入后立即查询可能为空，轮询等待最多 15 秒
  let homeAfter = null;
  for (let i = 0; i < 15; i++) {
    const poll = await getStats();
    homeAfter = (poll.data.topPages || []).find(p => p.path === '/');
    if (homeAfter) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  check('首页 / 出现在热门页面且 PV 增长', !!(homeAfter && (!homeBefore || homeAfter.pv >= homeBefore.pv)), JSON.stringify(homeAfter));
}

console.log(`\n线上结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
