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

import { corsFor, MAIN_HOST, API_HOST, WWW_HOST } from './config.js';  // 域名/源站/来源白名单统一配置（2026-08-23 审查第 2 项）
import { handleAuth, adminDeleteAccount } from './auth.js';
import { handleErrand } from './errand.js';
import { cleanupDb } from './maintenance.js';
import { serveApk } from './apk.js';
import { handleVisit, handleActivity, handleDeleteActivity, handleRank, handleStats } from './stats.js';
import { handleSetNotice, handleDeleteNotice, handleFeedback, handleListFeedback, handleFeedbackHandled, handleDeleteFeedback } from './feedback.js';
import { handleSyncUpload, handleSyncDownload, handleSyncDelete } from './sync.js';
import { handleProxy } from './proxy.js';
import { json, methodNotAllowed, safeParseJson, requireAdmin } from './http.js';

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
    if (url.hostname === WWW_HOST) {  // 统一配置：www 301 目标（2026-08-23 审查第 2 项）
      const target = 'https://' + MAIN_HOST + url.pathname + url.search;
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
        // 2026-08-29：管理端删号改为与用户自注销同一套清理（会话/同步数据/活跃/限流/重置码/R2 对象等）
        return requireAdmin(request, env, () => adminDeleteAccount(request, env));
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

      if (url.hostname !== API_HOST && !path.startsWith('/api/')) {
        return handleProxy(request, env, path, path.startsWith('/proxy/') ? 'proxy' : 'root', ctx);
      }

      return json({ error: 'not found', path }, 404);
    } catch (err) {
      console.error('waiyuan-study route error:', err);  // 错误细节仅进 Worker 日志，不对外暴露
      return json({ error: 'internal error' }, 500);
    }
}

