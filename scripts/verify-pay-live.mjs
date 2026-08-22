/* verify-pay-live.mjs：线上会员付费闭环验证（真实 payjs 回调验签链路）
   前置：Worker 已配置 PAYJS_MCHID/PAYJS_KEY（wrangler secret put），本地带 PAYJS_KEY 环境变量运行
   用法（pwsh 或 bash）：
     PAYJS_KEY=<payjs key> node scripts/verify-pay-live.mjs
   流程：注册测试账号 → create 下单 → 校验二维码 → 构造签名 notify 回调 → 校验开通+幂等 → 注销清理
   说明：真实微信扫码无法自动化，本脚本用「签名回调」模拟 payjs 服务端通知（验签逻辑与真实回调完全一致）；
        真实扫码验证由用户手机完成。 */
import { createHash } from 'node:crypto';

const API = process.env.WAIYUAN_API || 'https://api.free60127.top';
const KEY = process.env.PAYJS_KEY || '';
const MCHID = process.env.PAYJS_MCHID || '';

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};

if (!KEY) { console.error('缺少 PAYJS_KEY 环境变量（验签构造需要，与线上 secret 一致）'); process.exit(1); }

const j = async r => ({ status: r.status, body: await r.json().catch(() => null) });
const sign = params => {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  const str = sorted.map(k => k + '=' + String(params[k])).join('&') + '&key=' + KEY;
  return createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
};

console.log('组 1：下单');
{
  const email = 'paytest-' + Date.now() + '@test.com';
  const reg = await j(await fetch(API + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', nickname: '支付测试' }),
  }));
  check('注册测试账号 201', reg.status === 201 && !!reg.body.token, JSON.stringify(reg.body));
  if (reg.status !== 201) process.exit(1);
  const token = reg.body.token;
  const c = await j(await fetch(API + '/api/pay/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ product: 'member30' }),
  }));
  if (c.status === 500 && c.body && c.body.error === '支付通道未配置，请联系管理员') {
    console.error('  线上 PAYJS secret 未配置，跳过（需先 wrangler secret put PAYJS_MCHID/PAYJS_KEY）');
    process.exit(2);
  }
  check('create 200 + qrcode + 单号', c.status === 200 && c.body.ok === true && /^P\d{13}[0-9a-f]{4}$/.test(c.body.outTradeNo) && c.body.qrcode.startsWith('weixin://'), JSON.stringify(c.body));
  check('金额 200 分', c.body.totalFee === 200);
  const outTradeNo = c.body.outTradeNo;

  console.log('组 2：签名回调（模拟 payjs notify）');
  {
    const mkNotify = () => {
      const params = {
        return_code: '1',
        out_trade_no: outTradeNo,
        total_fee: '200',
        payjs_order_id: 'PJ' + outTradeNo,
        transaction_id: 'TX' + Date.now(),
        time_end: '20260822235959',
        openid: 'oMOCK123',
      };
      params.sign = sign(params);
      return params;
    };
    const postNotify = async params => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(params)) fd.append(k, v);
      return fetch(API + '/api/pay/notify', { method: 'POST', body: fd });
    };
    // 错误签名
    const bad = await postNotify({ ...mkNotify(), sign: 'DEADBEEF' });
    check('错误签名 → fail', (await bad.text()) === 'fail');
    // 正确回调
    const ok = await postNotify(mkNotify());
    check('正确回调 → success', (await ok.text()) === 'success');
    // 查状态
    const st = await j(await fetch(API + '/api/pay/status?out_trade_no=' + outTradeNo, {
      headers: { Authorization: 'Bearer ' + token },
    }));
    check('订单 paid + 会员期开通', st.status === 200 && st.body.status === 'paid' && st.body.memberUntil > Date.now(), JSON.stringify(st.body));
    // 幂等
    const ok2 = await postNotify(mkNotify());
    check('重复回调幂等（仍 success，不叠加）', (await ok2.text()) === 'success');
    const st2 = await j(await fetch(API + '/api/pay/status?out_trade_no=' + outTradeNo, {
      headers: { Authorization: 'Bearer ' + token },
    }));
    check('幂等后会员期不变', st2.body.memberUntil === st.body.memberUntil);
    // me
    const me = await j(await fetch(API + '/api/pay/me', { headers: { Authorization: 'Bearer ' + token } }));
    check('me 是会员', me.status === 200 && me.body.isMember === true);
  }

  console.log('组 3：清理');
  {
    const del = await j(await fetch(API + '/api/auth/delete-account', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ password: 'password123' }),
    }));
    check('注销测试账号', del.status === 200 && del.body.ok === true, JSON.stringify(del.body));
  }
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
