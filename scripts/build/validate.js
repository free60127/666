// validate.js — extended validator for all quiz/vocabulary/dictionary data sets.
// Reads the canonical source/*.json files (and optionally any JSON file passed
// as an argument). Structural problems are errors (exit code 1); duplicate
// questions and other data-quality findings are warnings unless --strict is set.
//
// Usage:
//   node scripts/build/validate.js                # validate all source datasets
//   node scripts/build/validate.js --strict       # duplicates become errors
//   node scripts/build/validate.js path/to.json   # validate a specific file
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const sourceDir = path.join(root, 'source');
const strict = process.argv.includes('--strict');
const args = process.argv.slice(2).filter(arg => arg !== '--strict');

const errors = [];
const warnings = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const warn = (file, message) => warnings.push(`${file}: ${message}`);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(path.relative(root, file), `invalid JSON (${error.message})`);
    return null;
  }
}

const QUESTION_TYPES = new Set(['single', 'multi', 'theory', 'short', 'essay', 'material']);
const mark = strict ? fail : warn;

// ---- banks format (politics / computer) ----
function validateBanks(file, data) {
  if (!Array.isArray(data)) { fail(file, 'expected a banks array'); return; }
  const keys = new Set();
  for (const bank of data) {
    if (!isObject(bank)) { fail(file, 'bank must be an object'); continue; }
    if (!isNonEmptyString(bank.key)) { fail(file, 'bank.key missing/empty'); continue; }
    if (keys.has(bank.key)) fail(file, `duplicate bank key ${bank.key}`);
    keys.add(bank.key);
    const questions = bank.questions;
    if (!Array.isArray(questions) || !questions.length) { fail(file, `${bank.key}: questions missing/empty`); continue; }
    const idsByType = new Map();
    const titlesByType = new Map();
    for (const question of questions) {
      if (!isObject(question)) { fail(file, `${bank.key}: question must be an object`); continue; }
      const {type, title, id} = question;
      if (!QUESTION_TYPES.has(type)) fail(file, `${bank.key}: invalid question type "${type}" (id ${id ?? '?'})`);
      if (!isNonEmptyString(title)) fail(file, `${bank.key}: empty question title (id ${id ?? '?'})`);
      const typeIds = idsByType.get(type) || new Set();
      if (typeIds.has(id)) fail(file, `${bank.key}: duplicate id ${id} within type ${type}`);
      typeIds.add(id);
      idsByType.set(type, typeIds);
      const options = question.options || [];
      if (options.length > 0 && (options.length < 2 || options.length > 6)) {
        warn(file, `${bank.key}: question "${String(title).slice(0, 30)}…" has ${options.length} options (expected 2–6)`);
      }
      const answer = String(question.answer || '').trim();
      if (/^[A-E]+$/i.test(answer)) {
        for (const letter of answer.toUpperCase()) {
          const index = letter.charCodeAt(0) - 65;
          if (index >= options.length) fail(file, `${bank.key}: answer "${answer}" out of range for id ${id}`);
        }
      }
      const key = `${type}|${title}`;
      const list = titlesByType.get(key) || [];
      list.push(id);
      titlesByType.set(key, list);
    }
    for (const [key, ids] of titlesByType) {
      if (ids.length > 1) {
        mark(file, `${bank.key}: duplicate question (type ${key.split('|')[0]}, ids ${ids.join(', ')}): ${String(key.slice(key.indexOf('|') + 1)).slice(0, 40)}…`);
      }
    }
  }
}

// ---- vocabulary format ----
function validateVocabulary(file, data) {
  if (!isObject(data) || !Array.isArray(data.books)) { fail(file, 'expected {books: [...]}'); return; }
  const keys = new Set();
  for (const book of data.books) {
    if (!isObject(book)) { fail(file, 'book must be an object'); continue; }
    if (!isNonEmptyString(book.key)) { fail(file, 'book.key missing/empty'); continue; }
    if (keys.has(book.key)) fail(file, `duplicate book key ${book.key}`);
    keys.add(book.key);
    const words = book.words || [];
    const ids = new Set();
    const orders = new Set();
    for (const word of words) {
      if (!isObject(word)) { fail(file, `${book.key}: word must be an object`); continue; }
      if (!isNonEmptyString(word.word)) fail(file, `${book.key}: empty word (id ${word.id ?? '?'})`);
      if (ids.has(word.id)) fail(file, `${book.key}: duplicate word id ${word.id}`);
      ids.add(word.id);
      if (word.bookOrder !== undefined && orders.has(word.bookOrder)) warn(file, `${book.key}: duplicate bookOrder ${word.bookOrder}`);
      orders.add(word.bookOrder);
    }
  }
}

// ---- dictionary format ----
function validateDictionary(file, data) {
  if (!Array.isArray(data)) { fail(file, 'expected an entries array'); return; }
  const seen = new Map();
  for (const entry of data) {
    if (!Array.isArray(entry) || !isNonEmptyString(entry[0])) { fail(file, `entry must be [word, …] (got ${JSON.stringify(entry).slice(0, 60)})`); continue; }
    const key = entry[0].toLocaleLowerCase('en');
    if (seen.has(key)) warn(file, `duplicate dictionary word "${key}" (id rows ${seen.get(key)} and current)`);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
}

// ---- exercise format (translations / rewrite) ----
// 2026-08-21 合并自 scripts/validate-quiz-data.js（原独立校验器已删除）：
// number 必填、title/kind/id 必填、expectedAnswerCount 一致性警告。
function validateExercises(file, data) {
  if (!isObject(data)) { fail(file, 'expected an object'); return; }
  if (!isNonEmptyString(data.source)) fail(file, 'source is empty');
  const groups = Array.isArray(data.sections) ? data.sections : Array.isArray(data.exercises) ? data.exercises : null;
  if (!groups) { fail(file, 'expected sections or exercises'); return; }
  const ids = new Set();
  const hasValue = value => isNonEmptyString(value) || (typeof value === 'number' && Number.isInteger(value));
  for (const group of groups) {
    if (!isObject(group)) { fail(file, 'group must be an object'); continue; }
    if (Array.isArray(data.exercises)) {
      for (const field of ['id', 'title', 'kind']) {
        if (!isNonEmptyString(group[field])) fail(file, `${field} is empty (group "${group.id ?? group.title ?? '?'}")`);
      }
    } else if (!isNonEmptyString(group.title)) {
      fail(file, 'section title is empty');
    }
    if (group.id !== undefined) {
      if (ids.has(group.id)) fail(file, `duplicate group id ${group.id}`);
      ids.add(group.id);
    }
    const items = Array.isArray(group.items) ? group.items : Array.isArray(group.questions) ? group.questions : [];
    if (!items.length) { fail(file, `group "${group.title || group.id || '?'}" has no items`); continue; }
    const numbers = new Set();
    for (const item of items) {
      if (!isObject(item)) { fail(file, 'item must be an object'); continue; }
      const text = item.question ?? item.text;
      if (!isNonEmptyString(text)) fail(file, `empty question text (number ${item.number ?? '?'})`);
      if (!isNonEmptyString(item.answer)) fail(file, `empty answer (number ${item.number ?? '?'})`);
      if (!hasValue(item.number)) fail(file, `item number is missing: "${String(text || '').slice(0, 40)}…"`);
      if (item.number !== undefined) {
        const key = String(item.number);
        if (numbers.has(key)) fail(file, `duplicate question number ${key} in group "${group.title || group.id || '?'}"`);
        numbers.add(key);
      }
    }
    if (group.expectedAnswerCount !== undefined && group.expectedAnswerCount !== items.length) {
      warn(file, `${group.title || group.id}: expectedAnswerCount (${group.expectedAnswerCount}) differs from items.length (${items.length})`);
    }
  }
}

// ---- content-book format (reading / basic-english) ----
// {version, title, books:[{key, name, units:[{key, kind, name, questions:[{index,q,options?,answer,type}]}]}]}
// type: choice（有选项 + 字母答案）/ text
function validateContentBooks(file, data) {
  if (!isObject(data)) { fail(file, 'expected an object'); return; }
  if (!isNonEmptyString(data.title)) fail(file, 'title is empty');
  if (!Array.isArray(data.books) || !data.books.length) { fail(file, 'books missing/empty'); return; }
  const bookKeys = new Set();
  let totalQuestions = 0;
  for (const book of data.books) {
    if (!isObject(book)) { fail(file, 'book must be an object'); continue; }
    if (!isNonEmptyString(book.key)) fail(file, 'book.key missing/empty');
    if (bookKeys.has(book.key)) fail(file, `duplicate book key ${book.key}`);
    bookKeys.add(book.key);
    if (!isNonEmptyString(book.name)) fail(file, `${book.key}: book.name empty`);
    const units = Array.isArray(book.units) ? book.units : [];
    const unitKeys = new Set();
    for (const unit of units) {
      if (!isObject(unit)) { fail(file, `${book.key}: unit must be an object`); continue; }
      if (!isNonEmptyString(unit.key)) fail(file, `${book.key}: unit.key missing/empty`);
      if (unitKeys.has(unit.key)) fail(file, `${book.key}: duplicate unit key ${unit.key}`);
      unitKeys.add(unit.key);
      if (!isNonEmptyString(unit.name)) fail(file, `${book.key}/${unit.key}: unit.name empty`);
      const questions = Array.isArray(unit.questions) ? unit.questions : [];
      const indices = new Set();
      // HTML 实体残留检查：旧页面提取未解码会把 "&#39;/&quot;" 字样存进数据，
      // 前端转义后用户看到乱码（2026-08-21 曾修复 487 处）——发布前必须拦截
      const checkNoEntities = (text, where) => {
        if (!text) return;
        const hit = String(text).match(/&(?:[a-zA-Z]+|#\d+);/);
        if (hit) fail(file, `${book.key}/${unit.key}: HTML 实体残留 "${hit[0]}" in ${where} (index ${question?.index ?? '?'})`);
      };
      checkNoEntities(unit.instruction, `instruction`);
      (unit.wordBanks || []).forEach((bank, bi) => (bank.words || []).forEach((word, wi) => checkNoEntities(word, `wordBanks[${bi}].words[${wi}]`)));
      for (const question of questions) {
        if (!isObject(question)) { fail(file, `${book.key}/${unit.key}: question must be an object`); continue; }
        if (question.index === undefined) fail(file, `${book.key}/${unit.key}: question index missing: "${String(question.q || '').slice(0, 40)}…"`);
        else if (indices.has(String(question.index))) fail(file, `${book.key}/${unit.key}: duplicate question index ${question.index}`);
        indices.add(String(question.index));
        if (!isNonEmptyString(question.q)) fail(file, `${book.key}/${unit.key}: empty question q (index ${question.index ?? '?'})`);
        if (!isNonEmptyString(question.answer)) fail(file, `${book.key}/${unit.key}: empty answer (index ${question.index ?? '?'})`);
        checkNoEntities(question.q, `q`);
        checkNoEntities(question.answer, `answer`);
        (question.options || []).forEach((option, i) => checkNoEntities(option, `options[${i}]`));
        const type = String(question.type || '');
        if (type !== 'choice' && type !== 'text') fail(file, `${book.key}/${unit.key}: invalid type "${type}" (index ${question.index ?? '?'})`);
        const options = question.options || [];
        if (type === 'choice') {
          if (!Array.isArray(options) || options.length < 2) fail(file, `${book.key}/${unit.key}: choice question needs >=2 options (index ${question.index ?? '?'})`);
          const answer = String(question.answer || '').trim().replace(/^参考答案[:：]\s*/i, '');
          if (/^[A-Z]+$/i.test(answer)) {
            for (const letter of answer.toUpperCase()) {
              if (letter.charCodeAt(0) - 65 >= options.length) fail(file, `${book.key}/${unit.key}: answer "${answer}" out of range for index ${question.index}`);
            }
          }
        }
        totalQuestions++;
      }
    }
  }
  console.log(`  content books: ${data.books.length} books, ${totalQuestions} questions`);
}

const defaults = [
  'politics.json', 'computer.json', 'vocabulary.json', 'dictionary.json',
  'translations.json', 'rewrite-sentences.json', 'reading.json', 'basic-english.json',
];
const targets = args.length ? args : defaults.map(name => path.join(sourceDir, name));

for (const file of targets) {
  const data = readJson(file);
  if (data === null) continue;
  const name = path.basename(file);
  if (name === 'politics.json' || name === 'computer.json') validateBanks(path.relative(root, file), data);
  else if (name === 'vocabulary.json') validateVocabulary(path.relative(root, file), data);
  else if (name === 'dictionary.json') validateDictionary(path.relative(root, file), data);
  else if (name === 'reading.json' || name === 'basic-english.json') validateContentBooks(path.relative(root, file), data);
  else validateExercises(path.relative(root, file), data);
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.forEach(w => console.log(`- ${w}`));
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  errors.forEach(e => console.error(`- ${e}`));
  process.exitCode = 1;
} else {
  console.log(`Validated ${targets.length} data file(s) — ${strict ? 'strict' : 'normal'} mode, 0 errors.`);
}
