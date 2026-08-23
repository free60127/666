/* ============================================================
   学习中心 · 云端同步模块（恢复码 + AES-GCM 加密）
   - 恢复码：32 字节随机（base64url 43 字符），是用户唯一的钥匙
   - deviceId = SHA-256(恢复码)（服务端只存哈希，即使 KV 泄露也推不出恢复码）
   - payload 加密：PBKDF2(恢复码, salt, 120000, SHA-256) 派生 AES-GCM-256 密钥，
     云端存储的是密文，管理员也读不到学习内容
   - 兼容浏览器（window.WaiyuanCloudSync）与 Node（module.exports，便于测试）
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.WaiyuanCloudSync = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const DEFAULT_API = 'https://api.free60127.top';
  const apiBase = () => (root && root.WAIYUAN_API_BASE) || DEFAULT_API;

  const subtle = () => {
    const c = (root && root.crypto) || globalThis.crypto;
    if (!c || !c.subtle) throw new Error('当前环境不支持 Web Crypto（请使用 https 访问）');
    return c.subtle;
  };
  const randomBytes = n => {
    const c = (root && root.crypto) || globalThis.crypto;
    if (!c || !c.getRandomValues) throw new Error('当前环境不支持加密随机数');
    return c.getRandomValues(new Uint8Array(n));
  };

  // 分块 base64url：String.fromCharCode(...bytes) 对 1~2MB 数据会 RangeError 爆栈（审查 2026-08-23），按 0x8000 分块
  const b64 = bytes => {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64 = text => Uint8Array.from(atob(String(text).replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));

  /** 生成恢复码：32 字节随机 -> base64url（43 字符，约 256 bit 熵） */
  function createCode() { return b64(randomBytes(32)); }

  /** 恢复码 -> 服务端 deviceId（SHA-256 hex，64 字符） */
  async function sha256Hex(text) {
    const digest = await subtle().digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }

  async function deriveKey(code, salt) {
    const baseKey = await subtle().importKey('raw', new TextEncoder().encode(String(code)), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle().deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, baseKey, 256);
    return subtle().importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  /** 加密备份对象 -> {v:1, s:salt, i:iv, c:密文}（全部 base64url） */
  async function encrypt(code, data) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await deriveKey(code, salt);
    const cipher = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    return { v: 1, s: b64(salt), i: b64(iv), c: b64(new Uint8Array(cipher)) };
  }

  /** 解密 {v,s,i,c} -> 原对象；恢复码错误会抛异常 */
  async function decrypt(code, payload) {
    if (!payload || !payload.s || !payload.i || !payload.c) throw new Error('云端数据格式无效');
    const salt = unb64(payload.s);
    const iv = unb64(payload.i);
    const cipher = unb64(payload.c);
    const key = await deriveKey(code, salt);
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /* ---------- 合并（云端恢复 -> 本地）----------
     目标：两边独有数据都保留；重复条目取时间较新者；
     无法可靠比较时间的（背单词 FSRS 卡片、附加数据叶子）云端优先（恢复语义）。 */
  const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
  const newer = (a, b, fields) => {
    const t = r => { if (!r) return 0; for (const f of fields) { const n = Number(r[f]) || 0; if (n) return n; } return 0; };
    return t(b) >= t(a) ? b : a;
  };
  const mergeObjects = (a, b, preferLocal) => {
    if (!isObject(a)) return b === undefined ? a : preferLocal ? a : b;
    if (!isObject(b)) return b === undefined ? a : b;
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      out[k] = k in a && k in b ? mergeObjects(a[k], b[k], preferLocal) : k in a ? a[k] : b[k];
    }
    return out;
  };
  const mergeByKey = (a, b, picker) => {
    const out = {};
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) out[k] = picker((a || {})[k], (b || {})[k]);
    return out;
  };

  /** 合并两份备份（createBackup 格式：{format,version,data:{webQuiz,vocabulary,extra}}）
   *  prefer='cloud'（默认，恢复语义）：FSRS 卡片/附加数据叶子云端优先
   *  prefer='local'（备份语义）：本地优先（本设备刚改的数据不丢）
   *  时间戳类字段（progress/favorites/history）天然按较新者取，方向无关 */
  function mergeBackup(local, cloud, prefer) {
    const l = (local && local.data) || {};
    const c = (cloud && cloud.data) || {};
    const lw = l.webQuiz || {};
    const cw = c.webQuiz || {};
    // vocabulary 兼容两种形态：直接对象（words/history/...）或 {storageKey, progress} 包裹（createBackup 原样）
    const unwrap = v => (v && v.progress && typeof v.progress === 'object' && !('words' in v) ? v.progress : v);
    const lv = unwrap(l.vocabulary || {});
    const cv = unwrap(c.vocabulary || {});
    const localWins = prefer === 'local';

    const progress = mergeByKey(lw.progress, cw.progress, (a, b) => newer(a, b, ['lastViewedAt', 'updatedAt']));
    const favorites = mergeByKey(lw.favorites, cw.favorites, (a, b) => newer(a, b, ['updatedAt']));
    const settings = Object.assign({}, localWins ? cw.settings || {} : lw.settings || {}, localWins ? lw.settings || {} : cw.settings || {});

    const pickWord = (a, b) => (a === undefined ? b : b === undefined ? a : localWins ? a : b); // FSRS 冲突：恢复云端优先 / 备份本地优先
    const words = mergeByKey(lv.words, cv.words, pickWord);
    const history = mergeByKey(lv.history, cv.history, (a, b) => {
      if (!a) return b; if (!b) return a;
      return { reviews: Math.max(a.reviews || 0, b.reviews || 0), correct: Math.max(a.correct || 0, b.correct || 0) };
    });
    const sequence = localWins ? (lv.sequence !== undefined ? lv.sequence : cv.sequence) : (cv.sequence !== undefined ? cv.sequence : lv.sequence);
    const vocabSettings = Object.assign({}, localWins ? cv.settings || {} : lv.settings || {}, localWins ? lv.settings || {} : cv.settings || {});
    const vocabulary = { words, history, sequence, settings: vocabSettings };

    const extra = mergeObjects(l.extra || {}, c.extra || {}, localWins);

    return {
      format: (cloud && cloud.format) || 'waiyuan-study-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      data: { webQuiz: { version: 2, progress, favorites, settings }, vocabulary, extra },
    };
  }

  /* ---------- 云端传输 ---------- */
  async function request(path, options, base) {
    const res = await fetch((base || apiBase()) + path, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error((body && body.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.body = body;  // 409 冲突时携带云端最新 {rev,payload}，供调用方合并重试
      throw err;
    }
    return res.json();
  }

  /** 上传（自动合并，永不覆盖他人更新）：
   *  先下载云端 → 本地与云端合并（prefer=local，本设备刚改的数据优先）→ 带 baseRev 上传；
   *  服务端检测到云端已有更新（baseRev ≠ 当前 rev）→ 409，自动拉最新合并重试一次 */
  async function uploadWithMerge(code, payload, base, deviceId) {
    let cloud = null;
    try { cloud = await download(code, base); } catch (_) {}  // 下载失败不阻断首次上传
    let merged = payload, baseRev = 0;
    if (cloud && cloud.payload) {
      merged = mergeBackup(payload, cloud.payload, 'local');
      baseRev = Number(cloud.rev) || 0;
    }
    const attempt = async () => request('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, payload: merged, baseRev }),
    }, base);
    try {
      return await attempt();
    } catch (err) {
      if (err && err.status === 409 && err.body && err.body.payload) {
        // 并发写入：拉取最新云端数据合并后重试（仅一次，再冲突抛给上层提示）
        merged = mergeBackup(merged, err.body.payload, 'local');
        baseRev = Number(err.body.rev) || 0;
        return request('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, payload: merged, baseRev }),
        }, base);
      }
      throw err;
    }
  }

  /** 上传备份（自动合并，不丢云端数据）：payload 为 encrypt() 结果 */
  async function backup(code, payload, base) {
    const deviceId = await sha256Hex(code);
    return uploadWithMerge(code, payload, base, deviceId);
  }

  /** 下载：返回 {rev, payload, updatedAt}；云端无数据返回 null（rev 供下次上传做冲突检测） */
  async function download(code, base) {
    const deviceId = await sha256Hex(code);
    const res = await fetch((base || apiBase()) + '/api/sync?deviceId=' + encodeURIComponent(deviceId));
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body && body.error) || ('HTTP ' + res.status));
    }
    return res.json();
  }

  /** 删除云端备份 */
  async function remove(code, base) {
    const deviceId = await sha256Hex(code);
    return request('/api/sync?deviceId=' + encodeURIComponent(deviceId), { method: 'DELETE' }, base);
  }

  /* ---------- 账号模式（2026-08-22）：登录后数据键 user:{id} + Bearer 鉴权 ----------
     与匿名（恢复码）数据完全隔离；登录后调用 migrateAnonymous 自动把旧匿名数据搬进账号 */
  let identity = null;  // { token, userId }
  function setAuth(token, userId) { identity = { token: String(token), userId: String(userId) }; }
  function clearAuth() { identity = null; }
  function isAuthed() { return !!(identity && identity.token && identity.userId); }
  const authHeaders = () => ({ Authorization: 'Bearer ' + identity.token });

  /** 账号模式上传（无需 deviceId，worker 按会话解析 user 键；payload 仍为 encrypt() 密文）
   *  与 backup 相同：先下载云端 → 合并（local 优先）→ 带 baseRev 上传，409 自动重试一次 */
  async function backupAccount(payload, base) {
    if (!isAuthed()) throw new Error('未登录，请先登录账号');
    let cloud = null;
    try { cloud = await downloadAccount(base); } catch (_) {}
    let merged = payload, baseRev = 0;
    if (cloud && cloud.payload) {
      merged = mergeBackup(payload, cloud.payload, 'local');
      baseRev = Number(cloud.rev) || 0;
    }
    const attempt = async () => request('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ payload: merged, baseRev }),
    }, base);
    try {
      return await attempt();
    } catch (err) {
      if (err && err.status === 409 && err.body && err.body.payload) {
        merged = mergeBackup(merged, err.body.payload, 'local');
        baseRev = Number(err.body.rev) || 0;
        return request('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ payload: merged, baseRev }),
        }, base);
      }
      throw err;
    }
  }

  /** 账号模式下载：返回 {payload, updatedAt}；无数据返回 null */
  async function downloadAccount(base) {
    if (!isAuthed()) throw new Error('未登录，请先登录账号');
    const res = await fetch((base || apiBase()) + '/api/sync', { headers: authHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body && body.error) || ('HTTP ' + res.status));
    }
    return res.json();
  }

  /** 账号模式删除 */
  async function removeAccount(base) {
    if (!isAuthed()) throw new Error('未登录，请先登录账号');
    return request('/api/sync', { method: 'DELETE', headers: authHeaders() }, base);
  }

  /** 匿名 → 账号一次性迁移（登录后调用）：
     账号云端无数据 && 匿名云端有数据 → 搬过去并删除匿名；返回 {status:'migrated'|'noop'|'skipped'} */
  async function migrateAnonymous(code, base) {
    if (!isAuthed()) return { status: 'noop' };
    const account = await downloadAccount(base);
    if (account && account.payload) return { status: 'skipped' };  // 账号已有数据，不覆盖
    if (!code) return { status: 'noop' };
    const anon = await download(code, base);
    if (!anon || !anon.payload) return { status: 'noop' };
    await backupAccount(anon.payload, base);
    await remove(code, base);
    return { status: 'migrated', size: JSON.stringify(anon.payload).length, updatedAt: anon.updatedAt };
  }

  /* ---------- 恢复码本地持久化（浏览器端；Node 测试不使用）---------- */
  const CODE_KEY = 'waiyuan-cloud-recovery-code-v1';
  function loadCode() {
    try {
      const raw = JSON.parse(localStorage.getItem(CODE_KEY) || 'null');
      return raw && typeof raw.code === 'string' && raw.code ? raw.code : '';
    } catch (_) { return ''; }
  }
  function saveCode(code) {
    try { localStorage.setItem(CODE_KEY, JSON.stringify({ code: String(code), updatedAt: new Date().toISOString() })); } catch (_) {}
  }
  function clearCode() {
    try { localStorage.removeItem(CODE_KEY); } catch (_) {}
  }

  return { createCode, sha256Hex, encrypt, decrypt, mergeBackup, backup, download, remove, setAuth, clearAuth, isAuthed, backupAccount, downloadAccount, removeAccount, migrateAnonymous, loadCode, saveCode, clearCode, DEFAULT_API };
});
