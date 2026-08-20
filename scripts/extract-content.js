// 一次性迁移工具：把 泛读系列/基英系列 的巨型静态 HTML 提取为结构化 JSON
//（source/reading.json、source/basic-english.json），此后内容改由 JSON 维护，
// 经 scripts/build/build.js 生成 data.js。提取完成后此脚本保留作参考。
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'source');

// ---------- 通用：解析单元 details 内容 ----------
// 单元内题目按 DOM 顺序配对：<div class="q"> 开始新题，<div class="options"> 挂选项，<details class="answer"> 挂答案。
// options 内部嵌套选项 <div>，必须用深度配对找结束位置，不能用非贪婪正则。
function findTagEnds(html, openTag, closeTag) {
  // 返回所有 "<openTag...>" 的 [start, endAfterOpen]，以及配对的闭合位置
  const opens = [];
  let i = 0;
  while (i < html.length) {
    const idx = html.indexOf(openTag, i);
    if (idx < 0) break;
    const gt = html.indexOf('>', idx);
    if (gt < 0) break;
    opens.push({ start: idx, openEnd: gt + 1 });
    i = gt + 1;
  }
  return opens;
}

function matchBlock(html, start) {
  // 从 start 处的 "<div class=...>" 开始，深度配对扫描，返回 [blockStart, blockEnd]（含结束标签）
  let depth = 0;
  let i = start;
  while (i < html.length) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth++;
      i = html.indexOf('>', nextOpen) + 1;
    } else {
      depth--;
      if (depth <= 0) return { start, end: nextClose + '</div>'.length };
      i = nextClose + '</div>'.length;
    }
  }
  return { start, end: html.length };
}

function parseUnitBody(bodyHtml) {
  const parts = [];
  const qRe = /<div class="q"><b>(\d+)<\/b><pre>([\s\S]*?)<\/pre><\/div>/g;
  const ansRe = /<details class="answer"><summary>[\s\S]*?<\/summary>([\s\S]*?)<\/details>/g;
  const moduleTitles = [...bodyHtml.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map(m => stripTags(m[1]).trim());
  const instruction = (bodyHtml.match(/<p class="instruction">([\s\S]*?)<\/p>/) || [])[1];
  for (const [re, kind] of [[qRe, 'q'], [ansRe, 'answer']]) {
    let m;
    while ((m = re.exec(bodyHtml)) !== null) parts.push({ kind, index: m.index, groups: m });
  }
  // options 块：深度配对
  const optStarts = findTagEnds(bodyHtml, '<div class="options">', '</div>');
  for (const o of optStarts) {
    const block = matchBlock(bodyHtml, o.start);
    parts.push({ kind: 'options', index: o.start, block });
  }
  parts.sort((a, b) => a.index - b.index);
  const questions = [];
  let current = null;
  for (const part of parts) {
    if (part.kind === 'q') {
      current = { index: part.groups[1], q: part.groups[2].trim() };
      questions.push(current);
    } else if (part.kind === 'options' && current) {
      current.options = parseOptions(bodyHtml.slice(part.block.start, part.block.end));
    } else if (part.kind === 'answer' && current) {
      const text = stripTags(part.groups[1]).trim();
      // "正确答案：C" / "参考答案：C&D"（多选用 & 、 ， 空格分隔）/ 无字母则为文本答案
      const letter = text.match(/(?:正确答案|参考答案)[:：]\s*([A-E](?:\s*[&、,，]\s*[A-E])*)/i);
      current.answer = letter ? letter[1].toUpperCase().replace(/[^A-E]/g, '') : text;
    }
  }
  // type 推断：有选项且答案是指向选项的字母 → choice，否则 text
  for (const q of questions) {
    const hasOptions = Array.isArray(q.options) && q.options.length;
    const isChoice = hasOptions && /^[A-E]+$/i.test(q.answer || '');
    q.type = isChoice ? 'choice' : 'text';
  }
  return { modules: moduleTitles, instruction: instruction ? stripTags(instruction).trim() : '', questions };
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
}

function parseOptions(blockHtml) {
  const out = [];
  // 剥掉外壳 <div class="options">…</div>，只解析内部选项 div（深度配对）
  const outerOpen = blockHtml.indexOf('<div');
  if (outerOpen < 0) return out;
  const innerStart = blockHtml.indexOf('>', outerOpen) + 1;
  const innerEnd = blockHtml.lastIndexOf('</div>');
  const inner = innerEnd > innerStart ? blockHtml.slice(innerStart, innerEnd) : blockHtml.slice(innerStart);
  let depth = 0, start = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner.startsWith('<div', i)) { if (depth === 0) start = i; depth++; i = inner.indexOf('>', i); if (i < 0) break; }
    else if (inner.startsWith('</div>', i)) { depth--; if (depth === 0) { out.push(cleanOption(inner.slice(start, i))); start = -1; } i += 5; }
  }
  return out.filter(Boolean);
}

function cleanOption(divHtml) {
  let s = divHtml.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
  s = s.replace(/<strong>\s*[A-Ea-e][.、．)）]\s*<\/strong>/gi, ''); // 去掉任意位置的 "A." 前缀
  s = s.replace(/<span class="[^"]*"><\/span>/g, ''); // 去掉空装饰 span
  s = s.trim();
  return s || null;
}

// ---------- 泛读系列 ----------
function extractReading() {
  const html = fs.readFileSync(path.join(root, '专业课/英语系/泛读系列/index.html'), 'utf8');
  const books = [];
  // 单元 details 会嵌套 answer 的 <details class="answer">，不能用正则直接配对闭合标签；
  // 改为按开始位置切分：body = 本单元 summary 结束 → 下一个单元开始（或页面尾部）。
  const unitStartRe = /<details id="book-(\d+)-([a-z]+)-unit-(\d+)"><summary>([\s\S]*?)<\/summary>/g;
  const nameRe = /<section id="book-(\d+)"><h2>([\s\S]*?)<\/h2>/g;
  const names = {};
  let m;
  while ((m = nameRe.exec(html)) !== null) names[m[1]] = stripTags(m[2]).trim();
  const markers = [];
  while ((m = unitStartRe.exec(html)) !== null) markers.push({ match: m, start: m.index });
  const byBook = {};
  markers.forEach((marker, i) => {
    const [, bookNo, kind, unitNo, summaryHtml] = marker.match;
    const summary = summaryHtml.replace(/<small>[\s\S]*?<\/small>/g, '').trim();
    const bodyStart = marker.start + marker.match[0].length; // summary 结束处
    const bodyEnd = markers[i + 1] ? markers[i + 1].start : html.length;
    const body = html.slice(bodyStart, bodyEnd);
    const parsed = parseUnitBody(body);
    const unit = {
      key: `book-${bookNo}-${kind}-unit-${unitNo}`,
      kind,
      name: summary,
      modules: parsed.modules,
      instruction: parsed.instruction,
      questions: parsed.questions
    };
    (byBook[bookNo] = byBook[bookNo] || []).push(unit);
  });
  for (const no of Object.keys(byBook).sort((a, b) => Number(a) - Number(b))) {
    books.push({ key: `book-${no}`, name: names[no] || `泛读${no}`, units: byBook[no] });
  }
  return { version: 1, title: '泛读系列', books };
}

// ---------- 基英系列 ----------
function extractBasicEnglish() {
  const html = fs.readFileSync(path.join(root, '专业课/英语系/基英系列/index.html'), 'utf8');
  const units = [];
  const unitStartRe = /<details id="unit-(\d+)"><summary>([\s\S]*?)<\/summary>/g;
  const markers = [];
  let m;
  while ((m = unitStartRe.exec(html)) !== null) markers.push({ match: m, start: m.index });
  markers.forEach((marker, i) => {
    const [, unitNo, summaryHtml] = marker.match;
    const summary = summaryHtml.replace(/<small>[\s\S]*?<\/small>/g, '').trim();
    const bodyStart = marker.start + marker.match[0].length; // summary 结束处
    const bodyEnd = markers[i + 1] ? markers[i + 1].start : html.length;
    const body = html.slice(bodyStart, bodyEnd);
    const parsed = parseUnitBody(body);
    units.push({
      key: `unit-${unitNo}`,
      kind: '',
      name: summary,
      modules: parsed.modules,
      instruction: parsed.instruction,
      questions: parsed.questions
    });
  });
  return { version: 1, title: '基英系列', books: [{ key: 'book-1', name: '基英综合教程', units }] };
}

// ---------- 输出 ----------
function stats(data, label) {
  let qTotal = 0, choice = 0, text = 0;
  for (const book of data.books) for (const unit of book.units) for (const q of unit.questions) {
    qTotal++; if (q.type === 'choice') choice++; else text++;
  }
  console.log(`${label}: ${data.books.length} 书 / ${data.books.reduce((n, b) => n + b.units.length, 0)} 单元 / ${qTotal} 题（choice ${choice} / text ${text}）`);
  return qTotal;
}

const reading = extractReading();
const basic = extractBasicEnglish();
stats(reading, '泛读');
stats(basic, '基英');
fs.writeFileSync(path.join(sourceDir, 'reading.json'), JSON.stringify(reading, null, 1), 'utf8');
fs.writeFileSync(path.join(sourceDir, 'basic-english.json'), JSON.stringify(basic, null, 1), 'utf8');
console.log('已写入 source/reading.json、source/basic-english.json');
