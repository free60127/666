import { json, safeParseJson } from "./http.js";  // 公共 HTTP 工具
import { DEVICE_ID_RE, resolveSyncIdentity } from "./identity.js";  // 身份解析（统一模块，2026-08-23 审查第 4 项）
import { syncRateLimit } from "./rate-limit.js";  // 统一限流（2026-08-23 审查第 4 项）

/* ---------- 进度同步（2026-08-22 加固）----------
   匿名模式（访客）：恢复码 → deviceId=sha256 hex(64)，deviceId 即钥匙
   账号模式（登录用户）：Authorization: Bearer <session token>，数据键 user:{id}，
     与匿名数据完全隔离；登录后前端自动把旧匿名数据迁移到账号（cloud-sync.js migrateAnonymous）
   保护：deviceId 必须 64 位十六进制；每键每分钟限流（上传 10/下载 30/删除 6）；
     Content-Length 预检 + 字符串化二次校验（payload ≤ 2.5MB）；写入带 2 年 TTL；
     响应 Cache-Control: no-store（fetch 外层统一加）
   POST   /api/sync              {deviceId?, payload}   上传
   GET    /api/sync?deviceId=x   下载（不存在返回 404）
   DELETE /api/sync?deviceId=x   删除 */

const MAX_SYNC_BYTES = 2_500_000;

async function handleSyncUpload(request, env) {
  // 请求体大小预检（Content-Length 不可信时由字符串化二次校验兜底）
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_SYNC_BYTES + 2048) return json({ error: 'payload too large (max 2.5MB)' }, 413);
  const identity = await resolveSyncIdentity(request, env);
  if (identity.error) return json({ error: identity.error }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  let key;
  if (identity.key) {
    key = identity.key;
  } else {
    const deviceId = String(body.deviceId || '').trim();
    if (!DEVICE_ID_RE.test(deviceId)) return json({ error: 'deviceId must be 64 hex chars' }, 400);
    key = deviceId;
  }
  const rlUp = await syncRateLimit(env, key, 'upload');
  if (rlUp.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (!rlUp.ok) return json({ error: 'too many requests, try again later' }, 429);
  const payload = JSON.stringify(body.payload ?? null);
  // 2026-08-22 审查：按 UTF-8 字节数校验（中文 1 字符=3 字节，字符数会漏放行）
  const payloadBytes = new TextEncoder().encode(payload).length;
  if (payloadBytes > MAX_SYNC_BYTES) return json({ error: 'payload too large (max 2.5MB)' }, 413);
  const now = Date.now();
  const rev = now;
  const baseRev = body.baseRev;
  // 2026-08-23：baseRev 只要存在（含 0）就做 CAS 校验，与 KV 版语义一致；仅 undefined/null（旧客户端）走覆盖
  if (baseRev === undefined || baseRev === null) {
    // 旧客户端不带 baseRev：最后写入覆盖（INSERT OR REPLACE）
    try {
      await env.DB.prepare('INSERT OR REPLACE INTO sync_data (user_id, payload, rev, updated_at) VALUES (?, ?, ?, ?)' )
        .bind(key, payload, rev, now).run();
    } catch (e) {
      console.error('sync upload error:', e);
      return json({ error: '服务繁忙，请稍后再试' }, 503);
    }
  } else {
    // 原子 CAS：仅当云端 rev === baseRev 才覆盖；否则 409 返回云端最新（2026-08-23 审查）
    try {
      const res = await env.DB.prepare(
        'INSERT INTO sync_data (user_id, payload, rev, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
        'ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, rev = excluded.rev, updated_at = excluded.updated_at ' +
        'WHERE sync_data.rev = ?5')
        .bind(key, payload, rev, now, Number(baseRev)).run();
      if (!res || !res.meta || Number(res.meta.changes) < 1) {
        const cur = await env.DB.prepare('SELECT payload, rev, updated_at FROM sync_data WHERE user_id = ?').bind(key).first();
        const curRev = cur ? Number(cur.rev) || 0 : 0;
        return json({ error: 'conflict', rev: curRev, payload: cur ? safeParseJson(cur.payload, null) : null, updatedAt: cur ? new Date(Number(cur.updated_at)).toISOString() : null }, 409);
      }
    } catch (e) {
      console.error('sync upload cas error:', e);
      return json({ error: '服务繁忙，请稍后再试' }, 503);
    }
  }
  return json({ ok: true, size: payloadBytes, updatedAt: new Date(rev).toISOString(), rev });
}
async function handleSyncDownload(request, env) {
  const identity = await resolveSyncIdentity(request, env);
  if (identity.error) return json({ error: identity.error }, 401);
  const deviceId = new URL(request.url).searchParams.get('deviceId') || '';
  const key = identity.key || deviceId;
  if (!key) return json({ error: 'deviceId required (64 hex chars)' }, 400);
  if (!identity.key && !DEVICE_ID_RE.test(key)) return json({ error: 'deviceId must be 64 hex chars' }, 400);
  const rlDl = await syncRateLimit(env, key, 'download');
  if (rlDl.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (!rlDl.ok) return json({ error: 'too many requests, try again later' }, 429);
  let row;
  try {
    row = await env.DB.prepare('SELECT payload, rev, updated_at FROM sync_data WHERE user_id = ?').bind(key).first();
  } catch (e) {
    console.error('sync download error:', e);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  if (!row) return json({ error: 'not found' }, 404);
  // 旧记录 rev 视为 0（前端据此做首次合并）
  const payload = safeParseJson(row.payload, null);
  if (payload === null) {
    console.error('sync data corrupted, key:', key);
    return json({ error: '同步数据已损坏，请删除后重新备份' }, 500);
  }
  return json({ ok: true, payload, updatedAt: new Date(Number(row.updated_at)).toISOString(), rev: Number(row.rev) || 0 });
}
async function handleSyncDelete(request, env) {
  const identity = await resolveSyncIdentity(request, env);
  if (identity.error) return json({ error: identity.error }, 401);
  const deviceId = new URL(request.url).searchParams.get('deviceId') || '';
  const key = identity.key || deviceId;
  if (!key) return json({ error: 'deviceId required (64 hex chars)' }, 400);
  if (!identity.key && !DEVICE_ID_RE.test(key)) return json({ error: 'deviceId must be 64 hex chars' }, 400);
  const rlDel = await syncRateLimit(env, key, 'delete');
  if (rlDel.failed) return json({ error: '服务繁忙，请稍后再试' }, 503);
  if (!rlDel.ok) return json({ error: 'too many requests, try again later' }, 429);
  try {
    await env.DB.prepare('DELETE FROM sync_data WHERE user_id = ?').bind(key).run();
  } catch (e) {
    console.error('sync delete error:', e);
    return json({ error: '服务繁忙，请稍后再试' }, 503);
  }
  return json({ ok: true });
}

export { handleSyncUpload, handleSyncDownload, handleSyncDelete };
