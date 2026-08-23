// 存量 KV 反馈 -> D1 feedbacks 迁移（2026-08-23 审查第 7 项；两阶段安全流程，2026-08-23 审查第二轮第 2 项加固）
//
// 两阶段步骤（阶段 1 只读 KV，绝不删除；删除只允许在「导入 + 核对通过」之后的阶段 2 执行）：
//   0. 环境变量：CF_API_TOKEN / CF_ACCOUNT_ID / CF_KV_NS（与部署一致）
//   1. node scripts/migrate-kv-feedback-to-d1.mjs
//        → 只读 KV（feedback: 前缀）生成 scripts/_tmp-feedback-migrate.sql（INSERT OR IGNORE，幂等），不删任何键
//   2. node $W d1 execute waiyuan-study-db --remote --file=scripts/_tmp-feedback-migrate.sql
//        → 导入 D1（$W = wrangler 路径，见 workers/README.md）
//   3. node scripts/migrate-kv-feedback-to-d1.mjs --verify
//        → 核对：D1 已存在的 feedback id 必须覆盖全部 KV 键（数量 + ID）；未覆盖 → exit 1（绝不删除）
//   4. node scripts/migrate-kv-feedback-to-d1.mjs --delete-after
//        → 自动先执行 --verify，核对通过后才删除 KV 键；任一删除失败 → exit 1（保留剩余键）
// 失败保护：任何一步失败（网络/权限/核对不通过）都不会删除任何 KV 键。
// 2026-08-23 审查第 2 轮第 5 项加固：阶段 1 里 KV 读取（非 2xx/网络异常）或记录无法解析
// 一律让迁移失败（exit 1），并先清理旧的 _tmp-feedback-migrate.sql，杜绝「半成品 SQL 被误用」。
//
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";

const TOKEN = process.env.CF_API_TOKEN;
const ACCOUNT = process.env.CF_ACCOUNT_ID;
const NS = process.env.CF_KV_NS;
const DO_VERIFY = process.argv.includes("--verify");
const DO_DELETE = process.argv.includes("--delete-after");
if (!TOKEN || !ACCOUNT || !NS) { console.error("缺少 CF_API_TOKEN / CF_ACCOUNT_ID / CF_KV_NS"); process.exit(2); }
const BASE = "https://api.cloudflare.com/client/v4";
const H = { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" };

// 从 workers/wrangler.jsonc 解析 D1 database_id（避免硬编码漂移）
function readDbId() {
  try {
    const cfg = readFileSync(new URL("../workers/wrangler.jsonc", import.meta.url), "utf8");
    const m = cfg.match(/"database_id"\s*:\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch { return null; }
}
const DB_ID = readDbId();
if (!DB_ID) { console.error("无法从 workers/wrangler.jsonc 解析 database_id"); process.exit(2); }

async function kvListAll() {
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

async function kvGet(name) {
  // 2026-08-23 审查第 2 轮第 5 项：KV 读取失败（非 2xx / 网络异常）必须让阶段 1 失败，
  // 绝不静默跳过并生成不完整 SQL——否则阶段 2 的 --verify 会因数量不匹配而阻塞，
  // 但更危险的是用户误以为阶段 1 完成而直接执行导入。
  let res;
  try {
    res = await fetch(BASE + "/accounts/" + ACCOUNT + "/storage/kv/namespaces/" + NS + "/values/" + encodeURIComponent(name), { headers: H });
  } catch (e) {
    console.error("KV get 网络失败", name, e);
    process.exit(1);
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error("KV get 失败", name, res.status, bodyText);
    process.exit(1);
  }
  return await res.text();
}

async function kvDelete(name) {
  const res = await fetch(BASE + "/accounts/" + ACCOUNT + "/storage/kv/namespaces/" + NS + "/values/" + encodeURIComponent(name), { method: "DELETE", headers: H });
  return res.ok;
}

// D1 核对：返回 D1 中已有 feedback 全部 id（Set）
async function d1FeedbackIds() {
  const res = await fetch(BASE + "/accounts/" + ACCOUNT + "/d1/database/" + DB_ID + "/query", {
    method: "POST", headers: H, body: JSON.stringify({ sql: "SELECT id FROM feedbacks" }),
  });
  if (!res.ok) { console.error("D1 query 失败", res.status, await res.text()); process.exit(1); }
  const j = await res.json();
  if (!j.success) { console.error("D1 query 未成功", JSON.stringify(j.errors || j)); process.exit(1); }
  const ids = new Set();
  for (const batch of (j.result || [])) {
    for (const row of (batch.results || [])) if (row && row.id != null) ids.add(String(row.id));
  }
  return ids;
}

const names = await kvListAll();
console.log("KV 反馈键数:", names.length);

if (DO_VERIFY || DO_DELETE) {
  const d1Ids = await d1FeedbackIds();
  const missing = names.filter(n => !d1Ids.has(String(n)));
  if (missing.length) {
    console.error("核对失败：以下 KV 键在 D1 中不存在（或尚未导入），已拒绝任何删除操作（共 " + missing.length + " 个）：");
    for (const m of missing.slice(0, 20)) console.error("  - " + m);
    if (missing.length > 20) console.error("  … 还有 " + (missing.length - 20) + " 个");
    process.exit(1);
  }
  console.log("核对通过：全部 " + names.length + " 个 KV 键均已在 D1 中存在（数量 + ID 覆盖）。");
  if (DO_VERIFY && !DO_DELETE) { console.log("（--verify 模式：不做任何 KV 删除）"); process.exit(0); }
}

if (!DO_DELETE) {
  // 阶段 1：只读 KV 生成 SQL（不删除）
  // 先清掉上一次可能残留的临时 SQL，避免旧半成品被误当作本次产物（2026-08-23 审查第 2 轮第 5 项）
  try { unlinkSync("scripts/_tmp-feedback-migrate.sql"); } catch (_) {}
  const esc = s => String(s == null ? "" : s).replace(/'/g, "''");
  const lines = [];
  let migrated = 0;
  const bad = [];
  for (const name of names) {
    const raw = await kvGet(name);
    if (!raw) { bad.push(name + "(空)"); continue; }
    let rec;
    try { rec = JSON.parse(raw); } catch (_) { bad.push(name); continue; }
    const ts = Date.parse(rec.ts) || Date.now();
    lines.push("INSERT OR IGNORE INTO feedbacks (id, page, question, answer, type, note, contact, ts, handled, created_at) VALUES (" +
      "'" + esc(name) + "', '" + esc(rec.page) + "', '" + esc(rec.question) + "', '" + esc(rec.answer) + "', '" + esc(rec.type) + "', '" + esc(rec.note) + "', '" + esc(rec.contact) + "', " + ts + ", " + (rec.handled ? 1 : 0) + ", " + ts + ");");
    migrated++;
  }
  // 任何无法读取/解析的记录都让阶段 1 失败：绝不生成「看似完整其实缺行」的 SQL（2026-08-23 审查第 2 轮第 5 项）
  if (bad.length) {
    console.error("阶段 1 终止：有 " + bad.length + " 条记录无法读取或解析，未生成 SQL（已清掉旧临时产物）：");
    for (const b of bad.slice(0, 20)) console.error("  - " + b);
    if (bad.length > 20) console.error("  … 还有 " + (bad.length - 20) + " 条");
    process.exit(1);
  }
  const file = "scripts/_tmp-feedback-migrate.sql";
  writeFileSync(file, lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
  console.log("阶段 1 完成：生成 SQL:", file, migrated + " 条（未删除任何 KV 键）");
  console.log("下一步：用 wrangler d1 execute 导入，然后 node scripts/migrate-kv-feedback-to-d1.mjs --verify 核对，最后 --delete-after 清理。");
  process.exit(0);
}

// 阶段 2：--delete-after（已通过上方核对）
console.log("开始删除 KV 键（--delete-after）…");
let deleted = 0, failed = 0;
for (const name of names) {
  const okDel = await kvDelete(name);
  if (okDel) deleted++;
  else { failed++; console.warn("KV 删除失败:", name); }
}
console.log("删除完成：成功 " + deleted + " / 失败 " + failed + "（共 " + names.length + "）");
if (failed) {
  console.error("失败保护：" + failed + " 个键未删除（见上方警告），请重试 --delete-after；未删键不会被阶段 1 误删。");
  process.exit(1);
}
console.log("全部 KV 键已清理。");
