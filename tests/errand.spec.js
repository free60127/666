// 跑腿平台 UI 测试（2026-08-22）：mock /api/auth + /api/errand，真实 DOM 交互
const { test, expect } = require('@playwright/test');

test.use({
  launchOptions: { args: ['--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:8788'] },
});

const BASE = 'http://127.0.0.1:8788/' + encodeURI('paotui/index.html');

// mock /api/auth/*：token → 用户会话
function mockAuthApi(page, store) {
  page.route('**/api/auth/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    const ok = body => route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
    const fail = (status, error) => route.fulfill({ status, headers, body: JSON.stringify({ error }) });
    const json = () => route.request().postDataJSON();
    const users = store.users;
    if (url.pathname === '/api/auth/register') {
      const b = json();
      if (users.some(u => u.email === b.email)) return fail(409, '该邮箱已注册，请直接登录');
      const user = { id: 'u' + users.length, email: b.email, password: b.password, nickname: b.nickname || '' };
      users.push(user);
      store.sessions['tok-' + user.id] = user; // 2026-08-23：注册即建会话（前端免二次登录）
      return ok({ ok: true, token: 'tok-' + user.id, user });
    }
    if (url.pathname === '/api/auth/login') {
      const b = json();
      const user = users.find(u => u.email === b.email && u.password === b.password);
      if (!user) return fail(401, '邮箱或密码不正确');
      const token = 'tok-' + user.id;
      store.sessions[token] = user;
      return ok({ ok: true, token, user: { id: user.id, email: user.email, nickname: user.nickname } });
    }
    if (url.pathname === '/api/auth/logout') {
      const a = route.request().headers()['authorization'] || '';
      delete store.sessions[a.replace('Bearer ', '')];
      return ok({ ok: true });
    }
    if (url.pathname === '/api/auth/me') {
      const a = route.request().headers()['authorization'] || '';
      const u = store.sessions[a.replace('Bearer ', '')] || store.users[0] || null;
      return u ? ok({ ok: true, user: { id: u.id, email: u.email, nickname: u.nickname } }) : fail(401, 'unauthorized');
    }
    return fail(404, 'not found');
  });
}

// mock /api/errand/*：内存任务状态机
function mockErrandApi(page, store) {
  page.route('**/api/errand/**', async route => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;
    const ok = body => route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
    const fail = (status, error) => route.fulfill({ status, headers, body: JSON.stringify({ error }) });
    const auth = () => { const a = route.request().headers()['authorization'] || ''; return a.startsWith('Bearer ') ? a.slice(7) : null; };
    const me = () => { const t = auth(); return t ? store.sessions[t] || null : null; };
    const tasks = store.tasks;

    if (path === '/api/errand/tasks' && method === 'POST') {
      if (!me()) return fail(401, 'unauthorized');
      const b = route.request().postDataJSON();
      const id = tasks.length ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
      const task = {
        id, publisherId: me().id, title: b.title, description: b.description || '',
        reward: b.reward, pickup: b.pickup || '', dropoff: b.dropoff || '', contact: b.contact || '',
        deadline: b.deadline || null, status: 'open', takerId: null,
        createdAt: Date.now(), updatedAt: Date.now(), completedAt: null, confirmedAt: null,
        cancelledAt: null, cancelReason: '', publisherName: me().nickname, takerName: null,
      };
      tasks.push(task);
      return route.fulfill({ status: 201, headers, body: JSON.stringify({ ok: true, task }) });
    }
    if (path === '/api/errand/tasks' && method === 'GET') {
      const status = url.searchParams.get('status') || 'open';
      const items = tasks.filter(t => status === 'all' ? t.status !== 'cancelled' : t.status === status);
      return ok({ items, total: items.length, page: 1, pageSize: 20 });
    }
    if (path === '/api/errand/mine' && method === 'GET') {
      if (!me()) return fail(401, 'unauthorized');
      const role = url.searchParams.get('role');
      const items = tasks.filter(t => role === 'posted' ? t.publisherId === me().id : t.takerId === me().id);
      return ok({ items, total: items.length, page: 1, pageSize: 20, role });
    }
    if (path === '/api/errand/reviews' && method === 'POST') {
      if (!me()) return fail(401, 'unauthorized');
      const b = route.request().postDataJSON();
      const t = tasks.find(x => x.id === Number(b.taskId));
      if (!t) return fail(404, '任务不存在');
      if (!t.confirmedAt) return fail(400, '任务确认完成后才能评价');
      const u = me();
      if (u.id !== t.publisherId && u.id !== t.takerId) return fail(403, '只有任务双方可以评价');
      if (store.reviews.some(r => r.taskId === t.id && r.reviewerId === u.id)) return fail(400, '已评价过该任务');
      const rev = { id: store.reviews.length + 1, taskId: t.id, reviewerId: u.id, rating: b.rating, comment: b.comment || '', createdAt: Date.now() };
      store.reviews.push(rev);
      return route.fulfill({ status: 201, headers, body: JSON.stringify({ ok: true, review: rev }) });
    }
    if (path === '/api/errand/reviews' && method === 'GET') {
      const taskId = Number(url.searchParams.get('taskId'));
      const items = store.reviews.filter(r => r.taskId === taskId).map(r => {
        const u = store.users.find(x => x.id === r.reviewerId);
        return { ...r, reviewerName: u ? u.nickname : '匿名' };
      });
      return ok({ reviews: items });
    }
    // 申诉 + 管理端
    const withName = d => { const u = store.users.find(x => x.id === d.userId); return { ...d, userName: u ? u.nickname : '匿名' }; };
    if (path === '/api/errand/disputes' && method === 'POST') {
      if (!me()) return fail(401, 'unauthorized');
      const b = route.request().postDataJSON();
      const t = tasks.find(x => x.id === Number(b.taskId));
      if (!t) return fail(404, '任务不存在');
      if (t.status === 'open' || t.status === 'cancelled') return fail(400, '该状态任务无法申诉');
      const u = me();
      if (u.id !== t.publisherId && u.id !== t.takerId) return fail(403, '只有任务双方可以申诉');
      if (store.disputes.some(d => d.taskId === t.id && d.userId === u.id && d.status === 'open')) return fail(400, '已有进行中的申诉，请等待处理');
      const d = {
        id: store.disputes.length + 1, taskId: t.id, userId: u.id, role: u.id === t.publisherId ? 'publisher' : 'taker',
        reason: b.reason, detail: b.detail || '', status: 'open', adminNote: '', createdAt: Date.now(), updatedAt: Date.now(),
      };
      store.disputes.push(d);
      return route.fulfill({ status: 201, headers, body: JSON.stringify({ ok: true, dispute: d }) });
    }
    if (path === '/api/errand/disputes' && method === 'GET') {
      const taskId = Number(url.searchParams.get('taskId'));
      if (taskId) {
        const t = tasks.find(x => x.id === taskId);
        if (!t) return fail(404, '任务不存在');
        const u = me();
        if (!u || (u.id !== t.publisherId && u.id !== t.takerId)) return fail(403, '无权查看');
        return ok({ disputes: store.disputes.filter(d => d.taskId === taskId).map(withName) });
      }
      if (auth() !== 'admin-token') return fail(401, 'unauthorized');
      return ok({ disputes: store.disputes.map(withName) });
    }
    if (path === '/api/errand/admin/tasks' && method === 'GET') {
      if (auth() !== 'admin-token') return fail(401, 'unauthorized');
      const status = url.searchParams.get('status') || 'all';
      let items = tasks;
      if (status !== 'all') items = items.filter(t => t.status === status);
      return ok({ items, total: items.length, page: 1, pageSize: 50 });
    }
    let am = path.match(/^\/api\/errand\/admin\/tasks\/(\d+)$/);
    if (am && method === 'DELETE') {
      if (auth() !== 'admin-token') return fail(401, 'unauthorized');
      const t = tasks.find(x => x.id === Number(am[1]));
      if (!t) return fail(404, '任务不存在');
      tasks.splice(tasks.indexOf(t), 1);
      store.disputes = store.disputes.filter(d => d.taskId !== t.id);
      store.reviews = store.reviews.filter(r => r.taskId !== t.id);
      return ok({ ok: true });
    }
    am = path.match(/^\/api\/errand\/admin\/disputes\/(\d+)$/);
    if (am && method === 'PATCH') {
      if (auth() !== 'admin-token') return fail(401, 'unauthorized');
      const d = store.disputes.find(x => x.id === Number(am[1]));
      if (!d || d.status !== 'open') return fail(400, '申诉不存在或已处理');
      const b = route.request().postDataJSON();
      if (!['resolved', 'rejected'].includes(b.status)) return fail(400, 'invalid status');
      d.status = b.status; d.adminNote = b.note || '';
      return ok({ ok: true, dispute: d });
    }
    let em = path.match(/^\/api\/errand\/disputes\/(\d+)\/evidence$/);
    if (em && method === 'GET') {
      const d = store.disputes.find(x => x.id === Number(em[1]));
      if (!d) return fail(404, '申诉不存在');
      const t = tasks.find(x => x.id === d.taskId);
      const u = me();
      const isAdmin = auth() === 'admin-token';
      const isParty = u && t && (u.id === t.publisherId || u.id === t.takerId);
      if (!isAdmin && !isParty) return fail(403, '无权查看');
      return ok({ evidence: store.evidence.filter(e => e.disputeId === d.id).map(e => ({ id: e.id, data: e.data, createdAt: e.createdAt })) });
    }
    if (path === '/api/errand/admin/logs' && method === 'GET') {
      if (auth() !== 'admin-token') return fail(401, 'unauthorized');
      const items = store.logs.slice().reverse();
      return ok({ logs: items, total: items.length });
    }
    let m = path.match(/^\/api\/errand\/tasks\/(\d+)$/);
    if (m && method === 'GET') {
      const t = tasks.find(x => x.id === Number(m[1]));
      if (!t) return fail(404, '任务不存在');
      const u = me();
      const canSee = u && (u.id === t.publisherId || (u.id === t.takerId && (t.status === 'doing' || t.status === 'done')));
      return ok({ task: { ...t, contact: canSee ? t.contact : '' } });
    }
    m = path.match(/^\/api\/errand\/tasks\/(\d+)\/(take|complete|confirm|cancel)$/);
    if (m && method === 'POST') {
      if (!me()) return fail(401, 'unauthorized');
      const t = tasks.find(x => x.id === Number(m[1]));
      if (!t) return fail(404, '任务不存在');
      const u = me();
      const act = m[2];
      if (act === 'take') {
        if (t.publisherId === u.id) return fail(400, '不能接自己发布的任务');
        if (t.status !== 'open') return fail(409, '手慢了，任务已被接走');
        t.status = 'doing'; t.takerId = u.id; t.takerName = u.nickname;
      } else if (act === 'complete') {
        if (t.takerId !== u.id || t.status !== 'doing') return fail(400, '只有接单者能在进行中标记完成');
        t.status = 'done'; t.completedAt = Date.now();
      } else if (act === 'confirm') {
        if (t.publisherId !== u.id || t.status !== 'done' || t.confirmedAt) return fail(400, '只有发布者能确认已完成的任务');
        t.confirmedAt = Date.now(); t.confirmedBy = 'publisher';
      } else if (act === 'cancel') {
        if (t.status === 'done') return fail(400, '任务已完成，不能取消');
        if (t.publisherId !== u.id && t.takerId !== u.id) return fail(403, '无权操作该任务');
        t.status = 'cancelled'; t.cancelledAt = Date.now();
        t.cancelReason = t.publisherId === u.id ? '发布者取消' : '接单者取消';
      }
      return ok({ ok: true, task: t });
    }
    return fail(404, 'not found');
  });
}

function newStore() {
  return { users: [], sessions: {}, tasks: [], reviews: [], disputes: [], evidence: [], logs: [] };
}

// 通过 UI 注册并登录；若 mock store 里已有该邮箱（密码匹配），自动改用登录，避免注册 409
async function uiRegisterAndLogin(page, store, email, nickname, password) {
  await page.locator('#auth-open-btn').click();
  const existing = store.users.find(u => u.email === email && u.password === password);
  if (existing) {
    await page.locator('#auth-tabs .tab[data-aview=login]').click();
    await page.fill('#auth-email-input', email);
    await page.fill('#auth-password-input', password);
  } else {
    await page.locator('#auth-tabs .tab[data-aview=register]').click();
    await page.fill('#auth-email-input', email);
    await page.fill('#auth-nick-input', nickname);
    await page.fill('#auth-password-input', password);
  }
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-email')).toBeVisible({ timeout: 5000 });
}

test('列表渲染 + 未登录发布被拦截引导登录', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '帮取快递', description: '菜鸟驿站 3 号柜', reward: 5,
    pickup: '菜鸟驿站', dropoff: '女生宿舍 3 栋', contact: '13800000000', deadline: null,
    status: 'open', takerId: null, createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: null, confirmedAt: null, cancelledAt: null, cancelReason: '',
    publisherName: '发布者', takerName: null,
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);

  // 列表渲染
  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card')).toContainText('帮取快递');
  await expect(page.locator('.task-card')).toContainText('¥5');
  await expect(page.locator('.task-card .badge')).toHaveText('待接单');
  await expect(page.locator('#auth-open-btn')).toBeVisible();

  // 未登录点发布 → 弹登录
  await page.locator('#fab-publish').click();
  await expect(page.locator('#auth-modal')).toBeVisible();
  await expect(page.locator('#auth-title')).toHaveText('登录');
});

test('注册登录后发布任务成功并出现在列表', async ({ page }) => {
  const store = newStore();
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);

  await uiRegisterAndLogin(page, store, 'taker@test.com', '跑腿小张', 'secret123');
  await expect(page.locator('#auth-email')).toContainText('跑腿小张');

  await page.locator('#fab-publish').click();
  await expect(page.locator('#publish-modal')).toBeVisible();
  await page.fill('#p-title', '带一份二食堂炒饭');
  await page.fill('#p-reward', '3');
  await page.fill('#p-pickup', '二食堂');
  await page.fill('#p-dropoff', '图书馆');
  await page.fill('#p-contact', '13800138000');
  await page.locator('#pub-submit').click();

  await expect(page.locator('#toast')).toContainText('发布成功');
  await expect(page.locator('.task-card')).toContainText('带一份二食堂炒饭');
  // 我发布的 tab 能看到
  await page.locator('#tabs .tab[data-tab=mine-posted]').click();
  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card')).toContainText('带一份二食堂炒饭');
});

test('接单→完成→确认 全闭环（双用户）', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '送文件到教学楼', description: '', reward: 8,
    pickup: '行政楼', dropoff: '教学楼 A 栋', contact: '', deadline: null,
    status: 'open', takerId: null, createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: null, confirmedAt: null, cancelledAt: null, cancelReason: '',
    publisherName: '发布者', takerName: null,
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  page.on('dialog', d => d.accept());
  await page.goto(BASE);

  // 接单者注册登录 → 接单
  await uiRegisterAndLogin(page, store, 'taker@test.com', '跑腿小王', 'secret123');
  await page.locator('.task-card').first().click();
  await expect(page.locator('#detail-modal')).toBeVisible();
  await page.locator('[data-act=take]').click();
  await expect(page.locator('#detail-modal')).toContainText('进行中');
  await expect(page.locator('#detail-modal')).toContainText('跑腿小王');
  // 标记完成
  await page.locator('[data-act=complete]').click();
  await expect(page.locator('#detail-modal')).toContainText('已完成');
  await page.locator('#detail-modal [data-act=close]').click();

  // 退出 → 发布者登录 → 确认
  await page.locator('#auth-logout-btn').click();
  await expect(page.locator('#auth-open-btn')).toBeVisible();
  await uiRegisterAndLogin(page, store, 'pub@test.com', '发布者', 'secret123');
  await page.locator('#tabs .tab[data-tab=mine-posted]').click();
  await expect(page.locator('.task-card')).toHaveCount(1);
  await page.locator('.task-card').first().click();
  await expect(page.locator('#detail-modal')).toContainText('已完成');
  await page.locator('[data-act=confirm]').click();
  await expect(page.locator('#detail-modal')).toContainText('双方确认完成');
});
test('联系方式脱敏：接单前不可见，接单后接单者可见', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '送文件', reward: 8, pickup: '行政楼', dropoff: '教学楼', contact: '13800000000', deadline: null,
    status: 'open', takerId: null, createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: null, confirmedAt: null, cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: null,
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  page.on('dialog', d => d.accept());
  await page.goto(BASE);
  // 匿名打开详情 → 联系方式显示'接单后可见'，不泄露真实号码
  await page.locator('.task-card').first().click();
  await expect(page.locator('#detail-modal')).toContainText('接单后可见');
  await expect(page.locator('#detail-modal')).not.toContainText('13800000000');
  await page.locator('#detail-modal [data-act=close]').click();
  // 接单者注册登录 → 接单成功后可见联系方式
  await uiRegisterAndLogin(page, store, 'taker@test.com', '跑腿小王', 'secret123');
  await page.locator('.task-card').first().click();
  await page.locator('[data-act=take]').click();
  await expect(page.locator('#detail-modal')).toContainText('13800000000');
});

test('过期任务：列表显示已过期徽标，详情不可接单', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '过期单', reward: 8, pickup: 'A', dropoff: 'B', contact: '', deadline: Date.now() - 60000,
    status: 'open', takerId: null, createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: null, confirmedAt: null, cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: null,
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);
  await expect(page.locator('.task-card .badge')).toHaveText('已过期');
  await page.locator('.task-card').first().click();
  await expect(page.locator('#detail-modal')).toContainText('已过期，无法接单');
  await expect(page.locator('[data-act=take]')).toHaveCount(0);
});

test('确认完成后双方互评：评价提交 + 列表展示 + 重复评价被拒', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.users.push({ id: 'u1', email: 'taker@test.com', password: 'secret123', nickname: '跑腿小王' });
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '送文件', reward: 8, pickup: 'A', dropoff: 'B', contact: '13800000000', deadline: null,
    status: 'done', takerId: 'u1', createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: Date.now(), confirmedAt: Date.now(), cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: '跑腿小王',
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);
  // 发布者登录 → 再进已完成 tab 打开详情（modal 会遮挡顶栏登录按钮）
  await uiRegisterAndLogin(page, store, 'pub@test.com', '发布者', 'secret123');
  await page.locator('#tabs .tab[data-tab=done]').click();
  await page.locator('.task-card').first().click();
  await expect(page.locator('[data-act=review]')).toBeVisible();
  await page.locator('[data-act=review]').click();
  await expect(page.locator('#review-modal')).toBeVisible();
  await page.fill('#rv-comment', '很靠谱，送得快');
  await page.locator('#rv-submit').click();
  await expect(page.locator('#toast')).toContainText('评价成功');
  await expect(page.locator('#review-box')).toContainText('很靠谱，送得快');
  // 重复评价被拒
  await page.locator('[data-act=review]').click();
  await page.locator('#rv-submit').click();
  await expect(page.locator('#toast')).toContainText('已评价过');
});

test('申诉：双方可发起申诉 + 提交后详情显示待处理', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.users.push({ id: 'u1', email: 'taker@test.com', password: 'secret123', nickname: '跑腿小王' });
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '送文件', reward: 8, pickup: 'A', dropoff: 'B', contact: '13800000000', deadline: null,
    status: 'done', takerId: 'u1', createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: Date.now(), confirmedAt: null, cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: '跑腿小王',
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);
  // 发布者登录 → 已完成 tab → 详情：申诉按钮可见
  await uiRegisterAndLogin(page, store, 'pub@test.com', '发布者', 'secret123');
  await page.locator('#tabs .tab[data-tab=done]').click();
  await page.locator('.task-card').first().click();
  await expect(page.locator('[data-act=dispute]')).toBeVisible();
  await page.locator('[data-act=dispute]').click();
  await expect(page.locator('#dispute-modal')).toBeVisible();
  await page.fill('#dp-reason', '对方没送到指定地点');
  await page.fill('#dp-detail', '放错楼栋了');
  await page.locator('#dp-submit').click();
  await expect(page.locator('#toast')).toContainText('申诉已提交');
  // 详情重新加载 → 申诉记录显示待处理
  await expect(page.locator('#dispute-box')).toContainText('待处理');
  await expect(page.locator('#dispute-box')).toContainText('对方没送到指定地点');
  await expect(page.locator('#dispute-box')).toContainText('发布者 · 发布者');
});

test('管理面板：跑腿订单列表 + 删除订单 + 处理申诉', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.users.push({ id: 'u1', email: 'taker@test.com', password: 'secret123', nickname: '跑腿小王' });
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '送文件', reward: 8, pickup: 'A', dropoff: 'B', contact: '13800000000', deadline: null,
    status: 'done', takerId: 'u1', createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: Date.now(), confirmedAt: Date.now(), cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: '跑腿小王',
  });
  store.tasks.push({
    id: 2, publisherId: 'u0', title: '带饭', reward: 3, pickup: '二食堂', dropoff: '图书馆', contact: '', deadline: null,
    status: 'open', takerId: null, createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: null, confirmedAt: null, cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: null,
  });
  store.disputes.push({
    id: 1, taskId: 1, userId: 'u1', role: 'taker', reason: '对方不确认', detail: '已送达但拖延', status: 'open', adminNote: '',
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  page.on('dialog', d => {
    if (d.type() === 'prompt') d.accept('已核实，双方协商一致');
    else d.accept();
  });
  await page.addInitScript(() => {
    localStorage.setItem('waiyuan-admin-api-v1', 'http://127.0.0.1:8788');
    sessionStorage.setItem('waiyuan-admin-token-v1', 'admin-token');
  });
  await page.goto('http://127.0.0.1:8788/admin.html');
  await page.locator('.tabs button[data-tab=errand]').click();
  await page.locator('#load-errand').click();
  // 任务列表：2 单 + 含联系方式
  await expect(page.locator('#er-list .fb')).toHaveCount(2);
  await expect(page.locator('#er-list')).toContainText('13800000000');
  await expect(page.locator('#er-count')).toContainText('共 2 单');
  // 申诉列表：1 条 open
  await page.locator('#load-disputes').click();
  await expect(page.locator('#dp-list .fb')).toHaveCount(1);
  await expect(page.locator('#dp-list')).toContainText('对方不确认');
  // 处理申诉（prompt 填备注）→ 已解决
  await page.locator('#dp-list .fb button:has-text("标记解决")').click();
  await expect(page.locator('#dp-list')).toContainText('已解决');
  await expect(page.locator('#dp-list')).toContainText('已核实，双方协商一致');
  // 删除订单 #1 → 列表剩 1 单
  await page.locator('#er-list .fb').first().locator('button:has-text("删除订单")').click();
  await expect(page.locator('#er-list .fb')).toHaveCount(1);
  await expect(page.locator('#er-list')).not.toContainText('送文件');
});

test('自动确认语义：system 显示系统自动确认', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.users.push({ id: 'u1', email: 'taker@test.com', password: 'secret123', nickname: '跑腿小王' });
  const now = Date.now();
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '系统自动确认单', reward: 8, pickup: 'A', dropoff: 'B', contact: '', deadline: null,
    status: 'done', takerId: 'u1', createdAt: now, updatedAt: now,
    completedAt: now, confirmedAt: now, confirmedBy: 'system', autoConfirmedAt: now, cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: '跑腿小王',
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);
  await uiRegisterAndLogin(page, store, 'pub@test.com', '发布者', 'secret123');
  await page.locator('#tabs .tab[data-tab=done]').click();
  await page.locator('.task-card').first().click();
  await expect(page.locator('#detail-modal')).toContainText('系统超时自动确认');
  await expect(page.locator('#detail-modal')).not.toContainText('双方确认完成');
});

test('证据查看：详情页申诉区查看证据 + 管理面板查看证据', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.users.push({ id: 'u1', email: 'taker@test.com', password: 'secret123', nickname: '跑腿小王' });
  const now = Date.now();
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '送文件', reward: 8, pickup: 'A', dropoff: 'B', contact: '13800000000', deadline: null,
    status: 'done', takerId: 'u1', createdAt: now, updatedAt: now,
    completedAt: now, confirmedAt: null, cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: '跑腿小王',
  });
  store.disputes.push({
    id: 1, taskId: 1, userId: 'u1', role: 'taker', reason: '对方不确认', detail: '已送达但拖延', status: 'open', adminNote: '', createdAt: now, updatedAt: now,
  });
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  store.evidence.push({ id: 1, disputeId: 1, data: PNG, createdAt: now });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);
  // 发布者登录 → 详情 → 申诉区查看证据
  await uiRegisterAndLogin(page, store, 'pub@test.com', '发布者', 'secret123');
  await page.locator('#tabs .tab[data-tab=done]').click();
  await page.locator('.task-card').first().click();
  await expect(page.locator('#dispute-box')).toContainText('对方不确认');
  await page.locator('button[data-dp-evidence]').click();
  await expect(page.locator('img.dp-ev-img')).toBeVisible();
  await page.locator('#detail-modal [data-act=close]').click();
  // 管理面板查看证据
  await page.addInitScript(() => {
    localStorage.setItem('waiyuan-admin-api-v1', 'http://127.0.0.1:8788');
    sessionStorage.setItem('waiyuan-admin-token-v1', 'admin-token');
  });
  await page.goto('http://127.0.0.1:8788/admin.html');
  await page.locator('.tabs button[data-tab=errand]').click();
  await page.locator('#load-disputes').click();
  await page.locator('#dp-list .fb button:has-text("查看证据")').click();
  await expect(page.locator('#dp-list img.ev-img')).toBeVisible();
});

test('管理面板：审计日志 tab 渲染操作记录', async ({ page }) => {
  const store = newStore();
  store.logs.push({ id: 1, action: 'errand.task.delete', detail: '删除任务 #2（带饭）', admin: 'admin-to', createdAt: Date.now() - 60000 });
  store.logs.push({ id: 2, action: 'errand.dispute.resolve', detail: 'status=resolved', admin: 'admin-to', createdAt: Date.now() });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.addInitScript(() => {
    localStorage.setItem('waiyuan-admin-api-v1', 'http://127.0.0.1:8788');
    sessionStorage.setItem('waiyuan-admin-token-v1', 'admin-token');
  });
  await page.goto('http://127.0.0.1:8788/admin.html');
  await page.locator('.tabs button[data-tab=logs]').click();
  await page.locator('#load-logs').click();
  await expect(page.locator('#logs-list .fb')).toHaveCount(2);
  await expect(page.locator('#logs-list')).toContainText('errand.task.delete');
  await expect(page.locator('#logs-list')).toContainText('删除任务 #2');
  await expect(page.locator('#logs-list')).toContainText('errand.dispute.resolve');
  await expect(page.locator('#logs-count')).toContainText('共 2 条');
});

test('管理面板：清除令牌按钮清空会话令牌', async ({ page }) => {
  const store = newStore();
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.addInitScript(() => {
    localStorage.setItem('waiyuan-admin-api-v1', 'http://127.0.0.1:8788');
    sessionStorage.setItem('waiyuan-admin-token-v1', 'admin-token');
  });
  await page.goto('http://127.0.0.1:8788/admin.html');
  await expect(page.locator('#token')).toHaveValue('admin-token');
  await page.locator('#clear-token').click();
  await expect(page.locator('#token')).toHaveValue('');
  const cleared = await page.evaluate(() => sessionStorage.getItem('waiyuan-admin-token-v1'));
  expect(cleared).toBeNull();
});
test('分享卡片：底部入口生成平台卡与任务卡，可保存图片', async ({ page }) => {
  const store = newStore();
  store.users.push({ id: 'u0', email: 'pub@test.com', password: 'secret123', nickname: '发布者' });
  store.tasks.push({
    id: 1, publisherId: 'u0', title: '帮取快递', reward: 5, pickup: '菜鸟驿站', dropoff: '女生宿舍 3 栋', contact: '13800000000', deadline: Date.now() + 3600000,
    status: 'open', takerId: null, createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: null, confirmedAt: null, cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: null,
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);
  // 底部入口可见
  await expect(page.locator('#share-card-btn')).toBeVisible();
  // 打开任务详情（供任务卡使用）后关闭
  await page.locator('.task-card').first().click();
  await expect(page.locator('#detail-modal')).toBeVisible();
  await page.locator('#detail-modal [data-act=close]').click();
  // 打开分享面板 → 平台卡默认生成
  await page.locator('#share-card-btn').click();
  await expect(page.locator('#share-modal')).toBeVisible();
  await expect(page.locator('#share-preview img')).toBeVisible();
  const src1 = await page.locator('#share-preview img').getAttribute('src');
  expect(src1.startsWith('data:image/png')).toBe(true);
  // 切任务卡
  await page.locator('#share-tabs .tab[data-stype=task]').click();
  await expect(page.locator('#share-preview img')).toBeVisible();
  const src2 = await page.locator('#share-preview img').getAttribute('src');
  expect(src2).not.toBe(src1);
  // 保存图片触发下载
  const dl = page.waitForEvent('download');
  await page.locator('#share-save').click();
  const d = await dl;
  expect(d.suggestedFilename()).toContain('任务卡.png');
});


test('发布表单：必填字段校验提示（联系方式缺失拦截）', async ({ page }) => {
  const store = newStore();
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);
  await uiRegisterAndLogin(page, store, 'req@test.com', '必填君', 'secret123');
  await page.locator('#fab-publish').click();
  await page.fill('#p-title', '帮取快递');
  await page.fill('#p-reward', '2');
  await page.fill('#p-pickup', '菜鸟驿站');
  await page.fill('#p-dropoff', '宿舍');
  await page.locator('#pub-submit').click();
  await expect(page.locator('#pub-hint')).toContainText('联系方式');
  await page.fill('#p-contact', '13800138000');
  await page.locator('#pub-submit').click();
  await expect(page.locator('#toast')).toContainText('发布成功');
});

test('分享深链：?task=ID 打开页面自动进入任务详情', async ({ page }) => {
  const store = newStore();
  store.tasks.push({
    id: 7, publisherId: 'u0', title: '深链任务', description: '', reward: 5,
    pickup: 'A', dropoff: 'B', contact: '13800000000', deadline: null, status: 'open',
    takerId: null, createdAt: Date.now(), updatedAt: Date.now(), completedAt: null,
    confirmedAt: null, cancelledAt: null, cancelReason: '', publisherName: '发布者', takerName: null,
  });
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE + '?task=7');
  await expect(page.locator('#detail-modal')).toBeVisible();
  await expect(page.locator('#detail-body')).toContainText('深链任务');
});

test('添加到主屏幕：beforeinstallprompt 触发后显示安装区块', async ({ page }) => {
  const store = newStore();
  mockAuthApi(page, store);
  mockErrandApi(page, store);
  await page.goto(BASE);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
  await expect(page.locator('#install-site')).toBeHidden();
  await page.evaluate(() => {
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    ev.prompt = () => Promise.resolve();
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(ev);
  });
  await expect(page.locator('#install-site')).toBeVisible();
  await expect(page.locator('#install-hint')).toHaveText('像 App 一样从桌面直接打开');
  await page.locator('#install-btn').click();
  await expect(page.locator('#install-site')).toBeHidden();
});
