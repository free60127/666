const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const sourceDir = path.join(root, 'source');

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function loadGlobal(file, name) {
  const context = {window:{}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), context, {filename:file});
  if (!(name in context.window)) throw new Error(`${file} did not define window.${name}`);
  return context.window[name];
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`EXTRACT ${path.relative(root, file)} (${Buffer.byteLength(JSON.stringify(value, null, 2) + '\n')} bytes)`);
}

fs.mkdirSync(sourceDir, {recursive:true});

const vocabulary = loadGlobal(path.join(root, '背单词', 'vocabulary-data.js'), 'WAIYUAN_VOCABULARY');
const dictionary = loadGlobal(path.join(root, 'dictionary', 'english-lookup-data.js'), 'WAIYUAN_ENGLISH_LOOKUP');
const politics = loadGlobal(path.join(root, '思政系列', 'data.js'), 'POLITICS_BANKS');
const computer = loadGlobal(path.join(root, '计算机系列', 'data.js'), 'POLITICS_BANKS');

writeJson(path.join(sourceDir, 'politics.json'), politics);
writeJson(path.join(sourceDir, 'computer.json'), computer);
writeJson(path.join(sourceDir, 'vocabulary.json'), vocabulary);
writeJson(path.join(sourceDir, 'dictionary.json'), dictionary);

for (const book of vocabulary.books || []) writeJson(path.join(sourceDir, `${book.key}.json`), book);

const translationFile = path.join(root, '专业课', '语法（通用）', '翻译句子', 'data.json');
const rewriteFile = path.join(root, '专业课', '语法（通用）', '改写句子', 'data.json');
writeJson(path.join(sourceDir, 'translations.json'), readJson(translationFile));
writeJson(path.join(sourceDir, 'rewrite-sentences.json'), readJson(rewriteFile));

console.log(`Extracted ${politics.length} politics banks, ${computer.length} computer banks, ${vocabulary.books.length} vocabulary books and ${dictionary.length} dictionary entries.`);
