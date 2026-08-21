// 数据治理（2026-08-21，可重复执行，幂等）：
// ① 基英/泛读内容源清理：中文 OCR 空格、页码/章节残留、<strong> 标签、
//    词典法英文拆词合并（如 succ umb → succumb）、答案尾部孤立斜杠
// ② 基英 31 道「有选项但 type=text」转 choice/multi，"C&F" 规范化 "CF"
// ③ 计算机 vfp1-review #32 空选项补 "LOOP"（VFP 循环退出命令 EXIT 的配套命令）
// ④ 输出人工核对清单 scripts/ocr-manual-check.md（词典法未覆盖的拆词/截断选项）
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

/* ---------- 词典词集（english-lookup-data.js 16026 条） ---------- */
const dictSrc = fs.readFileSync(path.join(root, 'dictionary', 'english-lookup-data.js'), 'utf8');
const dictMatch = dictSrc.match(/window\.WAIYUAN_ENGLISH_LOOKUP\s*=\s*(\[[\s\S]*?\])\s*;?\s*$/);
if (!dictMatch) { console.error('无法解析词典文件'); process.exit(1); }
const dict = new Set(JSON.parse(dictMatch[1]).map(e => String(Array.isArray(e) ? e[0] : e.word || e).toLowerCase()));
const has = w => dict.has(w.toLowerCase());
// 基础词形还原后查词典（复数/ed/ing 变形）
const stem = w => w.toLowerCase()
  .replace(/ies$/, 'y').replace(/ves$/, 'f').replace(/oes$/, 'o')
  .replace(/es$/, '').replace(/s$/, '').replace(/ing$/, '')
  .replace(/ed$/, '').replace(/tion$/, 'te').replace(/sions$/, 'sion').replace(/ions$/, 'ion');
const hasStem = w => dict.has(w.toLowerCase()) || dict.has(stem(w));

/* ---------- 文本修复函数 ---------- */
const deCnSpace = t => { let s = String(t); for (let i = 0; i < 6; i++) { const n = s.replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2'); if (n === s) break; s = n; } return s; };
const deTag = t => String(t).replace(/<\/?strong>/gi, '');
// 尾部页码/章节残留（如 "determined 14 Reading Critically 3"、"encourage Unit 7 Cyberspace and Human Relations"、"17 圭"）
const dePageResidue = t => String(t)
  .replace(/\s+\d{1,3}\s*Reading Critically\s*\d*\s*$/i, '')
  .replace(/\s+Unit\s+\d+[\s\S]*$/i, '')
  .replace(/\s+\d{1,3}\s*圭\s*$/, '')
  .replace(/\s+圭\s*$/, '');
// 词典法拆词（3 段 + 2 段；拼接在词典 && 至少一个片段不在词典 && 全小写字母）
// 人工核对修正表（2026-08-21，逐条对照语义上下文确认：如 succ umb=不屈从于权威→succumb、
// re lig ios figures→religious、Ben Bern an ke=美联储主席→Bernanke）
const KNOWN_SPLITS = [
  ['ru fling', 'ruffling'], ['Cham pions', 'champions'], ['Ben Bern an ke', 'Bernanke'],
  ['I ndige nous', 'indigenous'], ['Patri arch al', 'patriarchal'], ['Edu cation', 'education'],
  ['Exp edition', 'expedition'], ['Demo crat ic', 'democratic'], ['Com petition', 'competition'],
  ['Con federate', 'Confederate'], ['Pre jud ice', 'prejudice'], ['Rea ding', 'reading'],
  ['succ umb', 'succumb'], ['disp ose', 'dispose'], ['trauma tic', 'traumatic'],
  ['re lig ios', 'religious'], ['per sistent', 'persistent'],
  ['dicta te', 'dictate'], ['la ment', 'lament'],
];
const applyKnown = t => KNOWN_SPLITS.reduce((s, [from, to]) => s.split(from).join(to), String(t));
// 词典法拆词（2 段；首段 ≥2 字符防正则回溯吃掉前一个单词；拼接在词典 && 至少一个片段不在词典）
const deSplitWord2 = t => String(t).replace(/\b([a-z]{2,6})\s+([a-z]{2,10})\b/gi, (all, a, b) => {
  if (!/^[a-z]+$/i.test(a + b)) return all;
  const joined = (a + b).toLowerCase();
  if (hasStem(joined) && (!has(a) || !has(b))) return a + b;
  return all;
});
const deTrailSlash = t => { const s = String(t); const core = s.replace(/\/+\s*$/, ''); return core.trim().length ? core : s; };  // "/"（表示不填）是合法答案，不能删空
// KNOWN 修正可能暴露新的尾部残留（如 Rea ding → reading 后 "68 reading critically 3" 可被 dePageResidue 删除），故第二遍 dePageResidue
const fixField = t => deTrailSlash(deSplitWord2(dePageResidue(applyKnown(deCnSpace(dePageResidue(deTag(t)))))));

/* ---------- 人工核对清单 ---------- */
const manual = [];
const addManual = (where, field, text) => manual.push(`- ${where} :: ${field} :: ${JSON.stringify(text)}`);

/* ---------- 备份 ---------- */
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
for (const f of ['basic-english.json', 'reading.json', 'computer.json']) {
  const file = path.join(root, 'source', f);
  fs.copyFileSync(file, file + '.bak-pollution-' + stamp);
}

/* ---------- 处理内容数据（reading/basic-english） ---------- */
for (const file of ['reading.json', 'basic-english.json']) {
  const full = path.join(root, 'source', file);
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  let fields = 0, typeFixed = 0, orKept = 0, splitFixed = 0;
  for (const book of data.books || []) for (const unit of book.units || []) {
    for (const q of unit.questions || []) {
      const fix = (v, label) => {
        const nv = fixField(v);
        if (nv !== v) { fields++; if (label === 'answer') splitFixed++; }
        if (KNOWN_SPLITS.some(([from]) => String(v).includes(from))) {
          const hits = KNOWN_SPLITS.filter(([from]) => String(v).includes(from)).map(([from, to]) => `${from}→${to}`).join(', ');
          q._knownApplied = (q._knownApplied ? q._knownApplied + '; ' : '') + hits;
        }
        return nv;
      };
      q.q = fix(q.q, 'q');
      q.answer = fix(q.answer, 'answer');
      if (Array.isArray(q.options)) q.options = q.options.map(o => fix(o, 'opt'));
      if (unit.instruction) unit.instruction = fix(unit.instruction, 'ins');
      (unit.wordBanks || []).forEach(bank => (bank.words || []).forEach((w, wi) => { bank.words[wi] = fix(w, 'wb'); }));
      // ② text + options → choice/multi（答案字母规范化；前端按答案字母数区分单选/多选，类型统一 choice）
      if (q.type === 'multi') { q.type = 'choice'; }  // 迁移历史 multi 标记
      if (q.type === 'text' && Array.isArray(q.options) && q.options.length) {
        const ans = String(q.answer || '').trim();
        const pair = ans.match(/^([A-F])\s*[&,，、]\s*([A-F])$/i);
        if (pair) { q.answer = pair[1].toUpperCase() + pair[2].toUpperCase(); q.type = 'choice'; typeFixed++; }
        else if (/^[A-F]$/i.test(ans)) { q.answer = ans.toUpperCase(); q.type = 'choice'; typeFixed++; }
        else if (/^([A-F])\s+or\s+([A-F])$/i.test(ans)) { q.type = 'choice'; orKept++; }  // "A or D" 语义保留原文
      }
      // 截断选项检测（如 "F. nicity 341 to avoid..."）：选项内出现 残词+页码 模式
      if (Array.isArray(q.options)) q.options.forEach((o, i) => {
        if (/\b[a-z]{2,6}\s+\d{2,3}\s/.test(String(o))) addManual(`${file} ${book.key}/${unit.key}#${q.index}`, `option ${i + 1} 截断`, o);
      });
      // 应用人工核对修正表时记录（供用户对照教材复核）
      if (q._knownApplied) { addManual(`${file} ${book.key}/${unit.key}#${q.index}`, 'KNOWN 修正', q._knownApplied); delete q._knownApplied; }
    }
  }
  fs.writeFileSync(full, JSON.stringify(data, null, 1) + '\n', 'utf8');
  console.log(`${file}: 修复字段 ${fields} 处，text→choice/multi ${typeFixed} 题（or 保留 ${orKept}），拆词合并 ${splitFixed} 处`);
}

/* ---------- ③ 计算机 vfp1-review #32 空选项补 LOOP ---------- */
const compFull = path.join(root, 'source', 'computer.json');
const comp = JSON.parse(fs.readFileSync(compFull, 'utf8'));
const vfp1 = comp.find(b => b.key === 'computer-vfp1-review');
if (vfp1 && vfp1.questions[31] && vfp1.questions[31].options && vfp1.questions[31].options[0] === '') {
  vfp1.questions[31].options[0] = 'LOOP';  // VFP：LOOP 继续循环 / EXIT 退出循环；答案 C=EXIT 保持不变
  console.log('computer.json: vfp1-review #32 空选项 → LOOP');
}
fs.writeFileSync(compFull, JSON.stringify(comp, null, 2) + '\n', 'utf8');

/* ---------- ④ 人工核对清单 ---------- */
const manualFile = path.join(root, 'scripts', 'ocr-manual-check.md');
const md = `# OCR / 内容污染人工核对清单（${stamp}）\n\n词典法自动合并无法覆盖的项，需对照教材人工确认：\n\n${manual.length ? manual.join('\n') : '（无）'}\n`;
fs.writeFileSync(manualFile, md, 'utf8');
console.log(`人工核对清单 ${manual.length} 条 → scripts/ocr-manual-check.md`);
