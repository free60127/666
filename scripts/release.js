/* ============================================================
   scripts/release.js — 一键发布脚本
   流程：
   1. 重建数据产物（source → 各模块 data.js/data.json + 背单词拆分）
   2. 全站 HTML 版本号刷新为 v=YYYYMMDD-HHMM（强制缓存更新）
   3. 重建两份单文件离线版（思政/计算机，内联全部资源）
   4. 校验：check-links（引用完整）+ verify-standalone ×2
   5. git add / commit / push（push 后核验远程 HEAD 与本地一致）
   完成后等待 GitHub Pages 构建 1-3 分钟，再跑 node scripts/check-online.js
   用法：node scripts/release.js
   ============================================================ */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const run = (cmd, opts = {}) => {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, {cwd: root, stdio: 'inherit', ...opts});
};

// ---------- 1. 重建数据产物 ----------
run('node scripts/build/build.js');

// ---------- 2. 全站 HTML 版本号刷新 ----------
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const version = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

const htmlFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
})(root);

let bumped = 0;
for (const file of htmlFiles) {
  if (path.basename(file).includes('单文件离线版')) continue; // 由构建步骤重新生成
  const html = fs.readFileSync(file, 'utf8');
  const next = html.replace(/v=\d{8}-[a-z0-9-]+/gi, `v=${version}`);
  if (next !== html) {
    fs.writeFileSync(file, next, 'utf8');
    bumped++;
    console.log(`版本号: ${path.relative(root, file)} → v=${version}`);
  }
}
console.log(`\n版本号刷新完成：${bumped} 个页面。`);

// ---------- 3. 重建单文件离线版 ----------
run('node scripts/build-standalone.js 思政系列');
run('node scripts/build-standalone.js 计算机系列');

// ---------- 4. 校验 ----------
run('node scripts/check-links.js');
run('node scripts/verify-standalone.js 思政系列/思政刷题-单文件离线版.html');
run('node scripts/verify-standalone.js 计算机系列/计算机刷题-单文件离线版.html');

// ---------- 5. git 提交并推送 ----------
run('git add -A');
const message = `release: ${version}`;
try { execSync(`git diff --cached --quiet`, {cwd: root}); console.log('\n无内容变更，跳过提交。'); }
catch (_) {
  run(`git commit -m "${message}"`);
  try { run('git push origin main'); }
  catch (e) {
    console.warn('\n⚠ push 命令报错（pwsh 下可能只是显示超时），正在核验远程状态…');
  }
}

// 核验远程 HEAD 与本地一致（push 超时≠失败，之前的教训）
const localHead = execSync('git rev-parse HEAD', {cwd: root}).toString().trim();
const remoteHead = execSync('git ls-remote origin main', {cwd: root}).toString().trim().split(/\s+/)[0] || '';
if (localHead === remoteHead) {
  console.log(`\n✓ 已发布：远程 main = ${localHead}（v=${version}）`);
  console.log('等待 GitHub Pages 构建 1-3 分钟后执行：node scripts/check-online.js');
} else {
  console.error(`\n✗ 推送未生效：本地 ${localHead} ≠ 远程 ${remoteHead}，请手动检查网络后重新 push。`);
  process.exit(1);
}
