import { countVisit } from "./stats.js";  // 反代页面访问计数
import { UPSTREAM } from "./config.js";  // 源站统一配置（2026-08-23 审查第 2 项）

/* ---------- 反代加速 ----------
   mode 'root'：主域直连（https://free60127.top/xxx -> UPSTREAM/xxx，HTML 去 /666/ 前缀）
   mode 'proxy'：兼容路径（/proxy/xxx -> UPSTREAM/xxx，HTML 一律改 /proxy/ 前缀） */

async function handleProxy(request, env, path, mode, ctx) {
  // 反代只允许读取类方法，避免经代理转发任意请求；敏感头一律不转发
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('method not allowed', { status: 405 });
  }
  const prefix = mode === 'root' ? '/' : '/proxy/';
  const rest = path.startsWith(prefix) ? path.slice(prefix.length).replace(/^\/+/, '') : '';
  const url = new URL(request.url);
  const target = `${UPSTREAM}/${rest}${url.search}`;
  const upstream = await fetch(target, {
    method: request.method,
    headers: filterHeaders(request.headers),
    redirect: 'manual',
  });
  const headers = new Headers(upstream.headers);
  headers.delete('content-security-policy');
  // 资源引用重写
  const type = (headers.get('content-type') || '');
  let body = upstream.body;
  if (type.includes('text/html')) {
    let html = await upstream.text();
    if (mode === 'root') {
      // 主域直连：/666/x -> /x；OG 分享地址改主域；其余根绝对/相对路径保持（自然走本域）
      html = html
        .replace(/(href|src)="\/666\//g, `$1="/`)
        .replace(/https:\/\/free60127\.github\.io\/666\//g, 'https://free60127.top/');
    } else {
      html = html
        .replace(/(href|src)="\/666\//g, `$1="/proxy/`)
        .replace(/(href|src)="\/(?!\/)/g, `$1="/proxy/`)
        .replace(/(href|src)="(?!https?:|\/\/|#|data:)/g, `$1="/proxy/`);
    }
    body = html;
    // body 已重写，原响应长度/编码/缓存标签全部失效，必须移除
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
    headers.delete('last-modified');
    headers.set('cache-control', 'no-cache');
  }
  headers.set('access-control-allow-origin', '*');
  // 页面浏览量统计：仅 GET 的 HTML 页面（HEAD/资源/API 不计），失败静默
  if (request.method === 'GET' && type.includes('text/html')) {
    const setCookie = await countVisit(env, request, url.pathname, ctx);
    if (setCookie) headers.append('Set-Cookie', setCookie);
  }
  return new Response(body, { status: upstream.status, headers });
}

function filterHeaders(headers) {
  const out = new Headers();
  const blocked = new Set(['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'authorization', 'proxy-authorization', 'cookie', 'set-cookie']);
  for (const [k, v] of headers) {
    if (blocked.has(k.toLowerCase())) continue;
    out.set(k, v);
  }
  out.set('x-forwarded-host', 'free60127.github.io');
  return out;
}

export { handleProxy };
