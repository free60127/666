// 线上验证：活跃上报 + 日/周排行榜
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
const rank = async period => {
  const r = await fetch(API + '/api/rank?period=' + period, { headers: { Authorization: 'Bearer ' + TOKEN } });
  return { status: r.status, data: await r.json().catch(() => null) };
};

console.log('1) 匿名心跳聚合');
const deviceId = hex64();
{
  const h1 = await post('/api/activity', { deviceId, learned: 3 });
  const h2 = await post('/api/activity', { deviceId, learned: 2 });
  check('两次心跳 200 且累计 minutes=2 learned=5', h1.status === 200 && h2.status === 200 && h2.ok, String(h1.status));
  const h1j = await h1.json(), h2j = await h2.json();
  check('累计值正确', h2j.minutes === 2 && h2j.learned === 5, JSON.stringify(h2j));
  const bad = await post('/api/activity', { deviceId: 'zz', learned: 1 });
  check('非法 deviceId → 400', bad.status === 400);
  const none = await post('/api/activity', { learned: 1 });
  check('无身份 → 400', none.status === 400);
}

console.log('2) 账号心跳（昵称入榜）');
let acctKey = '';
{
  const email = 'rank-' + Date.now().toString(36) + '@test.com';
  const reg = await post('/api/auth/register', { email, password: 'password123', nickname: '排行测试' });
  const regJ = await reg.json();
  check('注册 201', reg.status === 201);
  for (let i = 0; i < 3; i++) await post('/api/activity', { learned: 4 }, regJ.token);
  acctKey = 'user:' + regJ.user.id;
}

console.log('3) 排行榜接口');
{
  const no = await fetch(API + '/api/rank');
  check('无令牌 → 401', no.status === 401);
  const day = await rank('day');
  check('日榜 200 且含匿名与账号', day.status === 200 && day.data.items.some(i => i.id === 'anon:' + deviceId) && day.data.items.some(i => i.id === acctKey), JSON.stringify(day.data && day.data.items.map(i => i.id)));
  const anon = day.data.items.find(i => i.id === 'anon:' + deviceId);
  const acct = day.data.items.find(i => i.id === acctKey);
  check('匿名 minutes=2 learned=5', anon && anon.minutes === 2 && anon.learned === 5, JSON.stringify(anon));
  check('账号 minutes=3 learned=12 且昵称正确', acct && acct.minutes === 3 && acct.learned === 12 && acct.name === '排行测试', JSON.stringify(acct));
  const week = await rank('week');
  check('周榜 200 且范围 7 天', week.status === 200 && /~/.test(week.data.range));
  check('按分钟降序', day.data.items.every((it, i, a) => i === 0 || a[i - 1].minutes >= it.minutes));
}

console.log(`\n线上结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
