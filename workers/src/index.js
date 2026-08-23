/**
 * 外院知识分享站 · 云端 API（Cloudflare Worker）
 *
 * 路由：
 *   GET  /api/health         健康检查
 *   GET  /api/notice         读取公告（公开）
 *   POST /api/notice         更新公告（需 ADMIN_TOKEN）
 *   POST /api/feedback       提交错题/意见反馈（公开，限频）
 *   GET  /api/feedback       拉取反馈列表（分页/筛选，需 ADMIN_TOKEN）
 *   PATCH /api/feedback      标记反馈已处理/重新打开（需 ADMIN_TOKEN）
 *   GET  /proxy/*            站点反代加速（映射到 https://free60127.github.io/666/）
 */

const UPSTREAM = 'https://free60127.github.io/666';
import { handleAuth } from './auth.js';
import { handleErrand } from './errand.js';
import { cleanupDb } from './maintenance.js';
import { serveApk } from './apk.js';
import { handleVisit, handleActivity, handleDeleteActivity, handleRank, handleStats } from './stats.js';
import { handleSetNotice, handleDeleteNotice, handleFeedback, handleListFeedback, handleFeedbackHandled, handleDeleteFeedback } from './feedback.js';
import { handleSyncUpload, handleSyncDownload, handleSyncDelete } from './sync.js';
import { handleProxy } from './proxy.js';
import { json, methodNotAllowed, safeParseJson, requireAdmin } from './http.js';
// CORS：只对站点白名单来源回显 Origin（其余不带 CORS 头，浏览器直接拦截；
// 未携带 Origin 的同源/非浏览器请求不受影响）
const ALLOWED_ORIGINS = new Set(['https://free60127.github.io', 'https://free60127.top']);
const corsFor = request => {
  const origin = (request && request.headers.get('Origin')) || '';
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',  // 白名单来源不同 → 缓存应区分（2026-08-22 审查）
  };
};

// 导出供 Node 单测（scripts/test-sync-guard.mjs），wrangler 仅消费 default 导出
export { handleSyncDownload } from "./sync.js";
export default {
  async fetch(request, env, ctx) {
    const response = await route(request, env, ctx);
    const cors = corsFor(request);
    for (const [key, value] of Object.entries(cors)) {
      if (value) response.headers.set(key, value);
    }
    // 全部 API 响应禁止缓存（同步/认证/反馈/公告，2026-08-22 审查）
    if (new URL(request.url).pathname.startsWith('/api/')) {
      response.headers.set('Cache-Control', 'no-store');
    }
    return response;
  },
  /* 每日清理 D1 滚动数据（2026-08-22 审查 P1）：Cron UTC 02:30（北京 10:30） */
  async scheduled(_event, env) {
    return cleanupDb(env);
  }
};

async function route(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // www 子域统一 301 跳转主域（保留路径与查询串，避免双域名内容/统计分裂）
    if (url.hostname === 'www.free60127.top') {
      const target = 'https://free60127.top' + url.pathname + url.search;
      return new Response(null, { status: 301, headers: { Location: target, 'Cache-Control': 'no-store' } });
    }

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    try {
      if (path === '/api/health') return json({ ok: true, time: Date.now(), name: 'waiyuan-study' });

      if (path === '/api/notice') {
        if (request.method === 'GET') {
          const raw = await env.STUDY_KV.get('notice');
          return json(safeParseJson(raw, { text: '', updatedAt: null }));
        }
        if (request.method === 'POST') return requireAdmin(request, env, () => handleSetNotice(request, env));
        if (request.method === 'DELETE') return requireAdmin(request, env, () => handleDeleteNotice(env));
        return methodNotAllowed();
      }

      if (path === '/api/feedback') {
        if (request.method === 'POST') return handleFeedback(request, env);
        if (request.method === 'GET') return requireAdmin(request, env, () => handleListFeedback(request, env));
        if (request.method === 'PATCH') return requireAdmin(request, env, () => handleFeedbackHandled(request, env));
        if (request.method === 'DELETE') return requireAdmin(request, env, () => handleDeleteFeedback(request, env));
        return methodNotAllowed();
      }

      if (path === '/api/auth/account' && request.method === 'DELETE') {
        return requireAdmin(request, env, () => handleDeleteAccount(request, env));
      }

      if (path.startsWith('/api/auth')) {
        return handleAuth(request, env, path);
      }

      if (path === '/api/stats') {
        if (request.method === 'GET') return requireAdmin(request, env, () => handleStats(env));
        return methodNotAllowed();
      }

      if (path === '/api/activity') {
        if (request.method === 'POST') return handleActivity(request, env);
        if (request.method === 'DELETE') return requireAdmin(request, env, () => handleDeleteActivity(request, env));
        return methodNotAllowed();
      }

      if (path === '/api/visit') {
        if (request.method === 'POST') return handleVisit(request, env);
        return methodNotAllowed();
      }

      if (path === '/api/rank') {
        if (request.method === 'GET') return requireAdmin(request, env, () => handleRank(request, env));
        return methodNotAllowed();
      }

      if (path === '/api/sync') {
        if (request.method === 'POST') return handleSyncUpload(request, env);
        if (request.method === 'GET') return handleSyncDownload(request, env);
        if (request.method === 'DELETE') return handleSyncDelete(request, env);
        return methodNotAllowed();
      }

      // 跑腿平台（2026-08-22）：/api/errand/* 全部交给 errand.js 分发
      if (path.startsWith('/api/errand')) {
        return handleErrand(request, env, path);
      }

      // 反代（主域直连或 /proxy/ 兼容路径）；api.free60127.top 只提供 API，不反代
      // APK 下载（KV 托管，国内可直连）：/apk/waiyuan-share.apk | /apk/waiyuan-paotui.apk（稳定地址 302 → 版本化地址）
      if (path.startsWith('/apk/')) return serveApk(request, env, path);

      if (url.hostname !== 'api.free60127.top' && !path.startsWith('/api/')) {
        return handleProxy(request, env, path, path.startsWith('/proxy/') ? 'proxy' : 'root', ctx);
      }

      return json({ error: 'not found', path }, 404);
    } catch (err) {
      console.error('waiyuan-study route error:', err);  // 错误细节仅进 Worker 日志，不对外暴露
      return json({ error: 'internal error' }, 500);
    }
}


/** 管理操作：按邮箱删除账号（级联删会话；用于清理线上测试账号，requireAdmin） */
async function handleDeleteAccount(request, env) {
  if (!env.DB) return json({ error: 'database not configured' }, 500);
  const email = String(new URL(request.url).searchParams.get('email') || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'invalid email' }, 400);
  const info = await env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email).run();
  return json({ ok: true, deleted: (info && info.meta && info.meta.changes) || 0 });
}

