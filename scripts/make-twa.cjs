const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;
const root = execSync('npm root -g').toString().trim();
const core = require(path.join(root, '@bubblewrap', 'cli', 'node_modules', '@bubblewrap', 'core'));
const { TwaManifest, TwaGenerator, MockLog } = core;

const app = process.argv[2];
if (!['share', 'paotui'].includes(app)) { console.error('usage: node make-twa.cjs <share|paotui> [outdir]'); process.exit(1); }
const outdir = path.resolve(process.argv[3] || ('android-' + app));
const cfg = {
  share: {
    packageId: 'com.waiyuan.share',
    name: '外院知识分享站',
    launcherName: '外院知识分享站',
    startUrl: 'https://free60127.top/',
    iconUrl: 'https://free60127.top/icons/icon-512.png',
    maskableIconUrl: 'https://free60127.top/icons/icon-512-maskable.png',
    webManifestUrl: 'https://free60127.top/manifest.webmanifest',
  },
  paotui: {
    packageId: 'com.waiyuan.paotui',
    name: '外院跑腿',
    launcherName: '外院跑腿',
    startUrl: 'https://free60127.top/paotui/',
    iconUrl: 'https://free60127.top/paotui/icon-512.png',
    maskableIconUrl: 'https://free60127.top/paotui/icon-512-maskable.png',
    webManifestUrl: 'https://free60127.top/paotui/manifest.webmanifest',
  },
}[app];

const keystoreSrc = process.env.TWA_KEYSTORE ? path.resolve(process.env.TWA_KEYSTORE) : null;
const keystore = path.join(outdir, 'android.keystore');
const twaManifest = new TwaManifest({
  packageId: cfg.packageId,
  host: 'free60127.top',
  name: cfg.name,
  launcherName: cfg.launcherName,
  display: 'standalone',
  themeColor: '#28634f',
  themeColorDark: '#1d2f28',
  navigationColor: '#28634f',
  navigationColorDark: '#17211f',
  navigationDividerColor: '#28634f',
  navigationDividerColorDark: '#17211f',
  backgroundColor: '#fdfaf3',
  startUrl: cfg.startUrl,
  iconUrl: cfg.iconUrl,
  maskableIconUrl: cfg.maskableIconUrl,
  signingKey: {
    path: keystore,
    alias: process.env.TWA_KEY_ALIAS || 'waiyuan',
    keyPassword: process.env.TWA_KEY_PASS || 'waiyuan2026',
    password: process.env.TWA_KEYSTORE_PASS || 'waiyuan2026',
  },
  appVersion: '1.0',
  appVersionCode: 1,
  shortcuts: [],
  generatorApp: 'bubblewrap-cli',
  webManifestUrl: cfg.webManifestUrl,
  fallbackType: 'customtabs',
  features: {},
  alphaDependencies: { enabled: false },
  enableSiteSettingsShortcut: true,
  enableNotifications: true,
  splashScreenFadeOutDuration: 0,
  orientation: 'default',
});
fs.mkdirSync(outdir, { recursive: true });
(async () => {
  await twaManifest.saveToFile(path.join(outdir, 'twa-manifest.json'));
  const generator = new TwaGenerator();
  await generator.createTwaProject(outdir, twaManifest, new MockLog(), () => {});
  if (keystoreSrc) {
    fs.copyFileSync(keystoreSrc, keystore);
    console.log('keystore copied ->', keystore);
  }
  // 注入 AGP 签名配置（bubblewrap 模板不含 signingConfig，产出为 unsigned）
  const bgPath = path.join(outdir, 'app', 'build.gradle');
  const bg = fs.readFileSync(bgPath, 'utf8');
  const signBlock = [
    '    signingConfigs {',
    '        release {',
    "            storeFile rootProject.file('android.keystore')",
    "            storePassword '" + (process.env.TWA_KEYSTORE_PASS || '') + "'",
    "            keyAlias '" + (process.env.TWA_KEY_ALIAS || 'waiyuan') + "'",
    "            keyPassword '" + (process.env.TWA_KEY_PASS || '') + "'",
    '        }',
    '    }',
  ].join('\n');
  const oldBt = [
    '    buildTypes {',
    '        release {',
    '            minifyEnabled true',
    '        }',
    '    }',
  ].join('\n');
  const newBt = [
    signBlock + '\n' + oldBt.replace('            minifyEnabled true', "            minifyEnabled true\n            signingConfig signingConfigs.release"),
  ].join('\n');
  if (!bg.includes(oldBt)) throw new Error('buildTypes block not found in generated build.gradle');
  fs.writeFileSync(bgPath, bg.replace(oldBt, newBt));
  console.log('signing config injected');
  console.log('generated ->', outdir);
})().catch(e => { console.error(e); process.exit(1); });