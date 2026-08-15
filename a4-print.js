(() => {
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const withLineBreaks = value => escapeHtml(value).replace(/\n/g, '<br>');

  function open({title, subtitle = '', questions = []}) {
    if (!questions.length) {
      alert('当前没有可导出的题目。');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('浏览器拦截了打印窗口，请允许弹出窗口后重试。');
      return;
    }
    const questionRows = questions.map((item, index) => `<li><span class="type">${escapeHtml(item.type || '')}</span>${withLineBreaks(item.question)}</li>`).join('');
    const answerRows = questions.map((item, index) => `<li>${withLineBreaks(item.answer || '原文未提供参考答案。')}</li>`).join('');
    const documentTitle = `外院知识分享站 - ${title}`;
    printWindow.document.title = documentTitle;
    printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title><style>
      @page{size:A4;margin:15mm 14mm}*{box-sizing:border-box}body{margin:0;color:#1d2924;font:11pt/1.65 Georgia,"Times New Roman","Songti SC",serif}h1{margin:0 0 4mm;color:#1d5948;font:700 20pt/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}h2{margin:0 0 8mm;color:#d06f3d;font:700 9pt/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:1px}.subtitle{margin:0 0 8mm;padding-bottom:5mm;border-bottom:1px solid #cfdcd3;font-weight:700}.questions,.answers{margin:0;padding-left:7mm}.questions li,.answers li{padding:0 0 4mm 2mm;break-inside:avoid}.type{display:block;margin-bottom:1mm;color:#6a8175;font:700 8pt -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.answers{break-before:page}.answers-title{margin:0 0 7mm;padding-bottom:4mm;border-bottom:1px solid #cfdcd3;color:#1d5948;font:700 16pt/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.foot{margin-top:9mm;color:#718079;font:8pt -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h2>外院 · 知识分享站</h2><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="subtitle">${withLineBreaks(subtitle)}</p>` : ''}<ol class="questions">${questionRows}</ol><section class="answers"><h2 class="answers-title">参考答案</h2><ol>${answerRows}</ol></section><p class="foot">A4 打印版 · 可在系统打印窗口选择“另存为 PDF”或直接打印</p></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 250);
  }

  window.A4QuestionPrint = {open};
})();
