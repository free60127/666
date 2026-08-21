/* ============================================================
   scripts/release.js — 一键发布脚本
   流程：
   1. 重建数据产物（source → 各模块 data.js/data.json + 背单词拆分）
   2. 全站 HTML 版本号刷新为 v=YYYYMMDD-HHMM（强制缓存更新）
      + 运行时脚本内联资源版本号刷新（白名单：排除 scripts/ 目录）
   3. 重建两份单文件离线版（思政/计算机，内联全部资源）
   4. 校验：check-links（引用完整）+ verify-standalone ×2
   5. git add（打印 diff --stat 清单）/ commit / push（核验远程 HEAD）
   完成后等待 GitHub Pages 构建 1-3 分钟，再跑 node scripts/check-online.js
   用法：node scripts/release.js
   ============================================================ */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const fail = (step, e) => {
  console.error(`\n✗ 步骤「${step}」失败：${e && e.message ? e.message : e}`);
  process.exit(1);
};
const run = (cmd, opts = {}) => {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, {cwd: root, stdio: 'inherit', ...opts});
};
const tryRun = (step, cmd) => { try { run(cmd); } catch (e) { fail(step, e); } };

try {
  // ---------- 1. 重建数据产物 ----------
  tryRun('重建数据产物', 'node scripts/build/build.js');

  // ---------- 1.5 数据源全量校验（8 个 source/*.json，失败即中止发布）----------
  tryRun('数据源校验', 'node scripts/build/validate.js');
  // 题型统计（解析思政/计算机 data.js，失败同样中止——防止发布损坏产物）
  tryRun('题型统计', 'node scripts/count-types.js');

  // ---------- 2. 全站 HTML + 运行时脚本版本号刷新 ----------
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const version = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

  const collect = (dir, out, predicate, skipDirs) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (skipDirs.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full, out, predicate, skipDirs);
      else if (predicate(entry.name)) out.push(full);
    }
  };

  const htmlFiles = [];
  collect(root, htmlFiles, name => name.endsWith('.html'), ['.git', 'node_modules', 'archive']);

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
  // 运行时脚本内联的资源版本号（reading-tools.js 词典 URL、背单词 app.js 词书 URL 等）。
  // 白名单：只扫部署的运行时 JS，跳过 scripts/ 构建脚本与 sw.js 自身。
  const jsFiles = [];
  collect(root, jsFiles, name => name.endsWith('.js') && name !== 'sw.js', ['.git', 'node_modules', 'scripts']);
  for (const file of jsFiles) {
    const code = fs.readFileSync(file, 'utf8');
    const next = code.replace(/\?v=\d{8}-[a-z0-9-]+/gi, `?v=${version}`);
    if (next !== code) {
      fs.writeFileSync(file, next, 'utf8');
      console.log(`版本号: ${path.relative(root, file)} → v=${version}（脚本内联资源）`);
    }
  }
  console.log(`\n版本号刷新完成：${bumped} 个页面。`);

  // ---------- 3. 重建单文件离线版 ----------
  tryRun('重建思政单文件版', 'node scripts/build-standalone.js 思政系列');
  tryRun('重建计算机单文件版', 'node scripts/build-standalone.js 计算机系列');

  // ---------- 4. 校验 ----------
  tryRun('链接完整性检查', 'node scripts/check-links.js');
  tryRun('思政单文件版校验', 'node scripts/verify-standalone.js 思政系列/思政刷题-单文件离线版.html');
  tryRun('计算机单文件版校验', 'node scripts/verify-standalone.js 计算机系列/计算机刷题-单文件离线版.html');

  // ---------- 5. git 提交并推送 ----------
  // add 白名单：全量添加但排除归档目录、临时脚本、数据备份与本地教材库（textbook/ 为本地资料源，绝不推送）
  tryRun('git add', 'git add -A -- ":!archive/legacy" ":!scripts/_tmp-*" ":!*.bak-*" ":!textbook/"');
  try { execSync('git diff --cached --quiet', {cwd: root}); console.log('\n无内容变更，跳过提交。'); }
  catch (_) {
    try { run('git diff --cached --stat'); } catch (_) {}
    const message = `release: ${version}`;
    tryRun('git commit', `git commit -m "${message}"`);
    try { run('git push origin main'); }
    catch (e) {
      console.warn('\n⚠ push 命令报错（pwsh 下可能只是显示超时），正在核验远程状态…');
    }
  }

  // 核验远程 HEAD 与本地一致（push 超时≠失败，之前的教训）
  let localHead = '', remoteHead = '';
  try { localHead = execSync('git rev-parse HEAD', {cwd: root}).toString().trim(); } catch (e) { fail('读取本地 HEAD', e); }
  try { remoteHead = execSync('git ls-remote origin main', {cwd: root}).toString().trim().split(/\s+/)[0] || ''; } catch (e) { fail('连接远程仓库（ls-remote 失败，请检查网络）', e); }
  if (localHead === remoteHead) {
    console.log(`\n✓ 已发布：远程 main = ${localHead}（v=${version}）`);
    console.log('等待 GitHub Pages 构建 1-3 分钟后执行：node scripts/check-online.js');
  } else {
    console.error(`\n✗ 推送未生效：本地 ${localHead} ≠ 远程 ${remoteHead}，请手动检查网络后重新 push。`);
    process.exit(1);
  }
} catch (e) {
  fail('release 主流程', e);
}
