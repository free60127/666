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
const root = process.cwd();
const appGradle = path.join(root, appDir, 'android/app/build.gradle');
const keystoreSrc = path.join(root, 'keys', 'android.keystore');
const keystoreDst = path.join(root, appDir, 'android/app/android.keystore');
if (!fs.existsSync(appGradle)) { console.error('build.gradle not found:', appGradle); process.exit(1); }
if (!fs.existsSync(keystoreSrc)) { console.error('keystore not found:', keystoreSrc); process.exit(1); }
fs.copyFileSync(keystoreSrc, keystoreDst);
let g = fs.readFileSync(appGradle, 'utf8');

// versionCode/versionName 从 env 注入（gradle 构建时求值）；检查用完整表达式避免 TWA_VERSION 子串误匹配
if (!g.includes("System.getenv('TWA_VERSION_CODE')")) {
  g = g.replace(/versionCode \d+/, "versionCode Integer.parseInt(System.getenv('TWA_VERSION_CODE') ?: '1')");
}
if (!g.includes("System.getenv('TWA_VERSION')")) {
  g = g.replace(/versionName "[^"]*"/, "versionName (System.getenv('TWA_VERSION') ?: '1.0')");
}

// signingConfigs + buildTypes.release 签名（幂等）
if (!g.includes('signingConfigs')) {
  const signBlock = [
    '',
    '    signingConfigs {',
    '        release {',
    "            storeFile file('android.keystore')",
    "            storePassword System.getenv('TWA_KEYSTORE_PASS') ?: 'waiyuan2026'",
    "            keyAlias System.getenv('TWA_KEY_ALIAS') ?: 'waiyuan'",
    "            keyPassword System.getenv('TWA_KEY_PASS') ?: 'waiyuan2026'",
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