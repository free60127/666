// 全站 HTML 资源引用完整性检查（本地文件系统）
const fs = require('fs');
const path = require('path');

let missing = [];
let checked = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      walk(p);
    } else if (entry.name.endsWith('.html')) {
      const html = fs.readFileSync(p, 'utf8');
      const refs = [...html.matchAll(/<(?:script|link|img)[^>]+(?:src|href)="([^"]+)"/g)].map(m => m[1]);
      for (const ref of refs) {
        if (/^(https?:|data:|#|javascript:)/.test(ref)) continue;
        const clean = ref.split('?')[0].split('#')[0];
        const target = path.normalize(path.join(path.dirname(p), clean));
        if (!fs.existsSync(target)) missing.push(path.relative(process.cwd(), p) + ' → ' + ref);
        checked++;
      }
    }
  }
}
walk('.');
console.log('检查引用数:', checked, '缺失:', missing.length);
missing.forEach(m => console.log('  ✗', m));
if (!missing.length) console.log('全部 HTML 资源引用完整 ✓');
process.exit(missing.length ? 1 : 0);
