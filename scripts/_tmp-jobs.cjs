const { execSync } = require('child_process');
const token = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' }).match(/password=(.+)/)[1].trim();
async function main() {
  for (const id of ['32623995967', '32624007739']) {
    const res = await fetch('https://api.github.com/repos/free60127/666/actions/runs/' + id + '/jobs?per_page=20', {
      headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh' },
    });
    const data = await res.json();
    for (const job of data.jobs || []) {
      console.log('== run ' + id + ' job: ' + job.name + ' status=' + job.conclusion);
      for (const step of job.steps || []) {
        if (step.conclusion === 'failure') console.log('   FAILED STEP: ' + step.name);
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });