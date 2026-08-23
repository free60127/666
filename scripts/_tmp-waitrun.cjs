const { execSync } = require('child_process');
const token = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' }).match(/password=(.+)/)[1].trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await fetch('https://api.github.com/repos/free60127/666/actions/runs?per_page=5', {
      headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh' },
    });
    const data = await res.json();
    const run = data.workflow_runs && data.workflow_runs[0];
    if (!run) { console.log('no runs yet'); await sleep(15000); continue; }
    console.log(run.name + ' | ' + run.status + ' | ' + (run.conclusion || '') + ' | ' + run.id + ' | ' + run.head_sha.slice(0, 7));
    if (run.name.includes('构建 APK') && run.status === 'completed') {
      console.log('FINAL:', run.conclusion);
      process.exit(run.conclusion === 'success' ? 0 : 2);
    }
    await sleep(20000);
  }
  console.log('TIMEOUT waiting for APK build');
  process.exit(3);
}
main().catch(e => { console.error(e); process.exit(1); });