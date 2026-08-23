// 重新生成 App 图标：legacy 四角填白（修黑边）、adaptive foreground 安全区缩放
const path = require('path');
const sharp = require(path.join(__dirname, '_tmp-iconwork/node_modules/sharp'));
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FGD_XXXHDPI = 432; // adaptive foreground @xxxhdpi（108dp）

const APPS = [
  { name: 'share', src: path.join(ROOT, 'branding/share-icon.png'), res: path.join(ROOT, 'cap-share/android/app/src/main/res') },
  { name: 'paotui', src: path.join(ROOT, 'branding/paotui-icon.png'), res: path.join(ROOT, 'cap-paotui/android/app/src/main/res') },
];

async function loadRaw(p) {
  const img = sharp(p).ensureAlpha(); // 强制 RGBA：removeBg 需写 alpha 通道（RGB 图会越界写坏数据）
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

// flood fill 去背景（四角+四边种子）：透明/白/黑/灰 视为背景
function removeBg(data, info) {
  const W = info.width, H = info.height, C = info.channels;
  const out = Buffer.from(data);
  const isBg = (i) => {
    const a = C > 3 ? out[i + 3] : 255;
    if (a < 40) return true; // 透明
    const r = out[i], g = out[i + 1], b = out[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 20 && mx > 232) return true; // 白
    if (mx < 26) return true; // 黑
    if (mx - mn < 20 && mn > 18 && mn < 232) return true; // 灰
    return false;
  };
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, 0, x, H - 1); }
  for (let y = 0; y < H; y++) { stack.push(0, y, W - 1, y); }
  const idx = (x, y) => (y * W + x) * C;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const p = y * W + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = idx(x, y);
    if (isBg(i)) {
      out[i + 3] = 0;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }
  return { data: out, info };
}

async function genLegacy(src, outFile, size) {
  // 原图四角是黑底（白底圆角设计）→ 先去背景（黑/透明→透明），再垫白底，四角必为白（不透明）
  const srcRaw = await loadRaw(src);
  const bg = removeBg(srcRaw.data, srcRaw.info);
  const icon = await sharp(bg.data, { raw: { width: bg.info.width, height: bg.info.height, channels: bg.info.channels } })
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
  const white = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  await sharp(white).composite([{ input: icon }]).png().toFile(outFile);
}

async function genForeground(src, outFile, size) {
  // 1) 去背景 → 2) trim 内容 bbox → 3) 缩放至安全区直径(66%) → 4) 居中到透明画布
  const srcRaw = await loadRaw(src);
  const bg = removeBg(srcRaw.data, srcRaw.info);
  const W = bg.info.width, H = bg.info.height;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * bg.info.channels;
    if (bg.data[i + 3] > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) throw new Error('no content in ' + src);
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  // 内容裁出
  const crop = await sharp(bg.data, { raw: { width: W, height: H, channels: bg.info.channels } })
    .extract({ left: minX, top: minY, width: bw, height: bh }).png().toBuffer();
  // 缩放到安全区（66% 直径），再居中
  const target = Math.floor(size * 0.66);
  const resized = await sharp(crop).resize(target, target, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const canvas = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const off = Math.floor((size - target) / 2);
  await sharp(canvas).composite([{ input: resized, left: off, top: off }]).png().toFile(outFile);
}

(async () => {
  for (const app of APPS) {
    for (const [d, size] of Object.entries(DENSITIES)) {
      const dir = path.join(app.res, 'mipmap-' + d);
      await genLegacy(app.src, path.join(dir, 'ic_launcher.png'), size);
      await genLegacy(app.src, path.join(dir, 'ic_launcher_round.png'), size);
    }
    await genForeground(app.src, path.join(app.res, 'mipmap-xxxhdpi/ic_launcher_foreground.png'), FGD_XXXHDPI);
    // 其余密度 foreground 等比缩放
    for (const [d, size] of Object.entries(DENSITIES)) {
      if (d === 'xxxhdpi') continue;
      const dir = path.join(app.res, 'mipmap-' + d);
      const f = Math.round((size / 48) * 108);
      await genForeground(app.src, path.join(dir, 'ic_launcher_foreground.png'), f);
    }
    console.log(app.name, 'done');
  }
  // 站点 PWA 图标（any 用途）：原图黑角 → 去背景 + 垫白底（白底圆角视觉，无黑角）
  const site = [
    { src: path.join(ROOT, 'branding/share-icon.png'), out: path.join(ROOT, 'icons') },
    { src: path.join(ROOT, 'branding/paotui-icon.png'), out: path.join(ROOT, 'paotui') },
  ];
  for (const app of site) {
    for (const size of [192, 512]) {
      const srcRaw = await loadRaw(app.src);
      const bg = removeBg(srcRaw.data, srcRaw.info);
      const icon = await sharp(bg.data, { raw: { width: bg.info.width, height: bg.info.height, channels: bg.info.channels } })
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
      const white = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
      await sharp(white).composite([{ input: icon }]).png().toFile(path.join(app.out, 'icon-' + size + '.png'));
    }
  }
  console.log('site icons done');
  // 验证 legacy 四角 alpha=255 且为白
  for (const app of APPS) {
    const f = path.join(app.res, 'mipmap-xxxhdpi/ic_launcher.png');
    const { data, info } = await loadRaw(f);
    const px = (x, y) => { const i = (y * info.width + x) * info.channels; return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }; };
    console.log(app.name, 'corner0', JSON.stringify(px(0, 0)), 'cornerN', JSON.stringify(px(info.width - 1, info.height - 1)));
  }
})();
