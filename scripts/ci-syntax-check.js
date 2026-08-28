// CI 用：对全站 JS 做语法检查（node --check）。
// 排除范围：dsh-web-ui-src（外部 UI 源码仓库，不在本站源码内）、
// node_modules（任意层级）、archive、.git，以及外部工具生成/依赖目录
// （TWA 工程、Capacitor 壳、Playwright 产物、本地临时工具目录、签名材料）。
// workers/（Cloudflare Worker）仍纳入检查，防止云端代码漏检。
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const root = path.resolve(__dirname, '..');

// 按「目录名」精确排除（任意层级，如 cap-share/node_modules 也会命中）。
const EXCLUDE_DIR_NAMES = new Set([
  '.git', 'node_modules', 'archive', 'dsh-web-ui-src',
  // 外部生成/依赖目录（非站点源码）：
  'android-share', 'android-paotui',  // scripts/make-twa.cjs 生成的 TWA 工程（CI 产物）
  'cap-share', 'cap-paotui',          // Capacitor 壳工程（www/android/node_modules 均为生成/依赖产物）
  'keys',                             // 签名材料
  'test-results',                     // Playwright 产物（tests/test-results、根目录 test-results）
]);

// 按「相对根目录路径」排除的目录（目录名不唯一时用路径精确匹配）。
const EXCLUDE_DIR_PATHS = new Set([
  'scripts/_tmp-cap', 'scripts/_tmp-apk', 'scripts/_tmp-iconwork', // 本地临时工具目录
  'scripts/icon-work',                                            // 图标工具目录
  'archive/legacy',                                               // 归档历史
]);

const files = [];

function walk(dir, rel) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name.startsWith('.') || EXCLUDE_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDE_DIR_PATHS.has(relPath)) continue;
      walk(full, relPath);
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
}
walk(root, '');

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
