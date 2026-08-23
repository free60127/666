const { execSync } = require('child_process');
const token = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' }).match(/password=(.+)/)[1].trim();
async function main() {
  const res = await fetch('https://api.github.com/repos/free60127/666/actions/runs?per_page=6', {
    headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh' },
  });
  const data = await res.json();
  for (const run of data.workflow_runs || []) {
    console.log(run.id + ' | ' + run.name + ' | ' + run.status + ' | ' + (run.conclusion || '-') + ' | ' + run.head_sha.slice(0, 7));
  }
}
main().catch(e => { console.error(e); process.exit(1); });