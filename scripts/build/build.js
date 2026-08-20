const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..', '..');
const sourceDir = path.join(root, 'source');

// Note: root-level duplicate artifacts (data.js, english-lookup-data.js)
// were removed from the project in the cleanup pass; only the canonical
// subdirectory outputs are produced here.
const targets = [
  {source:'politics.json', global:'POLITICS_BANKS', js:['思政系列/data.js'], json:['思政系列/data.json']},
  {source:'computer.json', global:'POLITICS_BANKS', js:['计算机系列/data.js'], json:['计算机系列/data.json']},
  // vocabulary 整包 js 已移除（唯一消费者 reading-tools 查词回退已于 2026-08-21 改为
  // 只使用拆分产物 + ECDICT），json 产物保留供外部工具引用。
  {source:'vocabulary.json', global:'WAIYUAN_VOCABULARY', js:[], json:['背单词/vocabulary-data.json']},
  {source:'dictionary.json', global:'WAIYUAN_ENGLISH_LOOKUP', js:['dictionary/english-lookup-data.js'], json:['dictionary/english-lookup-data.json']},
  {source:'translations.json', global:'translationData', js:['专业课/语法（通用）/翻译句子/data.js'], json:['专业课/语法（通用）/翻译句子/data.json']},
  {source:'rewrite-sentences.json', global:'REWRITE_SENTENCE_DATA', js:['专业课/语法（通用）/改写句子/data.js'], json:['专业课/语法（通用）/改写句子/data.json']},
];

function compact(value) { return JSON.stringify(value); }
function prefixFor(global) {
  if (global === 'POLITICS_BANKS') return `window.${global}=`;
  return `window.${global} = `;
}
function write(file, text) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  const buffer = fs.readFileSync(target);
  console.log(`${file}\t${buffer.length} bytes\tsha256=${crypto.createHash('sha256').update(buffer).digest('hex')}`);
}

for (const target of targets) {
  const sourceFile = path.join(sourceDir, target.source);
  const data = JSON.parse(fs.readFileSync(sourceFile, 'utf8').replace(/^\uFEFF/, ''));
  const serialized = compact(data);
  for (const file of target.json) write(file, serialized);
  for (const file of target.js) write(file, `${prefixFor(target.global)}${serialized};`);
}

// vocabulary 额外拆分产物：背单词页按需加载单本词书（meta 常驻，tem4/tem8 懒加载）
const vocabFile = path.join(sourceDir, 'vocabulary.json');
if (fs.existsSync(vocabFile)) {
  const vocab = JSON.parse(fs.readFileSync(vocabFile, 'utf8').replace(/^\uFEFF/, ''));
  const meta = {version: vocab.version || 3, books: (vocab.books || []).map(book => ({key: book.key, name: book.name, shortName: book.shortName, description: book.description, total: book.words.length}))};
  write(path.join('背单词', 'vocabulary-meta.js'), `window.WAIYUAN_VOCABULARY_META = ${compact(meta)};`);
  for (const book of vocab.books || []) {
    const body = `window.WAIYUAN_VOCABULARY_BOOKS = window.WAIYUAN_VOCABULARY_BOOKS || [];\nwindow.WAIYUAN_VOCABULARY_BOOKS.push(${compact(book)});`;
    write(path.join('背单词', `vocabulary-data-${book.key}.js`), body);
  }
}

console.log(`Built ${targets.length} data sets from source/*.json.`);
