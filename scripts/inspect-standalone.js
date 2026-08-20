// Inspect standalone HTML files: which bank data they embed, external refs, inline status
// 用法: node scripts/inspect-standalone.js <文件...>
const fs = require('fs');

const files = process.argv.slice(2);
if (!files.length) { console.error('用法: node scripts/inspect-standalone.js <文件...>'); process.exit(1); }
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  console.log('---', f, '| chars:', t.length, '---');
  // which window.X_BANKS assignments exist
  const bankRefs = [...t.matchAll(/window\.([A-Za-z0-9_]+)\s*=/g)].map(m => m[1]);
  console.log('  window.* assignments (first 8):', [...new Set(bankRefs)].slice(0, 8).join(', '));
  console.log('  POLITICS_BANKS?', t.includes('POLITICS_BANKS'), '| COMPUTER_BANKS?', t.includes('COMPUTER_BANKS'));
  console.log('  reading-tools function inline?', t.includes('detectCharacterLanguage'));
  const srcs = [...t.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  console.log('  external script src:', srcs.length ? srcs.join(', ') : '(none)');
  const links = [...t.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]);
  console.log('  external link href:', links.length ? links.join(', ') : '(none)');
  // count question objects heuristically: look for "type":"single" occurrences
  const singles = (t.match(/"type"\s*:\s*"single"/g) || []).length;
  const multis = (t.match(/"type"\s*:\s*"multi"/g) || []).length;
  console.log('  embedded question marks: single=' + singles + ' multi=' + multis);
  // banks meta
  const meta = t.match(/<title>([^<]*)<\/title>/);
  console.log('  title:', meta ? meta[1] : '(none)');
  console.log();
}
