// 线上反馈 D1 链路验证（2026-08-23 审查第 7 项）
const BASE = "https://api.free60127.top";
const ADMIN = "6HOqnhBpzYWpPkoYjQeWGM4HBaIw7T53";
let failures = 0;
async function check(name, fn) { try { await fn(); console.log("  ok " + name); } catch (e) { failures++; console.log("  FAIL " + name + " -> " + (e && e.message)); } }
let id = null;
await check("POST 提交 200", async () => {
  const res = await fetch(BASE + "/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "线上验证", question: "验证题", type: "测试", note: "D1 迁移验证-" + Date.now(), contact: "13900000000" }) });
  const j = await res.json(); if (!res.ok || !j.ok) throw new Error(res.status + " " + JSON.stringify(j)); id = j.id;
});
await check("GET 列表含新反馈", async () => {
  const res = await fetch(BASE + "/api/feedback?limit=5", { headers: { Authorization: "Bearer " + ADMIN } });
  const j = await res.json(); if (!j.ok || !j.items || !j.items.some(x => x.key === id)) throw new Error("missing");
  if (typeof j.items[0].ts !== "string") throw new Error("ts not string");
});
await check("PATCH 标记已处理", async () => {
  const res = await fetch(BASE + "/api/feedback?key=" + encodeURIComponent(id) + "&handled=1", { method: "PATCH", headers: { Authorization: "Bearer " + ADMIN } });
  const j = await res.json(); if (!j.ok || j.handled !== true) throw new Error(JSON.stringify(j));
});
await check("DELETE 删除", async () => {
  const res = await fetch(BASE + "/api/feedback?key=" + encodeURIComponent(id), { method: "DELETE", headers: { Authorization: "Bearer " + ADMIN } });
  const j = await res.json(); if (!j.ok) throw new Error(JSON.stringify(j));
});
console.log(failures === 0 ? "\n线上反馈 D1：全部通过" : "\n线上反馈 D1：失败 " + failures + " 项");
process.exit(failures === 0 ? 0 : 1);
