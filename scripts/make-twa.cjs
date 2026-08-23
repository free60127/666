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

const keystore = process.env.TWA_KEYSTORE ? path.resolve(process.env.TWA_KEYSTORE) : path.join(outdir, 'android.keystore');
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
  console.log('generated ->', outdir);
})().catch(e => { console.error(e); process.exit(1); });