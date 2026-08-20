// history 题库去重（2026-08-20，依据《大一下近代史.docx》核对完成后执行）
// 保留策略：同题干组内保留 1 题——选项相同留最小 id；变体组显式指定
// 注意：id 在 bank 内按 type 独立编号（single#87 与 multi#87 是不同题），删除标识必须用 type#id
// 运行：node scripts/build/dedupe-history.js
const fs = require('fs');
const path = require('path');
const root = 'D:/study/sb/study platform';
const file = path.join(root, 'source/politics.json');
const politics = JSON.parse(fs.readFileSync(file, 'utf8'));
const history = politics.find(b => b.key === 'history');

// 变体组显式保留（id 列表内保留哪一个）
const KEEP = {
  'single|64,122,172': 122,   // 64 选项错字「试训政纲领」
  'multi|15,89': 15,          // 15 选项「避免…」（完整），89「免…」
  'multi|26,38,42,60': 38,    // 主要矛盾：38/60 选项为文档标准 4 项，答案 AB（八大正确表述）
  'multi|28,67,90': 90,       // 中特理论体系：90 为 5 选项完整版（含新时代思想），答案 BCDE
};

const byTitle = new Map();
for (const q of history.questions) {
  const key = q.type + '|' + q.title;
  const list = byTitle.get(key) || [];
  list.push(q);
  byTitle.set(key, list);
}

let removed = 0;
const removedKeys = []; // type#id
for (const [key, list] of byTitle) {
  if (list.length <= 1) continue;
  const ids = list.map(q => q.id).sort((a, b) => a - b);
  const explicit = KEEP[list[0].type + '|' + ids.join(',')];
  const keepId = explicit !== undefined ? explicit : ids[0];
  for (const q of list) {
    if (q.id === keepId) continue;
    removedKeys.push(q.type + '#' + q.id);
    removed++;
  }
}

// 执行删除 + 清理保留题选项尾空括号
const keepSet = new Set(removedKeys);
history.questions = history.questions.filter(q => !keepSet.has(q.type + '#' + q.id));
const tailParen = /[（(]\s*[）)]\s*$/;
let cleaned = 0;
for (const q of history.questions) {
  if (!Array.isArray(q.options)) continue;
  for (let i = 0; i < q.options.length; i++) {
    const o = q.options[i];
    if (tailParen.test(o)) { q.options[i] = o.replace(tailParen, ''); cleaned++; }
  }
}

fs.writeFileSync(file, JSON.stringify(politics, null, 2), 'utf8');
console.log('删除 ' + removed + ' 题（' + removedKeys.join(',') + '）');
console.log('清理选项尾空括号 ' + cleaned + ' 处');
console.log('剩余: single=' + history.questions.filter(q=>q.type==='single').length
  + ' multi=' + history.questions.filter(q=>q.type==='multi').length
  + ' short=' + history.questions.filter(q=>q.type==='short').length
  + ' essay=' + history.questions.filter(q=>q.type==='essay').length
  + ' 共 ' + history.questions.length + ' 题');
