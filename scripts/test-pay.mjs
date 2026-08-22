/* test-pay.mjs：会员付费（payjs）全链路单测（MemoryD1 + mock fetch，无网络）
   用法：node scripts/test-pay.mjs */
import { handleAuth } from '../workers/src/auth.js';
import { handlePay } from '../workers/src/pay.js';

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};

/* ---------- mock payjs（native/check） ---------- */
const payjsMock = {
  nativeResult: null,      // null=正常 或 覆盖对象
  checkStatus: 0,          // 0 未支付 1 已支付
  checkFail: false,        // 查单网络失败
  nativeCalls: 0, checkCalls: 0,
};
const origFetch = globalThis.fetch;
function installPayjsMock() {
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('payjs.cn/api/native')) {
      payjsMock.nativeCalls++;
      if (payjsMock.nativeResult) {
        return new Response(JSON.stringify(payjsMock.nativeResult), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const params = new URLSearchParams(String(opts.body));
      return new Response(JSON.stringify({
        return_code: 1, return_msg: 'OK', qrcode: 'weixin://wxpay/bizpayurl?pr=mock123',
        payjs_order_id: 'PJ' + params.get('out_trade_no'), out_trade_no: params.get('out_trade_no'),
        total_fee: params.get('total_fee'), sign: 'MOCK',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.includes('payjs.cn/api/check')) {
      payjsMock.checkCalls++;
      if (payjsMock.checkFail) throw new Error('network down');
      return new Response(JSON.stringify({
        return_code: 1, return_msg: 'OK', status: payjsMock.checkStatus,
        out_trade_no: new URLSearchParams(String(opts.body)).get('out_trade_no') || '',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return origFetch(url, opts);
  };
}
function restoreFetch() { globalThis.fetch = origFetch; }

/* ---------- MemoryD1（auth + pay 所需） ---------- */
class MemoryD1 {
  constructor() {
    this.users = new Map(); this.sessions = new Map();
    this.rates = new Map();
    this.payOrders = new Map(); this.nextOrderId = 1;
    this.failRates = false;
  }
  prepare(sql) {
    const db = this;
    let bound = { _sql: sql, _args: [] };
    return {
      bind(...args) { bound = { _sql: sql, _args: args }; return this; },
      async first() { return db._first(bound._sql, bound._args); },
      async all() { return db._all(bound._sql, bound._args); },
      async run() { return db._run(bound._sql, bound._args); },
    };
  }
  async batch(statements) {
    const results = [];
    for (const stmt of statements) results.push(await stmt.run());
    return results;
  }
  async _first(s, args) {
    if (s.includes('FROM users') && s.includes('WHERE email')) {
      const email = String(args[0]).trim().toLowerCase();
      for (const u of this.users.values()) if (u.email === email) return u;
      return null;
    }
    if (s.includes('FROM sessions') && s.includes('JOIN users')) {
      const [tokenHash, now] = args;
      const sess = this.sessions.get(tokenHash);
      if (!sess || sess.expires_at <= now) return null;
      const u = this.users.get(sess.user_id);
      return u ? { id: u.id, email: u.email, nickname: u.nickname, password_hash: u.password_hash, recovery_encrypted: u.recovery_encrypted } : null;
    }
    if (s.includes('INTO rate') && s.includes('RETURNING count')) {
      if (this.failRates) throw new Error('rate db down');
      const [key, winEnd, winStart] = args;
      const cur = this.rates.get(key);
      if (!cur || cur.until <= winStart) { this.rates.set(key, { count: 1, until: winEnd }); return { count: 1 }; }
      cur.count++; this.rates.set(key, cur);
      return { count: cur.count };
    }
    if (s.includes('FROM pay_orders') && s.includes('WHERE out_trade_no')) {
      const o = this.payOrders.get(String(args[0]));
      if (!o) return null;
      const u = this.users.get(o.user_id);
      return { ...o, user_id: o.user_id, password_hash: u ? u.password_hash : null };
    }
    if (s.includes('SELECT member_until FROM users') && s.includes('WHERE id')) {
      const u = this.users.get(String(args[0]));
      return u ? { member_until: u.member_until || 0 } : null;
    }
    return null;
  }
  async _all(s, args) { return { results: [] }; }
  async _run(s, args) {
    if (s.startsWith('INSERT INTO users')) {
      const [id, email, password_hash, nickname, recovery_encrypted, created_at, updated_at] = args;
      this.users.set(id, { id, email, password_hash, nickname, recovery_encrypted, created_at, updated_at, member_until: 0 });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO sessions')) {
      const [tokenHash, user_id, created_at, expires_at] = args;
      this.sessions.set(tokenHash, { token: tokenHash, user_id, created_at, expires_at });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO pay_orders')) {
      const [user_id, out_trade_no, product, amount, status, created_at, expires_at] = args;
      const id = this.nextOrderId++;
      this.payOrders.set(out_trade_no, { id, user_id, out_trade_no, payjs_order_id: '', product, amount, status, created_at, expires_at, paid_at: null });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (s.startsWith('UPDATE pay_orders')) {
      const setPart = s.slice(s.indexOf('SET') + 3, s.indexOf('WHERE'));
      const sets = [];
      const setRe = /([a-z_]+)\s*=\s*(?:\?|'([^']*)')/g;
      let m, argIdx = 0;
      while ((m = setRe.exec(setPart))) sets.push([m[1], m[2] !== undefined ? m[2] : args[argIdx++]]);
      const wherePart = s.slice(s.indexOf('WHERE') + 5);
      const wm = wherePart.match(/out_trade_no\s*=\s*\?/);
      const im = wherePart.match(/id\s*=\s*\?/);
      const key = wm ? String(args[argIdx]) : null;
      const id = im ? Number(args[argIdx]) : null;
      let target = null;
      if (key) target = this.payOrders.get(key);
      if (id) for (const o of this.payOrders.values()) if (o.id === id) target = o;
      if (!target) return { meta: { changes: 0 } };
      const pendingGuard = wherePart.includes("status = 'pending'") && target.status !== 'pending';
      if (pendingGuard) return { meta: { changes: 0 } };
      for (const [k, v] of sets) target[k] = v;
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('UPDATE users') && s.includes('member_until')) {
      const setPart = s.slice(s.indexOf('SET') + 3, s.indexOf('WHERE'));
      const sm = setPart.match(/member_until\s*=\s*MAX\(member_until,\s*\?\)/);
      const uid = String(args[1]);
      const u = this.users.get(uid);
      if (!u) return { meta: { changes: 0 } };
      if (sm) u.member_until = Math.max(u.member_until || 0, Number(args[0]));
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('DELETE FROM sessions')) return { meta: { changes: 0 } };
    return { meta: { changes: 0 } };
  }
}

/* ---------- env + api ---------- */
const SECRET = { PAYJS_MCHID: '10001', PAYJS_KEY: 'secretkey123456' };
const db = new MemoryD1();
const env = { DB: db, ...SECRET, STUDY_KV: { delete: async () => undefined }, ADMIN_TOKEN: 'admin-token', SMTP_TEST_MODE: true, SMTP_SENT: [] };

async function api(path, { method = 'GET', token, body } = {}) {
  const url = new URL('https://api.free60127.top' + path);
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const req = new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (path.startsWith('/api/auth')) return handleAuth(req, env, url.pathname);
  if (path.startsWith('/api/pay')) return handlePay(req, env, url.pathname);
  return new Response('not found', { status: 404 });
}
async function jres(res) { return { status: res.status, body: await res.json().catch(() => null) }; }
async function register(email, password) {
  const r = await api('/api/auth/register', { method: 'POST', body: { email, password, nickname: '测试' } });
  const j = await jres(r);
  return j.body.token;
}

/* ---------- 测试 ---------- */
installPayjsMock();

console.log('组 1：下单');
{
  const t1 = await register('a@test.com', 'password123');
  const r = await jres(await api('/api/pay/create', { method: 'POST', token: t1, body: { product: 'member30' } }));
  check('未登录 401', (await jres(await api('/api/pay/create', { method: 'POST', body: { product: 'member30' } }))).status === 401);
  const r2 = await jres(await api('/api/pay/create', { method: 'POST', token: t1, body: { product: 'nope' } }));
  check('未知商品 400', r2.status === 400);
  check('下单成功 ok+qr+单号', r.status === 200 && r.body.ok === true && /^P\d{13}[0-9a-f]{4}$/.test(r.body.outTradeNo) && r.body.qrcode.startsWith('weixin://'));
  check('金额 200 分=2 元', r.body.totalFee === 200 && r.body.productName === '全站会员 30 天');
  const o = db.payOrders.get(r.body.outTradeNo);
  check('订单落库 pending + payjs 单号回填', o && o.status === 'pending' && o.payjs_order_id.startsWith('PJ'));
  const r3 = await jres(await api('/api/pay/create', { method: 'POST', token: t1, body: { product: 'member30' } }));
  check('同用户再次下单成功（新单）', r3.status === 200 && r3.body.outTradeNo !== r.body.outTradeNo);
}
{
  const t2 = await register('b@test.com', 'password123');
  for (let i = 0; i < 10; i++) await api('/api/pay/create', { method: 'POST', token: t2, body: { product: 'member30' } });
  const r = await jres(await api('/api/pay/create', { method: 'POST', token: t2, body: { product: 'member30' } }));
  check('限流：第 11 次 429', r.status === 429);
}
{
  const t3 = await register('c@test.com', 'password123');
  const oldNative = payjsMock.nativeResult;
  payjsMock.nativeResult = { return_code: 0, return_msg: '失败' };
  const r = await jres(await api('/api/pay/create', { method: 'POST', token: t3, body: { product: 'member30' } }));
  check('payjs 下单失败 → 502 且订单关闭', r.status === 502 && [...db.payOrders.values()].some(o => o.user_id === [...db.users.values()].find(u => u.email === 'c@test.com').id && o.status === 'closed'));
  payjsMock.nativeResult = oldNative;
}
{
  const envNoSecret = { DB: db, STUDY_KV: { delete: async () => undefined } };
  const req = new Request('https://api.free60127.top/api/pay/create', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await register('d@test.com', 'password123')) }, body: JSON.stringify({ product: 'member30' }) });
  const r = await jres(await handlePay(req, envNoSecret, '/api/pay/create'));
  check('未配置支付通道 → 500', r.status === 500);
}

console.log('组 2：回调 notify');
{
  const t = await register('n1@test.com', 'password123');
  const c = await jres(await api('/api/pay/create', { method: 'POST', token: t, body: { product: 'member30' } }));
  const out = c.body.outTradeNo;
  const order = db.payOrders.get(out);
  // 构造 payjs 回调：正确 sign
  const mk = (over) => {
    const params = { return_code: '1', out_trade_no: out, total_fee: String(order.amount), payjs_order_id: 'PJX1', transaction_id: 'TX1', time_end: '20260822120000' };
    const all = { ...params, ...over };
    const sorted = Object.keys(all).filter(k => k !== 'sign').sort();
    const str = sorted.map(k => k + '=' + String(all[k])).join('&') + '&key=' + SECRET.PAYJS_KEY;
    // 需要 md5——直接 import
    return all;
  };
  const { default: md5 } = await import('../workers/src/md5.js');
  const signed = (over) => {
    const all = mk(over);
    const sorted = Object.keys(all).filter(k => k !== 'sign').sort();
    const str = sorted.map(k => k + '=' + String(all[k])).join('&') + '&key=' + SECRET.PAYJS_KEY;
    all.sign = md5(str).toUpperCase();
    return all;
  };
  const sendNotify = async (params) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(params)) fd.append(k, v);
    const req = new Request('https://api.free60127.top/api/pay/notify', { method: 'POST', body: fd });
    return handlePay(req, env, '/api/pay/notify');
  };
  const bad = await sendNotify(signed({ total_fee: '1' }));
  check('金额不匹配 → fail', (await bad.text()) === 'fail');
  const badSign = await sendNotify(mk({ sign: 'BAD' }));
  check('错误签名 → fail', (await badSign.text()) === 'fail');
  const ok = await sendNotify(signed({}));
  const okText = await ok.text();
  const order2 = db.payOrders.get(out);
  const u = db.users.get(order2.user_id);
  check('回调成功 → success + 订单 paid', okText === 'success' && order2.status === 'paid' && order2.paid_at !== null);
  check('会员期 ≈ now+30 天', Math.abs(u.member_until - (Date.now() + 30 * 24 * 3600 * 1000)) < 60000);
  const ok2 = await sendNotify(signed({}));
  const u2 = db.users.get(order2.user_id);
  check('回调幂等（重复通知不叠加）', (await ok2.text()) === 'success' && u2.member_until === u.member_until);
}

console.log('组 3：状态查询 + 主动查单兜底');
{
  const t = await register('s1@test.com', 'password123');
  const c = await jres(await api('/api/pay/create', { method: 'POST', token: t, body: { product: 'member30' } }));
  const out = c.body.outTradeNo;
  const r = await jres(await api('/api/pay/status?out_trade_no=' + out, { token: t }));
  check('未支付 → pending', r.status === 200 && r.body.status === 'pending');
  check('他人订单 403', (await jres(await api('/api/pay/status?out_trade_no=' + out, { token: await register('s2@test.com', 'password123') }))).status === 403);
  check('伪造单号 400', (await jres(await api('/api/pay/status?out_trade_no=BAD', { token: t }))).status === 400);
  check('未登录 401', (await jres(await api('/api/pay/status?out_trade_no=' + out))).status === 401);
  db.rates.delete('pay:check:' + out); // 清掉前面"未支付"查询消耗的窗口
  const before = payjsMock.checkCalls;
  await api('/api/pay/status?out_trade_no=' + out, { token: t });
  await api('/api/pay/status?out_trade_no=' + out, { token: t });
  check('25s 间隔限频：两次查询只调 1 次 payjs check', payjsMock.checkCalls - before === 1);
  payjsMock.checkStatus = 1;
  db.rates.delete('pay:check:' + out); // 清限频窗口，让下一次查询触发主动查单
  const r2 = await jres(await api('/api/pay/status?out_trade_no=' + out, { token: t }));
  const o = db.payOrders.get(out);
  const u = db.users.get(o.user_id);
  check('check 已支付 → paid + 会员开通（兜底路径）', r2.status === 200 && r2.body.status === 'paid' && u.member_until > Date.now());
  payjsMock.checkStatus = 0;
}

console.log('组 4：我的会员 + 续费叠加');
{
  const t = await register('m1@test.com', 'password123');
  const r = await jres(await api('/api/pay/me', { token: t }));
  check('me 非会员', r.status === 200 && r.body.isMember === false && r.body.memberUntil === 0);
  check('me 未登录 401', (await jres(await api('/api/pay/me'))).status === 401);
  // 续费叠加：已有 10 天会员再买 30 天 → MAX(now+10d, now+30d) = now+30d（不缩短）
  const uid = [...db.users.values()].find(u => u.email === 'm1@test.com').id;
  db.users.get(uid).member_until = Date.now() + 10 * 24 * 3600 * 1000;
  const c = await jres(await api('/api/pay/create', { method: 'POST', token: t, body: { product: 'member30' } }));
  const out = c.body.outTradeNo;
  const { default: md5 } = await import('../workers/src/md5.js');
  const order = db.payOrders.get(out);
  const params = { return_code: '1', out_trade_no: out, total_fee: String(order.amount), payjs_order_id: 'PJX2', transaction_id: 'TX2' };
  const sorted = Object.keys(params).sort();
  const str = sorted.map(k => k + '=' + String(params[k])).join('&') + '&key=' + SECRET.PAYJS_KEY;
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...params, sign: md5(str).toUpperCase() })) fd.append(k, v);
  await handlePay(new Request('https://api.free60127.top/api/pay/notify', { method: 'POST', body: fd }), env, '/api/pay/notify');
  const me = await jres(await api('/api/pay/me', { token: t }));
  check('续费 MAX 叠加：30 天盖过 10 天', me.body.isMember === true && Math.abs(me.body.memberUntil - (Date.now() + 30 * 24 * 3600 * 1000)) < 60000);
}

restoreFetch();
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
