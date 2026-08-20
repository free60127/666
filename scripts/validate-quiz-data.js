const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const defaultFiles = [
  path.join(root, '专业课', '语法（通用）', '翻译句子', 'data.json'),
  path.join(root, '专业课', '语法（通用）', '改写句子', 'data.json')
];
const files = process.argv.slice(2).map(file => path.resolve(process.cwd(), file));
const targets = files.length ? files : defaultFiles;
const errors = [];
const warnings = [];

const fail = (file, message) => errors.push(`${path.relative(root, file)}: ${message}`);
const warn = (file, message) => warnings.push(`${path.relative(root, file)}: ${message}`);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const isNumber = value => typeof value === 'number' && Number.isInteger(value);
const hasValue = value => isNonEmptyString(value) || isNumber(value);

function validateQuestion(file, location, item, textField) {
  if (!isObject(item)) {
    fail(file, `${location} must be an object`);
    return false;
  }
  if (!hasValue(item.number)) fail(file, `${location}.number is missing`);
  if (!isNonEmptyString(item[textField])) fail(file, `${location}.${textField} is empty`);
  if (!isNonEmptyString(item.answer)) fail(file, `${location}.answer is empty`);
  return true;
}

function validateSections(file, data) {
  if (!Array.isArray(data.sections)) {
    fail(file, 'sections must be an array');
    return {sections:0, questions:0};
  }
  const ids = new Set();
  let questions = 0;
  data.sections.forEach((section, sectionIndex) => {
    const location = `sections[${sectionIndex}]`;
    if (!isObject(section)) { fail(file, `${location} must be an object`); return; }
    if (!isNonEmptyString(section.title)) fail(file, `${location}.title is empty`);
    if (!Array.isArray(section.items) || !section.items.length) { fail(file, `${location}.items is empty`); return; }
    const numbers = new Set();
    section.items.forEach((item, itemIndex) => {
      const itemLocation = `${location}.items[${itemIndex}]`;
      if (validateQuestion(file, itemLocation, item, 'question')) {
        const number = String(item.number);
        if (numbers.has(number)) fail(file, `${location} has duplicate question number ${number}`);
        numbers.add(number);
        questions += 1;
      }
    });
    if (section.expectedAnswerCount !== undefined && section.expectedAnswerCount !== section.items.length) {
      warn(file, `${location}.expectedAnswerCount (${section.expectedAnswerCount}) differs from items.length (${section.items.length})`);
    }
  });
  return {sections:data.sections.length, questions};
}

function validateExercises(file, data) {
  if (!Array.isArray(data.exercises)) {
    fail(file, 'exercises must be an array');
    return {sections:0, questions:0};
  }
  const ids = new Set();
  let questions = 0;
  data.exercises.forEach((exercise, exerciseIndex) => {
    const location = `exercises[${exerciseIndex}]`;
    if (!isObject(exercise)) { fail(file, `${location} must be an object`); return; }
    for (const field of ['id', 'title', 'kind']) if (!isNonEmptyString(exercise[field])) fail(file, `${location}.${field} is empty`);
    if (ids.has(exercise.id)) fail(file, `duplicate exercise id ${exercise.id}`);
    ids.add(exercise.id);
    if (!Array.isArray(exercise.questions) || !exercise.questions.length) { fail(file, `${location}.questions is empty`); return; }
    const numbers = new Set();
    exercise.questions.forEach((item, itemIndex) => {
      const itemLocation = `${location}.questions[${itemIndex}]`;
      if (validateQuestion(file, itemLocation, item, 'text')) {
        const number = String(item.number);
        if (numbers.has(number)) fail(file, `${location} has duplicate question number ${number}`);
        numbers.add(number);
        questions += 1;
      }
    });
  });
  return {sections:data.exercises.length, questions};
}

function validateFile(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(file, `invalid JSON (${error.message})`);
    return;
  }
  if (!isObject(data)) { fail(file, 'root must be an object'); return; }
  if (!isNonEmptyString(data.source)) fail(file, 'source is empty');
  const stats = Array.isArray(data.sections) ? validateSections(file, data) : validateExercises(file, data);
  if (!Array.isArray(data.sections) && !Array.isArray(data.exercises)) fail(file, 'expected sections or exercises');
  if (stats.questions) console.log(`OK ${path.relative(root, file)} | ${stats.sections} groups | ${stats.questions} questions`);
}

targets.forEach(validateFile);
if (errors.length) {
  console.error(`\n${errors.length} validation error(s):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Validated ${targets.length} quiz data file(s).`);
}
if (warnings.length) {
  console.warn(`\n${warnings.length} validation warning(s):`);
  warnings.forEach(warning => console.warn(`- ${warning}`));
}
