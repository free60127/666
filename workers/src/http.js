/* ============================================================
   公共 HTTP / 安全工具（2026-08-23 三阶段·第一阶段第 3 项）
   从 index.js / auth.js / errand.js 抽取，统一以下语义：
   - json()：统一 JSON 响应（UTF-8 + 状态码）
   - methodNotAllowed()：405 统一文案
   - safeParseJson()：KV/D1 损坏 JSON 兜底（不直接 500）
   - readJsonBody()：统一请求体大小限制（默认 256KB；认证可传 64KB）
   - bearerToken() / isAdmin() / requireAdmin()：管理端鉴权（ADMIN_TOKEN）
   ============================================================ */

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export const methodNotAllowed = () => json({ error: 'method not allowed' }, 405);

/** KV/D1 中存的 JSON 损坏时不直接 500（2026-08-23 复审） */
export const safeParseJson = (text, fallback = null) => {
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch (_) { return fallback; }
};

/** 通用请求体上限（反馈/公告/访问/活跃；同步上传另有 2.5MB 专用校验） */
export const MAX_JSON_BODY = 256 * 1024;
/** 认证请求体上限（认证请求远小于 64KB，宽松覆盖恢复码密文 c<=8192） */
export const MAX_AUTH_BODY = 64 * 1024;

/** 读取并解析 JSON body：content-length 预检 + 实际字节数兜底；
 *  超限抛 'payload too large'（调用方转 413），读取失败/非法 JSON 返回 null（调用方转 400） */
export async function readJsonBody(request, max = MAX_JSON_BODY) {
  const cl = Number(request.headers.get('content-length') || 0);
  if (cl > max) throw new Error('payload too large');
  let text;
  try { text = await request.text(); } catch { return null; }
  if (new TextEncoder().encode(text).byteLength > max) throw new Error('payload too large');  // UTF-8 字节数（中文 1 字=3 字节，不能用 text.length）
  try { return JSON.parse(text); } catch { return null; }
}

/** Authorization: Bearer <token> 提取 */
export function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.replace(/^Bearer\s+/i, '');
}

/** 管理端鉴权（布尔）：token 由 env.ADMIN_TOKEN 提供 */
export function isAdmin(request, env) {
  const token = bearerToken(request);
  return !!env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

/** 管理端鉴权（index.js 风格：失败返回 401，成功执行 next） */
export function requireAdmin(request, env, next) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  return next();
}