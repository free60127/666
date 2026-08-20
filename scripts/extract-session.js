// Extract key events from a decoded DSH session JSONL for progress review
// Usage: node extract-session.js <session.jsonl> [output.txt]
const fs = require('fs');

const input = process.argv[2];
const output = process.argv[3] || 'session-extract.txt';
const lines = fs.readFileSync(input, 'utf8').split('\n').filter(Boolean);

const out = [];
const push = (s) => out.push(s);

let userCount = 0, compCount = 0;

for (const line of lines) {
  let o;
  try { o = JSON.parse(line); } catch { continue; }
  const t = o.type;
  if (t === 'session/title') {
    push('\n========== SESSION TITLE: ' + JSON.stringify(o.data || o.title) + ' ==========');
  } else if (t === 'user/message') {
    userCount++;
    const msg = o.data?.content || o.content || o.message;
    let text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    if (text.length > 1500) text = text.slice(0, 1500) + ' ...[truncated]';
    push(`\n----- USER MESSAGE #${userCount} (seq ${o.seq0}) -----\n${text}`);
  } else if (t === 'compaction/summary') {
    compCount++;
    push(`\n===== COMPACTION SUMMARY #${compCount} (seq ${o.seq0}) =====\n${o.data?.summary || o.summary || JSON.stringify(o)}`);
  } else if (t === 'todo/write') {
    push(`\n----- TODO (seq ${o.seq0}) -----\n${JSON.stringify(o.data || o)}`);
  } else if (t === 'approval/policy') {
    push(`\n[APPROVAL POLICY] ${JSON.stringify(o.data || o)}`);
  } else if (t === 'sandbox/mode') {
    push(`\n[SANDBOX MODE] ${JSON.stringify(o.data || o)}`);
  } else if (t === 'session/end-seed') {
    push(`\n[END-SEED] ${JSON.stringify(o.data || o)}`);
  }
}

fs.writeFileSync(output, out.join('\n'), 'utf8');
console.log('user messages:', userCount, '| compaction summaries:', compCount, '| written to', output);
