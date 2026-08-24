/* test-errand.mjs：跑腿平台全链路单测（MemoryD1，无网络）
   用法：node scripts/test-errand.mjs */
import { handleAuth } from '../workers/src/auth.js';
import { handleErrand } from '../workers/src/errand.js';
import { deleteR2Objects, recordPendingR2, pendingR2Keys, retryPendingR2 } from '../workers/src/evidence-store.js';

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};

/* ---------- MemoryD1（auth 相关 + errand 表） ---------- */
class MemoryD1 {
  constructor() {
    this.users = new Map(); this.sessions = new Map();
    this.rates = new Map(); this.loginFails = new Map();
    this.tasks = new Map(); this.nextTaskId = 1;
    this.reviews = new Map(); this.nextReviewId = 1;
    this.disputes = new Map(); this.nextDisputeId = 1;
    this.evidence = new Map(); this.nextEvidenceId = 1;
    this.adminLogs = new Map(); this.nextAdminLogId = 1;
    this.failRates = false;   // 模拟限流存储故障
    this.enforceUniqueDispute = false; // 模拟唯一部分索引
    this.failEvidenceInsert = false; // 模拟证据 D1 元数据写入故障（R2 闭环测试）
    this.failEvidenceKeys = false;   // 模拟证据 R2 键查询（JOIN）故障（第 2 轮 fail-closed 测试）
  }
  prepare(sql) {
    const db = this;
    let bound = { _sql: sql, _args: [] };
    return {
      bind(...args) { bound = { _sql: sql, _args: args }; return this; },
      async first() { return db._first(bound._sql, bound._args); },
      async all() { return db._all(bound._sql, bound._args); },
      async run() { return db._run(bound._sql, bound._args); },
    };
  }
  async batch(statements) {
    const results = [];
    for (const stmt of statements) results.push(await stmt.run());
    return results;
  }
  /* ---- auth 基础 ---- */
  async _first(s, args) {
    if (s.includes('FROM users') && s.includes('WHERE email')) {
      const email = String(args[0]).trim().toLowerCase();
      for (const u of this.users.values()) if (u.email === email) return u;
      return null;
    }
    if (s.includes('FROM sessions') && s.includes('JOIN users')) {
      const [tokenHash, now] = args;
      const sess = this.sessions.get(tokenHash);
      if (!sess || sess.expires_at <= now) return null;
      const u = this.users.get(sess.user_id);
      return u ? { id: u.id, email: u.email, nickname: u.nickname, password_hash: u.password_hash, recovery_encrypted: u.recovery_encrypted } : null;
    }
    if (s.includes('FROM login_fails') && s.includes('WHERE email')) {
      return this.loginFails.get(args[0]) || null;
    }
    if (s.includes('INTO rate') && s.includes('RETURNING count')) {
      if (this.failRates) throw new Error('rate db down');
      const [key, winEnd, winStart] = args;
      const cur = this.rates.get(key);
      if (!cur || cur.until <= winStart) { this.rates.set(key, { count: 1, until: winEnd }); return { count: 1 }; }
      cur.count++; this.rates.set(key, cur);
      return { count: cur.count };
    }
    if (s.includes('SELECT COUNT(*) AS c FROM errand_tasks') && s.includes('status IN') && s.includes('confirmed_at IS NULL')) {
      // 注销拦截：按 publisher/taker 计数进行中任务
      const col = s.includes('publisher_id = ?') ? 'publisher_id' : 'taker_id';
      const userId = String(args[0]);
      const innPart = s.slice(s.indexOf('IN (') + 4, s.indexOf(')', s.indexOf('IN (')));
      const inn = innPart.split(',').map(x => x.replace(/['\s]/g, ''));
      let n = 0;
      for (const t of this.tasks.values()) {
        if (String(t[col]) === userId && inn.includes(t.status) && !t.confirmed_at) n++;
      }
      return { c: n };
    }
    if (s.includes('SELECT COUNT(*) AS c FROM errand_tasks')) {
      let n = 0;
      if (s.includes('t.status')) {
        if (s.includes('!=')) { for (const t of this.tasks.values()) if (t.status !== 'cancelled') n++; }
        else for (const t of this.tasks.values()) if (t.status === args[0]) n++;
      } else if (s.indexOf('WHERE') === -1) {
        n = this.tasks.size;
      } else {
        const w = s.slice(s.indexOf('WHERE'));
        const col = w.includes('t.publisher_id') ? 'publisher_id' : (w.includes('t.taker_id') ? 'taker_id' : null);
        if (col) for (const t of this.tasks.values()) if (t[col] === args[0]) n++;
      }
      return { c: n };
    }
    if (s.includes('FROM errand_tasks') && (s.includes('t.status') || s.includes('t.id'))) {
      const m = s.match(/WHERE\s+t\.id\s*=\s*\?/);
      if (m) return this._taskRow(Number(args[0]));
      // status 查询
      const sm = s.match(/WHERE\s+t\.status\s*=\s*\?/);
      if (sm) {
        const arr = [...this.tasks.values()].filter(t => t.status === args[0]);
        return arr.length ? this._taskRow(arr[0].id) : null;
      }
    }
    if (s.includes('SELECT status, publisher_id FROM errand_tasks')) {
      const t = this.tasks.get(Number(args[0]));
      return t ? { status: t.status, publisher_id: t.publisher_id } : null;
    }
    if (s.includes('SELECT status, publisher_id, deadline FROM errand_tasks')) {
      const t = this.tasks.get(Number(args[0]));
      return t ? { status: t.status, publisher_id: t.publisher_id, deadline: t.deadline } : null;
    }
    if (s.includes('FROM errand_tasks') && s.includes('confirmed_at')) {
      const t = this.tasks.get(Number(args[0]));
      return t ? { id: t.id, publisher_id: t.publisher_id, taker_id: t.taker_id, confirmed_at: t.confirmed_at } : null;
    }
    if (s.includes('SELECT id, publisher_id, taker_id, status FROM errand_tasks')) {
      const t = this.tasks.get(Number(args[0]));
      return t ? { id: t.id, publisher_id: t.publisher_id, taker_id: t.taker_id, status: t.status } : null;
    }
    if (s.includes('SELECT publisher_id, taker_id FROM errand_tasks')) {
      const t = this.tasks.get(Number(args[0]));
      return t ? { publisher_id: t.publisher_id, taker_id: t.taker_id } : null;
    }
    if (s.includes('FROM errand_disputes') && s.includes('WHERE d.id = ?')) {
      const d = this.disputes.get(Number(args[0]));
      if (!d) return null;
      const u = this.users.get(d.user_id);
      return { ...d, user_name: u ? u.nickname : null };
    }
    if (s.includes('FROM errand_disputes') && s.includes("AND status = 'open'")) {
      const [taskId, userId] = args;
      for (const d of this.disputes.values()) if (d.task_id === taskId && d.user_id === userId && d.status === 'open') return d;
      return null;
    }
    if (s.includes('FROM errand_reviews') && s.includes('reviewer_id')) {
      const [taskId, reviewerId] = args;
      for (const r of this.reviews.values()) if (r.task_id === taskId && r.reviewer_id === reviewerId) return r;
      return null;
    }
    if (s.includes('SELECT status, publisher_id, taker_id FROM errand_tasks')) {
      const t = this.tasks.get(Number(args[0]));
      return t ? { status: t.status, publisher_id: t.publisher_id, taker_id: t.taker_id } : null;
    }
    if (s.includes('SELECT COUNT(*) AS c FROM admin_logs')) {
      return { c: this.adminLogs.size };
    }
    if (s.includes('SELECT task_id FROM errand_disputes WHERE id = ?')) {
      const d = this.disputes.get(Number(args[0]));
      return d ? { task_id: d.task_id } : null;
    }
    if (s.includes('FROM errand_evidence') && s.includes('WHERE id = ?')) {
      const e = this.evidence.get(Number(args[0]));
      return e ? { id: e.id, dispute_id: e.dispute_id, data: e.data, url: e.url, mime: e.mime } : null;
    }
    return null;
  }
  _taskRow(id) {
    const t = this.tasks.get(id);
    if (!t) return null;
    const u = this.users.get(t.publisher_id);
    const u2 = t.taker_id ? this.users.get(t.taker_id) : null;
    return { ...t, publisher_name: u ? u.nickname : null, taker_name: u2 ? u2.nickname : null };
  }
  async _all(s, args) {
    // 证据 R2 键查询（evidence-store 的 JOIN 查询）——必须放在 FROM errand_tasks 分支之前，
    // 否则 evidenceKeysForUser 的 SQL 会因包含 JOIN errand_tasks t 被误判为任务查询
    if (s.includes('FROM errand_evidence e') && s.includes('JOIN errand_disputes d')) {
      if (this.failEvidenceKeys) throw new Error('evidence keys down (fake)');
      const urls = [];
      if (s.includes('d.task_id = ?')) {
        const taskId = Number(args[0]);
        for (const d of this.disputes.values()) {
          if (d.task_id !== taskId) continue;
          for (const e of this.evidence.values()) if (e.dispute_id === d.id && e.url) urls.push(e.url);
        }
      } else {
        const uid = String(args[0]);
        for (const d of this.disputes.values()) {
          const t = this.tasks.get(d.task_id);
          const related = String(d.user_id) === uid || (t && (String(t.publisher_id) === uid || String(t.taker_id) === uid));
          if (!related) continue;
          for (const e of this.evidence.values()) if (e.dispute_id === d.id && e.url) urls.push(e.url);
        }
      }
      return { results: urls.map(url => ({ url })) };
    }
    if (s.includes('FROM errand_tasks')) {
      const results = [];
      const w = s.slice(s.indexOf('WHERE'));
      const col = w.includes('t.publisher_id') ? 'publisher_id' : (w.includes('t.taker_id') ? 'taker_id' : null);
      if (s.includes('WHERE t.status')) {
        const arr = s.includes('!=')
          ? [...this.tasks.values()].filter(x => x.status !== 'cancelled')
          : [...this.tasks.values()].filter(x => x.status === args[0]);
        for (const t of arr.sort((a, b) => b.created_at - a.created_at)) results.push(this._taskRow(t.id));
      } else if (col) {
        for (const t of [...this.tasks.values()].filter(x => x[col] === args[0]).sort((a, b) => b.created_at - a.created_at))
          results.push(this._taskRow(t.id));
      } else {
        for (const t of [...this.tasks.values()].sort((a, b) => b.created_at - a.created_at)) results.push(this._taskRow(t.id));
      }
      const pageSize = Number(args[args.length - 2]), offset = Number(args[args.length - 1]);
      return { results: results.slice(offset, offset + pageSize) };
    }
    if (s.includes('FROM errand_disputes d')) {
      const tm = s.match(/WHERE d\.task_id = \?/);
      let arr = [...this.disputes.values()];
      if (tm) arr = arr.filter(d => d.task_id === Number(args[0]));
      return { results: arr.sort((a, b) => b.created_at - a.created_at).map(d => ({ ...d, user_name: (this.users.get(d.user_id) || {}).nickname || null })) };
    }
    if (s.includes('FROM errand_tasks') && s.indexOf('WHERE') === -1) {
      const all = [...this.tasks.values()].sort((a, b) => b.created_at - a.created_at);
      const pageSize = Number(args[args.length - 2]), offset = Number(args[args.length - 1]);
      return { results: all.slice(offset, offset + pageSize).map(t => this._taskRow(t.id)) };
    }
    if (s.includes('FROM errand_evidence')) {
      const did = Number(args[0]);
      const arr = [...this.evidence.values()].filter(e => e.dispute_id === did).sort((a, b) => a.id - b.id);
      return { results: arr.map(e => ({ id: e.id, data: e.data, created_at: e.created_at, url: e.url, size: e.size, sha256: e.sha256, mime: e.mime })) };
    }
    if (s.includes('FROM errand_reviews')) {
      const taskId = Number(args[0]);
      const arr = [...this.reviews.values()].filter(r => r.task_id === taskId).sort((a, b) => b.created_at - a.created_at);
      return { results: arr.map(r => ({ ...r, reviewer_name: (this.users.get(r.reviewer_id) || {}).nickname || null })) };
    }
    if (s.includes('FROM admin_logs')) {
      const arr = [...this.adminLogs.values()].sort((a, b) => b.id - a.id);
      const pageSize = Number(args[args.length - 2]), offset = Number(args[args.length - 1]);
      return { results: arr.slice(offset, offset + pageSize) };
    }
    return { results: [] };
  }
  async _run(s, args) {
    // takeTask 特判：WHERE 含 (deadline IS NULL OR deadline > ?) OR 组，通用解析器不支持
    if (s.startsWith('UPDATE errand_tasks') && s.includes('deadline > ?')) {
      const [takerId, nowMs, id, userId] = args;
      const t = this.tasks.get(id);
      if (!t || t.status !== 'open' || t.publisher_id === userId) return { meta: { changes: 0 } };
      if (t.deadline !== null && t.deadline !== undefined && Number(t.deadline) <= nowMs) return { meta: { changes: 0 } };
      t.status = 'doing'; t.taker_id = takerId; t.updated_at = nowMs;
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('UPDATE errand_tasks') && s.includes('status IN')) {
      // cancelTask 特判：WHERE status IN ('open','doing') AND (publisher_id=? OR (status='doing' AND taker_id=?))
      const [cancelledAt, reason, updatedAt, id, publisherId, takerId] = args;
      const t = this.tasks.get(id);
      if (!t) return { meta: { changes: 0 } };
      const okPub = String(t.publisher_id) === String(publisherId) && (t.status === 'open' || t.status === 'doing');
      const okTak = String(t.taker_id) === String(takerId) && t.status === 'doing';
      if (!okPub && !okTak) return { meta: { changes: 0 } };
      t.status = 'cancelled'; t.cancelled_at = cancelledAt; t.cancel_reason = reason; t.updated_at = updatedAt;
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO errand_disputes')) {
      const [task_id, user_id, role, reason, detail, created_at, updated_at] = args;
      if (this.enforceUniqueDispute) {
        for (const d of this.disputes.values()) if (d.task_id === task_id && d.user_id === user_id && d.status === 'open') {
          throw new Error('UNIQUE constraint failed: errand_disputes.task_id, errand_disputes.user_id');
        }
      }
      const id = this.nextDisputeId++;
      this.disputes.set(id, { id, task_id, user_id, role, reason, detail, status: 'open', admin_note: '', created_at, updated_at });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (s.startsWith('INSERT INTO errand_evidence')) {
      if (this.failEvidenceInsert) throw new Error('evidence insert down');
      const [dispute_id, data, created_at] = args;
      const id = this.nextEvidenceId++;
      let rec = { id, dispute_id, data, created_at };
      // R2 分支 SQL：data 保持 NOT NULL，用空字符串表示内容在 R2；
      // bind 7 参为 (dispute_id, data, url, size, sha256, mime, created_at)。
      // 兼容旧测试替身曾使用的 NULL 形式，避免测试实现绑定到已淘汰的 SQL 文本。
      if (s.includes('INSERT INTO errand_evidence') && s.includes('url') && args.length >= 7) {
        rec = { id, dispute_id: args[0], data: args[1], url: args[2], size: args[3], sha256: args[4], mime: args[5], created_at: args[6] };
      } else if (s.includes(', NULL,') && args.length >= 6) {
        rec = { id, dispute_id: args[0], data: null, url: args[1], size: args[2], sha256: args[3], mime: args[4], created_at: args[5] };
      }
      this.evidence.set(id, rec);
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('UPDATE errand_disputes')) {
      const [st, note, now, id] = args;
      const d = this.disputes.get(id);
      if (!d || d.status !== 'open') return { meta: { changes: 0 } };
      d.status = st; d.admin_note = note; d.updated_at = now;
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO admin_logs')) {
      const [action, detail, admin, created_at] = args;
      const id = this.nextAdminLogId++;
      this.adminLogs.set(id, { id, action, detail, admin, created_at });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('DELETE FROM errand_tasks')) {
      const id = Number(args[0]);
      if (!this.tasks.has(id)) return { meta: { changes: 0 } };
      this.tasks.delete(id);
      const revIds = [...this.reviews.values()].filter(r => r.task_id === id).map(r => r.id);
      revIds.forEach(rid => this.reviews.delete(rid));
      const disIds = [...this.disputes.values()].filter(d => d.task_id === id).map(d => d.id);
      disIds.forEach(did => { this.disputes.delete(did); for (const eid of [...this.evidence.keys()]) if (this.evidence.get(eid).dispute_id === did) this.evidence.delete(eid); });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO errand_reviews')) {
      const [task_id, reviewer_id, reviewee_id, rating, comment, created_at] = args;
      const id = this.nextReviewId++;
      this.reviews.set(id, { id, task_id, reviewer_id, reviewee_id, rating, comment, created_at });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (s.startsWith('INSERT INTO users')) {
      const [id, email, password_hash, nickname, recovery_encrypted, created_at, updated_at] = args;
      this.users.set(id, { id, email, password_hash, nickname, recovery_encrypted, created_at, updated_at });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO sessions')) {
      const [tokenHash, user_id, created_at, expires_at] = args;
      this.sessions.set(tokenHash, { token: tokenHash, user_id, created_at, expires_at });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO errand_tasks')) {
      const [publisher_id, title, description, reward, pickup, dropoff, contact, deadline, created_at, updated_at] = args;
      const id = this.nextTaskId++;
      this.tasks.set(id, { id, publisher_id, title, description, reward, pickup, dropoff, contact, deadline, status: 'open', taker_id: null, created_at, updated_at, completed_at: null, confirmed_at: null, confirmed_by: null, auto_confirmed_at: null, cancelled_at: null, cancel_reason: '' });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (s.startsWith('UPDATE errand_tasks')) {
      // 解析 SET 与 WHERE（支持 ? 占位与 '字面量'）
      const setPart = s.slice(s.indexOf('SET') + 3, s.indexOf('WHERE'));
      const sets = [];
      const setRe = /([a-z_]+)\s*=\s*(?:\?|'([^']*)')/g;
      let m, argIdx = 0;
      while ((m = setRe.exec(setPart))) {
        sets.push([m[1], m[2] !== undefined ? m[2] : args[argIdx++]]);
      }
      const wherePart = s.slice(s.indexOf('WHERE') + 5);
      const conds = [];
      const condRe = /([a-z_]+)\s*(=|!=)\s*(?:\?|'([^']*)')|([a-z_]+)\s+IS\s+NULL/g;
      while ((m = condRe.exec(wherePart))) {
        if (m[4]) conds.push({ col: m[4], op: 'IS NULL', val: null });
        else conds.push({ col: m[1], op: m[2], val: m[3] !== undefined ? m[3] : args[argIdx++] });
      }
      const match = (t) => conds.every(c => {
        const v = t[c.col];
        if (c.op === 'IS NULL') return v === null || v === undefined;
        return c.op === '!=' ? String(v) !== String(c.val) : String(v) === String(c.val);
      });
      let changes = 0;
      for (const t of this.tasks.values()) {
        if (match(t)) { for (const [col, val] of sets) t[col] = val; changes++; }
      }
      return { meta: { changes } };
    }
    if (s.startsWith('DELETE FROM errand_disputes')) {
      const id = Number(args[0]);
      if (!this.disputes.has(id)) return { meta: { changes: 0 } };
      this.disputes.delete(id);
      for (const eid of [...this.evidence.keys()]) if (this.evidence.get(eid).dispute_id === id) this.evidence.delete(eid);
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('DELETE FROM sessions')) {
      const [tokenHash] = args;
      return { meta: { changes: this.sessions.delete(tokenHash) ? 1 : 0 } };
    }
    return { meta: { changes: 0 } };
  }
}

/* ---------- 请求封装 ---------- */
const db = new MemoryD1();
const kvStore = new Map();
const studyKv = {
  failGet: false,      // 模拟 KV 读取故障（pending 状态未知）
  failDeleteKv: false, // 模拟 KV 清空失败（不能谎报 pending=0）
  async get(k) { if (this.failGet) throw new Error('fake KV get down'); return kvStore.has(k) ? kvStore.get(k) : null; },
  async put(k, v) { kvStore.set(k, v); },
  async delete(k) { if (this.failDeleteKv) throw new Error('fake KV delete down'); kvStore.delete(k); },
};
const env = { DB: db, STUDY_KV: studyKv, ADMIN_TOKEN: 'admin-token', SMTP_TEST_MODE: true, SMTP_SENT: [] };

/* fake R2（2026-08-23 审查第 6 项闭环）：不依赖真实 bucket 的本地测试替身 */
const fakeR2 = {
  store: new Map(),
  puts: 0,
  deletes: 0,
  failPut: false,
  failAtPut: 0, // 第 N 次 put 抛错（模拟部分成功后的写入故障）
  async put(key, value, opts) {
    this.puts++;
    if (this.failPut || (this.failAtPut && this.puts >= this.failAtPut)) throw new Error('fake R2 put down');
    this.store.set(key, value);
  },
  failDelete: false, // 第 2 轮：模拟 R2 对象删除失败（pending 重试测试）
  async delete(key) { this.deletes++; if (this.failDelete) throw new Error('fake R2 delete down'); this.store.delete(key); },
  async get(key) { const v = this.store.get(key); return v === undefined ? null : { body: v }; },
};
async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const u = new URL('https://api.test' + path);
  const req = new Request(u, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (u.pathname.startsWith('/api/auth')) return handleAuth(req, env, u.pathname);
  return handleErrand(req, env, u.pathname);
}
const data = async (r) => { let d = null; try { d = await r.json(); } catch (_) {} return d; };

/* ---------- 用例 ---------- */
console.log('0) 准备账号');
const ra = await api('/api/auth/register', { method: 'POST', body: { email: 'pub@test.com', password: 'secret123', nickname: '发布者' } });
check('注册发布者 201', ra.status === 201);
const la = await api('/api/auth/login', { method: 'POST', body: { email: 'pub@test.com', password: 'secret123' } });
const tokenA = (await data(la)).token;
const rb = await api('/api/auth/register', { method: 'POST', body: { email: 'taker@test.com', password: 'secret123', nickname: '跑腿员' } });
check('注册接单者 201', rb.status === 201);
const lb = await api('/api/auth/login', { method: 'POST', body: { email: 'taker@test.com', password: 'secret123' } });
const tokenB = (await data(lb)).token;
const rc = await api('/api/auth/register', { method: 'POST', body: { email: 'other@test.com', password: 'secret123', nickname: '路人' } });
const lc = await api('/api/auth/login', { method: 'POST', body: { email: 'other@test.com', password: 'secret123' } });
const tokenC = (await data(lc)).token;
check('三账号就绪', tokenA && tokenB && tokenC);

console.log('1) 发布任务');
const noAuth = await api('/api/errand/tasks', { method: 'POST', body: { title: 'x' } });
check('未登录发布 401', noAuth.status === 401);
const badTitle = await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '   ' } });
check('空标题 400', badTitle.status === 400);
const badReward = await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '取快递', reward: -1 } });
check('负赏金 400', badReward.status === 400);
const badDeadline = await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '取快递', reward: 5, deadline: Date.now() - 1000 } });
check('过去截止时间 400', badDeadline.status === 400);
const ok = await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '帮取快递', description: '中通，菜鸟驿站 3 号柜', reward: 5, pickup: '菜鸟驿站', dropoff: '女生宿舍 3 栋', contact: '13800000000', deadline: Date.now() + 3600e3 } });
check('正常发布 201', ok.status === 201, String(ok.status));
const task1 = (await data(ok)).task;
check('返回任务字段', task1 && task1.id === 1 && task1.status === 'open' && task1.reward === 5 && task1.publisherName === '发布者');

console.log('2) 列表与详情');
const list = await data(await api('/api/errand/tasks'));
check('默认列表 open 1 条', list.items.length === 1 && list.total === 1);
const listAll = await data(await api('/api/errand/tasks?status=all'));
check('status=all 排除 cancelled', listAll.total === 1);
const det = await data(await api('/api/errand/tasks/1'));
check('匿名详情字段完整但联系方式脱敏', det.task && det.task.pickup === '菜鸟驿站' && det.task.contact === '');
const detPub = await data(await api('/api/errand/tasks/1', { token: tokenA }));
check('发布者可见联系方式', detPub.task.contact === '13800000000');
const detOther = await data(await api('/api/errand/tasks/1', { token: tokenC }));
check('路人详情联系方式脱敏', detOther.task.contact === '');
const det404 = await api('/api/errand/tasks/999');
check('不存在 404', det404.status === 404);

console.log('3) 接单（原子抢占 + 权限）');
const selfTake = await api('/api/errand/tasks/1/take', { method: 'POST', token: tokenA });
check('发布者不能接自己的单 400', selfTake.status === 400);
const take = await data(await api('/api/errand/tasks/1/take', { method: 'POST', token: tokenB }));
check('B 接单成功 doing', take.ok === true && take.task.status === 'doing' && take.task.takerId !== null);
const again = await api('/api/errand/tasks/1/take', { method: 'POST', token: tokenC });
check('已被接走 409', again.status === 409);
const det2 = await data(await api('/api/errand/tasks/1'));
check('详情显示接单者昵称', det2.task.takerName === '跑腿员');
const detB = await data(await api('/api/errand/tasks/1', { token: tokenB }));
check('接单成功后接单者可见联系方式', detB.task.contact === '13800000000');

console.log('4) 完成 + 确认');
const wrongComplete = await api('/api/errand/tasks/1/complete', { method: 'POST', token: tokenC });
check('路人不能标记完成 400', wrongComplete.status === 400);
const complete = await data(await api('/api/errand/tasks/1/complete', { method: 'POST', token: tokenB }));
check('B 标记完成 done', complete.ok === true && complete.task.status === 'done' && complete.task.completedAt !== null);
const wrongConfirm = await api('/api/errand/tasks/1/confirm', { method: 'POST', token: tokenB });
check('接单者不能确认 400', wrongConfirm.status === 400);
const confirm = await data(await api('/api/errand/tasks/1/confirm', { method: 'POST', token: tokenA }));
check('发布者确认 confirmed_at', confirm.ok === true && confirm.task.confirmedAt !== null);
const confirmAgain = await api('/api/errand/tasks/1/confirm', { method: 'POST', token: tokenA });
check('重复确认 400', confirmAgain.status === 400);

console.log('5) 取消');
const t2 = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '带饭', reward: 3, pickup: '二食堂', dropoff: '图书馆', contact: '13900000000' } }));
const doneCancel = await api('/api/errand/tasks/1/cancel', { method: 'POST', token: tokenA, body: { reason: 'x' } });
check('已完成不能取消 400', doneCancel.status === 400);
const pubCancel = await data(await api('/api/errand/tasks/' + t2.task.id + '/cancel', { method: 'POST', token: tokenA, body: { reason: '自己去了' } }));
check('发布者取消待接单', pubCancel.ok === true && pubCancel.task.status === 'cancelled' && pubCancel.task.cancelReason === '自己去了');
const listAfterCancel = await data(await api('/api/errand/tasks?status=all'));
check('all 列表不含已取消（1 条）', listAfterCancel.total === 1);
const t3 = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '送文件', reward: 8, pickup: '行政楼', dropoff: '教学楼', contact: '13900000000' } }));
await api('/api/errand/tasks/' + t3.task.id + '/take', { method: 'POST', token: tokenB });
const takerCancel = await data(await api('/api/errand/tasks/' + t3.task.id + '/cancel', { method: 'POST', token: tokenB }));
check('接单者取消进行中', takerCancel.ok === true && takerCancel.task.status === 'cancelled' && takerCancel.task.cancelReason === '接单者取消');

console.log('6) 我的任务');
const minePosted = await data(await api('/api/errand/mine?role=posted', { token: tokenA }));
check('我发布的 3 条', minePosted.items.length === 3);
const mineTaken = await data(await api('/api/errand/mine?role=taken', { token: tokenB }));
check('我接的 2 条', mineTaken.items.length === 2);
const mineNoAuth = await api('/api/errand/mine?role=posted');
check('未登录 mine 401', mineNoAuth.status === 401);

console.log('7) 发布限流');
let hit429 = false;
for (let i = 0; i < 31; i++) {
  const r = await api('/api/errand/tasks', { method: 'POST', token: tokenB, body: { title: '刷单' + i, reward: 1, pickup: 'A', dropoff: 'B', contact: '13900000000' } });
  if (r.status === 429) { hit429 = true; break; }
}
check('第 31 次发布触发 429', hit429);

console.log('8) 截止时间过期：不可接单 + 自动取消');
const tExp = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '过期任务', reward: 2, pickup: 'A', dropoff: 'B', contact: '13900000000', deadline: Date.now() + 3600e3 } }));
db.tasks.get(tExp.task.id).deadline = Date.now() - 1000; // 直接改内存模拟过期
const expTake = await api('/api/errand/tasks/' + tExp.task.id + '/take', { method: 'POST', token: tokenB });
check('过期任务接单被拒 409', expTake.status === 409);
const expBody = await data(expTake);
check('过期任务自动置为 cancelled', expBody.status === 'cancelled' && expBody.error.includes('已过期'));
const tExp2 = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '过期任务2', reward: 2, pickup: 'A', dropoff: 'B', contact: '13900000000', deadline: Date.now() + 3600e3 } }));
db.tasks.get(tExp2.task.id).deadline = Date.now() - 1000;
const expList = await data(await api('/api/errand/tasks?status=open'));
  // 过期任务仍会出现在 open 列表（前端展示已过期徽标 + 禁用接单；cron 兜底清理为 cancelled）
check('过期任务在 open 列表可见（前端标记已过期）', expList.items.some(t => t.id === tExp2.task.id));

console.log('9) 评价（确认完成后双方互评）');
// 任务1 已确认：A 评 B
const revNoAuth = await api('/api/errand/reviews', { method: 'POST', body: { taskId: 1, rating: 5 } });
check('未登录评价 401', revNoAuth.status === 401);
const revBadRating = await api('/api/errand/reviews', { method: 'POST', token: tokenA, body: { taskId: 1, rating: 6 } });
check('评分越界 400', revBadRating.status === 400);
const revOther = await api('/api/errand/reviews', { method: 'POST', token: tokenC, body: { taskId: 1, rating: 5 } });
check('路人不能评价 403', revOther.status === 403);
const revA = await api('/api/errand/reviews', { method: 'POST', token: tokenA, body: { taskId: 1, rating: 5, comment: '跑得快' } });
check('A 评价 B 201', revA.status === 201);
const revDup = await api('/api/errand/reviews', { method: 'POST', token: tokenA, body: { taskId: 1, rating: 4 } });
check('重复评价 400', revDup.status === 400);
// 新任务走完闭环：B 评 A
const tRev = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '评价闭环', reward: 3, pickup: 'X', dropoff: 'Y', contact: '13900000000' } }));
await api('/api/errand/tasks/' + tRev.task.id + '/take', { method: 'POST', token: tokenB });
await api('/api/errand/tasks/' + tRev.task.id + '/complete', { method: 'POST', token: tokenB });
await api('/api/errand/tasks/' + tRev.task.id + '/confirm', { method: 'POST', token: tokenA });
const revBeforeConfirm = await api('/api/errand/reviews', { method: 'POST', token: tokenA, body: { taskId: tRev.task.id, rating: 5 } });
// 上面 confirm 已确认，直接 B 评 A
const revB = await api('/api/errand/reviews', { method: 'POST', token: tokenB, body: { taskId: tRev.task.id, rating: 4, comment: '联系顺畅' } });
check('B 评价 A 201', revB.status === 201);
const revList1 = await data(await api('/api/errand/reviews?taskId=1'));
check('任务1 评价列表 1 条', revList1.reviews.length === 1 && revList1.reviews[0].reviewerName === '发布者' && revList1.reviews[0].rating === 5);
const revList2 = await data(await api('/api/errand/reviews?taskId=' + tRev.task.id));
check('新任务互评 2 条（双方各一条）', revList2.reviews.length === 2 && revList2.reviews.some(r => r.reviewerName === '跑腿员') && revList2.reviews.some(r => r.reviewerName === '发布者'));
const revAnon = await data(await api('/api/errand/reviews?taskId=1'));
check('匿名可看评价列表', revAnon.reviews.length === 1);
// 未确认任务不可评：新建任务只接单不确认
const tUn = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '未确认', reward: 1, pickup: 'A', dropoff: 'B', contact: '13900000000' } }));
await api('/api/errand/tasks/' + tUn.task.id + '/take', { method: 'POST', token: tokenB });
const revUn = await api('/api/errand/reviews', { method: 'POST', token: tokenA, body: { taskId: tUn.task.id, rating: 5 } });
check('未确认任务不能评价 400', revUn.status === 400);

/* ---------- 10) 申诉（doing/done/confirmed 可申诉 + 证据上传） ---------- */
console.log('10) 申诉（doing/done/confirmed 可申诉 + 证据上传）');
const dNoAuth = await api('/api/errand/disputes', { method: 'POST', body: { taskId: 1, reason: 'x' } });
check('未登录申诉 401', dNoAuth.status === 401);
const tOpen = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '申诉测试open', reward: 1, pickup: 'A', dropoff: 'B', contact: '13900000000' } }));
const dOpen = await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tOpen.task.id, reason: 'x' } });
check('open 状态任务不能申诉 400', dOpen.status === 400);
const dOther = await api('/api/errand/disputes', { method: 'POST', token: tokenC, body: { taskId: 1, reason: 'x' } });
check('路人申诉 403', dOther.status === 403, String(dOther.status) + ' ' + JSON.stringify(await data(dOther)));
const dOk = await data(await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: 1, reason: '对方没送到', detail: '放在错误的楼栋', evidence: ['data:image/png;base64,AAAA', 'data:image/jpeg;base64,BBBB', 'data:text/plain;base64,CCCC'] } }));
check('A 申诉 201（role=publisher）', dOk.ok === true && dOk.dispute.role === 'publisher' && dOk.dispute.status === 'open', JSON.stringify(dOk));
check('证据 2 张入库（非法 1 张跳过）', db.evidence.size === 2, 'evidence=' + db.evidence.size + ' disputes=' + db.disputes.size);
const dDup = await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: 1, reason: 'again' } });
check('重复 open 申诉 400', dDup.status === 400);
const dTaker = await data(await api('/api/errand/disputes', { method: 'POST', token: tokenB, body: { taskId: 1, reason: '对方不确认', detail: '已送达但对方拖延' } }));
check('B 申诉 201（role=taker）', dTaker.ok === true && dTaker.dispute.role === 'taker', JSON.stringify(dTaker));
const dListPub = await data(await api('/api/errand/disputes?taskId=1', { token: tokenA }));
check('发布者可见申诉列表 2 条', dListPub.disputes.length === 2);
const dListTaker = await data(await api('/api/errand/disputes?taskId=1', { token: tokenB }));
check('接单者可见申诉列表 2 条', dListTaker.disputes.length === 2);
const dListOther = await api('/api/errand/disputes?taskId=1', { token: tokenC });
check('路人查看申诉 403', dListOther.status === 403);
const dListAnon = await api('/api/errand/disputes?taskId=1');
check('匿名查看申诉 403', dListAnon.status === 403);
const dAdminNoAuth = await api('/api/errand/disputes');
check('admin 全量申诉无 token 401', dAdminNoAuth.status === 401);
const dAdmin = await data(await api('/api/errand/disputes', { token: 'admin-token' }));
check('admin 全量申诉含昵称', dAdmin.disputes.length >= 2 && dAdmin.disputes.some(d => d.userName === '发布者'), JSON.stringify(dAdmin));

/* ---------- 11) 管理端（任务列表 / 删除 / 申诉处理） ---------- */
console.log('11) 管理端（任务列表 / 删除 / 申诉处理）');
const aTasksNoAuth = await api('/api/errand/admin/tasks');
check('adminTasks 无 token 401', aTasksNoAuth.status === 401);
const aTasks = await data(await api('/api/errand/admin/tasks?pageSize=50', { token: 'admin-token' }));
check('adminTasks 全量含联系方式', aTasks.total >= 4 && aTasks.items.some(t => t.contact === '13800000000'), 'total=' + aTasks.total + ' ' + JSON.stringify(aTasks.items && aTasks.items[0]));
const aTasksOpen = await data(await api('/api/errand/admin/tasks?status=open', { token: 'admin-token' }));
check('adminTasks 按状态筛选', aTasksOpen.items.length > 0 && aTasksOpen.items.every(t => t.status === 'open'));
const aTasksBad = await api('/api/errand/admin/tasks?status=xx', { token: 'admin-token' });
check('非法状态 400', aTasksBad.status === 400);
const disputeId = dOk.dispute.id;
const resNoAuth = await api('/api/errand/admin/disputes/' + disputeId, { method: 'PATCH', body: { status: 'resolved', note: 'x' } });
check('处理申诉无 token 401', resNoAuth.status === 401);
const resBad = await api('/api/errand/admin/disputes/' + disputeId, { method: 'PATCH', token: 'admin-token', body: { status: 'banana' } });
check('非法处理状态 400', resBad.status === 400);
const resOk = await data(await api('/api/errand/admin/disputes/' + disputeId, { method: 'PATCH', token: 'admin-token', body: { status: 'resolved', note: '已核实，双方和解' } }));
check('处理申诉 resolved + 备注', resOk.ok === true && resOk.dispute.status === 'resolved' && resOk.dispute.adminNote === '已核实，双方和解');
const resAgain = await api('/api/errand/admin/disputes/' + disputeId, { method: 'PATCH', token: 'admin-token', body: { status: 'rejected' } });
check('重复处理 400', resAgain.status === 400);
const delNoAuth = await api('/api/errand/admin/tasks/' + tOpen.task.id, { method: 'DELETE' });
check('删除任务无 token 401', delNoAuth.status === 401);
const del = await api('/api/errand/admin/tasks/' + tOpen.task.id, { method: 'DELETE', token: 'admin-token' });
check('删除任务 ok', del.status === 200);
const delAfter = await api('/api/errand/tasks/' + tOpen.task.id);
check('删除后详情 404', delAfter.status === 404);
const del404 = await api('/api/errand/admin/tasks/99999', { method: 'DELETE', token: 'admin-token' });
check('删除不存在 404', del404.status === 404);
const tDel = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '待删除', reward: 2, pickup: 'A', dropoff: 'B', contact: '13900000000' } }));
await api('/api/errand/tasks/' + tDel.task.id + '/take', { method: 'POST', token: tokenB });
await api('/api/errand/tasks/' + tDel.task.id + '/complete', { method: 'POST', token: tokenB });
const dDel = await data(await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tDel.task.id, reason: '删除测试', evidence: ['data:image/png;base64,DDDD'] } }));
const evBefore = db.evidence.size;
await api('/api/errand/admin/tasks/' + tDel.task.id, { method: 'DELETE', token: 'admin-token' });
check('删除任务级联清申诉与证据', !db.disputes.has(dDel.dispute.id) && db.evidence.size === evBefore - 1);

/* ---------- 12) 注销拦截：进行中跑腿单禁止注销 ---------- */
console.log('12) 注销拦截：进行中跑腿单禁止注销');
const rd = await data(await api('/api/auth/register', { method: 'POST', body: { email: 'del@test.com', password: 'secret123', nickname: '注销员' } }));
const ld = await api('/api/auth/login', { method: 'POST', body: { email: 'del@test.com', password: 'secret123' } });
const tokenD = (await data(ld)).token;
check('D 账号就绪', !!tokenD);
const tDel1 = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenD, body: { title: '注销前任务', reward: 2, pickup: 'A', dropoff: 'B', contact: '13900000000' } }));
const delBlocked = await api('/api/auth/delete-account', { method: 'POST', token: tokenD, body: { password: 'secret123' } });
check('有进行中任务注销被拒 400', delBlocked.status === 400 && (await data(delBlocked)).error.includes('跑腿'), JSON.stringify(await data(delBlocked)));
await api('/api/errand/tasks/' + tDel1.task.id + '/cancel', { method: 'POST', token: tokenD, body: { reason: '清理' } });
const delOk = await api('/api/auth/delete-account', { method: 'POST', token: tokenD, body: { password: 'secret123' } });
check('任务取消后可注销 200', delOk.status === 200);
const delBadPw = await api('/api/auth/delete-account', { method: 'POST', token: tokenD, body: { password: 'wrong' } });
check('注销密码错误 401', delBadPw.status === 401);

/* ---------- 13) 证据读取 API（管理端或任务双方） ---------- */
console.log('13) 证据读取 API');
const evNoAuth = await api('/api/errand/disputes/' + disputeId + '/evidence');
check('证据无 token 401', evNoAuth.status === 401);
const evOther = await api('/api/errand/disputes/' + disputeId + '/evidence', { token: tokenC });
check('证据路人 403', evOther.status === 403);
const evPub = await data(await api('/api/errand/disputes/' + disputeId + '/evidence', { token: tokenA }));
check('证据发布者可见 2 张（列表仅元数据）', evPub.evidence.length === 2 && evPub.evidence[0].data === undefined && evPub.evidence[0].stored === 'd1');
const evDlPub = await api('/api/errand/evidence/' + evPub.evidence[0].id, { token: tokenA });
check('发布者经保护端点下载 base64 证据 200', evDlPub.status === 200 && evDlPub.headers.get('content-type') === 'image/png');
const evTaker = await data(await api('/api/errand/disputes/' + disputeId + '/evidence', { token: tokenB }));
check('证据接单者可见 2 张', evTaker.evidence.length === 2);
const evAdmin = await data(await api('/api/errand/disputes/' + disputeId + '/evidence', { token: 'admin-token' }));
check('证据管理员可见', evAdmin.evidence.length === 2);
const ev404 = await api('/api/errand/disputes/99999/evidence', { token: 'admin-token' });
check('证据不存在申诉 404', ev404.status === 404);

/* ---------- 14) 隐藏内部 ID（评价/申诉公开脱敏） ---------- */
console.log('14) 隐藏内部 ID');
const revPub2 = await data(await api('/api/errand/reviews?taskId=1'));
check('评价公开列表无 reviewerId/revieweeId', revPub2.reviews.length === 1 && revPub2.reviews[0].reviewerId === undefined && revPub2.reviews[0].revieweeId === undefined);
const dListPub2 = await data(await api('/api/errand/disputes?taskId=1', { token: tokenA }));
check('申诉双方视图无 userId', dListPub2.disputes.length === 2 && dListPub2.disputes.every(d => d.userId === undefined));
const dAdmin2 = await data(await api('/api/errand/disputes', { token: 'admin-token' }));
check('管理端申诉仍含 userId', dAdmin2.disputes.length >= 2 && dAdmin2.disputes.every(d => d.userId !== undefined));

/* ---------- 15) 限流存储故障：写操作保守失败 503 ---------- */
console.log('15) 限流存储故障 503');
db.failRates = true;
const rateFail = await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '限流故障', reward: 1, pickup: 'A', dropoff: 'B', contact: '13900000000' } });
check('限流故障时发布 503', rateFail.status === 503);
db.failRates = false;
const rateOk = await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '限流恢复', reward: 1, pickup: 'A', dropoff: 'B', contact: '13900000000' } });
check('限流恢复后发布 201', rateOk.status === 201);

/* ---------- 16) 申诉限流：用户 60s/5 次 ---------- */
console.log('16) 申诉限流');
const re = await data(await api('/api/auth/register', { method: 'POST', body: { email: 'rate@test.com', password: 'secret123', nickname: '申诉狂' } }));
const le = await api('/api/auth/login', { method: 'POST', body: { email: 'rate@test.com', password: 'secret123' } });
const tokenE = (await data(le)).token;
const tRate = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenE, body: { title: '限流任务', reward: 1, pickup: 'A', dropoff: 'B', contact: '13900000000' } }));
await api('/api/errand/tasks/' + tRate.task.id + '/take', { method: 'POST', token: tokenB });
let dp429 = null;
for (let i = 0; i < 6; i++) {
  const r = await api('/api/errand/disputes', { method: 'POST', token: tokenE, body: { taskId: tRate.task.id, reason: '限流测试' } });
  if (r.status === 429) { dp429 = i + 1; break; }
}
check('第 6 次申诉触发 429', dp429 === 6, 'hit at ' + dp429);

/* ---------- 17) 请求体过大 413 ---------- */
console.log('17) 请求体过大 413');
const bigEv = ['data:image/png;base64,' + 'A'.repeat(400000)];
const tooBig = await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: 1, reason: 'x', evidence: [bigEv[0], bigEv[0], bigEv[0]] } });
check('申诉请求体过大 413', tooBig.status === 413);

/* ---------- 18) 唯一 open 申诉索引（并发兜底） ---------- */
console.log('18) 唯一 open 申诉索引');
db.enforceUniqueDispute = true;
const tUniq = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '唯一申诉', reward: 1, pickup: 'A', dropoff: 'B', contact: '13900000000' } }));
await api('/api/errand/tasks/' + tUniq.task.id + '/take', { method: 'POST', token: tokenB });
const uq1 = await api('/api/errand/disputes', { method: 'POST', token: tokenB, body: { taskId: tUniq.task.id, reason: '索引测试' } });
check('唯一索引下首次申诉 201', uq1.status === 201, String(uq1.status));
const uq2 = await api('/api/errand/disputes', { method: 'POST', token: tokenB, body: { taskId: tUniq.task.id, reason: '索引测试2' } });
check('唯一索引冲突返回 400 友好提示', uq2.status === 400 && (await data(uq2)).error.includes('已有进行中的申诉'));
db.enforceUniqueDispute = false;

/* ---------- 19) cancelTask 并发语义 ---------- */
console.log('19) cancelTask 并发语义');
const tConc = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '并发取消', reward: 1, pickup: 'A', dropoff: 'B', contact: '13900000000' } }));
await api('/api/errand/tasks/' + tConc.task.id + '/take', { method: 'POST', token: tokenB });
const cancOther = await api('/api/errand/tasks/' + tConc.task.id + '/cancel', { method: 'POST', token: tokenC });
check('路人取消 doing 任务 403', cancOther.status === 403);
const cancPub = await data(await api('/api/errand/tasks/' + tConc.task.id + '/cancel', { method: 'POST', token: tokenA }));
check('发布者取消 doing 任务 200', cancPub.ok === true && cancPub.task.status === 'cancelled');
const cancAgain = await api('/api/errand/tasks/' + tConc.task.id + '/cancel', { method: 'POST', token: tokenA });
check('重复取消 400', cancAgain.status === 400);

/* ---------- 20) 管理审计日志 ---------- */
console.log('20) 管理审计日志');
const logsNoAuth = await api('/api/errand/admin/logs');
check('审计日志无 token 401', logsNoAuth.status === 401);
const logs = await data(await api('/api/errand/admin/logs', { token: 'admin-token' }));
check('审计日志含删除与申诉处理记录', logs.total >= 3 && logs.logs.some(l => l.action === 'errand.task.delete') && logs.logs.some(l => l.action === 'errand.dispute.resolve'));
check('审计 admin 为令牌前缀', logs.logs.every(l => l.admin === 'admin-to'));

/* ---------- 21) 确认来源字段 ---------- */
console.log('21) 确认来源字段');
const detConfirm = await data(await api('/api/errand/tasks/1'));
check('手动确认 confirmedBy=publisher', detConfirm.task.confirmedBy === 'publisher' && detConfirm.task.autoConfirmedAt === null);

/* ---------- 22) R2 证据闭环（2026-08-23 审查第 6 项） ---------- */
console.log('22) R2 证据闭环（fake R2 + MemoryD1）');
const resetR2 = () => { fakeR2.store.clear(); fakeR2.puts = 0; fakeR2.deletes = 0; fakeR2.failPut = false; fakeR2.failAtPut = 0; db.failEvidenceInsert = false; for (const k of [...db.rates.keys()]) if (k.startsWith('errand:dp') || k.startsWith('errand:take')) db.rates.delete(k); };
const pngA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pngB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const b64len = (s) => { const b = Uint8Array.from(atob(s.split(',')[1]), ch => ch.charCodeAt(0)); return b; };
const mkTask = async () => { const t = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: 'R2证据单' + Date.now(), reward: 1, pickup: 'A', dropoff: 'B', contact: '13900000000' } })); await api('/api/errand/tasks/' + t.task.id + '/take', { method: 'POST', token: tokenB }); return t.task.id; };
const disputeIdsFor = async (tid, tok) => { const r = await data(await api('/api/errand/disputes?taskId=' + tid, { token: tok })); return (r.disputes || []).length; };

resetR2();
env.EVIDENCE_BUCKET = fakeR2;
const tR2 = await mkTask();
const dR2 = await data(await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tR2, reason: '证据闭环', evidence: [pngA, pngB] } }));
check('R2 模式申诉 201 且返回 dispute', dR2.dispute && dR2.dispute.id > 0, String((dR2.dispute || {}).id));
check('R2 put 2 次且存储 2 个对象', fakeR2.puts === 2 && fakeR2.store.size === 2);
const dR2id = dR2.dispute.id;
const metaR2 = await data(await api('/api/errand/disputes/' + dR2id + '/evidence', { token: tokenA }));
check('证据列表只含元数据（无 base64/对象键泄露）', metaR2.evidence.length === 2 && metaR2.evidence.every(v => v.stored === 'r2' && v.data === undefined && v.url === undefined && v.size > 0));
const ev1 = metaR2.evidence[0].id;
check('证据下载无 token 401', (await api('/api/errand/evidence/' + ev1)).status === 401);
check('路人下载证据 403', (await api('/api/errand/evidence/' + ev1, { token: tokenC })).status === 403);
const dlA = await api('/api/errand/evidence/' + ev1, { token: tokenA });
{ const exp = b64len(pngA); const got = new Uint8Array(await dlA.arrayBuffer()); check('发布者下载 200 且二进制一致', dlA.status === 200 && got.length === exp.length && got.every((b, i) => b === exp[i]) && dlA.headers.get('content-type') === 'image/png'); }
const dlB = await api('/api/errand/evidence/' + ev1, { token: tokenB });
check('接单者下载 200', dlB.status === 200);
const dlAdm = await api('/api/errand/evidence/' + ev1, { token: 'admin-token' });
check('管理员下载 200', dlAdm.status === 200);
check('证据 id 不存在 404', (await api('/api/errand/evidence/999999', { token: tokenA })).status === 404);

// R2 部分写入失败（第 2 张失败）：已写对象 + 申诉行都必须回滚
resetR2();
fakeR2.failAtPut = 2;
env.EVIDENCE_BUCKET = fakeR2;
const tR2b = await mkTask();
const dR2Fail = await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tR2b, reason: '部分失败回滚', evidence: [pngA, pngB] } });
check('R2 第二张写入失败 503', dR2Fail.status === 503, String(dR2Fail.status));
check('R2 已写对象被回滚清理', fakeR2.store.size === 0 && fakeR2.puts === 2, 'store=' + fakeR2.store.size + ' puts=' + fakeR2.puts);
check('申诉行已回滚', (await disputeIdsFor(tR2b, tokenA)) === 0);

// D1 元数据 batch 失败：已写 R2 对象必须删除
resetR2();
db.failEvidenceInsert = true;
env.EVIDENCE_BUCKET = fakeR2;
const tR2c = await mkTask();
const dD1Fail = await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tR2c, reason: 'D1失败回滚', evidence: [pngA] } });
check('D1 元数据失败 503', dD1Fail.status === 503, String(dD1Fail.status));
check('R2 对象随 D1 失败已清理', fakeR2.store.size === 0 && fakeR2.puts === 1, 'store=' + fakeR2.store.size);
check('申诉行已回滚', (await disputeIdsFor(tR2c, tokenA)) === 0);
db.failEvidenceInsert = false;

// R2 binding 缺失（真实配置未启用）：下载必须显式 503 阻断，不回退泄露
env.EVIDENCE_BUCKET = undefined;
const dlNoR2 = await api('/api/errand/evidence/' + ev1, { token: tokenA });
check('R2 未配置时下载显式 503（阻断说明）', dlNoR2.status === 503 && (await data(dlNoR2)).error.includes('EVIDENCE_BUCKET'));

// 管理删除带 R2 证据的任务：R2 对象必须一并清理
resetR2();
env.EVIDENCE_BUCKET = fakeR2;
const tR2d = await mkTask();
const dR2d = await data(await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tR2d, reason: '删除清理', evidence: [pngA] } }));
check('管理删除前置就绪', dR2d.dispute && dR2d.dispute.id > 0 && fakeR2.store.size === 1);
const delR2 = await api('/api/errand/admin/tasks/' + tR2d, { method: 'DELETE', token: 'admin-token' });
check('管理删除带证据任务 200', delR2.status === 200, String(delR2.status));
check('R2 对象随任务删除清理', fakeR2.store.size === 0 && fakeR2.deletes >= 1, 'store=' + fakeR2.store.size);

// byteLength 边界：40 万汉字（字符数 < 110 万、UTF-8 字节 > 110 万）必须 413
const bigEvByte = '中'.repeat(400001);
const tByte = await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tR2, reason: '字节边界', detail: '', evidence: [bigEvByte] } });
check('申诉体按 UTF-8 字节限制 413（中文 40 万字符）', tByte.status === 413 && (await data(tByte)).error.includes('请求体过大'), String(tByte.status));
env.EVIDENCE_BUCKET = undefined;

/* ---------- 23) R2 fail-closed + 删除失败可重试（2026-08-23 审查第 2 轮第 3 项） ---------- */
console.log('23) R2 fail-closed + pending 重试');
// 证据键查询失败：管理删除必须 503，且任务仍保留（否则 D1 行删除后 R2 对象成孤儿）
resetR2();
db.failEvidenceKeys = true;
env.EVIDENCE_BUCKET = fakeR2;
const tFC = await mkTask();
await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tFC, reason: 'failclosed', evidence: [pngA] } });
const delFC = await api('/api/errand/admin/tasks/' + tFC, { method: 'DELETE', token: 'admin-token' });
check('证据键查询失败→管理删除 503（fail-closed）', delFC.status === 503 && db.tasks.has(tFC), String(delFC.status));
db.failEvidenceKeys = false;

// R2 删除失败：对象保留但键记入 KV pending；恢复后 retryPendingR2 清理成功
resetR2();
kvStore.clear();
env.EVIDENCE_BUCKET = fakeR2;
fakeR2.store.set('evidence/1-test.bin', new Uint8Array([1]));
fakeR2.failDelete = true;
const delFail = await deleteR2Objects(env, ['evidence/1-test.bin']);
check('R2 删除失败返回 failedKeys', delFail.failed === 1 && delFail.failedKeys[0] === 'evidence/1-test.bin');
check('失败的键已记入 KV pending', (await pendingR2Keys(env)).includes('evidence/1-test.bin'));
fakeR2.failDelete = false;
const retry1 = await retryPendingR2(env);
check('重试成功后对象清除且 pending 清空', retry1.deleted === 1 && retry1.pending === 0 && fakeR2.store.size === 0 && (await pendingR2Keys(env)).length === 0, 'deleted=' + retry1.deleted + ' pending=' + retry1.pending);

// recordPendingR2 幂等合并
await recordPendingR2(env, ['a', 'b']);
await recordPendingR2(env, ['b', 'c']);
const pend = await pendingR2Keys(env);
check('pending 合并去重（a,b,c）', pend.length === 3 && pend.includes('a') && pend.includes('c') && pend.filter(x => x === 'b').length === 1, JSON.stringify(pend));
kvStore.clear();

// 管理删除时 R2 删除失败：主删除成功、对象保留但进入 pending（安全失败 + 可重试记录）
resetR2();
fakeR2.failDelete = false;
env.EVIDENCE_BUCKET = fakeR2;
const tPF = await mkTask();
await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tPF, reason: 'pending删除', evidence: [pngA] } });
fakeR2.failDelete = true;
const delPF = await api('/api/errand/admin/tasks/' + tPF, { method: 'DELETE', token: 'admin-token' });
check('管理删除遇 R2 删除失败仍 200（对象进 pending 重试）', delPF.status === 200 && fakeR2.store.size === 1 && (await pendingR2Keys(env)).length >= 1, String(delPF.status) + ' store=' + fakeR2.store.size);
fakeR2.failDelete = false;
env.EVIDENCE_BUCKET = undefined;


// KV pending 读取失败 = 状态未知：跳过重试、保留对象与 KV 原值（不当作无 pending）
env.EVIDENCE_BUCKET = fakeR2;
fakeR2.store.clear();
kvStore.clear();
kvStore.set('r2:pending-cleanup', JSON.stringify(['evidence/x.bin']));
fakeR2.store.set('evidence/x.bin', new Uint8Array([1]));
studyKv.failGet = true;
const retrNull = await retryPendingR2(env);
check('pending 读取失败→跳过重试且对象与 KV 原值保留', retrNull.error === 'pending-read-failed' && retrNull.pending === -1 && fakeR2.store.size === 1 && kvStore.has('r2:pending-cleanup'), JSON.stringify(retrNull));
studyKv.failGet = false;

// 删除成功后 KV 清空失败：不得谎报 pending=0
env.EVIDENCE_BUCKET = fakeR2;
fakeR2.store.clear();
kvStore.clear();
kvStore.set('r2:pending-cleanup', JSON.stringify(['evidence/y.bin']));
fakeR2.store.set('evidence/y.bin', new Uint8Array([1]));
studyKv.failDeleteKv = true;
const retrClear = await retryPendingR2(env);
check('KV 清空失败时 pending=键数（不谎报 0）', retrClear.pending === 1 && retrClear.deleted === 1 && fakeR2.store.size === 0 && kvStore.has('r2:pending-cleanup'), JSON.stringify(retrClear));
studyKv.failDeleteKv = false;

// pending 存量损坏：record 不能覆盖旧值
kvStore.clear();
kvStore.set('r2:pending-cleanup', '{broken json');
const recCorrupt = await recordPendingR2(env, ['new-key']);
check('pending 存量损坏时 record 失败且保留原值', recCorrupt === false && kvStore.get('r2:pending-cleanup') === '{broken json');
kvStore.clear();
fakeR2.store.clear();
fakeR2.failDelete = false;
console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
