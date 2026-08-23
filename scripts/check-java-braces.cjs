const fs = require('fs');
let bad = 0;
for (const f of [
  'cap-share/android/app/src/main/java/com/waiyuan/share/MainActivity.java',
  'cap-paotui/android/app/src/main/java/com/waiyuan/paotui/MainActivity.java',
]) {
  const s = fs.readFileSync(f, 'utf8');
  let n = 0;
  for (const c of s) { if (c === '{') n++; if (c === '}') n--; }
  if (n !== 0) { bad++; console.error('braces unbalanced: ' + f + ' (' + n + ')'); }
}
if (bad) process.exit(1);
console.log('MainActivity 花括号配平 ✓');