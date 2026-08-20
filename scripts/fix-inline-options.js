// 数据补丁：把题干文本内嵌选项的选择题（如 "…higher education. A.impediment against B.barrier for C.impediment to D. obstacle from"）
// 从 text 题拆分为标准 choice 题（q + options[]，answer 字母不变）。
// 适用范围：source/reading.json、source/basic-english.json 中所有
//   type=text 且 answer 为单个 [A-E] 字母 且题干含 ≥2 个 " A. " 选项标记 的题目。
// 用法：node scripts/fix-inline-options.js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = ['source/reading.json', 'source/basic-english.json'];
let fixed = 0, skipped = 0;

for (const file of files) {
  const full = path.join(root, file);
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  for (const book of data.books) for (const unit of book.units) {
    // 只处理 text 题
    const candidates = unit.questions.filter(q => q.type === 'text' && /^[A-E]$/.test(String(q.answer || '')));
    for (const q of candidates) {
      const text = String(q.q || '');
      // 选项标记格式不统一：有的 "A.impediment"（点后无空格），有的 "B. symptomatic"（点后有空格）。
      // 统一按「空格+字母+点」定位标记（点后可有可无空格），选项内容取标记后到下一标记前的文本。
      const marks = [...text.matchAll(/\s([A-E])\./g)];
      if (marks.length < 2) { skipped++; continue; }
      const letters = marks.map(m => m[1]);
      const sequential = letters.every((l, i) => i === 0 || l.charCodeAt(0) === letters[i - 1].charCodeAt(0) + 1);
      if (!sequential || letters[0] !== 'A') { skipped++; continue; }
      const stem = text.slice(0, marks[0].index).trim();
      const options = [];
      for (let i = 0; i < marks.length; i++) {
        const from = marks[i].index + marks[i][0].length;
        const to = i + 1 < marks.length ? marks[i + 1].index : text.length;
        options.push(text.slice(from, to).replace(/^\s+/, '').trim());
      }
      const answerLetter = String(q.answer || '').charCodeAt(0) - 64;
      if (options.length < 2 || answerLetter > options.length) { skipped++; continue; }
      q.q = stem.replace(/\s*_{3,}\s*$/, '').trim();  // 清理题干尾部悬空的 ____
      q.options = options;
      q.type = 'choice';
      fixed++;
    }
  }
  fs.writeFileSync(full, JSON.stringify(data, null, 1) + '\n', 'utf8');
}
console.log(`已拆分 ${fixed} 题（跳过 ${skipped} 题）`);
