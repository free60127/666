import md5 from './md5.js';
import { sessionUser } from './auth.js';

/* ============================================================
   会员付费模块（payjs 微信扫码，2026-08-22 路线 C）
   - 下单：POST /api/pay/create {product} → payjs native → 返回二维码内容
   - 查单：GET  /api/pay/status?out_trade_no= → 本地状态 + 兜底主动查 payjs
   - 回调：POST /api/pay/notify（payjs 服务器异步通知，无鉴权，MD5 验签）
   - 我的：GET  /api/pay/me → {memberUntil, isMember}
   商品：member30 = 2 元 / 30 天（PRODUCTS 表，续费按 MAX 叠加）
   依赖 env：PAYJS_MCHID / PAYJS_KEY（wrangler secret）；DB（D1）
   ============================================================ */

const PAYJS_NATIVE = 'https://payjs.cn/api/native';
const PAYJS_CHECK = 'https://payjs.cn/api/check';
const NOTIFY_URL = 'https://api.free60127.top/api/pay/notify';
const ORDER_TTL_MS = 10 * 60 * 1000;          // 未支付订单 10 分钟过期
const CHECK_MIN_GAP_MS = 25 * 1000;            // 同一订单主动查单最小间隔

const PRODUCTS = {
  member30: { name: '全站会员 30 天', amount: 200, days: 30 },
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/* ---------- payjs 签名：除 sign 外参数按 key ASCII 升序拼接，末尾 &key=密钥，MD5 大写 ---------- */
function payjsSign(params, key) {
  const sorted = Object.keys(params)
    .filter(k => k !== 'sign')
    .sort();
  const str = sorted.map(k => k + '=' + String(params[k])).join('&') + '&key=' + key;
  return md5(str).toUpperCase();
}

/** 校验请求参数中的 sign（payjs 回调/响应） */
function verifyPayjsSign(params, key) {
  if (!params || !params.sign) return false;
  return params.sign.toUpperCase() === payjsSign(params, key);
}

/** 调 payjs 表单接口（native/check），返回 JSON；网络/解析失败返回 null */
async function payjsPost(url, params, key) {
  const body = Object.keys(params)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])))
    .join('&');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    console.error('payjs fetch error:', err.message);
    return null;
  }
  let data;
  try { data = await res.json(); } catch { return null; }
  if (typeof data !== 'object' || data === null) return null;
  return data;
}

/** 限流（rate 表滚动窗口，同 index.js syncRateLimit 的 D1 版逻辑；失败放行并告警） */
async function rateHit(db, key, windowMs, max) {
  try {
    const now = Date.now();
    const until = now + windowMs;
    const row = await db.prepare(
      "INSERT INTO rate (key, count, until) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN rate.until <= ?3 THEN 1 ELSE rate.count + 1 END, until = CASE WHEN rate.until <= ?3 THEN ?4 ELSE rate.until END RETURNING count"
    ).bind(key, until, now, until).first();
    return { count: (row && row.count) || 1, failed: false };
  } catch (err) {
    console.error('pay rateHit error:', err);
    return { count: 0, failed: true };
  }
}

/** 生成唯一单号：P + 13 位毫秒时间戳 + 4 位随机十六进制 */
function newOutTradeNo() {
  return 'P' + Date.now() + Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
}

const OUT_RE = /^P\d{13}[0-9a-f]{4}$/;

/** 创建订单：登录 → 限流 → 落库 pending → payjs 下单 → 回填 payjs_order_id */
async function createOrder(request, env) {
  const user = await sessionUser(env.DB, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!env.PAYJS_MCHID || !env.PAYJS_KEY) return json({ error: '支付通道未配置，请联系管理员' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const product = PRODUCTS[String(body.product || '')];
  if (!product) return json({ error: '未知商品' }, 400);

  const rl = await rateHit(env.DB, 'pay:create:' + user.id, 10 * 60 * 1000, 10);
  if (rl.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (rl.count > 10) return json({ error: '操作太频繁，请稍后再试' }, 429);

  const now = Date.now();
  const outTradeNo = newOutTradeNo();
  try {
    await env.DB.prepare(
      'INSERT INTO pay_orders (user_id, out_trade_no, product, amount, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, outTradeNo, body.product, product.amount, 'pending', now, now + ORDER_TTL_MS).run();
  } catch (err) {
    console.error('pay order insert error:', err);
    return json({ error: 'internal error' }, 500);
  }

  const params = {
    mchid: env.PAYJS_MCHID,
    total_fee: product.amount,
    out_trade_no: outTradeNo,
    body: product.name,
    notify_url: NOTIFY_URL,
    nonce_str: Math.floor(Math.random() * 0x7fffffff).toString(16),
  };
  params.sign = payjsSign(params, env.PAYJS_KEY);
  const data = await payjsPost(PAYJS_NATIVE, params, env.PAYJS_KEY);
  if (!data || String(data.return_code) !== '1' || !data.qrcode) {
    // 下单失败：关闭订单，避免残留 pending 占位
    await env.DB.prepare("UPDATE pay_orders SET status = 'closed' WHERE out_trade_no = ?").bind(outTradeNo).run().catch(() => {});
    console.error('payjs native failed:', JSON.stringify(data || {}));
    return json({ error: '支付通道暂时不可用，请稍后再试' }, 502);
  }
  // 回填 payjs 订单号（payjs 订单号用于主动查单）
  await env.DB.prepare('UPDATE pay_orders SET payjs_order_id = ? WHERE out_trade_no = ?')
    .bind(String(data.payjs_order_id || ''), outTradeNo).run().catch(() => {});
  return json({
    ok: true,
    outTradeNo,
    qrcode: data.qrcode,          // weixin://wxpay/bizpayurl?pr=xxx，前端渲染二维码
    totalFee: product.amount,
    product: body.product,
    productName: product.name,
    expiresIn: Math.floor(ORDER_TTL_MS / 1000),
  });
}

/** 支付完成：订单置 paid + 会员期 MAX 叠加；原子 batch；幂等（已 paid 直接返回） */
async function markPaid(env, order, payjsOrderId, now) {
  const product = PRODUCTS[order.product];
  if (!product) return null;
  const memberUntil = now + product.days * 24 * 3600 * 1000;
  await env.DB.batch([
    env.DB.prepare("UPDATE pay_orders SET status = 'paid', paid_at = ?, payjs_order_id = ? WHERE id = ? AND status = 'pending'")
      .bind(now, payjsOrderId || '', order.id),
    env.DB.prepare('UPDATE users SET member_until = MAX(member_until, ?) WHERE id = ?').bind(memberUntil, order.user_id),
  ]);
  return memberUntil;
}

/** 主动查单（payjs check），返回 1=已支付 0=未支付 null=查询失败 */
async function queryPayjs(env, order) {
  const params = {
    mchid: env.PAYJS_MCHID,
    out_trade_no: order.out_trade_no,
    nonce_str: Math.floor(Math.random() * 0x7fffffff).toString(16),
  };
  if (order.payjs_order_id) params.payjs_order_id = order.payjs_order_id;
  params.sign = payjsSign(params, env.PAYJS_KEY);
  const data = await payjsPost(PAYJS_CHECK, params, env.PAYJS_KEY);
  if (!data || String(data.return_code) !== '1') return null;
  return String(data.status) === '1' ? 1 : 0;
}

/** 查单状态（前端轮询）：paid / pending / closed + memberUntil */
async function orderStatus(request, env) {
  const user = await sessionUser(env.DB, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const outTradeNo = new URL(request.url).searchParams.get('out_trade_no') || '';
  if (!OUT_RE.test(outTradeNo)) return json({ error: 'invalid out_trade_no' }, 400);
  const order = await env.DB.prepare('SELECT * FROM pay_orders WHERE out_trade_no = ?').bind(outTradeNo).first();
  if (!order) return json({ error: '订单不存在' }, 404);
  if (order.user_id !== user.id) return json({ error: '无权查看该订单' }, 403);

  if (order.status === 'pending') {
    const now = Date.now();
    if (now > order.expires_at) {
      await env.DB.prepare("UPDATE pay_orders SET status = 'closed' WHERE id = ? AND status = 'pending'").bind(order.id).run();
      order.status = 'closed';
    } else if (env.PAYJS_MCHID && env.PAYJS_KEY) {
      // 兜底主动查单（回调可能延迟/丢失），限频：同订单 25 秒内不重复查
      const rl = await rateHit(env.DB, 'pay:check:' + order.out_trade_no, CHECK_MIN_GAP_MS, 1);
      if (!rl.failed && rl.count <= 1) {
        const payStatus = await queryPayjs(env, order);
        if (payStatus === 1) {
          const memberUntil = await markPaid(env, order, order.payjs_order_id, now);
          if (memberUntil) {
            order.status = 'paid';
            order.memberUntil = memberUntil;
          }
        }
      }
    }
  }
  if (order.status === 'paid') {
    const userRow = await env.DB.prepare('SELECT member_until FROM users WHERE id = ?').bind(order.user_id).first();
    return json({ status: 'paid', memberUntil: (userRow && userRow.member_until) || 0 });
  }
  return json({ status: order.status, memberUntil: 0 });
}

/** payjs 异步回调：验签 + 金额校验 + 幂等更新；返回纯文本 success/fail */
async function payNotify(request, env) {
  let form;
  try { form = await request.formData(); } catch { return new Response('fail', { status: 400 }); }
  const params = {};
  for (const [k, v] of form.entries()) params[k] = String(v);
  if (!env.PAYJS_MCHID || !env.PAYJS_KEY) return new Response('fail', { status: 500 });
  if (String(params.return_code) !== '1') return new Response('success', { status: 200 }); // 支付失败通知，直接确认
  if (!verifyPayjsSign(params, env.PAYJS_KEY)) {
    console.error('pay notify bad sign');
    return new Response('fail', { status: 200 });
  }
  const outTradeNo = String(params.out_trade_no || '');
  if (!OUT_RE.test(outTradeNo)) return new Response('fail', { status: 200 });
  const order = await env.DB.prepare('SELECT * FROM pay_orders WHERE out_trade_no = ?').bind(outTradeNo).first();
  if (!order) return new Response('fail', { status: 200 });
  if (Number(params.total_fee) !== order.amount) {
    console.error('pay notify amount mismatch:', params.total_fee, '!=', order.amount);
    return new Response('fail', { status: 200 });
  }
  if (order.status === 'pending') {
    await markPaid(env, order, String(params.payjs_order_id || ''), Date.now());
  }
  return new Response('success', { status: 200 });
}

/** 我的会员状态（门禁用） */
async function myMembership(request, env) {
  const user = await sessionUser(env.DB, request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT member_until FROM users WHERE id = ?').bind(user.id).first();
  const memberUntil = (row && row.member_until) || 0;
  return json({ memberUntil, isMember: memberUntil > Date.now() });
}

export async function handlePay(request, env, path) {
  const url = new URL(request.url);
  if (path === '/api/pay/create' && request.method === 'POST') return createOrder(request, env);
  if (path === '/api/pay/status' && request.method === 'GET') return orderStatus(request, env);
  if (path === '/api/pay/notify' && request.method === 'POST') return payNotify(request, env);
  if (path === '/api/pay/me' && request.method === 'GET') return myMembership(request, env);
  if (path.startsWith('/api/pay/')) return json({ error: 'not found' }, 404);
  return json({ error: 'method not allowed' }, 405);
}
