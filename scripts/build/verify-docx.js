// 题库 vs 原题文档核对：node verify-docx.js <docx文本路径> [bankKey]（默认 ethics）
// 多候选组遍历比对，short/essay 只验题干；选项按文本映射后比对答案
const fs = require('fs');
const path = require('path');
const root = 'D:/study/sb/study platform';
const DOCX_TXT = process.argv[2] || 'C:/Users/23674/AppData/Local/Temp/politics-docx.txt';
const BANK_KEY = process.argv[3] || 'ethics';
const lines = fs.readFileSync(DOCX_TXT, 'utf8').split('\n');

const GARBLED = /[釤呛俨匀谔鱉调硯錦渗呙铉們欤谦鸪饺竞荡赚輒坛買凍聞創沟燴鐺險爱氇谴净丛妈羥为贍偾蛏练籟塤礙馐决怂阐譜鱺鲷鴯譖昙膚遙闫撷凄凍鈹鋨劳臘锴痫婦胫籴輒峄陽檉簖疖網儂號泶買鲷鴯譖昙膚遙闫撷輒]/g;
const norm = s => String(s || '').replace(GARBLED, '').replace(/\s+/g, '').replace(/[（(]\s*[）)]/g, '').trim();

const sectionOfLine = {};
let section = 'unknown';
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  // 兼容「一.单项选择部分：」「三、简答题部分：」「多项选择：」「简答题：」等（前缀数字可省略，「部分」可有可无）
  const m = t.match(/^(?:[一二三四五六七八九十0-9]+[、.．]?\s*)?([^:：]*?(?:选择|简答题|论述题))(?:部分)?[:：]/);
  if (m) section = m[1].replace(/部分$/, '').trim();
  sectionOfLine[i] = section;
}
const isChoiceSec = s => s === '单项选择' || s === '多项选择';

const docQuestions = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  const sec = sectionOfLine[i];
  if (isChoiceSec(sec)) {
    // 题号括号可缺顿号（如「（     ）7关于真理标准问题讨论」）
    const re = /[（(]\s*[）)]\s*(\d+)(?:[、.．]|(?![0-9]))/g;
    const hits = [];
    let m;
    while ((m = re.exec(line))) hits.push({num: +m[1], start: m.index, end: m.index + m[0].length});
    for (let k = 0; k < hits.length; k++) {
      const seg = line.slice(hits[k].end, k + 1 < hits.length ? hits[k + 1].start : line.length);
      docQuestions.push({number: hits[k].num, text: norm(seg), line: i, section: sec, options: []});
    }
  } else if (sec === '简答题' || sec === '论述题') {
    const m = line.match(/^(\d+)[、.．](.+)$/);
    if (m && !/^(答|答案|参考)/.test(line)) docQuestions.push({number: +m[1], text: norm(m[2]), line: i, section: sec, options: []});
  }
}
const choiceQIdx = docQuestions.map((q, idx) => (isChoiceSec(q.section) ? idx : -1)).filter(i => i >= 0);
for (let ci = 0; ci < choiceQIdx.length; ci++) {
  const q = docQuestions[choiceQIdx[ci]];
  const nextLine = ci + 1 < choiceQIdx.length ? docQuestions[choiceQIdx[ci + 1]].line : Infinity;
  for (let i = q.line + 1; i < nextLine && i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('答案') || /^[（(]\s*[）)]\s*\d+/.test(t)) break;
    const re = /([A-E])[、.．]([^A-E]*?)(?=[A-E][、.．]|$)/g;
    let m;
    while ((m = re.exec(t))) q.options.push({key: m[1], text: norm(m[2])});
  }
}

const answerBlocks = [];
let current = null;
// 答案行：可选题号前缀 + （字母），如「（ B ） 2、（ D ）」「1、（ BC ）」；思政文档以「答案」开头
const isAnsLine = t => /^(\d+[、.．])?\s*[（(]\s*[A-E]{1,5}\s*[）)]/.test(t) && !/^[（(]\s*[）)]\s*\d+/.test(t);
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t.startsWith('答案')) { current = {startLine: i, endLine: i, text: t}; answerBlocks.push(current); }
  else if (isAnsLine(t) && current && i === current.endLine + 1) { current.endLine = i; current.text += t; }
  else if (isAnsLine(t) && !current) { current = {startLine: i, endLine: i, text: t}; answerBlocks.push(current); }
  else current = null;
}
for (const b of answerBlocks) {
  b.answers = [];
  const re = /[（(]\s*([A-E]{1,5})\s*[）)]/g;
  let m;
  while ((m = re.exec(b.text))) b.answers.push(m[1].replace(/\s/g, ''));
}
// 答案块归属：块前最近的一组（以题号==1 的行作为组起点）内的题才用该块的答案；其他组无答案
function docAnswer(docQ) {
  for (const b of answerBlocks) {
    let start = -1;
    for (const dq of docQuestions) if (dq.line < b.startLine && dq.number === 1) start = Math.max(start, dq.line);
    if (docQ.line >= start && docQ.line < b.startLine) {
      const idx = docQ.number - 1;
      return (idx >= 0 && idx < b.answers.length) ? b.answers[idx] : null;
    }
  }
  return null;
}

const politics = JSON.parse(fs.readFileSync(path.join(root, 'source/politics.json'), 'utf8'));
const ethics = politics.find(b => b.key === BANK_KEY);
if (!ethics) { console.error('未找到 bank:', BANK_KEY); process.exit(1); }
const typeMap = {single: '单项选择', multi: '多项选择', short: '简答题', essay: '论述题'};
const sortAns = a => String(a || '').replace(/[^A-Ea-e]/g, '').toUpperCase().split('').sort().join('');

function findCandidates(q) {
  const t = norm(q.title);
  const sec = typeMap[q.type] || 'unknown';
  return docQuestions.filter(d => d.section === sec && d.text && (d.text.includes(t) || t.includes(d.text)));
}
function mapOptions(bankOptions, docOptions) {
  const map = {};
  for (const bo of bankOptions) {
    const bt = norm(bo.text);
    let hit = docOptions.find(do_ => norm(do_.text) === bt);
    if (!hit && bt.length >= 8) hit = docOptions.find(do_ => {
      const dt = norm(do_.text);
      return dt && (dt.includes(bt) || bt.includes(dt));
    });
    if (hit) map[bo.key] = hit.key;
  }
  return map;
}

const out = {checked: 0, unmatched: [], mismatch: []};
for (const q of ethics.questions) {
  const cands = findCandidates(q);
  if (!cands.length) { out.unmatched.push({id: q.id, type: q.type, title: q.title.slice(0, 45)}); continue; }
  if (q.type === 'short' || q.type === 'essay') { out.checked++; continue; } // 题干匹配即通过
  const bankAns = sortAns(q.answer);
  const bankOpts = (q.options || []).map((t, i) => ({key: String.fromCharCode(65 + i), text: t}));
  // try every candidate group: consistent if any group's answer (mapped) matches bank
  let consistent = false, detail = [];
  for (const c of cands) {
    const da = docAnswer(c);
    if (da === null) { detail.push(`组${c.line}#${c.number}无答案`); continue; }
    const map = mapOptions(bankOpts, c.options);
    const mapped = bankAns.split('').filter(ch => map[ch]).map(ch => map[ch]);
    const mappedStr = sortAns(mapped.join(''));
    detail.push(`组行${c.line}#${c.number} 文档答案=${sortAns(da)} 映射=${mappedStr}${mapped.length !== bankAns.length ? '(映射缺' + (bankAns.length - mapped.length) + ')' : ''}`);
    // 映射完整则严格比对；映射不完整（题库选项在文档中无对应文本）时，字母直接相同视为一致
    if (mapped.length === bankAns.length ? sortAns(da) === mappedStr : sortAns(da) === bankAns) { consistent = true; break; }
  }
  if (!consistent) out.mismatch.push({id: q.id, type: q.type, bank: bankAns, detail, title: q.title.slice(0, 45)});
  out.checked++;
}
console.log(BANK_KEY, '共', ethics.questions.length, '| 已核对', out.checked, '| 未匹配', out.unmatched.length, '| 真不一致', out.mismatch.length);
console.log('\n=== 未匹配（题库独有） ===');
for (const u of out.unmatched) console.log(` [${u.type}] id=${u.id} | ${u.title}`);
console.log('\n=== 真不一致（任一候选组映射后仍不符） ===');
for (const m of out.mismatch) {
  console.log(` [${m.type}] id=${m.id} 题库=${m.bank} | ${m.title}`);
  for (const d of m.detail) console.log('    -', d);
}
