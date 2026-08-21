// 数据修复：内容源 HTML 实体解码 + 数字/百分号粘连补空格
// 背景：旧页面提取时未解码实体（&#39;/&quot;/&amp; 残留 487 处），且 OCR/转写
// 时丢失 $ / % 两侧空格（a$50、nearly25%of、of$200、,70%of 等）。
// 用法：node scripts/fix-html-entities.js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = ['source/basic-english.json', 'source/reading.json'];

// —— 实体解码（命名 + 十进制/十六进制数字实体）——
const NAMED = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&#39;': "'", '&nbsp;': '\u00A0', '&hellip;': '…', '&mdash;': '—', '&ndash;': '–',
  '&rsquo;': '’', '&lsquo;': '‘', '&rdquo;': '”', '&ldquo;': '“', '&middot;': '·',
};
const decodeEntities = text => String(text).replace(/&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, match => {
  if (NAMED[match] !== undefined) return NAMED[match];
  if (match[1] === '#') {
    const hex = /^&#[xX]/.test(match);
    const code = hex ? parseInt(match.slice(3, -1), 16) : parseInt(match.slice(2, -1), 10);
    if (Number.isFinite(code) && code > 0 && code <= 0x10FFFF) {
      try { return String.fromCodePoint(code); } catch (_) { return match; }
    }
  }
  return match;
});

// —— $/% 粘连补空格（规则只作用于含 $/% 或逗号数字的文本，误伤面极小）——
const fixGlue = text => {
  let out = String(text);
  for (let i = 0; i < 2; i++) {  // 两轮以处理嵌套（nearly25%of → nearly 25% of）
    out = out
      .replace(/([a-zA-Z])\$(\d)/g, (match, letter, digit) => `${letter} $${digit}`)  // a$50 → a $50；of$200 → of $200
      .replace(/([a-zA-Z])(\d+%)/g, '$1 $2')           // nearly25% → nearly 25%
      .replace(/(\d)%([a-zA-Z])/g, '$1% $2')           // 25%of → 25% of
      .replace(/(?<!\d)(,)(\d)/g, '$1 $2');            // anger,70% → anger, 70%（1,200 千分位不受影响）
  }
  return out;
};

let totalEntities = 0;
for (const name of files) {
  const file = path.join(root, name);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let entities = 0;
  const walk = obj => {
    if (typeof obj === 'string') {
      const decoded = decodeEntities(obj);
      if (decoded !== obj) {
        const count = (obj.match(/&(?:[a-zA-Z]+|#\d+);/g) || []).length;
        entities += count;
        return fixGlue(decoded);
      }
      return fixGlue(obj);
    }
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) obj[k] = walk(v);
      return obj;
    }
    return obj;
  };
  walk(data);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  totalEntities += entities;
  console.log(`${name}: 解码实体 ${entities} 处（含粘连补空格）`);
}
console.log(`合计解码 ${totalEntities} 处实体`);
