// 临时验证：wordBanks 提取结果 + 重放 book-4-word-unit-5 #8 语义修正
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const reading = JSON.parse(fs.readFileSync(path.join(root, 'source/reading.json'), 'utf8'));
const basic = JSON.parse(fs.readFileSync(path.join(root, 'source/basic-english.json'), 'utf8'));

// 1. wordBanks 统计
const count = data => {
  let total = 0;
  const perBook = {};
  for (const book of data.books) {
    let n = 0;
    for (const unit of book.units) n += (unit.wordBanks || []).length;
    perBook[book.key] = n;
    total += n;
  }
  return { total, perBook };
};
console.log('reading wordBanks:', JSON.stringify(count(reading)));
console.log('basic wordBanks:', JSON.stringify(count(basic)));

// 2. unit-2 验证
const unit2 = basic.books.find(b => b.key === 'book-1').units.find(u => u.key === 'book-1-wordFill-unit-2');
console.log('unit-2 questions:', unit2.questions.length, 'wordBanks:', JSON.stringify(unit2.wordBanks, null, 1));

// 3. 无 wordBanks 字段的单元（不应有）
const missing = [];
for (const data of [reading, basic]) for (const book of data.books) for (const unit of book.units) if (!Array.isArray(unit.wordBanks)) missing.push(unit.key);
console.log('units missing wordBanks field:', missing.length ? missing : 'none');

// 4. 语义修正重放：book-4-word-unit-5 #8 answer D -> C
let fixed = 0;
for (const book of reading.books) for (const unit of book.units) {
  if (unit.key !== 'book-4-word-unit-5') continue;
  for (const q of unit.questions) {
    if (String(q.index) === '8' && /^D$/i.test(String(q.answer))) { q.answer = 'C'; fixed++; }
  }
}
fs.writeFileSync(path.join(root, 'source/reading.json'), JSON.stringify(reading, null, 2) + '\n', 'utf8');
console.log('book-4-word-unit-5 #8 answer fixed:', fixed);
