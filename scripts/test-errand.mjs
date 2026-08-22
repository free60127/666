/* test-errand.mjs：跑腿平台全链路单测（MemoryD1，无网络）
   用法：node scripts/test-errand.mjs */
import { handleAuth } from '../workers/src/auth.js';
import { handleErrand } from '../workers/src/errand.js';

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
      const [key, winEnd, winStart] = args;
      const cur = this.rates.get(key);
      if (!cur || cur.until <= winStart) { this.rates.set(key, { count: 1, until: winEnd }); return { count: 1 }; }
      cur.count++; this.rates.set(key, cur);
      return { count: cur.count };
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
    if (s.includes('FROM errand_reviews')) {
      const taskId = Number(args[0]);
      const arr = [...this.reviews.values()].filter(r => r.task_id === taskId).sort((a, b) => b.created_at - a.created_at);
      return { results: arr.map(r => ({ ...r, reviewer_name: (this.users.get(r.reviewer_id) || {}).nickname || null })) };
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
    if (s.startsWith('INSERT INTO errand_disputes')) {
      const [task_id, user_id, role, reason, detail, created_at, updated_at] = args;
      const id = this.nextDisputeId++;
      this.disputes.set(id, { id, task_id, user_id, role, reason, detail, status: 'open', admin_note: '', created_at, updated_at });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (s.startsWith('INSERT INTO errand_evidence')) {
      const [dispute_id, data, created_at] = args;
      const id = this.nextEvidenceId++;
      this.evidence.set(id, { id, dispute_id, data, created_at });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('UPDATE errand_disputes')) {
      const [st, note, now, id] = args;
      const d = this.disputes.get(id);
      if (!d || d.status !== 'open') return { meta: { changes: 0 } };
      d.status = st; d.admin_note = note; d.updated_at = now;
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
      this.tasks.set(id, { id, publisher_id, title, description, reward, pickup, dropoff, contact, deadline, status: 'open', taker_id: null, created_at, updated_at, completed_at: null, confirmed_at: null, cancelled_at: null, cancel_reason: '' });
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
    if (s.startsWith('DELETE FROM sessions')) {
      const [tokenHash] = args;
      return { meta: { changes: this.sessions.delete(tokenHash) ? 1 : 0 } };
    }
    return { meta: { changes: 0 } };
  }
}

/* ---------- 请求封装 ---------- */
const db = new MemoryD1();
const env = { DB: db, STUDY_KV: {}, ADMIN_TOKEN: 'admin-token', SMTP_TEST_MODE: true, SMTP_SENT: [] };
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
const t2 = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '带饭', reward: 3, pickup: '二食堂', dropoff: '图书馆' } }));
const doneCancel = await api('/api/errand/tasks/1/cancel', { method: 'POST', token: tokenA, body: { reason: 'x' } });
check('已完成不能取消 400', doneCancel.status === 400);
const pubCancel = await data(await api('/api/errand/tasks/' + t2.task.id + '/cancel', { method: 'POST', token: tokenA, body: { reason: '自己去了' } }));
check('发布者取消待接单', pubCancel.ok === true && pubCancel.task.status === 'cancelled' && pubCancel.task.cancelReason === '自己去了');
const listAfterCancel = await data(await api('/api/errand/tasks?status=all'));
check('all 列表不含已取消（1 条）', listAfterCancel.total === 1);
const t3 = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '送文件', reward: 8, pickup: '行政楼', dropoff: '教学楼' } }));
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
  const r = await api('/api/errand/tasks', { method: 'POST', token: tokenB, body: { title: '刷单' + i, reward: 1 } });
  if (r.status === 429) { hit429 = true; break; }
}
check('第 31 次发布触发 429', hit429);

console.log('8) 截止时间过期：不可接单 + 自动取消');
const tExp = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '过期任务', reward: 2, pickup: 'A', dropoff: 'B', deadline: Date.now() + 3600e3 } }));
db.tasks.get(tExp.task.id).deadline = Date.now() - 1000; // 直接改内存模拟过期
const expTake = await api('/api/errand/tasks/' + tExp.task.id + '/take', { method: 'POST', token: tokenB });
check('过期任务接单被拒 409', expTake.status === 409);
const expBody = await data(expTake);
check('过期任务自动置为 cancelled', expBody.status === 'cancelled' && expBody.error.includes('已过期'));
const tExp2 = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '过期任务2', reward: 2, pickup: 'A', dropoff: 'B', deadline: Date.now() + 3600e3 } }));
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
const tRev = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '评价闭环', reward: 3, pickup: 'X', dropoff: 'Y' } }));
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
const tUn = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '未确认', reward: 1, pickup: 'A', dropoff: 'B' } }));
await api('/api/errand/tasks/' + tUn.task.id + '/take', { method: 'POST', token: tokenB });
const revUn = await api('/api/errand/reviews', { method: 'POST', token: tokenA, body: { taskId: tUn.task.id, rating: 5 } });
check('未确认任务不能评价 400', revUn.status === 400);

/* ---------- 10) 申诉（doing/done/confirmed 可申诉 + 证据上传） ---------- */
console.log('10) 申诉（doing/done/confirmed 可申诉 + 证据上传）');
const dNoAuth = await api('/api/errand/disputes', { method: 'POST', body: { taskId: 1, reason: 'x' } });
check('未登录申诉 401', dNoAuth.status === 401);
const tOpen = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '申诉测试open', reward: 1, pickup: 'A', dropoff: 'B' } }));
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
const tDel = await data(await api('/api/errand/tasks', { method: 'POST', token: tokenA, body: { title: '待删除', reward: 2, pickup: 'A', dropoff: 'B' } }));
await api('/api/errand/tasks/' + tDel.task.id + '/take', { method: 'POST', token: tokenB });
await api('/api/errand/tasks/' + tDel.task.id + '/complete', { method: 'POST', token: tokenB });
const dDel = await data(await api('/api/errand/disputes', { method: 'POST', token: tokenA, body: { taskId: tDel.task.id, reason: '删除测试', evidence: ['data:image/png;base64,DDDD'] } }));
const evBefore = db.evidence.size;
await api('/api/errand/admin/tasks/' + tDel.task.id, { method: 'DELETE', token: 'admin-token' });
check('删除任务级联清申诉与证据', !db.disputes.has(dDel.dispute.id) && db.evidence.size === evBefore - 1);
console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);