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
