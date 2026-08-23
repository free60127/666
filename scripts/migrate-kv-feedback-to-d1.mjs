// 存量 KV 反馈 -> D1 feedbacks 迁移（2026-08-23 审查第 7 项）
// 用法：node scripts/migrate-kv-feedback-to-d1.mjs
//   需要环境变量 CF_API_TOKEN / CF_ACCOUNT_ID / CF_KV_NS（与部署一致）
// 输出：scripts/_tmp-feedback-migrate.sql（INSERT OR IGNORE，幂等），再执行：
//   node wrangler.js d1 execute waiyuan-study-db --remote --file=scripts/_tmp-feedback-migrate.sql
// 迁移完成后可选 --delete-after 删除已迁 KV 键（默认不删，保留观察）。
import { writeFileSync, existsSync, rmSync } from "node:fs";

const TOKEN = process.env.CF_API_TOKEN;
const ACCOUNT = process.env.CF_ACCOUNT_ID;
const NS = process.env.CF_KV_NS;
const DELETE_AFTER = process.argv.includes("--delete-after");
if (!TOKEN || !ACCOUNT || !NS) { console.error("缺少 CF_API_TOKEN / CF_ACCOUNT_ID / CF_KV_NS"); process.exit(2); }
const BASE = "https://api.cloudflare.com/client/v4";
const H = { Authorization: "Bearer " + TOKEN };

async function listAll() {
  const out = []; let cursor = null;
  do {
    const url = BASE + "/accounts/" + ACCOUNT + "/storage/kv/namespaces/" + NS + "/keys?prefix=feedback:&limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
    const res = await fetch(url, { headers: H });
    if (!res.ok) { console.error("KV list 失败", res.status, await res.text()); process.exit(1); }
    const j = await res.json();
    for (const k of (j.result || [])) out.push(k.name);
    cursor = (j.result_info && j.result_info.cursor) || null;
  } while (cursor);
  return out;
}

async function getVal(name) {
  const res = await fetch(BASE + "/accounts/" + ACCOUNT + "/storage/kv/namespaces/" + NS + "/values/" + encodeURIComponent(name), { headers: H });
  if (!res.ok) { console.error("KV get 失败", name, res.status); return null; }
  return await res.text();
}

const names = await listAll();
console.log("KV 反馈键数:", names.length);
const esc = s => String(s == null ? "" : s).replace(/\'/g, "\'\''");
const lines = [];
let migrated = 0;
for (const name of names) {
  const raw = await getVal(name);
  if (!raw) continue;
  let rec;
  try { rec = JSON.parse(raw); } catch { console.warn("跳过损坏记录:", name); continue; }
  const ts = Date.parse(rec.ts) || Date.now();
  const sql = "INSERT OR IGNORE INTO feedbacks (id, page, question, answer, type, note, contact, ts, handled, created_at) VALUES (" +
    "\'" + esc(name) + "\', \'" + esc(rec.page) + "\', \'" + esc(rec.question) + "\', \'" + esc(rec.answer) + "\', \'" + esc(rec.type) + "\', \'" + esc(rec.note) + "\', \'" + esc(rec.contact) + "\', " + ts + ", " + (rec.handled ? 1 : 0) + ", " + ts + ");";
  lines.push(sql);
  migrated++;
  if (DELETE_AFTER) {
    const r2 = await fetch(BASE + "/accounts/" + ACCOUNT + "/storage/kv/namespaces/" + NS + "/values/" + encodeURIComponent(name), { method: "DELETE", headers: H });
    if (!r2.ok) console.warn("KV 删除失败:", name, r2.status);
  }
}
const file = "scripts/_tmp-feedback-migrate.sql";
writeFileSync(file, lines.join("\n") + "\n");
console.log("生成 SQL:", file, migrated + " 条");
if (DELETE_AFTER) console.log("已删除 KV 键（--delete-after）。");
