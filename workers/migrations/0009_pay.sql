-- 0009_pay.sql：会员付费（payjs 扫码支付）
-- 2026-08-22：用户选择路线 C（payjs 聚合支付，个人身份证接入）
-- 设计：orders 表记录支付订单；users.member_until 存会员到期时间戳（ms）；
--       续费 = MAX(现有, now + 时长)；支付回调幂等，重放安全。

-- 支付订单
CREATE TABLE IF NOT EXISTS pay_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  out_trade_no TEXT NOT NULL UNIQUE,      -- 我方单号 PAY+时间戳+随机（payjs 要求唯一）
  payjs_order_id TEXT NOT NULL DEFAULT '',-- payjs 订单号（回调/查单回填）
  product TEXT NOT NULL,                  -- 'member30' 等商品标识
  amount INTEGER NOT NULL,                -- 金额（分）
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','closed')),
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  expires_at INTEGER NOT NULL             -- 未支付订单过期时间（超时自动关闭，10 分钟）
);
CREATE INDEX IF NOT EXISTS idx_pay_orders_user ON pay_orders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_pay_orders_out ON pay_orders (out_trade_no);

-- 会员到期时间（ms 时间戳；0 = 非会员）
ALTER TABLE users ADD COLUMN member_until INTEGER NOT NULL DEFAULT 0;
