(() => {
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const withLineBreaks = value => escapeHtml(value).replace(/\n/g, '<br>');
  const mobileBrowser = () => navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const fileName = title => `${String(title || '题库').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}-A4打印版.pdf`;
  const isAppleMobile = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const isWeChat = () => /MicroMessenger/i.test(navigator.userAgent || '');
  let activeMobilePdfUrl = '';

  function wrapText(value, maxWidth = null) {
    const output = [];
    String(value || '').replace(/\r/g, '').split('\n').forEach(paragraph => {
      if (!paragraph) { output.push(''); return; }
      const asciiRatio = [...paragraph].filter(character => /[\u0000-\u00ff]/.test(character)).length / Math.max(1, [...paragraph].length);
      const limit = maxWidth == null ? (asciiRatio > .6 ? 56 : 47) : maxWidth;
      const tokens = paragraph.match(/\s+|[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*|[\u4e00-\u9fff]|[^\s]/g) || [];
      let line = '';
      let width = 0;
      let previousWord = false;
      let pendingSpace = false;
      tokens.forEach(token => {
        if (/^\s+$/.test(token)) { pendingSpace = true; return; }
        const word = /^[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*$/.test(token);
        const punctuation = /^[,.!?;:，。！？；：、…%‰）》】』」』\]\)}]/.test(token);
        let separator = !punctuation && (pendingSpace || (word && previousWord)) ? ' ' : '';
        const tokenWidth = textWidth(token) + textWidth(separator);
        if (line && !punctuation && width + tokenWidth > limit) {
          output.push(line.trimEnd());
          line = '';
          width = 0;
          previousWord = false;
          pendingSpace = false;
          separator = '';
        }
        line += separator + token;
        width += tokenWidth;
        previousWord = word;
        pendingSpace = false;
      });
      if (line) output.push(line.trimEnd());
    });
    return output;
  }

  function textWidth(value) { return [...String(value || '')].reduce((width, character) => width + (/[^\u0000-\u00ff]/.test(character) ? 1 : .55), 0); }
  function optionRows(options) { const entries = (options || []).map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`); if (!entries.length) return []; if (entries.length <= 4 && entries.reduce((width, entry) => width + textWidth(entry), 0) + (entries.length - 1) * 2 <= 47) return [{entries, columns: entries.length}]; const rows = []; for (let index = 0; index < entries.length; index += 2) { const left = wrapText(entries[index], 21); const right = entries[index + 1] ? wrapText(entries[index + 1], 21) : []; const count = Math.max(left.length, right.length); for (let line = 0; line < count; line++) rows.push({entries: [left[line] || '', right[line] || ''], columns: 2}); } return rows; }

  function prepareQuestions(source) {
    const prepared = [];
    (source || []).forEach(item => {
      const question = String(item.question || '').trim();
      const match = question.match(/^(.*?)[（(]\s*空格\s*([ivxlcdm\d]+)\s*[）)]\s*$/i);
      const base = match ? match[1].trim() : question;
      const label = match ? `空格 ${match[2]}` : '';
      const previous = prepared[prepared.length - 1];
      if (label && previous && previous.type === item.type && previous.question === base && previous.optionGroups) {
        previous.optionGroups.push({label, options: item.options || []});
        previous.answer = `${previous.answer}；${label.replace('空格 ', '')}：${cleanAnswer(item.answer)}`;
        return;
      }
      prepared.push({
        ...item,
        question: base,
        answer: label ? `${label.replace('空格 ', '')}：${cleanAnswer(item.answer)}` : cleanAnswer(item.answer),
        optionGroups: label ? [{label, options: item.options || []}] : null,
      });
    });
    return prepared;
  }

  function buildPages({title, subtitle, questions, mode = 'standard'}) {
    questions = prepareQuestions(questions);
    const pages = [];
    let page;
    let section = '';
    let continuation = false;

    function startPage() {
      page = {title, subtitle, section: continuation ? `${section}（续）` : section, lines: [], y: 730};
      pages.push(page);
      continuation = true;
    }

    function addLine(text, size = 10.5, gap = 15) {
      if (!page) startPage();
      if (page.y - gap < 54) startPage();
      if (text) page.lines.push({text, size, y: page.y});
      page.y -= gap;
    }

    function addText(text, size = 10.5, gap = 15, maxWidth = null) {
      wrapText(text, maxWidth).forEach(line => addLine(line, size, gap));
    }

    function addOptions(options) {
      optionRows(options).forEach(row => {
        const size = row.columns === 4 ? 9.5 : 10.5;
        const gap = row.columns === 4 ? 15 : 16;
        if (!page) startPage();
        if (page.y - gap < 54) startPage();
        page.lines.push({kind: 'options', entries: row.entries, columns: row.columns, size, y: page.y});
        page.y -= gap;
      });
    }

    function addOptionGroupLabel(label) {
      if (!page) startPage();
      if (page.y - 20 < 54) startPage();
      page.lines.push({kind: 'option-label', text: label, size: 9, y: page.y});
      page.y -= 14;
    }

    function addModuleHeading(type) {
      const heading = String(type || '').trim();
      if (!heading) return;
      if (!page) startPage();
      if (page.y - 30 < 54) startPage();
      page.lines.push({kind: 'module', text: heading, size: 10, y: page.y});
      page.y -= 18;
    }

    section = mode === 'memorize' ? '题目与答案' : '题目';
    continuation = false;
    startPage();
    let previousType = '';
    questions.forEach((item, index) => {
      const currentType = String(item.type || '').trim();
      if (currentType && currentType !== previousType) addModuleHeading(currentType);
      previousType = currentType;
      addText(`${index + 1}. ${item.question || ''}`, 10.5, 16);
      if (item.optionGroups) item.optionGroups.forEach(group => { addOptionGroupLabel(group.label); addOptions(group.options); });
      else addOptions(item.options);
      if (mode === 'memorize') {
        addLine('', 10.5, 5);
        addText(`答案：${cleanAnswer(item.answer)}`, 10.5, 16);
      }
      addLine('', 10.5, 10);
    });

    if (mode !== 'memorize') {
      section = '参考答案';
      continuation = false;
      startPage();
      previousType = '';
      questions.forEach((item, index) => {
        const currentType = String(item.type || '').trim();
        if (currentType && currentType !== previousType) addModuleHeading(currentType);
        previousType = currentType;
        addText(`${index + 1}. ${cleanAnswer(item.answer)}`, 10.5, 16);
        addLine('', 10.5, 10);
      });
    }
    return pages;
  }

  function cleanAnswer(value) {
    const answer = String(value || '').trim().replace(/^(?:(?:查看)?参考答案\s*[:：]?\s*)+/i, '');
    if (/教师用书对应页未提供本题答案|暂不作推测/.test(answer)) return '原书未提供答案';
    return answer || '原书未提供答案';
  }

  function unicodeHex(value) {
    let hex = '';
    for (const character of String(value || '')) {
      const code = character.codePointAt(0);
      hex += (code > 0xffff ? 0x3f : code).toString(16).padStart(4, '0');
    }
    return hex || '0020';
  }

  function textCommand(text, x, y, size) {
    return `BT\n/F1 ${size} Tf\n1 0 0 1 ${x} ${y} Tm\n<${unicodeHex(text)}> Tj\nET\n`;
  }

  function pdfBytes(options) {
    const pages = buildPages(options);
    const objects = [];
    const pageIds = pages.map((_, index) => 5 + index * 2);
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>';
    objects[4] = '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>';

    pages.forEach((page, index) => {
      const pageId = pageIds[index];
      const contentId = pageId + 1;
      const header = [
        textCommand('外院 · 知识分享站', 42, 807, 8.5),
        textCommand(page.title, 42, 786, 16),
        page.subtitle ? textCommand(page.subtitle, 42, 770, 8.5) : '',
        textCommand(page.section, 42, 748, 14),
      ].join('');
      const body = page.lines.map(line => textCommand(line.text, 42, line.y, line.size)).join('');
      const footer = textCommand(`A4 打印版 · 第 ${index + 1} / ${pages.length} 页`, 42, 34, 8);
      const stream = `${header}${body}${footer}`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    });

    let pdf = '%PDF-1.4\n% A4 question bank\n';
    const offsets = [0];
    const maxId = objects.length - 1;
    for (let id = 1; id <= maxId; id++) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= maxId; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new TextEncoder().encode(pdf);
  }

  // Mobile browsers and the mini program cannot rely on a reader having the
  // same Chinese CID font installed.  Render every A4 page first, then embed
  // that JPEG page in the PDF.  The exported file is therefore portable: it
  // has the same Chinese layout in WeChat, Android and desktop PDF readers.
  function asciiBytes(value) { const out = new Uint8Array(value.length); for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 255; return out; }
  function concatBytes(chunks) { const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0); const out = new Uint8Array(length); let offset = 0; chunks.forEach(chunk => { out.set(chunk, offset); offset += chunk.length; }); return out; }
  function jpegSize(bytes) { let offset = 2; while (offset < bytes.length) { if (bytes[offset] !== 255) { offset++; continue; } while (bytes[offset] === 255) offset++; const marker = bytes[offset++]; const length = bytes[offset] * 256 + bytes[offset + 1]; if ((marker >= 192 && marker <= 195) || (marker >= 197 && marker <= 199) || (marker >= 201 && marker <= 203) || (marker >= 205 && marker <= 207)) return {height: bytes[offset + 3] * 256 + bytes[offset + 4], width: bytes[offset + 5] * 256 + bytes[offset + 6]}; offset += length; } throw new Error('页面图片生成失败。'); }
  function imagePdf(images) { const objects = []; const pageIds = images.map((_, index) => 5 + index * 3); objects[1] = [asciiBytes('<< /Type /Catalog /Pages 2 0 R >>')]; objects[2] = [asciiBytes(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${images.length} >>`)]; images.forEach((image, index) => { const imageId = 3 + index * 3; const contentId = imageId + 1; const pageId = imageId + 2; const size = jpegSize(image); const content = asciiBytes('q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n'); objects[imageId] = [asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, asciiBytes('\nendstream')]; objects[contentId] = [asciiBytes(`<< /Length ${content.length} >>\nstream\n`), content, asciiBytes('endstream')]; objects[pageId] = [asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)]; }); const chunks = [asciiBytes('%PDF-1.4\n% portable A4 image PDF\n')]; const offsets = [0]; let length = chunks[0].length; const maxId = objects.length - 1; for (let id = 1; id <= maxId; id++) { offsets[id] = length; [asciiBytes(`${id} 0 obj\n`), ...objects[id], asciiBytes('\nendobj\n')].forEach(chunk => { chunks.push(chunk); length += chunk.length; }); } const xrefOffset = length; chunks.push(asciiBytes(`xref\n0 ${maxId + 1}\n0000000000 65535 f \n`)); for (let id = 1; id <= maxId; id++) chunks.push(asciiBytes(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)); chunks.push(asciiBytes(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)); return concatBytes(chunks); }
  function drawPortablePage(context, page, index, total) { const scale = 2; const draw = (text, x, y, size, color = '#1d2924', weight = '400') => { context.fillStyle = color; context.font = `${weight} ${size * scale}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`; context.fillText(String(text || ''), x * scale, (842 - y) * scale); }; context.fillStyle = '#fff'; context.fillRect(0, 0, 1190, 1684); context.textBaseline = 'alphabetic'; draw('外院 · 知识分享站', 42, 807, 8.5, '#6d8176', '600'); draw(page.title, 42, 786, 16, '#1d2924', '700'); if (page.subtitle) draw(page.subtitle, 42, 770, 8.5, '#6d8176'); draw(page.section, 42, 748, 14, '#1d5948', '700'); context.strokeStyle = '#cfdcd3'; context.lineWidth = 2; context.beginPath(); context.moveTo(84, 202); context.lineTo(1106, 202); context.stroke(); page.lines.forEach(line => { if (line.kind === 'module') { draw(line.text, 42, line.y, line.size, '#1d5948', '700'); return; } if (line.kind === 'option-label') { draw(line.text, 50, line.y, line.size, '#5c7569', '700'); return; } if (line.kind !== 'options') { draw(line.text, 42, line.y, line.size, '#26342d'); return; } const start = 58; const width = 495 / line.columns; line.entries.forEach((entry, column) => draw(entry, start + width * column, line.y, line.size, '#26342d')); }); draw(`A4 打印版 · 第 ${index + 1} / ${total} 页`, 42, 34, 8, '#718079'); }
  function portablePdfBytes(options) { const pages = buildPages(options); const canvas = document.createElement('canvas'); canvas.width = 1190; canvas.height = 1684; const context = canvas.getContext('2d'); const images = pages.map((page, index) => { drawPortablePage(context, page, index, pages.length); const raw = atob(canvas.toDataURL('image/jpeg', .92).split(',')[1]); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return bytes; }); return imagePdf(images); }

  function removeMobileDownloadPanel() {
    document.getElementById('a4-mobile-download-panel')?.remove();
    if (activeMobilePdfUrl) URL.revokeObjectURL(activeMobilePdfUrl);
    activeMobilePdfUrl = '';
  }

  function triggerDownload(url, name) {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function showMobileDownloadPanel(url, name) {
    const panel = document.createElement('div');
    panel.id = 'a4-mobile-download-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(17,32,27,.58);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;';
    const card = document.createElement('section');
    card.style.cssText = 'width:min(100%,390px);padding:26px 22px 20px;border-radius:20px;background:#fffdf8;color:#1d2924;box-shadow:0 18px 52px rgba(0,0,0,.28);text-align:center;';
    const title = document.createElement('h2');
    title.textContent = 'PDF 已生成';
    title.style.cssText = 'margin:0 0 10px;font-size:22px;line-height:1.25;color:#1d5948;';
    const description = document.createElement('p');
    description.textContent = '已尝试开始下载。若浏览器没有反应，请点击下面的按钮。';
    description.style.cssText = 'margin:0 0 17px;line-height:1.65;color:#52645b;font-size:14px;';
    const download = document.createElement('a');
    download.href = url;
    download.download = name;
    download.target = '_blank';
    download.rel = 'noopener';
    download.textContent = '下载 / 打开 A4 PDF';
    download.style.cssText = 'display:block;padding:13px 14px;border-radius:12px;background:#1d5948;color:#fff;text-decoration:none;font-weight:700;font-size:16px;';
    const note = document.createElement('p');
    note.textContent = '苹果手机可在 PDF 预览页点“分享”→“存储到文件”。';
    note.style.cssText = 'margin:15px 0 12px;line-height:1.55;color:#74827a;font-size:12px;';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '留在当前页面';
    close.style.cssText = 'border:0;background:transparent;color:#527366;font-size:14px;padding:8px 12px;';
    const dismiss = () => removeMobileDownloadPanel();
    close.addEventListener('click', dismiss);
    panel.addEventListener('click', event => { if (event.target === panel) dismiss(); });
    card.append(title, description, download, note, close);
    panel.appendChild(card);
    document.body.appendChild(panel);
  }

  function copyCurrentAddress(button) {
    const address = location.href.split('#')[0];
    const done = () => {
      button.textContent = '网址已复制，请到浏览器粘贴打开';
      button.style.background = '#28634f';
    };
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(address).then(done).catch(() => fallbackCopy(address, done));
    fallbackCopy(address, done);
  }

  function fallbackCopy(value, done) {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); done(); }
    catch (_) { alert(`请复制网址后到手机浏览器打开：\n${value}`); }
    input.remove();
  }

  function showWeChatGuide() {
    removeMobileDownloadPanel();
    const panel = document.createElement('div');
    panel.id = 'a4-mobile-download-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(17,32,27,.58);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;';
    const card = document.createElement('section');
    card.style.cssText = 'width:min(100%,390px);padding:26px 22px 20px;border-radius:20px;background:#fffdf8;color:#1d2924;box-shadow:0 18px 52px rgba(0,0,0,.28);text-align:center;';
    const title = document.createElement('h2');
    title.textContent = '请在手机浏览器生成 PDF';
    title.style.cssText = 'margin:0 0 10px;font-size:22px;line-height:1.25;color:#1d5948;';
    const description = document.createElement('p');
    description.textContent = '微信内置浏览器不支持保存网页临时生成的 PDF。请点右上角“…”选择“在浏览器打开”，再点击 PDF；也可以先复制当前网址。';
    description.style.cssText = 'margin:0 0 17px;line-height:1.7;color:#52645b;font-size:14px;text-align:left;';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = '复制当前网页地址';
    copy.style.cssText = 'display:block;width:100%;padding:13px 14px;border:0;border-radius:12px;background:#1d5948;color:#fff;font-weight:700;font-size:16px;';
    copy.addEventListener('click', () => copyCurrentAddress(copy));
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '我知道了';
    close.style.cssText = 'margin-top:10px;border:0;background:transparent;color:#527366;font-size:14px;padding:8px 12px;';
    close.addEventListener('click', removeMobileDownloadPanel);
    panel.addEventListener('click', event => { if (event.target === panel) removeMobileDownloadPanel(); });
    card.append(title, description, copy, close);
    panel.appendChild(card);
    document.body.appendChild(panel);
  }

  function chooseMode(options) {
    document.getElementById('a4-mode-panel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'a4-mode-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(17,32,27,.58);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;';
    const card = document.createElement('section');
    card.style.cssText = 'width:min(100%,410px);padding:24px 20px 18px;border-radius:20px;background:#fffdf8;color:#1d2924;box-shadow:0 18px 52px rgba(0,0,0,.28);';
    card.innerHTML = '<h2 style="margin:0 0 8px;font-size:21px;color:#1d5948">选择 PDF 排版模式</h2><p style="margin:0 0 16px;color:#65756d;font-size:13px;line-height:1.55">生成后仍可返回页面重新选择另一种模式。</p>';
    const choices = [
      ['standard', '标准模式', '前面统一为题目，后面统一为参考答案'],
      ['memorize', '背诵模式', '每道题下方直接显示对应参考答案'],
    ];
    choices.forEach(([mode, heading, detail]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.cssText = 'display:flex;flex-direction:column;width:100%;margin:8px 0;padding:13px 14px;border:1px solid #d5e2d8;border-radius:13px;background:#f3f7f2;color:#1d5948;text-align:left;cursor:pointer;';
      button.innerHTML = `<b style="font-size:16px">${heading}</b><span style="margin-top:4px;color:#6c7b74;font-size:12px">${detail}</span>`;
      button.addEventListener('click', () => {
        panel.remove();
        const selected = {...options, mode};
        if (isWeChat()) showWeChatGuide();
        else downloadMobilePdf(selected);
      });
      card.appendChild(button);
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    cancel.style.cssText = 'display:block;margin:8px auto 0;padding:7px 18px;border:0;background:transparent;color:#64756c;font-size:14px;';
    cancel.addEventListener('click', () => panel.remove());
    card.appendChild(cancel);
    panel.appendChild(card);
    panel.addEventListener('click', event => { if (event.target === panel) panel.remove(); });
    document.body.appendChild(panel);
  }

  async function downloadMobilePdf(options) {
    try {
      const url = URL.createObjectURL(new Blob([portablePdfBytes(options)], {type: 'application/pdf'}));
      removeMobileDownloadPanel();
      activeMobilePdfUrl = url;
      const name = fileName(options.title);
      showMobileDownloadPanel(url, name);
      if (!isAppleMobile()) triggerDownload(url, name);
      setTimeout(() => { if (activeMobilePdfUrl === url) removeMobileDownloadPanel(); }, 10 * 60 * 1000);
    } catch (error) {
      alert('PDF 生成失败，请稍后重试。');
      console.error(error);
    }
  }

  function openDesktopPrint({title, subtitle = '', questions = [], mode = 'standard'}) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('浏览器拦截了打印窗口，请允许弹出窗口后重试。');
      return;
    }
    const questionRows = questions.map(item => `<li>${withLineBreaks(item.question)}${mode === 'memorize' ? `<div class="inline-answer"><b>答案：</b>${withLineBreaks(cleanAnswer(item.answer))}</div>` : ''}</li>`).join('');
    const answerRows = questions.map(item => `<li>${withLineBreaks(cleanAnswer(item.answer))}</li>`).join('');
    const documentTitle = `外院知识分享站 - ${title}`;
    printWindow.document.title = documentTitle;
    printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title><style>
      @page{size:A4;margin:15mm 14mm}*{box-sizing:border-box}body{margin:0;color:#1d2924;font:11pt/1.65 Georgia,"Times New Roman","Songti SC",serif}h1{margin:0 0 4mm;color:#1d5948;font:700 20pt/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}h2{margin:0 0 8mm;color:#d06f3d;font:700 9pt/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:1px}.subtitle{margin:0 0 8mm;padding-bottom:5mm;border-bottom:1px solid #cfdcd3;font-weight:700}.questions,.answers{margin:0;padding-left:7mm}.questions li,.answers li{padding:0 0 4.5mm 2mm;break-inside:avoid}.inline-answer{margin-top:2mm;padding:2mm 3mm;border-left:2px solid #93b5a3;background:#f3f7f2;color:#385448}.answers{break-before:page}.answers-title{margin:0 0 7mm;padding-bottom:4mm;border-bottom:1px solid #cfdcd3;color:#1d5948;font:700 16pt/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.foot{margin-top:9mm;color:#718079;font:8pt -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h2>外院 · 知识分享站</h2><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="subtitle">${withLineBreaks(subtitle)}</p>` : ''}<ol class="questions">${questionRows}</ol>${mode === 'memorize' ? '' : `<section class="answers"><h2 class="answers-title">参考答案</h2><ol>${answerRows}</ol></section>`}<p class="foot">A4 打印版 · 可在系统打印窗口选择“另存为 PDF”或直接打印</p></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 250);
  }

  function open(options = {}) {
    const normalized = {...options, subtitle: options.subtitle || '', questions: options.questions || []};
    if (!normalized.questions.length) {
      alert('当前没有可导出的题目。');
      return;
    }
    // Use one portable A4 renderer on every device so the downloaded file is
    // identical in layout whether it was created on a phone or a computer.
    chooseMode(normalized);
  }

  window.A4QuestionPrint = {open, buildPages};
})();
