// Decode DSH session.jsonl.zstd (concatenated zstd frames) to JSONL text
// Usage: node decode-session.js <input.zstd> <output.jsonl>
// Frame scan approach ported from DSH dsh-session-persistence-jsonl.
const fs = require('fs');
const { zstdDecompressSync } = require('node:zlib');

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]); // zstd frame magic

function scanFrames(buf) {
  const frames = [];
  let off = 0;
  while (off + 4 <= buf.length) {
    if (!buf.subarray(off, off + 4).equals(MAGIC)) { off++; continue; }
    // Try to find a complete frame: iterate window sizes 8..16MB via trial decode
    let end = -1;
    const maxLen = Math.min(buf.length - off, 32 * 1024 * 1024);
    for (let len = 8; len <= maxLen; len++) {
      try {
        zstdDecompressSync(buf.subarray(off, off + len));
        end = off + len;
        break;
      } catch { /* incomplete frame, grow */ }
    }
    if (end < 0) { off++; continue; }
    frames.push({ start: off, end });
    off = end;
  }
  return frames;
}

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('usage: node decode-session.js <input.zstd> <output.jsonl>');
  process.exit(1);
}

const buf = fs.readFileSync(input);
const frames = scanFrames(buf);
console.log('frames found:', frames.length, 'of total bytes', buf.length);

let out = '';
let lastEnd = 0;
for (const f of frames) {
  const text = zstdDecompressSync(buf.subarray(f.start, f.end)).toString('utf8');
  out += text;
  lastEnd = f.end;
}
fs.writeFileSync(output, out, 'utf8');
console.log('decoded ->', output, '(', out.length, 'chars; trailing bytes', buf.length - lastEnd, ')');
