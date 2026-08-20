// 统计 data.js 中各题型数量与题库分布（思政 + 计算机）
const fs = require('fs');
const path = require('path');
const files = ['思政系列/data.js', '计算机系列/data.js'];
for (const file of files) {
  const t = fs.readFileSync(file, 'utf8');
  console.log(`\n== ${file} ==`);
  for (const type of ['single', 'multi', 'theory', 'short', 'essay', 'material']) {
    const re = new RegExp('"type":"' + type + '"', 'g');
    const count = (t.match(re) || []).length;
    if (count) console.log(type + ':', count);
  }
  const start = t.indexOf('=[') + 1;
  const end = t.lastIndexOf(']');
  if (start <= 0 || end <= start) { console.error(`✗ 无法定位 ${file} 的数组区间`); process.exitCode = 1; continue; }
  const banks = JSON.parse(t.slice(start, end + 1));
  console.log('banks:', banks.map(b => b.key + ':' + b.questions.length).join(' '));
  const byType = {};
  banks.forEach(b => b.questions.forEach(q => { byType[q.type] = (byType[q.type] || 0) + 1; }));
  console.log('total by type:', JSON.stringify(byType));
}
