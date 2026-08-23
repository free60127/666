// 线上跑腿 API 闭环验证：注册2用户 → 发布 → 接单 → 完成 → 确认 → 管理端清理
const BASE = 'https://api.free60127.top/api';
const ADMIN = process.env.WAIYUAN_ADMIN_TOKEN;

const j = (r) => r.json().catch(() => ({}));
async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await j(r);
  return { status: r.status, data };
}

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? ' ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' ' + extra : '')); }
};

const emailA = 'errand-a-' + Date.now() + '@test.com';
const emailB = 'errand-b-' + Date.now() + '@test.com';
const passwd = 'secret123';

const regA = await api('/auth/register', { method: 'POST', body: { email: emailA, password: passwd, nickname: '验证发布者' } });
check('注册A', regA.status === 201 || regA.status === 200, 's=' + regA.status);
const tokA = regA.data.token;
const regB = await api('/auth/register', { method: 'POST', body: { email: emailB, password: passwd, nickname: '验证接单者' } });
check('注册B', regB.status === 201 || regB.status === 200, 's=' + regB.status);
const tokB = regB.data.token;
if (!tokA || !tokB) { console.log('注册失败，中止'); process.exit(1); }

const task = await api('/errand/tasks', {
  method: 'POST', token: tokA,
  body: { title: '线上验证任务', description: '闭环验证', reward: 2, pickup: 'A', dropoff: 'B', contact: '线上验证联系', deadline: null },
});
check('发布任务', task.status === 201 && task.data.task && task.data.task.id, 's=' + task.status);
const tid = task.data.task && task.data.task.id;

const list = await api('/errand/tasks?status=open');
check('列表可见', list.status === 200 && list.data.items && list.data.items.some(t => t.id === tid));

const selfTake = await api('/errand/tasks/' + tid + '/take', { method: 'POST', token: tokA });
check('自接被拒', selfTake.status === 400, 's=' + selfTake.status);

const take = await api('/errand/tasks/' + tid + '/take', { method: 'POST', token: tokB });
check('B接单', take.status === 200 && take.data.task && take.data.task.status === 'doing', 's=' + take.status);

const take2 = await api('/errand/tasks/' + tid + '/take', { method: 'POST', token: tokB });
check('重复接单409', take2.status === 409, 's=' + take2.status);

const wrongComplete = await api('/errand/tasks/' + tid + '/complete', { method: 'POST', token: tokA });
check('非接单者完成被拒', wrongComplete.status === 400, 's=' + wrongComplete.status);

const complete = await api('/errand/tasks/' + tid + '/complete', { method: 'POST', token: tokB });
check('B完成', complete.status === 200 && complete.data.task && complete.data.task.status === 'done', 's=' + complete.status);

const confirm = await api('/errand/tasks/' + tid + '/confirm', { method: 'POST', token: tokA });
check('A确认', confirm.status === 200 && !!confirm.data.task.confirmedAt, 's=' + confirm.status);

const doneList = await api('/errand/tasks?status=done');
check('done列表含任务', doneList.status === 200 && doneList.data.items && doneList.data.items.some(t => t.id === tid));

const minePosted = await api('/errand/mine?role=posted', { token: tokA });
check('A的mine-posted含任务', minePosted.status === 200 && minePosted.data.items && minePosted.data.items.some(t => t.id === tid));
const mineTaken = await api('/errand/mine?role=taken', { token: tokB });
check('B的mine-taken含任务', mineTaken.status === 200 && mineTaken.data.items && mineTaken.data.items.some(t => t.id === tid));

// 评价闭环：确认后双方互评
const revNoAuth = await api('/errand/reviews', { method: 'POST', body: { taskId: tid, rating: 5 } });
check('未登录评价 401', revNoAuth.status === 401, 's=' + revNoAuth.status);
const revA = await api('/errand/reviews', { method: 'POST', token: tokA, body: { taskId: tid, rating: 5, comment: '线上验证-靠谱' } });
check('A评价B 201', revA.status === 201, 's=' + revA.status);
const revDup = await api('/errand/reviews', { method: 'POST', token: tokA, body: { taskId: tid, rating: 4 } });
check('重复评价 400', revDup.status === 400, 's=' + revDup.status);
const revB = await api('/errand/reviews', { method: 'POST', token: tokB, body: { taskId: tid, rating: 4, comment: '线上验证-顺畅' } });
check('B评价A 201', revB.status === 201, 's=' + revB.status);
const revList = await api('/errand/reviews?taskId=' + tid);
check('评价列表 2 条', revList.status === 200 && revList.data.reviews.length === 2, 'n=' + (revList.data.reviews || []).length);
const revAnon = await api('/errand/reviews?taskId=' + tid);
check('匿名可看评价', revAnon.status === 200 && revAnon.data.reviews.length === 2);

// 联系方式脱敏：接单前详情对匿名/非双方不可见，接单成功后接单者可见
const detAnon = await api('/errand/tasks/' + tid);
check('匿名详情联系方式脱敏', detAnon.status === 200 && detAnon.data.task.contact === '', 'contact=' + JSON.stringify(detAnon.data.task.contact));
const detB = await api('/errand/tasks/' + tid, { token: tokB });
check('接单者详情可见联系方式', detB.status === 200 && detB.data.task.contact === '线上验证联系', 'contact=' + JSON.stringify(detB.data.task.contact));
const detOther = await api('/errand/tasks/' + tid, { token: tokA });
// A 是发布者 → 可见
check('发布者详情可见联系方式', detOther.status === 200 && detOther.data.task.contact === '线上验证联系');
const anon = await api('/errand/tasks');
check('匿名可浏览列表', anon.status === 200);

// 申诉 + 证据 + 管理端（2026-08-22）
const emailC = 'errand-c-' + Date.now() + '@test.com';
const regC = await api('/auth/register', { method: 'POST', body: { email: emailC, password: passwd, nickname: '验证路人' } });
const tokC = regC.data.token;
const dOther = await api('/errand/disputes', { method: 'POST', token: tokC, body: { taskId: tid, reason: '路人申诉' } });
check('路人申诉 403', dOther.status === 403, 's=' + dOther.status);
const dOk = await api('/errand/disputes', {
  method: 'POST', token: tokA,
  body: { taskId: tid, reason: '线上验证申诉', detail: '对方没有履约', evidence: ['data:image/png;base64,iVBORw0KGgo='] },
});
check('A申诉 201（role=publisher）', dOk.status === 201 && dOk.data.dispute && dOk.data.dispute.role === 'publisher' && dOk.data.dispute.status === 'open', 's=' + dOk.status);
const dDup = await api('/errand/disputes', { method: 'POST', token: tokA, body: { taskId: tid, reason: '再来一次' } });
check('重复open申诉 400', dDup.status === 400, 's=' + dDup.status);
const dList = await api('/errand/disputes?taskId=' + tid, { token: tokA });
check('双方可见申诉列表', dList.status === 200 && dList.data.disputes.length === 1 && dList.data.disputes[0].userName === '验证发布者', 's=' + dList.status);
const dListOther = await api('/errand/disputes?taskId=' + tid, { token: tokC });
check('路人查看申诉 403', dListOther.status === 403, 's=' + dListOther.status);
const dListAnon = await api('/errand/disputes?taskId=' + tid);
check('匿名查看申诉 403', dListAnon.status === 403, 's=' + dListAnon.status);

// 注销拦截（2026-08-22）：有进行中跑腿任务时禁止注销
const emailD = 'errand-d-' + Date.now() + '@test.com';
const regD = await api('/auth/register', { method: 'POST', body: { email: emailD, password: passwd, nickname: '注销测试' } });
check('注册D', regD.status === 201 || regD.status === 200, 's=' + regD.status);
const tokD = regD.data.token;
if (tokD) {
  const taskD = await api('/errand/tasks', { method: 'POST', token: tokD, body: { title: '注销拦截任务', reward: 1, pickup: 'A', dropoff: 'B', contact: '', deadline: null } });
  const tidD = taskD.data.task && taskD.data.task.id;
  check('D发布任务', taskD.status === 201 && tidD, 's=' + taskD.status);
  const delBlocked = await api('/auth/delete-account', { method: 'POST', token: tokD, body: { password: passwd } });
  check('有进行中任务注销被拒 400', delBlocked.status === 400 && /跑腿/.test((delBlocked.data && delBlocked.data.error) || ''), 's=' + delBlocked.status + ' ' + ((delBlocked.data && delBlocked.data.error) || ''));
  const cancelD = await api('/errand/tasks/' + tidD + '/cancel', { method: 'POST', token: tokD });
  check('D取消任务', cancelD.status === 200, 's=' + cancelD.status);
  const delOk = await api('/auth/delete-account', { method: 'POST', token: tokD, body: { password: passwd } });
  check('取消后注销成功 200', delOk.status === 200, 's=' + delOk.status);
}

if (ADMIN) {
  const aTasksNoAuth = await api('/errand/admin/tasks');
  check('adminTasks 无token 401', aTasksNoAuth.status === 401, 's=' + aTasksNoAuth.status);
  const aTasks = await api('/errand/admin/tasks?pageSize=50', { token: ADMIN });
  check('adminTasks 含任务与联系方式', aTasks.status === 200 && aTasks.data.items && aTasks.data.items.some(t => t.id === tid && t.contact === '线上验证联系'), 's=' + aTasks.status);
  const aDisp = await api('/errand/disputes', { token: ADMIN });
  check('admin全量申诉含1条', aDisp.status === 200 && aDisp.data.disputes.length === 1 && aDisp.data.disputes[0].userName === '验证发布者', 's=' + aDisp.status);
  const did = dOk.data.dispute.id;
  const resNoAuth = await api('/errand/admin/disputes/' + did, { method: 'PATCH', body: { status: 'resolved', note: 'x' } });
  check('处理申诉无token 401', resNoAuth.status === 401, 's=' + resNoAuth.status);
  const res = await api('/errand/admin/disputes/' + did, { method: 'PATCH', token: ADMIN, body: { status: 'resolved', note: '已核实，双方协商一致' } });
  check('处理申诉 resolved+备注', res.status === 200 && res.data.dispute.status === 'resolved' && res.data.dispute.adminNote === '已核实，双方协商一致', 's=' + res.status);
  // 证据读取（2026-08-22）
  const evNoAuth = await api('/errand/disputes/' + did + '/evidence');
  check('证据 无token 401', evNoAuth.status === 401, 's=' + evNoAuth.status);
  const evParty = await api('/errand/disputes/' + did + '/evidence', { token: tokA });
  check('证据 双方可见 1张', evParty.status === 200 && Array.isArray(evParty.data.evidence) && evParty.data.evidence.length === 1, 's=' + evParty.status);
  const evAdmin = await api('/errand/disputes/' + did + '/evidence', { token: ADMIN });
  check('证据 管理端可见', evAdmin.status === 200 && evAdmin.data.evidence && evAdmin.data.evidence.length === 1 && evAdmin.data.evidence[0].data.indexOf('data:image/png;base64,') === 0, 's=' + evAdmin.status);
  // 隐藏内部 ID：双方申诉视图无 userId
  const dListAfter = await api('/errand/disputes?taskId=' + tid, { token: tokA });
  check('申诉双方视图无 userId', dListAfter.status === 200 && dListAfter.data.disputes.length === 1 && dListAfter.data.disputes[0].userId === undefined, 's=' + dListAfter.status);
  const res2 = await api('/errand/admin/disputes/' + did, { method: 'PATCH', token: ADMIN, body: { status: 'rejected' } });
  check('重复处理 400', res2.status === 400, 's=' + res2.status);
  const del = await api('/errand/admin/tasks/' + tid, { method: 'DELETE', token: ADMIN });
  check('管理端删除任务', del.status === 200, 's=' + del.status);
  const gone = await api('/errand/tasks/' + tid);
  check('删除后详情 404', gone.status === 404, 's=' + gone.status);
  const aDisp2 = await api('/errand/disputes', { token: ADMIN });
  check('级联删除申诉', aDisp2.status === 200 && !aDisp2.data.disputes.some(d => d.taskId === tid), 's=' + aDisp2.status);
  // 审计日志（2026-08-22）
  const logsNoAuth = await api('/errand/admin/logs');
  check('审计日志 无token 401', logsNoAuth.status === 401, 's=' + logsNoAuth.status);
  const logs = await api('/errand/admin/logs?pageSize=50', { token: ADMIN });
  const larr = (logs.data && logs.data.logs) || [];
  check('审计日志 含 resolve 与 delete', logs.status === 200 && larr.some(l => l.action === 'errand.dispute.resolve' && (l.detail || '').indexOf('dispute ' + did) === 0) && larr.some(l => l.action === 'errand.task.delete' && (l.detail || '').indexOf('task ' + tid) === 0), 's=' + logs.status);
  check('审计日志 admin 前缀脱敏', larr.filter(l => l.action === 'errand.task.delete').every(l => l.admin && l.admin.length <= 12), '');
} else {
  console.log('  - 无 ADMIN_TOKEN，跳过管理端验证');
}

// ===== 2026-08-23 审查整改验证：字段校验 / 限流 / 路径白名单 =====
{
  // 必填字段（前后端一致：pickup/dropoff/contact 必填）
  const noContact = await api('/errand/tasks', { method: 'POST', token: tokA, body: { title: '缺联系方式', reward: 1, pickup: 'A', dropoff: 'B' } });
  check('发布缺联系方式 400', noContact.status === 400 && String(noContact.data.error || '').includes('联系方式'), 's=' + noContact.status);
  const noPickup = await api('/errand/tasks', { method: 'POST', token: tokA, body: { title: '缺取件地', reward: 1, dropoff: 'B', contact: 'x' } });
  check('发布缺取件地点 400', noPickup.status === 400 && String(noPickup.data.error || '').includes('取件'), 's=' + noPickup.status);
  const badDeadline = await api('/errand/tasks', { method: 'POST', token: tokA, body: { title: '非整数截止', reward: 1, pickup: 'A', dropoff: 'B', contact: 'x', deadline: 1.5e12 + 0.5 } });
  check('非安全整数截止 400', badDeadline.status === 400, 's=' + badDeadline.status);
  // 注册限流：邮箱维度 1 小时 5 次，第 6 次 429
  let reg429 = false;
  const regEmail = 'rl-' + Date.now() + '@test.com';
  for (let i = 0; i < 7; i++) {
    const r = await api('/auth/register', { method: 'POST', body: { email: regEmail, password: 'secret123' } });
    if (r.status === 429) { reg429 = true; break; }
  }
  check('注册邮箱限流 429（第 6 次）', reg429, '');
  // forgot 防枚举 + 邮箱 1 分钟 1 次限流（未注册邮箱不发信，安全）
  const fMail = 'nobody-' + Date.now() + '@test.com';
  const f1 = await api('/auth/forgot', { method: 'POST', body: { email: fMail } });
  const f2 = await api('/auth/forgot', { method: 'POST', body: { email: fMail } });
  check('forgot 未注册邮箱 200（防枚举）+ 二次 429', f1.status === 200 && f2.status === 429, 's1=' + f1.status + ' s2=' + f2.status);
  // /api/visit：IP 限流（60/分钟） + 路径白名单
  const vid = 'a'.repeat(32);
  let visit429 = false;
  for (let i = 0; i < 61; i++) {
    const r = await api('/visit', { method: 'POST', body: { vid, path: '/验证页' } });
    if (r.status === 429) { visit429 = true; break; }
  }
  check('visit IP 限流 429（61 次内触发）', visit429, '');
  const badPath = await api('/visit', { method: 'POST', body: { vid, path: '/a//b' } });
  check('visit 双斜杠路径 400', badPath.status === 400, 's=' + badPath.status);
  const badPath2 = await api('/visit', { method: 'POST', body: { vid, path: '/../etc' } });
  check('visit 路径穿越 400', badPath2.status === 400, 's=' + badPath2.status);
}
if (ADMIN) {
  const c1 = await api('/auth/account?email=' + encodeURIComponent(emailA), { method: 'DELETE', token: ADMIN });
  const c2 = await api('/auth/account?email=' + encodeURIComponent(emailB), { method: 'DELETE', token: ADMIN });
  check('清理账号A', c1.status === 200, 's=' + c1.status);
  check('清理账号B', c2.status === 200, 's=' + c2.status);
  const gone = await api('/errand/tasks/' + tid);
  check('级联删除任务', gone.status === 404, 's=' + gone.status);
} else {
  console.log('  - 无 ADMIN_TOKEN，跳过清理（测试账号残留：' + emailA + ', ' + emailB + '）');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);