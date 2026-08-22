/* 极简 SMTP 客户端（Cloudflare Workers TCP sockets，2026-08-22）
 * 用于找回密码发信：直连 smtp.qq.com:465（TLS），AUTH LOGIN + QQ 邮箱授权码。
 * 配置（wrangler secret put）：SMTP_USER（如 3338095791@qq.com）、SMTP_PASS（QQ 授权码，非 QQ 密码）、
 *   SMTP_HOST（缺省 smtp.qq.com）、SMTP_PORT（缺省 465）、SMTP_FROM（缺省 SMTP_USER）。
 * 未配置时 sendEmail 返回 {ok:false}（forgot 接口据此返回 503，不影响其他功能）。
 * 测试钩子：env.SMTP_TEST_MODE 时邮件 push 到 env.SMTP_SENT 而不真发（test-auth 用）。
 */
/* cloudflare:sockets 仅在 Workers 运行时可用；Node 测试环境动态加载失败时置 null（sendEmail 用 SMTP_TEST_MODE 分支） */
let connect = null;
try { ({ connect } = await import('cloudflare:sockets')); } catch (_) { connect = null; }

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

async function readLine(reader, buffer, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const nl = buffer.indexOf(10);
    if (nl >= 0) {
      const bytes = buffer.splice(0, nl + 1);
      return DECODER.decode(new Uint8Array(bytes)).replace(/\r?\n$/, '');
    }
    if (Date.now() > deadline) throw new Error('SMTP read timeout');
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('SMTP read timeout')), timeoutMs)),
    ]);
    if (done) throw new Error('SMTP connection closed');
    buffer.push(...value);
  }
}

async function expectCode(line, wanted, label) {
  const code = Number(line.slice(0, 3));
  if (code !== wanted) throw new Error('SMTP ' + label + ' failed: ' + line);
}

const b64 = (s) => {
  const bytes = ENCODER.encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
};

const wrapBase64 = value => value.match(/.{1,76}/g)?.join('\r\n') || '';
const headerValue = value => String(value || '').replace(/[\r\n]+/g, ' ');
const buildMessage = ({ from, to, subject, text, html }) => {
  const content = typeof html === 'string' && html ? html : String(text || '');
  const contentType = typeof html === 'string' && html ? 'text/html' : 'text/plain';
  return [
    'From: ' + headerValue(from),
    'To: ' + headerValue(to),
    'Subject: =?UTF-8?B?' + b64(headerValue(subject)) + '?=',
    'MIME-Version: 1.0',
    'Content-Type: ' + contentType + '; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(b64(content)),
  ].join('\r\n');
};

/** 发送一封邮件。返回 {ok:true} 或 {ok:false, error} */
export async function sendEmail(env, { to, subject, text, html }) {
  const from = env.SMTP_FROM || env.SMTP_USER || '';
  if (env.SMTP_TEST_MODE) {
    if (!env.SMTP_SENT) env.SMTP_SENT = [];
    env.SMTP_SENT.push({ to, subject, text, html, raw: buildMessage({ from, to, subject, text, html }) });
    return { ok: true, test: true };
  }
  if (!connect) return { ok: false, error: 'sockets unavailable' };
  if (!env.SMTP_USER || !env.SMTP_PASS) return { ok: false, error: 'smtp not configured' };
  const host = env.SMTP_HOST || 'smtp.qq.com';
  const port = Number(env.SMTP_PORT || 465);
  let socket = null;
  let writer = null;
  let reader = null;
  try {
    socket = connect({ hostname: host, port }, { secureTransport: 'on' });
    await socket.opened; // 连接 + TLS 握手完成
    writer = socket.writable.getWriter();
    reader = socket.readable.getReader();
    const buffer = [];
    const write = async (line) => { await writer.write(ENCODER.encode(line + '\r\n')); };
    let step = 'connect';
    const read = async () => { try { return await readLine(reader, buffer, 15000); } catch (e) { throw new Error(step + ': ' + e.message); } };
    step = 'greeting';
    const reply = await read();
    await expectCode(reply, 220, 'greeting');
    step = 'ehlo';
    await write('EHLO waiyuan-study');
    let line = await read();
    while (line.length >= 4 && line[3] === '-') line = await read();
    await expectCode(line, 250, 'EHLO');
    step = 'auth-login';
    await write('AUTH LOGIN');
    line = await read();
    await expectCode(line, 334, 'AUTH');
    step = 'auth-user';
    await write(b64(env.SMTP_USER));
    line = await read();
    await expectCode(line, 334, 'AUTH user');
    step = 'auth-pass';
    await write(b64(env.SMTP_PASS));
    line = await read();
    await expectCode(line, 235, 'AUTH login');
    step = 'mail-from';
    await write('MAIL FROM:<' + from + '>');
    line = await read();
    await expectCode(line, 250, 'MAIL FROM');
    step = 'rcpt-to';
    await write('RCPT TO:<' + to + '>');
    line = await read();
    await expectCode(line, 250, 'RCPT TO');
    step = 'data';
    await write('DATA');
    line = await read();
    await expectCode(line, 354, 'DATA');
    const body = buildMessage({ from, to, subject, text, html });
    step = 'data-body';
    await write(body.replace(/^\./gm, '.$&'));
    step = 'data-dot';
    await write('.');
    line = await read();
    await expectCode(line, 250, 'DATA end');
    step = 'quit';
    await write('QUIT');
    await read().catch(() => {});
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  } finally {
    try { reader?.releaseLock(); } catch (_) {}
    try { writer?.releaseLock(); } catch (_) {}
    try { await socket?.close(); } catch (_) {}
  }
}

export function generateResetCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 100000000;
  return String(n).padStart(8, '0');
}
