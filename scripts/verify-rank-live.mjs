// 线上验证：活跃上报 + 日/周排行榜（会产生线上测试账号与活动数据，结束自动清理）
// 用法：WAIYUAN_ADMIN_TOKEN=xxx node scripts/verify-rank-live.mjs
const API = 'https://api.free60127.top';
const TOKEN = process.env.WAIYUAN_ADMIN_TOKEN || '';
let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, detail); }
};
const hex64 = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
const post = (path, body, token) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
const del = (path, token) => fetch(API + path, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
const rank = async period => {
  const r = await fetch(API + '/api/rank?period=' + period + '&nocache=1', { headers: { Authorization: 'Bearer ' + TOKEN } });  // 绕过 5 分钟缓存
  return { status: r.status, data: await r.json().catch(() => null) };
};
const todayCn = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// 测试痕迹：结束时清理活动记录与测试账号（管理接口，requireAdmin）
let cleanup = [];
const cleanupActivity = (key, date) => cleanup.push(['activity', key, date]);
const cleanupAccount = email => cleanup.push(['account', email]);
async function runCleanup() {
  for (const item of cleanup) {
    const kind = item[0];
    try {
      if (kind === 'activity') {
        const r = await del('/api/activity?key=' + encodeURIComponent(item[1]) + '&date=' + item[2], TOKEN);
        if (!r.ok) console.log('  ⚠ 清理活动记录失败', r.status, item[1], item[2]);
      } else {
        const r = await del('/api/auth/account?email=' + encodeURIComponent(item[1]), TOKEN);
        if (!r.ok) console.log('  ⚠ 清理测试账号失败', r.status, item[1]);
      }
    } catch (e) { console.log('  ⚠ 清理异常', e.message); }
  }
  console.log('清理完成：' + cleanup.length + ' 项测试痕迹（活动记录/测试账号）已处理。');
}

console.log('1) 匿名心跳聚合');
const deviceId = hex64();
cleanupActivity('anon:' + deviceId, todayCn());
{
  const h1 = await post('/api/activity', { deviceId, learned: 3 });
  const h1j = await h1.json();
  check('首次心跳 → 200 minutes=1 learned=3', h1.status === 200 && h1j.minutes === 1 && h1j.learned === 3, JSON.stringify(h1j));
  const bad = await post('/api/activity', { deviceId: 'zz', learned: 1 });
  check('非法 deviceId → 400', bad.status === 400);
  const none = await post('/api/activity', { learned: 1 });
  check('无身份 → 400', none.status === 400);
  // 心跳间隔校验：同一身份连续两次快速心跳 → 第二次 skipped（不计数）
  const hbId = hex64();
  cleanupActivity('anon:' + hbId, todayCn());
  const a1 = await post('/api/activity', { deviceId: hbId, learned: 1 });
  const a2 = await post('/api/activity', { deviceId: hbId, learned: 1 });
  const a1j = await a1.json(), a2j = await a2.json();
  check('间隔校验：首次计数 minutes=1', a1.status === 200 && a1j.minutes === 1, JSON.stringify(a1j));
  check('间隔校验：紧接第二次 skipped 不计数', a2.status === 200 && a2j.skipped === true && !a2j.minutes, JSON.stringify(a2j));
}

console.log('2) 账号心跳（昵称入榜）');
let acctKey = '';
{
  const email = 'rank-' + Date.now().toString(36) + '@test.com';
  const reg = await post('/api/auth/register', { email, password: 'password123', nickname: '排行测试' });
  const regJ = await reg.json();
  check('注册 201', reg.status === 201);
  if (reg.status === 201) cleanupAccount(email);
  await post('/api/activity', { learned: 4 }, regJ.token);  // 单次心跳（服务端 40s 间隔校验：连续快速心跳会被跳过）
  acctKey = 'user:' + regJ.user.id;
  if (regJ.user && regJ.user.id) cleanupActivity(acctKey, todayCn());
}

console.log('3) 排行榜接口');
{
  const no = await fetch(API + '/api/rank');
  check('无令牌 → 401', no.status === 401);
  const day = await rank('day');
  check('日榜 200 且含匿名与账号', day.status === 200 && day.data.items.some(i => i.id === 'anon:' + deviceId) && day.data.items.some(i => i.id === acctKey), JSON.stringify(day.data && day.data.items.map(i => i.id)));
  const anon = day.data.items.find(i => i.id === 'anon:' + deviceId);
  const acct = day.data.items.find(i => i.id === acctKey);
  check('匿名 minutes=1 learned=3', anon && anon.minutes === 1 && anon.learned === 3, JSON.stringify(anon));
  check('账号 minutes=1 learned=4 且昵称正确', acct && acct.minutes === 1 && acct.learned === 4 && acct.name === '排行测试', JSON.stringify(acct));
  const week = await rank('week');
  check('周榜 200 且范围 7 天', week.status === 200 && /~/.test(week.data.range));
  check('按分钟降序', day.data.items.every((it, i, a) => i === 0 || a[i - 1].minutes >= it.minutes));
}

console.log('\n线上结果：' + passed + ' 通过 / ' + failed + ' 失败');
await runCleanup();
process.exit(failed ? 1 : 0);