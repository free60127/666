const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const reportFile = path.join(__dirname, 'report.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }

function duplicateReport(banks, dataset) {
  const duplicates = [];
  for (const bank of banks) {
    const byTitle = new Map();
    for (const question of bank.questions || []) {
      const key = `${question.type}|${question.title}`;
      const list = byTitle.get(key) || [];
      list.push({id:question.id, answer:question.answer || ''});
      byTitle.set(key, list);
    }
    for (const [key, questions] of byTitle) {
      if (questions.length > 1) {
        duplicates.push({dataset, bank:bank.key, type:key.split('|')[0], title:key.slice(key.indexOf('|') + 1), questions, answerConflict:new Set(questions.map(item => item.answer)).size > 1});
      }
    }
  }
  return duplicates;
}

const politics = readJson(path.join(root, 'source', 'politics.json'));
const computer = readJson(path.join(root, 'source', 'computer.json'));
const report = {
  generatedAt:new Date().toISOString(),
  duplicateQuestions:[...duplicateReport(politics, 'politics'), ...duplicateReport(computer, 'computer')],
};
report.answerConflicts = report.duplicateQuestions.filter(item => item.answerConflict);
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, reportFile)}: ${report.duplicateQuestions.length} duplicate groups, ${report.answerConflicts.length} answer conflicts.`);
