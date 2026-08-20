const data = window.REWRITE_SENTENCE_DATA;
const filters = document.getElementById('filters');
const sectionNav = document.getElementById('section-nav');
const status = document.getElementById('status');
const exercisesNode = document.getElementById('exercises');
let activeKind = 'all';

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {all: '全部练习', combine: '多句合一', rewrite: '指定方式改写'};

function render() {
  const list = (data?.exercises || []).filter(item => activeKind === 'all' || item.kind === activeKind);
  filters.innerHTML = Object.entries(labels).map(([kind, label]) => `<button class="${activeKind === kind ? 'active' : ''}" data-kind="${kind}">${label}</button>`).join('');
  sectionNav.innerHTML = list.map(item => `<button data-section="${escapeHtml(item.id)}">${escapeHtml(item.title.replace('EXERCISE ', ''))}</button>`).join('');
  status.textContent = list.length ? `已载入 ${list.length} 节 EXERCISE · ${list.reduce((total, item) => total + item.questions.length, 0)} 道题 · 每题均可展开官方参考答案` : '暂无可显示的练习。';
  exercisesNode.innerHTML = list.map(item => `<article class="exercise" id="${escapeHtml(item.id)}">
    <header class="exercise-head">
      <div class="exercise-top"><p class="exercise-label">${escapeHtml(item.title)}</p><span class="kind ${item.kind}">${labels[item.kind]}</span></div>
      <p class="instruction">${escapeHtml(item.instruction)}</p>
      <button class="print-button" data-print="${escapeHtml(item.id)}">导出 A4 PDF / 打印</button>
    </header>
    <ol class="questions">${item.questions.map(question => `<li><p class="question-text">${escapeHtml(question.text)}</p><details class="answer"><summary>查看参考答案</summary><p>${escapeHtml(question.answer)}</p></details></li>`).join('')}</ol>
  </article>`).join('');
}

filters.addEventListener('click', event => {
  const button = event.target.closest('[data-kind]');
  if (!button) return;
  activeKind = button.dataset.kind;
  render();
});

sectionNav.addEventListener('click', event => {
  const button = event.target.closest('[data-section]');
  if (!button) return;
  document.getElementById(button.dataset.section)?.scrollIntoView({behavior:'smooth', block:'start'});
});

exercisesNode.addEventListener('click', event => {
  const button = event.target.closest('[data-print]');
  if (!button) return;
  const item = (data?.exercises || []).find(exercise => exercise.id === button.dataset.print);
  if (item) window.A4QuestionPrint?.open({
    title: `改写句子 · ${item.title}`,
    subtitle: item.instruction,
    questions: item.questions.map(question => ({question: question.text, answer: question.answer})),
  });
});

// 回到顶部由全局悬浮工具栏提供，页面内按钮已移除
render();
