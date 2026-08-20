// CI 用：对全站 JS 做语法检查（node --check），排除 node_modules / archive / workers 等
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const EXCLUDE_DIRS = new Set(['node_modules', 'archive', '.git', 'workers']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name.startsWith('.') || EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
}
walk(root);

let failed = 0;
for (const file of files) {
  try { execFileSync(process.execPath, ['--check', file], {stdio: 'pipe'}); }
  catch (error) {
    failed++;
    console.error(`✗ ${path.relative(root, file)}`);
    const detail = String(error.stderr || error.message).trim();
    if (detail) console.error('  ' + detail.split('\n')[0]);
  }
}
if (failed) { console.error(`\n语法检查失败：${failed}/${files.length} 个文件`); process.exit(1); }
console.log(`语法检查通过：${files.length} 个 JS 文件`);
