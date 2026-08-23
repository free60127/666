const { execSync } = require('child_process');
const token = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' }).match(/password=(.+)/)[1].trim();
async function main() {
  const res = await fetch('https://api.github.com/repos/free60127/666/actions/jobs/32623995967-j?per_page=20', {});
  // 先按 run id 拿 job id
  const r2 = await fetch('https://api.github.com/repos/free60127/666/actions/runs/32623995967/jobs', { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh' } });
  const d2 = await r2.json();
  const job = d2.jobs[0];
  console.log('job id:', job.id);
  const r3 = await fetch('https://api.github.com/repos/free60127/666/actions/jobs/' + job.id + '/logs', { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh' } });
  const text = await r3.text();
  const lines = text.split('\n');
  // 找 gradle 错误附近
  const idx = lines.findIndex(l => l.includes('FAILURE') || l.includes('What went wrong'));
  console.log(lines.slice(Math.max(0, idx - 40), idx + 60).join('\n'));
}
main().catch(e => { console.error(e); process.exit(1); });