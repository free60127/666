// 临时：统计两套旧 HTML 中 word-bank 使用情况
const fs = require('fs');
for (const f of ['archive/legacy/基英系列-旧版.html', 'archive/legacy/泛读系列-旧版.html']) {
  const h = fs.readFileSync(f, 'utf8');
  const tag = '<div class="word-bank">';
  let count = 0, idx = 0;
  while ((idx = h.indexOf(tag, idx)) >= 0) { count++; idx += tag.length; }
  console.log(f, '=> word-bank 标签数:', count);
  // 找出每个 word-bank 后的前 3 个 span 词
  let i = 0, shown = 0;
  while (shown < 3 && (i = h.indexOf(tag, i)) >= 0) {
    const seg = h.slice(i, i + 400);
    const spans = [...seg.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].slice(0, 4).map(m => m[1].trim());
    console.log('  sample words:', spans.join(' | '));
    i += tag.length; shown++;
  }
}
