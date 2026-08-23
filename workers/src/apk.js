import { json } from "./http.js";  // 统一 JSON 响应
import { APK_KEY_PREFIX } from "./config.js";  // APK KV 键前缀统一配置

/** 托管 APK 下载（KV 存储，键 apk:<name>）：
 *  稳定地址 /apk/waiyuan-share.apk → 302 到版本化地址（KV 键 apk:latest:<稳定名> = 版本号）
 *  版本化地址 /apk/waiyuan-share-v1.1.0.apk → 直接读 KV 键 apk:waiyuan-share-v1.1.0.apk（长缓存 + ETag）
 *  KV 无文件 → 404；KV 故障 → 503（2026-08-23 审查：区分存储故障与文件不存在） */
async function serveApk(request, env, path) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  let name = path.slice('/apk/'.length).replace(/^\/+/, '');
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name)) return json({ error: 'not found' }, 404);
  if (!env.STUDY_KV) return json({ error: 'not configured' }, 503);
  let key = APK_KEY_PREFIX + name;
  // 稳定地址：查最新版本号 → 302 到版本化地址（302 不缓存，客户端始终跟随最新）
  if (!/-v[0-9]/.test(name)) {
    try {
      const latest = await env.STUDY_KV.get('apk:latest:' + name);
      if (latest) {
        const ver = String(latest).trim();
        if (/^[0-9][A-Za-z0-9._-]*$/.test(ver)) {
          const vName = name.replace(/\.apk$/, '') + '-v' + ver + '.apk';
          if (/^[A-Za-z0-9._-]{1,80}$/.test(vName)) {
            return new Response(null, { status: 302, headers: { Location: '/apk/' + vName, 'Cache-Control': 'no-store' } });
          }
        }
      }
    } catch (e) {
      console.error('serveApk latest error:', e);
      // 2026-08-23 审查：latest 指针读取失败说明存储异常，静默回退会误发旧版本 → 直接 503
      return json({ error: 'storage unavailable' }, 503);
    }
  }
  let got;
  try {
    got = await env.STUDY_KV.getWithMetadata(key, { type: 'arrayBuffer' });
  } catch (e) {
    console.error('serveApk kv error:', e);
    return json({ error: 'storage unavailable' }, 503);
  }
  if (!got || !got.value) return json({ error: 'not found' }, 404);
  const data = got.value;
  const headers = new Headers();
  headers.set('Content-Type', 'application/vnd.android.package-archive');
  headers.set('Content-Disposition', 'attachment; filename="' + name + '"');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Content-Length', String(data.byteLength));
  // ETag：优先用上传时存的 metadata.sha；缺失（如 API 直传）则实时计算内容 SHA-256（2.4MB 约 10ms）
  let etag = got.metadata && got.metadata.sha ? '"' + String(got.metadata.sha) + '"' : '';
  if (!etag) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', data);
      const bytes = new Uint8Array(digest);
      let hex = '';
      for (let bi = 0; bi < bytes.length; bi++) hex += bytes[bi].toString(16).padStart(2, '0');
      etag = '"' + hex + '"';
    } catch (e) {
      console.error('serveApk digest error:', e);
    }
  }
  if (etag) headers.set('ETag', etag);
  if (etag && request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'public, max-age=3600' } });
  }
  headers.set('Cache-Control', /-v[0-9]/.test(name) ? 'public, max-age=604800, immutable' : 'public, max-age=3600');
  return new Response(data, { headers });
}


export { serveApk };
