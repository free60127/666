// Worker 路由冒烟测试（2026-08-23 审查第 3 项）：
// 目标：拆模块后能即时发现"导入成功但运行时变量缺失/引用缺失"类问题（如 UPSTREAM 漏定义）。
// 直接调用 default.fetch(request, env, ctx)，mock 上游 fetch 与 D1/KV 存储。
import mod from "../workers/src/index.js";

const ADMIN = "test-admin-token";
const DEVICE = "a".repeat(64);

function makeDb() {
  const makeStmt = (sql) => ({
    bind: () => makeStmt(sql),
    first: async () => {
      if (/INSERT INTO rate/.test(sql)) return { count: 1 };   // 限流：首次通过
      if (/SELECT payload, rev, updated_at FROM sync_data/.test(sql)) return null;  // 无数据 -> 404
      if (/SELECT payload, updated_at FROM rank_cache/.test(sql)) return null;
      if (/SELECT user_id FROM sessions/.test(sql)) return null;   // 无会话
      return null;
    },
    all: async () => ({ results: [] }),
    run: async () => ({ meta: { changes: 0 } }),
  });
  return { prepare: makeStmt, batch: async () => [] };
}

function makeKv() {
  return {
    get: async () => null,
    getWithMetadata: async () => ({ value: null, metadata: null }),
    list: async () => ({ keys: [], cursor: null }),
    put: async () => {},
    delete: async () => {},
  };
}

function makeEnv() {
  return { DB: makeDb(), STUDY_KV: makeKv(), ADMIN_TOKEN: ADMIN };
}

const ctx = { waitUntil: () => {} };
let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log("  ok " + name);
  } catch (e) {
    failures++;
    console.log("  FAIL " + name + " -> " + (e && e.message));
  }
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  // 模拟 UPSTREAM（github.io）返回一个简单 HTML；其它 URL 不应被反代调用
  return new Response("<html><head></head><body><h1>mock upstream</h1><a href=\"/666/site-search.js\">x</a></body></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

const env = makeEnv();
console.log("1) 反代与静态路由");
await check("/ 主域 200", async () => {
  const res = await mod.fetch(new Request("https://free60127.top/"), env, ctx);
  if (res.status !== 200) throw new Error("status " + res.status);
  if ((await res.text()).indexOf("mock upstream") < 0) throw new Error("body not proxied");
});
await check("/proxy/xxx 200 且改写 /proxy/ 前缀", async () => {
  const res = await mod.fetch(new Request("https://free60127.top/proxy/xxx"), env, ctx);
  if (res.status !== 200) throw new Error("status " + res.status);
  const text = await res.text();
  if (text.indexOf("/proxy/site-search.js") < 0) throw new Error("proxy rewrite missing");
});
await check("www 301 -> 主域", async () => {
  const res = await mod.fetch(new Request("https://www.free60127.top/"), env, ctx);
  if (res.status !== 301) throw new Error("status " + res.status);
  if (res.headers.get("Location") !== "https://free60127.top/") throw new Error("bad Location " + res.headers.get("Location"));
});
await check("/apk/waiyuan-share.apk 无文件 404（非 500）", async () => {
  const res = await mod.fetch(new Request("https://free60127.top/apk/waiyuan-share.apk"), env, ctx);
  if (res.status !== 404) throw new Error("status " + res.status);
});

console.log("2) API 路由");
await check("/api/health 200", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/health"), env, ctx);
  const j = await res.json();
  if (j.ok !== true) throw new Error("bad json");
});
await check("/api/notice 公开读 200", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/notice"), env, ctx);
  const j = await res.json();
  if (typeof j.text !== "string") throw new Error("bad json");
});
await check("/api/feedback GET 无 token 401", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/feedback"), env, ctx);
  if (res.status !== 401) throw new Error("status " + res.status);
});
await check("/api/sync GET 匿名无数据 404（限流不 500）", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/sync?deviceId=" + DEVICE), env, ctx);
  if (res.status !== 404) throw new Error("status " + res.status);
});
await check("/api/unknown 404", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/unknown"), env, ctx);
  if (res.status !== 404) throw new Error("status " + res.status);
});

globalThis.fetch = realFetch;
console.log(failures === 0 ? "\n路由冒烟：全部通过" : "\n路由冒烟：失败 " + failures + " 项");
process.exit(failures === 0 ? 0 : 1);
