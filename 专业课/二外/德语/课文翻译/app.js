const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

(() => {
  const data = window.translationData;
  if (!data || !Array.isArray(data.sections)) throw new Error('课文数据不可用');
  const nav = document.querySelector('#section-nav');
  const root = document.querySelector('#sections');
  const sections = (data.sections || []).filter(section => (section.texts || []).length);
  const totalLines = sections.reduce((n, s) => n + (s.texts || []).reduce((m, t) => m + (t.items || []).length, 0), 0);
  document.querySelector('#status').textContent = `已载入 ${sections.length} 个单元 · ${totalLines} 句对照译文。`;
  nav.innerHTML = sections.map(section => `<a href="#ex-${escapeHtml(section.key)}">${escapeHtml(section.title)}</a>`).join('');

  const textBlock = (text, section) => {
    const lines = (text.items || []).map(item => `<article class="line" title="点击展开/隐藏中文"><div class="line-head"><span class="number">${item.number}.</span><span class="de">${escapeHtml(item.de)}</span></div><div class="zh">${escapeHtml(item.zh || '')}</div></article>`).join('');
    const note = text.verified === false ? '<p class="notice">本篇为 OCR 初稿，译文正在复核中，不代表最终发布版本。</p>' : '';
    return `<div class="text-block"><div class="text-head"><span class="badge">${escapeHtml(text.tag || 'TEXT')}</span><div><h3>${escapeHtml(text.name)}</h3><small>${(text.items || []).length} 句</small></div></div>${note}${lines}</div>`;
  };

  root.innerHTML = sections.map(section => {
    const texts = (section.texts || []).map(text => textBlock(text, section)).join('');
    const note = section.verified === false ? '<p class="notice">此单元正在进行 OCR/译文逐项复核，预览中保留原始识别结果，不作为最终发布版本。</p>' : '';
    return `<section class="exercise" id="ex-${escapeHtml(section.key)}"><div class="exercise-head"><span class="badge">${escapeHtml(section.title)}</span><div><h2>${escapeHtml(section.title)}</h2><small>${section.subtitle || ''}</small></div><button class="print-button" type="button" data-print="${escapeHtml(section.key)}">导出 A4 PDF</button></div>${note}${texts}</section>`;
  }).join('');

  // 中文译文显示/隐藏：全局开关 + 逐句手动切换
  const body = document.body;
  const zhToggle = document.querySelector('#zh-toggle');
  const STORAGE_KEY = 'waiyuan-translation-zh-v1';
  const setGlobalZh = hidden => {
    body.classList.toggle('zh-hidden', hidden);
    if (zhToggle) {
      zhToggle.textContent = hidden ? '显示中文' : '隐藏中文';
      zhToggle.setAttribute('aria-pressed', String(!hidden));
    }
  };
  try { if (localStorage.getItem(STORAGE_KEY) === 'hide') setGlobalZh(true); } catch (_) { /* 隐私模式下忽略 */ }
  zhToggle?.addEventListener('click', () => {
    const hidden = !body.classList.contains('zh-hidden');
    setGlobalZh(hidden);
    try { localStorage.setItem(STORAGE_KEY, hidden ? 'hide' : 'show'); } catch (_) { /* 忽略 */ }
  });
  root.addEventListener('click', event => {
    const line = event.target.closest('.line');
    if (!line) return;
    if (body.classList.contains('zh-hidden')) {
      line.classList.remove('zh-hide');
      line.classList.toggle('zh-show');
    } else {
      line.classList.remove('zh-show');
      line.classList.toggle('zh-hide');
    }
  });

  root.addEventListener('click', event => {
    const printButton = event.target.closest('[data-print]');
    if (!printButton) return;
    const section = sections.find(item => item.key === printButton.dataset.print);
    if (!section) return;
    const questions = [];
    for (const text of section.texts || []) for (const item of text.items || []) {
      questions.push({question: `${text.name} · ${item.number}. ${item.de}`, answer: item.zh || ''});
    }
    window.A4QuestionPrint?.open({
      title: `${section.title} · 课文翻译`,
      subtitle: section.subtitle || '德语原文与中文译文对照',
      questions,
    });
  });
})()
