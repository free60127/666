// 线上真实闭环验证：注册 → me → logout → 登录 → 恢复码保险箱解锁 → 异常分支
// 运行：node scripts/verify-auth-live.mjs
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const mod = await import('../学习中心/auth.js');
const Auth = mod.default || globalThis.WaiyuanAuth;

const API = 'https://api.free60127.top';
const email = 'authtest-' + Date.now().toString(36) + '@example.com';
const password = 'test-password-123';
let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, detail); }
};

console.log('1) 注册（带恢复码保险箱）');
const recoveryCode = 'LIVE'.padEnd(43, 'Q');
const box = await Auth.lockRecovery(password, recoveryCode);
const reg = await Auth.register({ email, password, nickname: '线上测试', recovery: box });
check('register 201 成功', !!reg.token && reg.user.email === email, JSON.stringify(reg).slice(0, 120));
check('响应无 recovery（注册不返回密文）', reg.recovery === undefined);
const token = reg.token;

console.log('2) me / logout / 会话失效');
const me1 = await Auth.me(token);
check('me 返回用户', me1.user && me1.user.email === email && me1.user.nickname === '线上测试');
await Auth.logout(token);
let meAfter = null, meAfterErr = '';
try { meAfter = await Auth.me(token); } catch (e) { meAfterErr = e.message; }
check('logout 后 me 401', !meAfter && /unauthorized|401/.test(meAfterErr), meAfterErr);

console.log('3) 登录 + 恢复码保险箱解锁');
const login = await Auth.login({ email, password });
check('login 返回 token + recovery', !!login.token && !!login.recovery);
const unlocked = await Auth.unlockRecovery(password, login.recovery);
check('unlockRecovery 还原恢复码', unlocked === recoveryCode);

console.log('4) 异常分支');
let dup = null, dupErr = '';
try { await Auth.register({ email, password }); } catch (e) { dupErr = e.message; dup = e; }
check('重复邮箱被拒', /已注册/.test(dupErr), dupErr);
let bad = null, badErr = '';
try { await Auth.login({ email, password: 'wrong-password' }); } catch (e) { badErr = e.message; bad = e; }
check('错误密码 401', /不正确/.test(badErr), badErr);
let weak = null, weakErr = '';
try { await Auth.register({ email: 'x@y.com', password: 'short' }); } catch (e) { weakErr = e.message; }
check('弱密码被拒', /8 位/.test(weakErr), weakErr);

console.log(`\n线上结果：${passed} 通过 / ${failed} 失败（测试账号 ${email}）`);
process.exit(failed ? 1 : 0);
