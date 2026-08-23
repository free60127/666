/* ============================================================
    身份解析（2026-08-23 三阶段·审查第 4 项）：从 config/identity/rate-limit 分离耦合。
    统一：匿名 deviceId 校验 + 账号 Bearer 会话解析（sync / stats 共用同一实现）
    ============================================================ */

import { hashToken } from './auth.js';  // token -> SHA-256 hex（sessions 表存哈希）

/** 匿名设备号：恢复码派生 deviceId = sha256 hex 64 位（即钥匙） */
export const DEVICE_ID_RE = /^[0-9a-f]{64}$/;

/** 解析请求身份：带有效 Bearer -> 账号模式 {key:'user:{id}'}；否则匿名（由调用方取 deviceId） */
export async function resolveSyncIdentity(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return { key: null };
  if (!env.DB) return { error: 'database not configured' };
  const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?')
    .bind(await hashToken(token), Date.now()).first();
  if (!session) return { error: 'unauthorized' };
  return { key: 'user:' + session.user_id };
}
