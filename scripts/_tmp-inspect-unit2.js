// 临时：提取旧 HTML 基英1 unit-2 片段并打印（格式化）
const fs = require('fs');
const h = fs.readFileSync('archive/legacy/基英系列-旧版.html', 'utf8');
const start = h.indexOf('<details id="unit-2"');
const end = h.indexOf('<details id="unit-3"', start);
if (start < 0 || end < 0) { console.error('not found', start, end); process.exit(1); }
const seg = h.slice(start, end);
console.log('LEN', seg.length);
console.log(seg.replace(/></g, '>\n<'));
