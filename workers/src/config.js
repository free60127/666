/* ============================================================
    全局配置（2026-08-23 三阶段·审查第 2/4 项）：域名/源站/来源白名单/APK 只在此维护。
    拆分后多模块引用同一常量，改一处即可，避免只改到一处导致线上 500。
    ============================================================ */

export const UPSTREAM = 'https://free60127.github.io/666';  // GitHub Pages 源站（Worker 反代目标）
export const MAIN_HOST = 'free60127.top';  // 主域（反代 + 页面 + www 301 目标）
export const API_HOST = 'api.free60127.top';  // API 子域（仅 API，不反代）
export const WWW_HOST = 'www.free60127.top';  // www 子域（301 -> 主域）

export const ALLOWED_ORIGINS = new Set(['https://free60127.github.io', 'https://free60127.top']);

/** CORS：只对站点白名单来源回显 Origin（其余不带 CORS 头，浏览器直接拦截；
 *  未携带 Origin 的同源/非浏览器请求不受影响） */
export const corsFor = request => {
  const origin = (request && request.headers.get('Origin')) || '';
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',  // 白名单来源不同 -> 缓存应区分
  };
};

export const APK_KEY_PREFIX = 'apk:';  // KV 键前缀（apk:<name> 与 apk:latest:<name>）
