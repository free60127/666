/* ============================================================
   学习中心 · 账号登录模块（D1 账号体系）
   - 登录态：localStorage waiyuan-auth-v1（token + user）
   - 恢复码保险箱：把恢复码用「密码派生密钥」加密存账号（服务端不可读）；
     换设备登录后用同一密码解密，自动解锁云端数据
   - 兼容浏览器（window.WaiyuanAuth）与 Node（module.exports，便于测试）
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.WaiyuanAuth = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const DEFAULT_API = 'https://api.free60127.top';
  const apiBase = () => (root && root.WAIYUAN_API_BASE) || DEFAULT_API;
  const LS_KEY = 'waiyuan-auth-v1';
  const PBKDF2_ITERATIONS = 150000;

  const cryptoObj = () => (root && root.crypto) || globalThis.crypto;
  const subtle = () => {
    const c = cryptoObj();
    if (!c || !c.subtle) throw new Error('当前环境不支持 Web Crypto（请使用 https 访问）');
    return c.subtle;
  };
  const randomBytes = n => {
    const c = cryptoObj();
    if (!c || !c.getRandomValues) throw new Error('当前环境不支持加密随机数');
    return c.getRandomValues(new Uint8Array(n));
  };
  const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = text => Uint8Array.from(atob(String(text).replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));

  async function deriveKey(password, salt) {
    const baseKey = await subtle().importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle().deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, baseKey, 256);
    return subtle().importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  /** 用密码加密恢复码 → {salt,iv,c}（base64url） */
  async function lockRecovery(password, recoveryCode) {
    if (!recoveryCode) throw new Error('没有可绑定的恢复码');
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await deriveKey(password, salt);
    const cipher = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(recoveryCode)));
    return { salt: b64(salt), iv: b64(iv), c: b64(new Uint8Array(cipher)) };
  }

  /** 用密码解密恢复码（密码错误抛异常） */
  async function unlockRecovery(password, box) {
    if (!box || !box.salt || !box.iv || !box.c) throw new Error('账号未绑定恢复码');
    const key = await deriveKey(password, unb64(box.salt));
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.c));
    return new TextDecoder().decode(plain);
  }

  /* ---------- 登录态 ---------- */
  function getSession() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      return raw && raw.token ? raw : null;
    } catch (_) { return null; }
  }
  function isLoggedIn() { return !!getSession(); }
  function saveSession(session) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(session)); } catch (_) {}
  }
  function clearSession() {
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
  }

  /* ---------- API ---------- */
  async function api(path, options, base) {
    const res = await fetch((base || apiBase()) + path, options);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 会话失效（Token 过期/服务端已哈希改造/账号删除）：自动清理本地登录态，避免界面显示已登录但同步失败
      if (res.status === 401 && !path.endsWith('/login') && !path.endsWith('/register')) clearSession();
      throw new Error(body && body.error ? body.error : ('HTTP ' + res.status));
    }
    return body;
  }

  async function register(input, base) {
    return api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }, base);
  }

  async function login(input, base) {
    return api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }, base);
  }

  async function logout(token, base) {
    return api('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    }, base);
  }

  async function me(token, base) {
    return api('/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
    }, base);
  }

  async function setRecovery(token, box, base) {
    return api('/api/auth/recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ recovery: box }),
    }, base);
  }

  return { lockRecovery, unlockRecovery, getSession, saveSession, clearSession, isLoggedIn, register, login, logout, me, setRecovery, LS_KEY };
});
