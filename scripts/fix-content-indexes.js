// 一次性修复：basic-english.json / reading.json 中 unit 内 questions 的 index 重复
// （旧页面每个 exercise-module 内部从 1 编号导致）。按出现顺序统一重编号 1..N，
// 保证前端 DOM id 与 unified 进度键唯一。
const fs = require('fs');
const path = require('path');

const files = ['basic-english.json', 'reading.json'];
for (const name of files) {
  const file = path.join(__dirname, '..', 'source', name);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let fixedUnits = 0;
  let fixedQuestions = 0;
  for (const book of data.books || []) {
    for (const unit of book.units || []) {
      const questions = unit.questions || [];
      const indexes = questions.map(q => String(q.index));
      const hasDup = new Set(indexes).size !== indexes.length;
      if (!hasDup) continue;
      questions.forEach((q, i) => {
        if (q.index !== String(i + 1)) { q.index = String(i + 1); fixedQuestions++; }
      });
      fixedUnits++;
    }
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`${name}: 修复 ${fixedUnits} 个单元 / ${fixedQuestions} 道题编号`);
}
