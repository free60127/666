// 验证单文件离线版：提取所有内联 <script> 块做语法编译检查，并校验内嵌题库与 data.js 一致
// 用法: node scripts/verify-standalone.js <单文件版.html>
const fs = require('fs');
const vm = require('vm');

const file = process.argv[2];
if (!file) { console.error('用法: node scripts/verify-standalone.js <单文件版.html>'); process.exit(1); }
const html = fs.readFileSync(file, 'utf8');

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log(`内联 script 块: ${scripts.length}`);
let pass = true;
scripts.forEach((code, i) => {
  try { new vm.Script(code, { filename: `${file}#script${i}` }); }
  catch (e) { pass = false; console.log(`  ✗ script#${i} 语法错误: ${e.message}`); }
});
console.log(pass ? '语法检查: 全部通过 ✓' : '语法检查: 有错误 ✗');

// 提取数据块并解析题库
const dataScript = scripts.find(code => code.includes('POLITICS_BANKS'));
if (dataScript) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(dataScript, ctx);
  const banks = ctx.window.POLITICS_BANKS;
  if (Array.isArray(banks)) {
    console.log('内嵌题库: ' + banks.map(b => `${b.key}=${b.questions.length}`).join(' '));
  } else {
    pass = false; console.log('  ✗ POLITICS_BANKS 非数组');
  }
  // 与同目录 data.js 对比
  const dir = file.slice(0, file.lastIndexOf('/'));
  const dataJs = fs.readFileSync(dir + '/data.js', 'utf8');
  if (dataScript.trim() === dataJs.trim()) console.log('题库数据与 data.js 一致 ✓');
  else { pass = false; console.log('  ✗ 题库数据与 data.js 不一致!'); }
} else {
  pass = false; console.log('  ✗ 未找到 POLITICS_BANKS 数据块');
}

// 确认关键功能内联
for (const marker of ['detectCharacterLanguage', 'A4QuestionPrint', 'WaiyuanQuizEngine']) {
  console.log(`内联 ${marker}: ${html.includes(marker) ? '✓' : '✗ 缺失!'}`);
  if (!html.includes(marker)) pass = false;
}
// 确认无外部资源引用
const external = [...html.matchAll(/<(script|link)[^>]+(?:src|href)="([^"#][^"]*)"/g)].map(m => m[2]);
console.log(`外部资源引用: ${external.length ? external.join(', ') : '(无) ✓'}`);
if (external.length) pass = false;

console.log(pass ? '\n=== 全部验证通过 ===' : '\n=== 存在失败项 ===');
process.exit(pass ? 0 : 1);
