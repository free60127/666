(() => {
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const withLineBreaks = value => escapeHtml(value).replace(/\n/g, '<br>');
  const mobileBrowser = () => navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const fileName = title => `${String(title || '题库').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}-A4打印版.pdf`;

  function wrapText(value, maxWidth = 47) {
    const output = [];
    String(value || '').replace(/\r/g, '').split('\n').forEach(paragraph => {
      if (!paragraph) { output.push(''); return; }
      let line = '';
      let width = 0;
      for (const character of paragraph) {
        const characterWidth = /[\u0000-\u00ff]/.test(character) ? 0.55 : 1;
        if (line && width + characterWidth > maxWidth) {
          output.push(line);
          line = '';
          width = 0;
        }
        line += character;
        width += characterWidth;
      }
      if (line) output.push(line);
    });
    return output;
  }

  function buildPages({title, subtitle, questions}) {
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

    function addText(text, size = 10.5, gap = 15, maxWidth = 47) {
      wrapText(text, maxWidth).forEach(line => addLine(line, size, gap));
    }

    section = '题目';
    continuation = false;
    startPage();
    questions.forEach((item, index) => {
      const type = item.type ? `【${item.type}】` : '';
      addText(`${index + 1}. ${type}${item.question || ''}`, 10.5, 15);
      addLine('', 10.5, 7);
    });

    section = '参考答案';
    continuation = false;
    startPage();
    questions.forEach((item, index) => {
      addText(`${index + 1}. ${item.answer || '原文未提供参考答案。'}`, 10.5, 15);
      addLine('', 10.5, 7);
    });
    return pages;
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

  function openMobilePdf(options) {
    const viewer = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(new Blob([pdfBytes(options)], {type: 'application/pdf'}));
      if (viewer) {
        viewer.location.replace(url);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName(options.title);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (error) {
      viewer?.close();
      alert('PDF 生成失败，请稍后重试。');
      console.error(error);
    }
  }

  function openDesktopPrint({title, subtitle = '', questions = []}) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('浏览器拦截了打印窗口，请允许弹出窗口后重试。');
      return;
    }
    const questionRows = questions.map(item => `<li><span class="type">${escapeHtml(item.type || '')}</span>${withLineBreaks(item.question)}</li>`).join('');
    const answerRows = questions.map(item => `<li>${withLineBreaks(item.answer || '原文未提供参考答案。')}</li>`).join('');
    const documentTitle = `外院知识分享站 - ${title}`;
    printWindow.document.title = documentTitle;
    printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title><style>
      @page{size:A4;margin:15mm 14mm}*{box-sizing:border-box}body{margin:0;color:#1d2924;font:11pt/1.65 Georgia,"Times New Roman","Songti SC",serif}h1{margin:0 0 4mm;color:#1d5948;font:700 20pt/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}h2{margin:0 0 8mm;color:#d06f3d;font:700 9pt/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:1px}.subtitle{margin:0 0 8mm;padding-bottom:5mm;border-bottom:1px solid #cfdcd3;font-weight:700}.questions,.answers{margin:0;padding-left:7mm}.questions li,.answers li{padding:0 0 4mm 2mm;break-inside:avoid}.type{display:block;margin-bottom:1mm;color:#6a8175;font:700 8pt -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.answers{break-before:page}.answers-title{margin:0 0 7mm;padding-bottom:4mm;border-bottom:1px solid #cfdcd3;color:#1d5948;font:700 16pt/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.foot{margin-top:9mm;color:#718079;font:8pt -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h2>外院 · 知识分享站</h2><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="subtitle">${withLineBreaks(subtitle)}</p>` : ''}<ol class="questions">${questionRows}</ol><section class="answers"><h2 class="answers-title">参考答案</h2><ol>${answerRows}</ol></section><p class="foot">A4 打印版 · 可在系统打印窗口选择“另存为 PDF”或直接打印</p></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 250);
  }

  function open(options = {}) {
    const normalized = {...options, subtitle: options.subtitle || '', questions: options.questions || []};
    if (!normalized.questions.length) {
      alert('当前没有可导出的题目。');
      return;
    }
    if (mobileBrowser()) {
      openMobilePdf(normalized);
      return;
    }
    openDesktopPrint(normalized);
  }

  window.A4QuestionPrint = {open};
})();
