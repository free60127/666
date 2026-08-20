const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

(() => {
  const data = window.translationData;
  if (!data || !Array.isArray(data.sections)) throw new Error('题库数据不可用');
  const nav = document.querySelector('#section-nav');
  const root = document.querySelector('#sections');
  const sections = (data.sections || []).filter(section => section.verified !== false);
  document.querySelector('#status').textContent = `已载入 ${sections.length} 个 EXERCISE 小标题。`;
  nav.innerHTML = sections.map(section => `<a href="#ex-${escapeHtml(section.title)}">${escapeHtml(section.title)}</a>`).join('');
  root.innerHTML = sections.map(section => {
    const items = (section.items || []).map(item => `<article class="question"><div class="prompt"><span class="number">${item.number}.</span><span>${escapeHtml(item.question)}</span></div><button class="answer-toggle" type="button">查看参考译文</button><div class="answer">${escapeHtml(item.answer || '该题参考译文仍在复核。')}</div></article>`).join('');
    const note = section.verified ? '' : '<p class="notice">此节正在进行 OCR/答案逐项复核，预览中保留原始识别结果，不作为最终发布版本。</p>';
    return `<section class="exercise" id="ex-${escapeHtml(section.title)}"><div class="exercise-head"><span class="badge">${escapeHtml(section.title)}</span><div><h2>EXERCISE ${escapeHtml(section.title)}</h2><small>${section.items.length} 题</small></div><button class="print-button" type="button" data-print="${escapeHtml(section.title)}">导出 A4 PDF</button></div>${note}${items}</section>`;
  }).join('');
  root.addEventListener('click', event => {
    const printButton = event.target.closest('[data-print]');
    if (printButton) {
      const section = sections.find(item => item.title === printButton.dataset.print);
      if (section) window.A4QuestionPrint?.open({
        title: `翻译句子 · EXERCISE ${section.title}`,
        subtitle: '中译英练习 · 官方参考译文',
        questions: section.items.map(item => ({question: item.question, answer: item.answer || '该题参考译文仍在复核。'})),
      });
      return;
    }
    if(!event.target.matches('.answer-toggle')) return;
    const answer = event.target.nextElementSibling;
    answer.classList.toggle('show');
    event.target.textContent = answer.classList.contains('show') ? '收起参考译文' : '查看参考译文';
  });
})()

const backToTop = document.querySelector('#back-to-top');
window.addEventListener('scroll', () => backToTop.classList.toggle('show', window.scrollY > 420), {passive:true});
backToTop.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
