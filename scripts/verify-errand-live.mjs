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
  const res2 = await api('/errand/admin/disputes/' + did, { method: 'PATCH', token: ADMIN, body: { status: 'rejected' } });
  check('重复处理 400', res2.status === 400, 's=' + res2.status);
  const del = await api('/errand/admin/tasks/' + tid, { method: 'DELETE', token: ADMIN });
  check('管理端删除任务', del.status === 200, 's=' + del.status);
  const gone = await api('/errand/tasks/' + tid);
  check('删除后详情 404', gone.status === 404, 's=' + gone.status);
  const aDisp2 = await api('/errand/disputes', { token: ADMIN });
  check('级联删除申诉', aDisp2.status === 200 && !aDisp2.data.disputes.some(d => d.taskId === tid), 's=' + aDisp2.status);
} else {
  console.log('  - 无 ADMIN_TOKEN，跳过管理端验证');
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
