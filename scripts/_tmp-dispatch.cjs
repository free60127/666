const { execSync } = require('child_process');
const token = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' }).match(/password=(.+)/)[1].trim();
const run = async () => {
  const res = await fetch('https://api.github.com/repos/free60127/666/actions/workflows/twa-build.yml/dispatches', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'dsh' },
    body: JSON.stringify({ ref: 'main', inputs: { app: 'both', version: '' } }),
  });
  console.log('dispatch status:', res.status);
  if (res.status !== 204) console.log(await res.text());
};
run().catch(e => { console.error(e); process.exit(1); });