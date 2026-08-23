#!/usr/bin/env node
// 通知 Codex 开始下一轮评估：复用最近会话（codex exec resume --last）
const { execSync } = require('child_process');
const msg = process.argv.slice(2).join(' ') || 'DSH 本轮修改与检测已完成（详见 CODEX/DONE.md），请开始下一轮评估。';
try {
  const out = execSync('codex exec resume --last ' + JSON.stringify(msg), { encoding: 'utf8', timeout: 600000, stdio: ['ignore','pipe','pipe'] });
  console.log('NOTIFY_OK');
  console.log((out||'').slice(0, 2000));
} catch (e) {
  console.log('NOTIFY_ERR');
  console.log((e.stdout||'') + (e.stderr||'') + String(e.message).slice(0, 1200));
  process.exit(1);
}