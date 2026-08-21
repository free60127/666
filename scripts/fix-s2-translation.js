// 精读2 翻译单元修复（依据教材 OCR 核对，2026-08-21）：
// 1. U11 缺 #6（attend to 基金会）+ #7/#8 答案错位 → 补 #6、还原 #7/#8 答案、新写 #8 答案
// 2. U14#5 答案错误（Fates 命运女神系别题答案）→ 重写
// 用法：node scripts/fix-s2-translation.js（备份 source/basic-english.json.bak-s2）
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'source', 'basic-english.json');
fs.copyFileSync(file, file + '.bak-s2');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const b2 = data.books.find(b => b.key === 'book-2');
const u11 = b2.units.find(u => u.key === 'book-2-translation-unit-11');
const u14 = b2.units.find(u => u.key === 'book-2-translation-unit-14');

// —— U11：重排为 5-9，补 #6，答案归位 ——
const q5 = u11.questions.find(q => q.index === '5');
const q7 = u11.questions.find(q => q.index === '7');
const q8 = u11.questions.find(q => q.index === '8');
const q9 = u11.questions.find(q => q.index === '9');
const answerOf6 = q7.answer;               // 基金会答案 → #6
const answerOf7 = q8.answer;               // now that 答案 → #7
u11.questions = [
  q5,
  { index: '6', q: '这个基金会的首要工作是确保战争地区妇女和儿童的利益得到维护。(attend to)', answer: answerOf6, type: 'text', module: '' },
  { ...q7, answer: answerOf7 },
  { ...q8, answer: 'Just in case, you\'d better bring your own soap, shampoo and towel.' },
  q9
];
// 顺序保证
u11.questions.sort((a, b) => Number(a.index) - Number(b.index));

// —— U14#5：答案重写 ——
const q14_5 = u14.questions.find(q => q.index === '5');
q14_5.answer = 'Ignore insults, but take heed to constructive criticism.';

fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n', 'utf8');
console.log('U11 现题数:', u11.questions.length, '题序:', u11.questions.map(q => q.index).join(','));
console.log('U14#5 answer:', q14_5.answer);
console.log('已写回', file);
