(() => {
  if (window.__WAIYUAN_READING_TOOLS__) return;
  window.__WAIYUAN_READING_TOOLS__ = true;

  const STORAGE_KEY = 'waiyuan-web-font-size-v1';
  const levels = {small: .9, normal: 1, large: 1.15};
  const labels = {small: '小', normal: '标准', large: '大'};
  const body = document.body;
  if (!body || body.dataset.readingTools === 'off') return;
  body.classList.add('reading-tools-enabled');

  const tools = document.createElement('aside');
  tools.className = 'reading-tools';
  tools.setAttribute('aria-label', '阅读工具');
  let pdfMenu = null;

  const fontMenu = document.createElement('div');
  fontMenu.className = 'reading-tools__font-menu';
  const fontButton = makeButton('A', '字号', '调节字体大小');
  let currentLevel = readLevel();

  Object.keys(levels).forEach(level => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'reading-tools__font-option';
    option.dataset.level = level;
    option.innerHTML = `<b style="--sample-size:${level === 'small' ? 15 : level === 'large' ? 23 : 19}px">A</b><span>${labels[level]}</span>`;
    option.addEventListener('click', () => {
      setLevel(level);
      fontMenu.classList.remove('is-open');
    });
    fontMenu.appendChild(option);
  });

  fontButton.addEventListener('click', () => fontMenu.classList.toggle('is-open'));
  tools.append(fontMenu, fontButton);

  if (body.dataset.readingPdf === 'true') {
    const pdfButton = makeButton('PDF', '下载', '下载当前题库 PDF');
    pdfButton.classList.add('reading-tools__button--pdf');
    const books = [...document.querySelectorAll('main > section[id^="book-"]')]
      .filter(book => book.querySelector('article .q'));
    if (books.length > 1) {
      pdfMenu = buildPdfMenu(books);
      pdfButton.setAttribute('aria-label', '选择按单元或按整本书下载 PDF');
      pdfButton.addEventListener('click', () => {
        fontMenu.classList.remove('is-open');
        pdfMenu.classList.toggle('is-open');
      });
      tools.appendChild(pdfMenu);
    } else {
      pdfButton.addEventListener('click', () => exportPdf());
    }
    tools.appendChild(pdfButton);
  }

  const topButton = makeButton('↑', '顶部', '回到顶部');
  topButton.classList.add('reading-tools__button--top');
  topButton.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));
  tools.appendChild(topButton);
  body.appendChild(tools);
  setLevel(currentLevel);

  const updateTopButton = () => topButton.classList.toggle('is-visible', window.scrollY > 420);
  window.addEventListener('scroll', updateTopButton, {passive: true});
  updateTopButton();

  document.addEventListener('click', event => {
    if (!tools.contains(event.target)) {
      fontMenu.classList.remove('is-open');
      pdfMenu?.classList.remove('is-open');
    }
  });

  function makeButton(primary, secondary, ariaLabel) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reading-tools__button';
    button.setAttribute('aria-label', ariaLabel);
    button.innerHTML = `<strong>${primary}</strong><span>${secondary}</span>`;
    return button;
  }

  function readLevel() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return Object.prototype.hasOwnProperty.call(levels, saved) ? saved : 'normal';
    } catch (_) {
      return 'normal';
    }
  }

  function setLevel(level) {
    if (!Object.prototype.hasOwnProperty.call(levels, level)) return;
    currentLevel = level;
    document.documentElement.style.setProperty('--reading-scale', levels[level]);
    fontMenu.querySelectorAll('[data-level]').forEach(option => option.classList.toggle('is-active', option.dataset.level === level));
    try { localStorage.setItem(STORAGE_KEY, level); } catch (_) {}
  }

  function buildPdfMenu(books) {
    const menu = document.createElement('div');
    menu.className = 'reading-tools__pdf-menu';
    const heading = document.createElement('strong');
    heading.className = 'reading-tools__pdf-title';
    heading.textContent = '选择 PDF 范围';
    menu.appendChild(heading);

    const openedButton = document.createElement('button');
    openedButton.type = 'button';
    openedButton.className = 'reading-tools__pdf-option reading-tools__pdf-option--opened';
    openedButton.innerHTML = '<b>已展开单元</b><span>导出当前展开的一个或多个 Unit</span>';
    openedButton.addEventListener('click', () => {
      menu.classList.remove('is-open');
      exportPdf();
    });
    menu.appendChild(openedButton);

    books.forEach(book => {
      const bookTitle = book.querySelector(':scope > h2')?.textContent?.trim() || book.id;
      const count = book.querySelectorAll('article .q').length;
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'reading-tools__pdf-option';
      option.innerHTML = `<b>${escapeHtml(bookTitle)} · 整本书</b><span>${count} 题，包含本书全部单元</span>`;
      option.addEventListener('click', () => {
        menu.classList.remove('is-open');
        exportPdf(book, bookTitle);
      });
      menu.appendChild(option);
    });
    return menu;
  }

  function exportPdf(book = null, bookTitle = '') {
    if (book) {
      const questions = extractQuestions(book);
      openPdf({
        title: `${document.title.replace(/\s*[·|｜].*$/, '')} · ${bookTitle}`,
        subtitle: `整本书 · 共 ${questions.length} 题`,
        questions,
      });
      return;
    }
    const openedUnits = [...document.querySelectorAll('details[open]')]
      .filter(item => item.querySelector('article .q'));
    const scopes = openedUnits.length ? openedUnits : [document];
    const questions = scopes.flatMap(scope => extractQuestions(scope));
    if (!questions.length) {
      alert('当前页面没有识别到可导出的题目。');
      return;
    }
    if (!openedUnits.length && questions.length > 250) {
      alert(`当前题库共有 ${questions.length} 题。为避免手机生成超大文件，请先展开需要的一个或多个 Unit，再点击“PDF 下载”。`);
      return;
    }
    const firstUnit = openedUnits[0]?.querySelector(':scope > summary')?.textContent?.trim();
    const title = firstUnit ? `${document.title.replace(/\s*[·|｜].*$/, '')} · ${firstUnit}` : document.title;
    openPdf({title, subtitle: openedUnits.length ? `已展开 ${openedUnits.length} 个单元` : '当前题库', questions});
  }

  function openPdf(options) {
    if (window.A4QuestionPrint?.open) return window.A4QuestionPrint.open(options);
    window.print();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  }

  function extractQuestions(scope) {
    return [...scope.querySelectorAll('article')].map(article => {
      const questionNode = article.querySelector('.q pre, .q .question, .question');
      if (!questionNode) return null;
      const options = [...article.querySelectorAll('.options > div, .options .option')]
        .map(item => item.textContent.replace(/^\s*[A-Z][.．、]\s*/, '').trim())
        .filter(Boolean);
      const answerNode = article.querySelector('.answer p, .answer');
      const moduleTitle = article.closest('.exercise-module')?.querySelector('h3, .exercise-module-title')?.textContent?.trim() || '';
      return {
        type: moduleTitle,
        question: questionNode.textContent.trim(),
        options,
        answer: answerNode?.textContent?.trim() || '原文未提供参考答案。',
      };
    }).filter(Boolean);
  }
})();
