// 依据《新编英语语法教程 第6版 课后练习答案》PDF 对照修复翻译/改写数据
// （PDF 已解析为 scripts/pdf-keys.json；此脚本只改 source JSON，执行前自动备份 .bak-pdfcheck）
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const backup = name => {
  const full = path.join(root, 'source', name);
  const bak = full + '.bak-pdfcheck';
  if (!fs.existsSync(bak)) fs.copyFileSync(full, bak);
  return JSON.parse(fs.readFileSync(bak, 'utf8'));  // 始终从备份恢复（幂等）
};

const changes = [];

// ---------- 1. translations.json：21C 题号错位修复 ----------
const tr = backup('translations.json');
const s21 = tr.sections.find(s => (s.title || s.id) === '21C');
if (s21) {
  const items = s21.items;
  // 现状：#9 题目尾部粘连原 #10 题目、#10 题目丢失、#11 答案=#11+#12 合并、#12-19 答案顺延错位
  // 修复：#9 拆尾、#10 用原文、#11-20 题目 = 原 #9-18（origQuestions[n-2]）、答案按 PDF 1-20、expectedAnswerCount 同步
  const origQuestions = items.map(it => it.question);
  const pdf21c = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'pdf-keys.json'), 'utf8'))['21C'];
  const newItems = [];
  // #1-8 不动；#9 题目尾部粘连了原 #10 题目（"…什么也没看见。 10他可是一个需要认真对待的人。"）→ 拆出
  for (let i = 0; i < 8; i++) newItems.push({ ...items[i] });
  const q9 = items[8].question.replace(/\s*10他可是一个需要认真对待的人。\s*$/, '').trim();
  newItems.push({ number: 9, question: q9, answer: items[8].answer });
  // #10：题目用粘连处原文（原 #10 题目），答案用 PDF
  newItems.push({ number: 10, question: '他可是一个需要认真对待的人。', answer: pdf21c[10] });
  // #11-20：题目用原 #10-19（origQuestions[n-2]），答案用 PDF
  for (let n = 11; n <= 20; n++) {
    newItems.push({ number: n, question: origQuestions[n - 2], answer: pdf21c[n] });
  }
  // 校验 PDF 键齐全
  const missing = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].filter(n => !pdf21c[n]);
  if (missing.length) throw new Error(`21C PDF 键缺失: ${missing.join(',')}`);
  s21.items = newItems;
  if ('expectedAnswerCount' in s21) s21.expectedAnswerCount = newItems.length;
  changes.push('translations 21C：题目错位修复（#9 拆尾、#10 还原原文、#11-20 对齐 PDF 答案）');
}
fs.writeFileSync(path.join(root, 'source', 'translations.json'), JSON.stringify(tr, null, 2) + '\n', 'utf8');

// ---------- 2. rewrite-sentences.json：21B#11 前缀、23D#14 拼写、39B#26 答案 ----------
const rw = backup('rewrite-sentences.json');
for (const ex of rw.exercises || []) {
  if (ex.id === '21b') {
    const q = ex.questions.find(x => x.number === '11');
    if (q) { q.answer = q.answer.replace(/^\s*11\.\s+/, ''); changes.push('rewrite 21B#11：剥离题号前缀'); }
  }
  if (ex.id === '23d') {
    const q = ex.questions.find(x => x.number === '14');
    if (q) { const before = q.answer; q.answer = q.answer.replace(/V ote/g, 'Vote'); if (q.answer !== before) changes.push('rewrite 23D#14：V ote → Vote'); }
  }
  if (ex.id === '39b') {
    const q = ex.questions.find(x => x.number === '26');
    if (q) { q.answer = 'Not for the life of me can I understand why he is so afraid of injections.'; changes.push('rewrite 39B#26：答案修正为 PDF 值（原为 #36/#37 错位内容）'); }
  }
}
fs.writeFileSync(path.join(root, 'source', 'rewrite-sentences.json'), JSON.stringify(rw, null, 2) + '\n', 'utf8');

console.log('修复完成：');
for (const c of changes) console.log('  - ' + c);
