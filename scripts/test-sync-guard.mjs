// 云同步下载限流故障语义单测（审查 2026-08-23：故障必须 503，不再放行）
import worker, { handleSyncDownload } from '../workers/src/index.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } };

// 可编程 fake D1：SQL 子串 → 返回值 / 抛错
function makeDb(handler) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => handler(sql),
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 0 } }),
          };
        },
      };
    },
  };
}

// /api/visit 专用 fake D1：分别模拟 IP 限流、访客限流和统计写入。
function makeVisitDb({ failVisitRate = false } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const key = String(args[0] || '');
          return {
            first: async () => {
              if (failVisitRate && key.startsWith('rate:sync:visit:')) throw new Error('visit rate db down');
              return { count: 1 };
            },
            run: async () => ({ meta: { changes: 0 } }),
          };
        },
      };
    },
    batch: async () => ({}),
  };
}

// 1) 限流 DB 故障 -> 503（写操作保守拒绝，不再放行）
{
  const db = makeDb(() => { throw new Error('db down'); });
  const res = await handleSyncDownload(new Request('https://api.free60127.top/api/sync/download?deviceId=' + 'a'.repeat(64)), { DB: db });
  const body = await res.json();
  check('限流故障 -> 503 服务繁忙', res.status === 503 && body.error === '服务繁忙，请稍后再试');
}

// 2) 限流超限 -> 429，且不再继续查 sync_data
{
  let rateCalls = 0, dataCalls = 0;
  const db = makeDb(sql => {
    if (sql.includes('INTO rate')) { rateCalls++; return { count: 9999 }; }
    if (sql.includes('FROM sync_data')) { dataCalls++; return { payload: '{}', rev: 1, updated_at: 1 }; }
    return null;
  });
  const res = await handleSyncDownload(new Request('https://api.free60127.top/api/sync/download?deviceId=' + 'a'.repeat(64)), { DB: db });
  const body = await res.json();
  check('限流超限 -> 429', res.status === 429 && body.error === 'too many requests, try again later');
  check('超限后不再查询 sync_data', rateCalls === 1 && dataCalls === 0);
}

// 3) 正常下载 -> 200 + rev/payload 透传
{
  const db = makeDb(sql => {
    if (sql.includes('INTO rate')) return { count: 1 };
    if (sql.includes('FROM sync_data')) return { payload: JSON.stringify({ a: 1 }), rev: 5, updated_at: 1750000000000 };
    return null;
  });
  const res = await handleSyncDownload(new Request('https://api.free60127.top/api/sync/download?deviceId=' + 'a'.repeat(64)), { DB: db });
  const body = await res.json();
  check('正常下载 200 + rev/payload', res.status === 200 && body.rev === 5 && body.payload.a === 1);
}

// 4) 非法 deviceId -> 400
{
  const db = makeDb(() => null);
  const res = await handleSyncDownload(new Request('https://api.free60127.top/api/sync/download?deviceId=xyz'), { DB: db });
  check('非法 deviceId -> 400', res.status === 400);
}

// 5) /api/visit 限流 DB 故障 -> 503，不得继续写统计
{
  const db = makeVisitDb({ failVisitRate: true });
  const res = await worker.fetch(new Request('https://api.free60127.top/api/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vid: 'b'.repeat(32), path: '/ok' }),
  }), { DB: db });
  const body = await res.json();
  check('/api/visit 限流故障 -> 503', res.status === 503 && body.error === '服务繁忙，请稍后再试');
}

// 6) /api/visit 拒绝控制字符路径
{
  const db = makeVisitDb();
  const res = await worker.fetch(new Request('https://api.free60127.top/api/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vid: 'c'.repeat(32), path: '/a\u0001b' }),
  }), { DB: db });
  check('/api/visit 控制字符路径 -> 400', res.status === 400);
}

console.log('');
console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
