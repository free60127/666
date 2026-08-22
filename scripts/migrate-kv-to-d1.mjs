// KV → D1 存量数据迁移（2026-08-22）
// 用途：把 KV 里已有的 stats:* / act:* / stats:uv:day:*:*（去重）键一次性复制进 D1 表，
//       生成 SQL 后用 wrangler d1 execute --remote 执行。
// 用法：
//   node scripts/migrate-kv-to-d1.mjs          # 生成 workers/_migrate_kv_to_d1.sql
//   cd workers && node <wrangler> d1 execute waiyuan-study-db --remote --file _migrate_kv_to_d1.sql
import fs from 'node:fs';

const ACCOUNT = '0976c770750f5827d8da11fc3475d95d';
const NS = 'c839167b913f41d8b9bb6eb7eaa04821';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const BASE = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + '/storage/kv/namespaces/' + NS;

if (!TOKEN) { console.error('需要 CLOUDFLARE_API_TOKEN 环境变量'); process.exit(1); }

async function listKeys(prefix) {
  const keys = [];
  let cursor = '';
  do {
    const url = BASE + '/keys?limit=1000&prefix=' + encodeURIComponent(prefix) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
    const data = await res.json();
    if (!data.success) throw new Error('list failed: ' + JSON.stringify(data.errors));
    keys.push(...data.result.map(k => k.name));
    cursor = data.result_info?.cursor || '';
  } while (cursor);
  return keys;
}

async function getValue(name) {
  const res = await fetch(BASE + '/values/' + encodeURIComponent(name), { headers: { Authorization: 'Bearer ' + TOKEN } });
  if (!res.ok) return null;
  return res.text();
}

const statsKeys = await listKeys('stats:');
const actKeys = await listKeys('act:');
console.log('KV 键数：stats:* =', statsKeys.length, 'act:* =', actKeys.length);

const statsInserts = [];
const uvInserts = [];
const actInserts = [];

for (const name of statsKeys) {
  const v = Number(await getValue(name)) || 0;
  if (!v) continue;
  if (name.startsWith('stats:uv:day:') && name.split(':').length >= 5) {
    const parts = name.split(':');
    const day = parts[3];
    const vid = parts.slice(4).join(':');
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && vid) uvInserts.push([day, vid]);
  } else {
    statsInserts.push([name, v]);
  }
}

for (const name of actKeys) {
  const m = name.match(/^act:((?:user|anon):[0-9a-fA-F]{16,}):(\d{4}-\d{2}-\d{2})$/);
  if (!m) continue;
  const raw = await getValue(name);
  if (!raw) continue;
  let rec;
  try { rec = JSON.parse(raw); } catch { continue; }
  actInserts.push([m[1], m[2], (rec.minutes | 0), (rec.learned | 0), (rec.lastTs | 0)]);
}

const out = [];
out.push('-- KV→D1 存量迁移（' + new Date().toISOString() + '）');
for (const [k, v] of statsInserts) {
  out.push('INSERT OR IGNORE INTO stats (key, value) VALUES (' + q(k) + ', ' + v + ');');
}
for (const [day, vid] of uvInserts) {
  out.push('INSERT OR IGNORE INTO uv_seen (day, vid) VALUES (' + q(day) + ', ' + q(vid) + ');');
}
for (const [k, d, min, lrn, last] of actInserts) {
  out.push('INSERT OR IGNORE INTO activity (act_key, date, minutes, learned, last_ts) VALUES (' + q(k) + ', ' + q(d) + ', ' + min + ', ' + lrn + ', ' + last + ');');
}

function q(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

const file = 'workers/_migrate_kv_to_d1.sql';
fs.writeFileSync(file, out.join('\n'));
console.log('生成', file, '行数', out.length, '（stats', statsInserts.length, 'uv', uvInserts.length, 'act', actInserts.length, '）');