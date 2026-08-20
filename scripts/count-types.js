// 统计 data.js 中各题型数量与题库分布
const fs = require('fs');
const t = fs.readFileSync('思政系列/data.js', 'utf8');
for (const type of ['single', 'multi', 'short', 'essay']) {
  const re = new RegExp('"type":"' + type + '"', 'g');
  console.log(type + ':', (t.match(re) || []).length);
}
const start = t.indexOf('=[') + 1;
const end = t.lastIndexOf(']');
const banks = JSON.parse(t.slice(start, end));
console.log('banks:', banks.map(b => b.key + ':' + b.questions.length).join(' '));
const byType = {};
banks.forEach(b => b.questions.forEach(q => { byType[q.type] = (byType[q.type] || 0) + 1; }));
console.log('total by type:', JSON.stringify(byType));
