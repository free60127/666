// 反馈 D1 单测（2026-08-23 审查第 7 项）：POST/GET/PATCH/DELETE 全闭环 + 401 + 筛选/分页
import mod from "../workers/src/index.js";

const ADMIN = "test-admin-token";

function makeDb() {
  const fb = new Map(); // id -> {id,page,question,answer,type,note,contact,ts,handled}
  const makeStmt = (sql) => ({
    bind: (...args) => makeStmt(sql, args),
    first: async () => {
      if (/INSERT INTO rate/.test(sql)) return { count: 1 };
      if (/SELECT COUNT\(\*\) AS c FROM feedbacks/.test(sql)) return { c: fb.size };
      return null;
    },
    all: async () => {
      const rows = Array.from(fb.values()).sort((a, b) => b.ts - a.ts);
      return { results: rows };
    },
    run: async () => {
      if (/INSERT INTO feedbacks/.test(sql)) {
        const [id, page, question, answer, type, note, contact, ts] = args;
        fb.set(id, { id, page, question, answer, type, note, contact, ts, handled: 0 });
        return { meta: { changes: 1 } };
      }
      if (/UPDATE feedbacks SET handled/.test(sql)) {
        const [handled, id] = args;
        if (!fb.has(id)) return { meta: { changes: 0 } };
        fb.get(id).handled = handled;
        return { meta: { changes: 1 } };
      }
      if (/DELETE FROM feedbacks/.test(sql)) {
        const [id] = args;
        const had = fb.delete(id);
        return { meta: { changes: had ? 1 : 0 } };
      }
      return { meta: { changes: 0 } };
    },
  });
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => {
      if (/INSERT INTO rate/.test(sql)) return { count: 1 };
      if (/SELECT COUNT\(\*\) AS c FROM feedbacks/.test(sql)) return { c: fb.size };
      return null;
    },
    all: async () => ({ results: Array.from(fb.values()).sort((a, b) => b.ts - a.ts) }),
    run: async () => {
      const a = args;
      if (/INSERT INTO feedbacks/.test(sql)) {
        fb.set(a[0], { id: a[0], page: a[1], question: a[2], answer: a[3], type: a[4], note: a[5], contact: a[6], ts: a[7], handled: 0 });
        return { meta: { changes: 1 } };
      }
      if (/UPDATE feedbacks SET handled/.test(sql)) {
        if (!fb.has(a[1])) return { meta: { changes: 0 } };
        fb.get(a[1]).handled = a[0];
        return { meta: { changes: 1 } };
      }
      if (/DELETE FROM feedbacks/.test(sql)) {
        const had = fb.delete(a[0]);
        return { meta: { changes: had ? 1 : 0 } };
      }
      return { meta: { changes: 0 } };
    },
  });
  return { prepare: (sql) => stmt(sql), batch: async () => [] };
}

function makeKv() { return { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [], cursor: null }), getWithMetadata: async () => ({ value: null, metadata: null }) }; }
const env = { DB: makeDb(), STUDY_KV: makeKv(), ADMIN_TOKEN: ADMIN };
const ctx = { waitUntil: () => {} };
let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log("  ok " + name); }
  catch (e) { failures++; console.log("  FAIL " + name + " -> " + (e && e.message)); }
}

await check("POST 提交反馈 200", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "思政系列", question: "题目？", answer: "答案", type: "错题", note: "备注", contact: "123" }) }), env, ctx);
  if (res.status !== 200) throw new Error("status " + res.status);
  const j = await res.json();
  if (!j.ok || !j.id.startsWith("feedback:")) throw new Error("bad resp");
  global.__fid = j.id;
});
await check("GET 无 token 401", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/feedback"), env, ctx);
  if (res.status !== 401) throw new Error("status " + res.status);
});
await check("GET 列表含刚提交的反馈", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/feedback", { headers: { Authorization: "Bearer " + ADMIN } }), env, ctx);
  const j = await res.json();
  if (!j.ok || !j.items || j.items.length !== 1) throw new Error("items " + (j.items && j.items.length));
  if (j.items[0].key !== global.__fid) throw new Error("key mismatch");
  if (typeof j.items[0].ts !== "string") throw new Error("ts not ISO string");
});
await check("PATCH 标记已处理", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/feedback?key=" + encodeURIComponent(global.__fid) + "&handled=1", { method: "PATCH", headers: { Authorization: "Bearer " + ADMIN } }), env, ctx);
  const j = await res.json();
  if (!j.ok || j.handled !== true) throw new Error("bad resp");
});
await check("GET handled=1 筛选命中", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/feedback?handled=1", { headers: { Authorization: "Bearer " + ADMIN } }), env, ctx);
  const j = await res.json();
  if (j.items.length !== 1 || j.items[0].handled !== true) throw new Error("filter failed");
});
await check("DELETE 删除", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/feedback?key=" + encodeURIComponent(global.__fid), { method: "DELETE", headers: { Authorization: "Bearer " + ADMIN } }), env, ctx);
  const j = await res.json();
  if (!j.ok) throw new Error("bad resp");
});
await check("DELETE 后再 GET 空列表", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/feedback", { headers: { Authorization: "Bearer " + ADMIN } }), env, ctx);
  const j = await res.json();
  if (j.items.length !== 0) throw new Error("not empty");
});
await check("POST 空反馈 400", async () => {
  const res = await mod.fetch(new Request("https://api.free60127.top/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: "" }) }), env, ctx);
  if (res.status !== 400) throw new Error("status " + res.status);
});

console.log(failures === 0 ? "\n反馈 D1：全部通过" : "\n反馈 D1：失败 " + failures + " 项");
process.exit(failures === 0 ? 0 : 1);
