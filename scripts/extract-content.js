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
  const h3Positions = [...bodyHtml.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map(m => ({ title: stripTags(m[1]).trim(), index: m.index }));
  const moduleTitles = h3Positions.map(h => h.title);
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
      // q 保留 <mark>/<em> 标签供前端白名单渲染，但必须先解码 HTML 实体
      current = { index: part.groups[1], q: decodeEntities(part.groups[2].trim()), htmlIndex: part.index };
      questions.push(current);
    } else if (part.kind === 'options' && current) {
      current.options = parseOptions(bodyHtml.slice(part.block.start, part.block.end));
    } else if (part.kind === 'answer' && current) {
      const text = stripTags(part.groups[1]).trim();
      // 仅当「整个答案」就是选项字母序列（如 A / A、C / C&D）才视为选择题字母；
      // 必须首尾锚定——文本答案（如 "a, the, with" / "convey, handle"）的首字母
      // 恰好是 A-E 时不能被截断（曾把这两类误截成 "A" / "C"）。
      // 文本答案统一剥掉「正确答案/参考答案：」前缀，保留纯答案文本。
      const letter = text.match(/^(?:正确答案|参考答案)\s*[:：]\s*([A-E](?:\s*[&、,，]\s*[A-E])*)\s*$/i);
      current.answer = letter
        ? letter[1].toUpperCase().replace(/[^A-E]/g, '')
        : text.replace(/^(?:正确答案|参考答案)\s*[:：]\s*/, '');
    }
  }
  // type 推断：有选项且答案是指向选项的字母 → choice，否则 text
  for (const q of questions) {
    const hasOptions = Array.isArray(q.options) && q.options.length;
    const isChoice = hasOptions && /^[A-E]+$/i.test(q.answer || '');
    q.type = isChoice ? 'choice' : 'text';
    // 模块归属：该题在旧 HTML 中位于哪个 h3 模块标题之下（按位置判定）。
    // 渲染端据此把题目按题型模块交错展示，词库紧跟其所属模块。
    let owner = '';
    for (const h of h3Positions) { if (h.index < q.htmlIndex) owner = h.title; }
    q.module = owner;
    delete q.htmlIndex;
  }
  // 共享选项组（word-bank）：多道题上方共用的词库（若干单词/短语）。
  // 旧版曾把这类选项组整块丢弃，导致用户看不到可选词——按 exercise-module
  // 归属提取 {module: 模块标题, words: [...]}，渲染端在对应模块标题下展示。
  const wordBanks = [];
  const moduleRe = /<div class="exercise-module">/g;
  let mm;
  while ((mm = moduleRe.exec(bodyHtml)) !== null) {
    const block = matchBlock(bodyHtml, mm.index);
    const moduleHtml = bodyHtml.slice(mm.index, block.end);
    const titleMatch = moduleHtml.match(/<h3>([\s\S]*?)<\/h3>/);
    const wbStart = moduleHtml.indexOf('<div class="word-bank">');
    if (wbStart < 0) continue;
    const wbBlock = matchBlock(moduleHtml, wbStart);
    const wbHtml = moduleHtml.slice(wbStart, wbBlock.end);
    const words = [...wbHtml.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)]
      .map(m => stripTags(m[1]).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (words.length) wordBanks.push({ module: titleMatch ? stripTags(titleMatch[1]).trim() : '', words });
  }
  return { modules: moduleTitles, instruction: instruction ? stripTags(instruction).trim() : '', wordBanks, questions };
}

// —— HTML 实体解码（命名 + 十进制/十六进制数字实体）——
// 历史教训：旧页面用 &#39;/&quot; 等实体，q 提取若只剥标签不解码会把
// "&#39;" 字样原样存进数据，前端转义后用户看到乱码（2026-08-21 修复 487 处）。
const NAMED_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&#39;': "'", '&nbsp;': '\u00A0', '&hellip;': '…', '&mdash;': '—', '&ndash;': '–',
  '&rsquo;': '’', '&lsquo;': '‘', '&rdquo;': '”', '&ldquo;': '“', '&middot;': '·',
};
function decodeEntities(text) {
  return String(text || '').replace(/&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, match => {
    if (NAMED_ENTITIES[match] !== undefined) return NAMED_ENTITIES[match];
    if (match[1] === '#') {
      const hex = /^&#[xX]/.test(match);
      const code = hex ? parseInt(match.slice(3, -1), 16) : parseInt(match.slice(2, -1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10FFFF) {
        try { return String.fromCodePoint(code); } catch (_) { return match; }
      }
    }
    return match;
  });
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]*>/g, ''));
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
// 提取源：archive/legacy/泛读系列-旧版.html（旧静态 HTML 的存档，工作区版本已被数据驱动页取代）
function extractReading() {
  const html = fs.readFileSync(path.join(root, 'archive/legacy/泛读系列-旧版.html'), 'utf8');
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
      wordBanks: parsed.wordBanks,
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
// 旧页面结构：<section id="book-N"> 是容器（只有标题），单元全部位于其下的题型小节
// <section id="book-N-<kind>">（wordFill=选词填空 / translation=汉译英 / vocabulary=词汇）。
// 用「下一个 section 标签」切分小节 body（嵌套不影响：主 section 的 body 含子小节内容，直接跳过主 section）。
// 4 本书 × 题型还原：books = 基英1~4，unit.kind 记录题型，渲染端按 kind 分组展示。
// 提取源：archive/legacy/基英系列-旧版.html
function extractBasicEnglish() {
  const html = fs.readFileSync(path.join(root, 'archive/legacy/基英系列-旧版.html'), 'utf8');
  const books = [];
  const sectionStartRe = /<section id="(book-\d+(?:-[a-zA-Z]+)?)"[^>]*>/g;
  const markers = [];
  let m;
  while ((m = sectionStartRe.exec(html)) !== null) markers.push({ match: m, start: m.index });
  const sections = []; // {id, body}
  markers.forEach((marker, i) => {
    const bodyEnd = markers[i + 1] ? markers[i + 1].start : html.length;
    const bodyStart = marker.start + marker.match[0].length;
    sections.push({ id: marker.match[1], body: html.slice(bodyStart, bodyEnd) });
  });
  const kindLabelOf = kind => ({ wordFill: '选词填空', translation: '汉译英', vocabulary: '词汇' }[kind] || kind);
  for (let n = 1; n <= 4; n++) {
    const bookSections = sections.filter(s => s.id.startsWith(`book-${n}-`));
    if (!bookSections.length) continue;
    const units = [];
    for (const sec of bookSections) {
      const kind = sec.id.replace(/^book-\d+-/, '');
      const unitStartRe = /<details id="unit-(\d+)"><summary>([\s\S]*?)<\/summary>/g;
      const unitMarkers = [];
      let um;
      while ((um = unitStartRe.exec(sec.body)) !== null) unitMarkers.push({ match: um, start: um.index });
      unitMarkers.forEach((umark, i) => {
        const [, unitNo, summaryHtml] = umark.match;
        const summary = summaryHtml.replace(/<small>[\s\S]*?<\/small>/g, '').trim();
        const bodyStart = umark.start + umark.match[0].length;
        const bodyEnd = unitMarkers[i + 1] ? unitMarkers[i + 1].start : sec.body.length;
        const parsed = parseUnitBody(sec.body.slice(bodyStart, bodyEnd));
        units.push({
          key: `${sec.id}-unit-${unitNo}`,
          kind,
          kindLabel: kindLabelOf(kind),
          name: summary,
          modules: parsed.modules,
          instruction: parsed.instruction,
          wordBanks: parsed.wordBanks,
          questions: parsed.questions
        });
      });
    }
    books.push({ key: `book-${n}`, name: `基英${n}`, units });
  }
  return { version: 1, title: '基英系列', books };
}

// ---------- 输出 ----------
// 语义修正表：旧 HTML 自身数据有误，重提取后必须重放的修正。
// 每次重提取都会覆盖 source/*.json，这类人工核对结论固化在这里，防止丢失。
const SEMANTIC_FIXES = [
  // 泛读 book-4 词库变形单元第 8 题：旧 HTML 仅 3 个选项却标注答案 D；
  // corporate = relating to a body（C 项），人工核对后定 C。
  { file: 'reading', book: 'book-4', unit: 'book-4-word-unit-5', index: '8', answer: 'C' }
];
function applySemanticFixes(data, fileKey) {
  let fixed = 0;
  for (const fix of SEMANTIC_FIXES) {
    if (fix.file !== fileKey) continue;
    for (const book of data.books) {
      if (book.key !== fix.book) continue;
      for (const unit of book.units) {
        if (unit.key !== fix.unit) continue;
        for (const q of unit.questions) {
          if (String(q.index) === String(fix.index)) { q.answer = fix.answer; fixed++; }
        }
      }
    }
  }
  if (fixed) console.log(`语义修正：${fileKey} 重放 ${fixed} 处（${SEMANTIC_FIXES.filter(f => f.file === fileKey).map(f => f.unit + '#' + f.index).join('、')}）`);
}

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
applySemanticFixes(reading, 'reading');
applySemanticFixes(basic, 'basic');
stats(reading, '泛读');
stats(basic, '基英');
fs.writeFileSync(path.join(sourceDir, 'reading.json'), JSON.stringify(reading, null, 1), 'utf8');
fs.writeFileSync(path.join(sourceDir, 'basic-english.json'), JSON.stringify(basic, null, 1), 'utf8');
console.log('已写入 source/reading.json、source/basic-english.json');
