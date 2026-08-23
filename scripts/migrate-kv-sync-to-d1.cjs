// 存量云同步数据迁移：KV → D1（2026-08-23 云同步迁 D1）
// 用法：CLOUDFLARE_API_TOKEN=xxx node scripts/migrate-kv-sync-to-d1.cjs
// 1) CF API 列出 KV 全部 sync: 前缀键 → 读值（{data, updatedAt, rev?}）
// 2) 生成 SQL 文件（INSERT OR REPLACE INTO sync_data ...，payload 单引号转义）
// 3) cd workers && wrangler d1 execute waiyuan-study-db --remote --file sync-migration.sql
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '0976c770750f5827d8da11fc3475d95d';
const NS = process.env.CF_KV_NS || 'c839167b913f41d8b9bb6eb7eaa04821';
if (!TOKEN) { console.error('需要 CLOUDFLARE_API_TOKEN 环境变量'); process.exit(1); }

const API = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + '/storage/kv/namespaces/' + NS;
async function cf(pathname, opts) {
  const res = await fetch(API + pathname, Object.assign({ headers: { Authorization: 'Bearer ' + TOKEN } }, opts || {}));
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + pathname);
  const j = await res.json().catch(() => ({}));
  if (j.success === false) throw new Error(JSON.stringify(j.errors || []));
  return j.result;
}
function esc(s) { return String(s).replace(/'/g, "''"); }

(async () => {
  let keys = [];
  try {
    const r = await cf('/keys');
    for (const k of r || []) if (k.name && k.name.startsWith('sync:')) keys.push(k.name);
  } catch (e) { console.error('列键失败:', e.message); process.exit(1); }
  console.log('找到 sync 键 ' + keys.length + ' 个');
  if (!keys.length) { console.log('无存量数据，跳过'); return; }
  const lines = [];
  for (const key of keys) {
    let v;
    try { v = await cf('/values/' + encodeURIComponent(key)); }
    catch (e) { console.log('跳过读取失败', key, e.message); continue; }
    if (v === null || v === undefined) { console.log('跳过空值', key); continue; }
    let rec;
    try { rec = JSON.parse(v); } catch (e) { console.log('跳过无法解析', key, String(v).slice(0, 40)); continue; }
    const payload = rec.data !== undefined ? JSON.stringify(rec.data) : v;
    const rev = Number(rec.rev) || Date.now();
    const updatedAt = rec.updatedAt ? Date.parse(rec.updatedAt) || Date.now() : Date.now();
    lines.push("INSERT OR REPLACE INTO sync_data (user_id, payload, rev, updated_at) VALUES ('" + esc(key.slice(5)) + "', '" + esc(payload) + "', " + rev + ", " + updatedAt + ");");
  }
  if (!lines.length) { console.log('没有可迁移的有效数据'); return; }
  const out = path.join(__dirname, '..', 'workers', 'sync-migration.sql');
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log('SQL 已写入 ' + out + '（' + lines.length + ' 行）。');
  console.log('下一步：cd workers && wrangler d1 execute waiyuan-study-db --remote --file sync-migration.sql');
})();
