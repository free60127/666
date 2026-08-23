// Capacitor 工程签名/版本注入（GitHub Actions 中使用）
// 用法: node scripts/cap-sign.cjs <cap-share|cap-paotui>
// env: TWA_VERSION, TWA_VERSION_CODE, TWA_KEYSTORE_PASS, TWA_KEY_ALIAS, TWA_KEY_PASS
// keystore 来源: <cwd>/keys/android.keystore（workflow 从 secret 还原）
const fs = require('fs');
const path = require('path');
const appDir = process.argv[2];
if (!appDir || !/^cap-(share|paotui)$/.test(appDir)) {
  console.error('用法: node scripts/cap-sign.cjs <cap-share|cap-paotui>');
  process.exit(1);
}
// 2026-08-23 审查：fail-closed——签名/版本 env 缺失直接失败，绝不 fallback 到弱默认值
const REQUIRED_ENV = ['TWA_VERSION', 'TWA_VERSION_CODE', 'TWA_KEYSTORE_PASS', 'TWA_KEY_ALIAS', 'TWA_KEY_PASS'];
for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    console.error('缺少环境变量: ' + k + '（拒绝使用默认值签名/版本）');
    process.exit(1);
  }
}
const root = process.cwd();
const appGradle = path.join(root, appDir, 'android/app/build.gradle');
const keystoreSrc = path.join(root, 'keys', 'android.keystore');
const keystoreDst = path.join(root, appDir, 'android/app/android.keystore');
if (!fs.existsSync(appGradle)) { console.error('build.gradle not found:', appGradle); process.exit(1); }
if (!fs.existsSync(keystoreSrc)) { console.error('keystore not found:', keystoreSrc); process.exit(1); }
fs.copyFileSync(keystoreSrc, keystoreDst);

// 同步 capacitor.config.json 到 assets（Capacitor Android 启动时从 assets 读配置；
// 缺失会回退默认 hostname=localhost → https://localhost/ ERR_CONNECTION_REFUSED）
const configSrc = path.join(root, appDir, 'capacitor.config.json');
const assetsDir = path.join(root, appDir, 'android/app/src/main/assets');
if (fs.existsSync(configSrc)) {
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.copyFileSync(configSrc, path.join(assetsDir, 'capacitor.config.json'));
  console.log('cap-sign: capacitor.config.json synced to assets');
} else {
  console.error('capacitor.config.json not found:', configSrc);
  process.exit(1);
}

let g = fs.readFileSync(appGradle, 'utf8');

// versionCode/versionName 从 env 注入（gradle 构建时求值）；检查用完整表达式避免 TWA_VERSION 子串误匹配
if (!g.includes("System.getenv('TWA_VERSION_CODE')")) {
  g = g.replace(/versionCode \d+/, "versionCode Integer.parseInt(System.getenv('TWA_VERSION_CODE'))");
}
if (!g.includes("System.getenv('TWA_VERSION')")) {
  g = g.replace(/versionName "[^"]*"/, "versionName (System.getenv('TWA_VERSION'))");
}

// signingConfigs + buildTypes.release 签名（幂等）
if (!g.includes('signingConfigs')) {
  const signBlock = [
    '',
    '    signingConfigs {',
    '        release {',
    "            storeFile file('android.keystore')",
    "            storePassword System.getenv('TWA_KEYSTORE_PASS')",
    "            keyAlias System.getenv('TWA_KEY_ALIAS')",
    "            keyPassword System.getenv('TWA_KEY_PASS')",
    '        }',
    '    }',
    '',
  ].join('\n');
  g = g.replace('\n    buildTypes {', signBlock + '    buildTypes {');
  g = g.replace(
    "            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'\n        }",
    "            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'\n            signingConfig signingConfigs.release\n        }"
  );
}

fs.writeFileSync(appGradle, g);
console.log('cap-sign ok:', appDir, '-> versionCode/versionName env + signingConfigs.release injected');