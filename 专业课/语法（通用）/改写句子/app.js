const data = window.REWRITE_SENTENCE_DATA;
const filters = document.getElementById('filters');
const sectionNav = document.getElementById('section-nav');
const status = document.getElementById('status');
const exercisesNode = document.getElementById('exercises');
const backToTop = document.getElementById('back-to-top');
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

window.addEventListener('scroll', () => backToTop.classList.toggle('show', window.scrollY > 400), {passive:true});
backToTop.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
render();
