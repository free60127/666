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
   5. （仅 --commit）按白名单暂存并提交（只放行已跟踪文件与显式根目录清单；打印 diff --stat 清单）
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

// ---------- 暂存白名单/拒绝清单（--commit 用；导出供回归测试） ----------
// 白名单制暂存：只把「Git 已跟踪的项目文件 + 根目录显式列举的站点产物/配置文件」
// 纳入本次提交，白名单之外（未跟踪或未列举）的一概不暂存。
// 相对旧版「根目录按扩展名正则放行」的收紧：
//   - 根目录改为显式清单 STAGE_ROOT_FILES：不再放行任意的根目录 .md/.txt/.py 文件，
//     本地 AGENTS.md、*.txt、*.py 等产物不会被误暂存（同时补上旧正则漏掉的
//     wrangler.jsonc、.gitignore、.nojekyll、LICENSE 等已跟踪根文件）。
//   - 目录白名单（scripts/ 等）只放行 Git 已跟踪的文件：整个目录不再等同于放行，
//     scripts/ 下的未跟踪本地脚本/工具文件不会进入提交。
// 额外显式拒绝清单 STAGE_DENY_*：AGENTS.md、project-memory/、dsh-web-ui-src/、
// logs、keys、备份（*.bak-*、*.log、*.keystore 等）——即使未来被跟踪或命中白名单，
// 也一律不暂存。
const STAGE_ALLOWLIST_DIRS = [
  'source', 'scripts', 'tests', 'workers', '.github', '.well-known',
  '思政系列', '计算机系列', '背单词', '学习中心', 'dictionary',
  '考证', '专业课', '电子版教材', 'paotui', 'icons', 'branding',
];
// 根目录站点产物/配置文件（与 git ls-files 中已跟踪的根文件保持一致）。
const STAGE_ROOT_FILES = new Set([
  '.gitignore', '.nojekyll', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md',
  '404.html', '题库导入.html', 'admin.html', 'poster.html', 'index.html',
  'a4-print.js', 'admin.js', 'auth-ui.js', 'common.js',
  'english-content-engine.js', 'home-auth.js', 'home.js', 'lightbox.js',
  'reading-tools.js', 'site-search-data.js', 'site-search.js', 'sw.js',
  'tomato-timer.js', 'unified-quiz-engine.js',
  'admin.css', 'english-content.css', 'home.css', 'reading-tools.css',
  'theme.css', 'tomato-timer.css', 'unified-quiz-engine.css',
  'build-computer-data.py', 'build-rewrite-sentence-data.py',
  'favicon.svg', 'feedback-qr.jpg', 'og-image.png', 'payment-qr.jpg',
  'print-shop.jpg', 'website-qr.png', 'welcome-cat.jpg',
  'manifest.webmanifest', 'quiz-data.schema.json', 'robots.txt',
  'sitemap.xml', 'wrangler.jsonc',
]);
// 拒绝清单：目录名在任意层级命中即拒绝；文件名在任意层级命中同样拒绝。
const STAGE_DENY_DIRS = ['project-memory', 'dsh-web-ui-src', 'logs', 'keys', 'backups'];
const STAGE_DENY_FILES = ['AGENTS.md', '.dsh-test-write.txt'];
const isDenied = rel => {
  const parts = rel.split(/[\\/]+/);
  const base = parts[parts.length - 1];
  return parts.some(p => STAGE_DENY_DIRS.includes(p)) ||
    STAGE_DENY_FILES.includes(base) ||
    /\.(log|keystore|key|pem|backup)$/i.test(base) ||
    /\.bak(?:-|$)/i.test(base);
};
const inAllowlistDirs = rel =>
  STAGE_ALLOWLIST_DIRS.some(d => rel === d || rel.startsWith(d + '/') || rel.startsWith(d + '\\'));

// Git 已跟踪文件集合（懒加载；-z 正确处理中文/空格路径）。
let trackedSet = null;
const getTrackedFiles = () => {
  if (!trackedSet) {
    trackedSet = new Set();
    const out = execSync('git ls-files -z', {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
    for (const f of out.split('\0')) if (f) trackedSet.add(f);
  }
  return trackedSet;
};

// 暂存判定：先拒绝清单，再白名单。
// 根目录文件：仅放行 STAGE_ROOT_FILES 显式列举的项目产物/配置文件；
// 目录内文件：仅放行「已跟踪」文件（未跟踪的本地脚本/工具文件一概不暂存）。
const isStageable = rel => {
  if (isDenied(rel)) return false;
  if (rel.includes('/') || rel.includes('\\')) return inAllowlistDirs(rel) && getTrackedFiles().has(rel);
  return STAGE_ROOT_FILES.has(rel);
};

module.exports = { isStageable, isDenied, STAGE_ALLOWLIST_DIRS, STAGE_ROOT_FILES, STAGE_DENY_DIRS, STAGE_DENY_FILES };

// 作为脚本直接运行时才执行发布流程；被 require（回归测试）时只导出上述判定。
if (require.main !== module) return;

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
  // 白名单/拒绝清单已在模块区定义（isStageable，含回归测试导出）。
  const stagePaths = [];
  if (DO_COMMIT) {
    // porcelain -z：路径原文（UTF-8、不转义），条目间以 \0 分隔；
    // 未跟踪目录以「dir/」出现；重命名/复制条目会额外输出 <新路径>\0。
    const chunks = execSync('git status --porcelain -z', {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024})
      .split('\0');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      const status = chunk.slice(0, 2);
      const rel = chunk.slice(3);
      if (isStageable(rel)) stagePaths.push(rel);
      if (status[0] === 'R' || status[0] === 'C') {
        // 条目形如 "R  <旧路径>"，下一段是 <新路径>（git status -z 下无 XY 前缀）
        i++;
        if (chunks[i] && isStageable(chunks[i])) stagePaths.push(chunks[i]);
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
