/* ============================================================
   scripts/release.js — 发布脚本
   默认只做「构建 + 校验」，不做任何 git 操作；
   显式加 --commit / --push 才会提交/推送。
   流程：
   1. 重建数据产物（source → 各模块 data.js/data.json + 背单词拆分）
   2. 全站 HTML 版本号刷新为 v=YYYYMMDD-HHMM（强制缓存更新）
      + 运行时脚本内联资源版本号刷新（白名单：排除 scripts/ 目录）
   3. 重建两份单文件离线版（思政/计算机，内联全部资源）
   4. 校验：check-links（引用完整）+ verify-standalone ×2
   5. （仅 --commit）按白名单暂存并提交（打印 diff --stat 清单）
   6. （仅 --commit --push）推送并核验远程 HEAD 与本地一致
   完成后等待 GitHub Pages 构建 1-3 分钟，再跑 node scripts/check-online.js
   用法：
     node scripts/release.js                  # 仅构建 + 校验，不提交不推送
     node scripts/release.js --commit         # 构建 + 校验 + 提交
     node scripts/release.js --commit --push  # 构建 + 校验 + 提交 + 推送
   ============================================================ */
const { execSync, execFileSync } = require('child_process');
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

// ---------- 参数：默认只构建 + 校验，git 操作必须显式开启 ----------
const args = new Set(process.argv.slice(2));
const DO_COMMIT = args.has('--commit');
const DO_PUSH = args.has('--push');
if (DO_PUSH && !DO_COMMIT) {
  console.error('\n✗ 参数错误：--push 必须与 --commit 一起使用（先提交后才能推送）。');
  process.exit(1);
}

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

  // ---------- 5. git 暂存/提交（仅 --commit） ----------
  // 白名单制暂存：只把「项目允许目录 + 根目录站点产物文件」纳入本次提交。
  // 白名单之外的一概不暂存（未跟踪或已跟踪修改都跳过），例如：
  // AGENTS.md、project-memory/、dsh-web-ui-src/、*.bak-*、临时导出等，
  // 避免 release 误提交本地的非项目文件。
  const STAGE_ALLOWLIST_DIRS = [
    'source', 'scripts', 'tests', 'workers', '.github', '.well-known',
    '思政系列', '计算机系列', '背单词', '学习中心', 'dictionary',
    '考证', '专业课', '电子版教材', 'paotui', 'icons', 'branding',
  ];
  // 根目录的站点产物/配置文件（index.html、home.js、sw.js、manifest.webmanifest 等）
  const STAGE_ROOT_FILE_RE = /^[^/\\]+\.(html|css|js|json|webmanifest|txt|xml|md|svg|png|jpg|jpeg|webp|ico|py)$/;
  const inAllowlist = rel =>
    STAGE_ALLOWLIST_DIRS.some(d => rel === d || rel.startsWith(d + '/') || rel.startsWith(d + '\\')) ||
    STAGE_ROOT_FILE_RE.test(rel);

  const stagePaths = [];
  if (DO_COMMIT) {
    // porcelain -z：路径原文（UTF-8、不转义），条目间以 \0 分隔；
    // 重命名/复制条目会额外输出 <新路径>\0。
    const chunks = execSync('git status --porcelain -z', {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024})
      .split('\0');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      const status = chunk.slice(0, 2);
      const rel = chunk.slice(3);
      if (inAllowlist(rel)) stagePaths.push(rel);
      if (status[0] === 'R' || status[0] === 'C') {
        // 条目形如 "R  <旧路径>"，下一段是 <新路径>（git status -z 下无 XY 前缀）
        i++;
        if (chunks[i] && inAllowlist(chunks[i])) stagePaths.push(chunks[i]);
      }
    }
    stagePaths.sort();
  }

  if (DO_COMMIT && stagePaths.length > 0) {
    // 显式路径暂存（execFileSync 传数组，避免 shell 转义问题），不做任何 git add -A。
    try {
      execFileSync('git', ['add', '--', ...stagePaths], {cwd: root, stdio: 'inherit'});
    } catch (e) { fail('按白名单暂存', e); }
    try { execSync('git diff --cached --quiet', {cwd: root}); console.log('\n白名单内无内容变更，跳过提交。'); }
    catch (_) {
      try { run('git diff --cached --stat'); } catch (_) {}
      const message = `release: ${version}`;
      tryRun('git commit', `git commit -m "${message}"`);

      if (DO_PUSH) {
        // ---------- 6. 推送 + 核验远程 HEAD ----------
        try { run('git push origin main'); }
        catch (e) {
          console.warn('\n⚠ push 命令报错（pwsh 下可能只是显示超时），正在核验远程状态…');
        }
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
      } else {
        console.log(`\n✓ 已提交：${localCommitHead()}（v=${version}）`);
        console.log('推送请执行：node scripts/release.js --commit --push（或 git push origin main）');
      }
    }
  } else if (DO_COMMIT) {
    console.log('\n无白名单内变更，跳过提交。' + (DO_PUSH ? ' 已跳过推送（无新提交）。' : ''));
  } else {
    // ---------- 默认模式：只构建 + 校验，不做任何 git 操作 ----------
    console.log('\n✓ 构建与校验完成（默认模式，未执行 git 提交/推送）。');
    console.log('确认无误后执行：node scripts/release.js --commit --push');
  }
} catch (e) {
  fail('release 主流程', e);
}

function localCommitHead() {
  try {
    return execSync('git rev-parse --short HEAD', {cwd: root}).toString().trim();
  } catch (e) {
    return '(读取 HEAD 失败)';
  }
}
