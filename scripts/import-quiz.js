/* ============================================================
   本地题库导入器
   用法：
     node scripts/import-quiz.js <目标> <数据文件> [--bank <key>] [--unit <key>] [--check]
   目标（对应 source/*.json）：
     politics / computer      —— 思政/计算机题库（多 bank，需 --bank）
     reading / basic-english  —— 泛读/基英内容（--unit 指定现有单元，或 --book + --unit-name 新建）
   数据文件：
     .json —— 数组 [{type,title,options,answer,hint}] 或 {questions:[...]}
     .csv  —— 列：type,title,options,answer,hint（options 用 | 分隔；type 可留空自动推断）
   选项：
     --check          只校验与报告，不写文件
     --dry            同 --check（别名）
   流程：校验（题型/选项/答案/重复）→ 去重合并 → 备份原文件 → 写入 → 提示发布。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const schema = require('./quiz-schema');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'source');
const TARGETS = {
  politics: { file: 'politics.json', type: 'quiz', banks: true },
  computer: { file: 'computer.json', type: 'quiz', banks: true },
  reading: { file: 'reading.json', type: 'content', banks: false },
  'basic-english': { file: 'basic-english.json', type: 'content', banks: false },
};

function parseArgs(argv) {
  const args = { target: argv[2], file: argv[3] };
  for (let i = 4; i < argv.length; i++) {
    if (argv[i] === '--bank') args.bank = argv[++i];
    else if (argv[i] === '--unit') args.unit = argv[++i];
    else if (argv[i] === '--book') args.book = argv[++i];
    else if (argv[i] === '--unit-name') args.unitName = argv[++i];
    else if (argv[i] === '--check' || argv[i] === '--dry') args.check = true;
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { if (row.some(f => String(f).trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') pushField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushField(); pushRow();
    } else field += c;
  }
  if (field !== '' || row.length) { pushField(); pushRow(); }
  return rows;
}

function csvToQuestions(rows, target) {
  let header = rows[0] && rows[0].map(h => String(h).trim().toLowerCase());
  const headerHits = (header || []).filter(h => ['type', 'title', '题干', 'question', 'options', '答案', 'answer', 'hint', '提示'].includes(h));
  if (headerHits.length >= 2) rows = rows.slice(1);
  const content = target.type === 'content';
  return rows.map(r => {
    const q = { type: String(r[0] || '').trim().toLowerCase(), title: String(r[1] || '').trim(), options: r[2], answer: String(r[3] || '').trim(), hint: String(r[4] || '').trim() };
    if (!q.type) q.type = (q.options && String(q.options).trim()) ? 'single' : (content ? 'text' : 'short');
    return q;
  });
}

function jsonToQuestions(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.questions)) return data.questions;
  if (data && Array.isArray(data.banks)) return data.banks.flatMap(b => (b.questions || []).map(q => ({ ...q, _bank: b.key })));
  if (data && Array.isArray(data.books)) return data.books.flatMap(b => (b.units || []).flatMap(u => (u.questions || []).map(q => ({ ...q, _book: b.key, _unit: u.key }))));
  return [];
}

function loadInput(file, target) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv' || ext === '.tsv') {
    const rows = parseCsv(fs.readFileSync(file, 'utf8'));
    return csvToQuestions(rows, target);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  return jsonToQuestions(data);
}

function report(validation, bankLabel) {
  console.log(`\n校验报告（${bankLabel || '全部'}）：`);
  console.log(`  总题数 ${validation.stats.total}：` + Object.entries(validation.stats.byType).map(([t, n]) => `${t}=${n}`).join(' ') + '。');
  if (validation.duplicates.length) {
    console.log(`  ⚠ 输入内重复 ${validation.duplicates.length} 题（同题型同题干）：`);
    validation.duplicates.slice(0, 5).forEach(d => console.log(`    - #${d.index} 与 #${d.sameAs} 重复：「${String(d.title).slice(0, 40)}」`));
    if (validation.duplicates.length > 5) console.log(`    … 其余 ${validation.duplicates.length - 5} 条省略`);
  }
  if (validation.errors.length) {
    console.log(`  ✗ 校验错误 ${validation.errors.length} 条：`);
    validation.errors.slice(0, 8).forEach(e => e.messages.forEach(m => console.log(`    - #${e.index + 1} ${m}`)));
    if (validation.errors.length > 8) console.log(`    … 其余 ${validation.errors.length - 8} 条省略`);
    return false;
  }
  console.log('  ✓ 全部通过');
  return true;
}

function main() {
  const args = parseArgs(process.argv);
  const target = TARGETS[args.target];
  if (!target) {
    console.error(`目标必须是：${Object.keys(TARGETS).join(' / ')}`);
    process.exit(1);
  }
  if (!args.file) { console.error('用法：node scripts/import-quiz.js <目标> <json|csv 文件> [--bank key] [--unit key] [--check]'); process.exit(1); }
  const sourceFile = path.join(sourceDir, target.file);
  const data = JSON.parse(fs.readFileSync(sourceFile, 'utf8').replace(/^\uFEFF/, ''));
  const incoming = loadInput(args.file, target);
  if (!incoming.length) { console.error('✗ 输入文件未解析出任何题目'); process.exit(1); }

  // ---- 定位目标容器 ----
  let container; // {questions: [...]} 引用
  let label = args.target;
  if (target.banks) {
    const banks = data.banks || (Array.isArray(data) ? data : []);
    if (!banks.length) { console.error('✗ 源文件没有 banks'); process.exit(1); }
    const bank = args.bank ? banks.find(b => b.key === args.bank) : null;
    if (!bank) {
      console.error(`✗ 未找到 bank "${args.bank}"。可用：${banks.map(b => b.key).join(' / ')}`);
      process.exit(1);
    }
    container = bank; label = `${args.target} · ${bank.name}`;
  } else {
    const books = (data.books || []);
    const book = args.book ? books.find(b => b.key === args.book) : books[0];
    if (!book) { console.error('✗ 源文件没有 books'); process.exit(1); }
    if (args.unit) {
      const unit = book.units.find(u => u.key === args.unit);
      if (!unit) { console.error(`✗ 未找到单元 "${args.unit}"。可用：${book.units.slice(0, 20).map(u => u.key).join(' / ')}${book.units.length > 20 ? ' …' : ''}`); process.exit(1); }
      container = unit; label = `${args.target} · ${book.name} · ${unit.name}`;
    } else {
      if (!args.unitName) { console.error('✗ 内容型题库需要 --unit（追加现有单元）或 --unit-name（新建单元）'); process.exit(1); }
      const unit = { key: `${book.key}-unit-${book.units.length + 1}`, kind: '', name: args.unitName, modules: [], instruction: '', questions: [] };
      book.units.push(unit);
      container = unit; label = `${args.target} · ${book.name} · 新单元「${args.unitName}」`;
    }
  }
  container.questions = container.questions || [];

  // ---- 校验 ----
  const validation = schema.validateList(incoming, target.type);
  const ok = report(validation, label);
  if (!ok) process.exit(1);

  // ---- 合并去重 ----
  const { merged, dropped } = schema.mergeUnique(container.questions, incoming);
  if (dropped) console.log(`  ⚠ 与库内重复，跳过 ${dropped} 题；新增 ${merged.length - container.questions.length} 题。`);

  if (args.check) {
    console.log(`\n[--check] 未写入。合并后该容器共 ${merged.length} 题。`);
    process.exit(0);
  }

  // ---- 写入（备份） ----
  const backup = `${sourceFile}.bak-import-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
  fs.copyFileSync(sourceFile, backup);
  container.questions = schema.assignIds(merged);
  fs.writeFileSync(sourceFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n✓ 已写入 ${sourceFile}（原文件备份：${path.basename(backup)}）`);
  console.log(`  该容器现有 ${container.questions.length} 题。`);
  console.log('\n下一步：node scripts/release.js（自动构建 + 校验 + 发布上线）');
}

main();
