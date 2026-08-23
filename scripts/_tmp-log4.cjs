const { execSync } = require('child_process');
const token = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' }).match(/password=(.+)/)[1].trim();
async function main() {
  const r2 = await fetch('https://api.github.com/repos/free60127/666/actions/runs/32624007739/jobs', { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh' } });
  const d2 = await r2.json();
  const job = (d2.jobs || []).find(j => j.name === 'worker-test');
  const r3 = await fetch('https://api.github.com/repos/free60127/666/actions/jobs/' + job.id + '/logs', { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh' } });
  const lines = (await r3.text()).split('\n');
  // 找 verify-sync-local 之后的输出
  const idx = lines.findIndex(l => l.includes('验证结果') || l.includes('verify-sync-local') || l.includes('✗'));
  console.log(lines.slice(idx, idx + 80).join('\n'));
}
main().catch(e => { console.error(e); process.exit(1); });