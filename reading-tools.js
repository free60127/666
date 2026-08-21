(() => {
  if (window.__WAIYUAN_READING_TOOLS__) return;
  window.__WAIYUAN_READING_TOOLS__ = true;

  const STORAGE_KEY = 'waiyuan-web-font-size-v1';
  const VOCABULARY_STORAGE_KEY = 'waiyuan-vocabulary-progress-v1';
  const LOOKUP_STORAGE_KEY = 'waiyuan-lookup-words-v1';
  const levels = {small: .9, normal: 1, large: 1.15};
  const labels = {small: '小', normal: '标准', large: '大'};
  const body = document.body;
  const scriptUrl = document.currentScript?.src || location.href;
  const assetBaseUrl = new URL('.', scriptUrl);
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

  const themeButton = makeButton('🌙', '主题', '切换深色/浅色模式');
  const THEME_KEY = 'waiyuan-web-theme-v1';
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let theme = 'light';
  try { theme = localStorage.getItem(THEME_KEY) || (systemDark ? 'dark' : 'light'); } catch (e) { theme = systemDark ? 'dark' : 'light'; }
  const applyTheme = t => {
    theme = t;
    document.documentElement.dataset.theme = t;
    themeButton.textContent = t === 'dark' ? '☀️' : '🌙';
    themeButton.setAttribute('aria-label', t === 'dark' ? '切换到浅色模式' : '切换到深色模式');
  };
  applyTheme(theme);
  themeButton.addEventListener('click', () => {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  });
  tools.appendChild(themeButton);

  const topButton = makeButton('↑', '顶部', '回到顶部');
  topButton.classList.add('reading-tools__button--top');
  topButton.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));
  tools.appendChild(topButton);
  body.appendChild(tools);
  const lookup = buildLookupPanel();
  body.appendChild(lookup.panel);
  enhanceStaticOptions();
  setLevel(currentLevel);

  const updateTopButton = () => topButton.classList.toggle('is-visible', window.scrollY > 420);
  window.addEventListener('scroll', updateTopButton, {passive: true});
  updateTopButton();

  document.addEventListener('click', event => {
    if (!tools.contains(event.target)) {
      fontMenu.classList.remove('is-open');
      pdfMenu?.classList.remove('is-open');
    }
    const staticOption = event.target.closest?.('.options > div');
    if (isStaticOption(staticOption)) {
      selectStaticOption(staticOption);
      return;
    }
    if (!lookup.panel.contains(event.target) && !isLookupControl(event.target)) {
      const token = tokenAtPoint(event.clientX, event.clientY, event.target);
      if (token) showLookup(token);
    }
  });

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key) || !isStaticOption(event.target)) return;
    event.preventDefault();
    selectStaticOption(event.target);
  });

  lookup.panel.addEventListener('click', event => {
    const action = event.target.closest('[data-lookup-action]')?.dataset.lookupAction;
    if (action === 'close') closeLookup();
    if (action === 'favorite') toggleLookupFavorite();
    if (action === 'speak') speakLookupWord();
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

  let dictionaryPromise = null;
  let dictionaryIndex = null;
  let activeLookup = null;

  function buildLookupPanel() {
    const panel = document.createElement('div');
    panel.className = 'word-lookup';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = '<button class="word-lookup__backdrop" type="button" data-lookup-action="close" aria-label="关闭查词"></button><section class="word-lookup__sheet" role="dialog" aria-modal="true" aria-labelledby="word-lookup-title"><header><div><small id="word-lookup-language">DICTIONARY</small><h2 id="word-lookup-title">查词</h2></div><button type="button" data-lookup-action="close" aria-label="关闭">×</button></header><div id="word-lookup-content" class="word-lookup__content"></div></section>';
    return {
      panel,
      language: panel.querySelector('#word-lookup-language'),
      title: panel.querySelector('#word-lookup-title'),
      content: panel.querySelector('#word-lookup-content'),
    };
  }

  function isLookupControl(target) {
    return !target || target.closest('.reading-tools,.word-lookup,a,button,input,textarea,select,option,summary,label,.options,.option,.choice,[data-action],[data-index],[contenteditable],[data-no-dictionary]');
  }

  function isStaticOption(option) {
    return !!option && option.parentElement?.classList.contains('options') && !option.matches('.option,.choice,[data-action],[data-index]');
  }

  function enhanceStaticOptions() {
    document.querySelectorAll('.options > div').forEach(option => {
      if (!isStaticOption(option)) return;
      option.setAttribute('role', 'button');
      option.setAttribute('tabindex', '0');
      option.setAttribute('aria-pressed', 'false');
    });
  }

  function selectStaticOption(option) {
    const container = option.parentElement;
    const options = [...container.children].filter(isStaticOption);
    const answerText = container.closest('article,.question-card')?.querySelector('.answer p,.answer')?.textContent || '';
    const correctLetters = (answerText.match(/(?:正确答案|参考答案|答案)\s*[：:]\s*([A-Z]+)/i)?.[1] || '').toUpperCase().split('');
    const selectedLetter = (option.querySelector('strong')?.textContent.match(/[A-Z]/i)?.[0] || '').toUpperCase();
    options.forEach(item => {
      item.classList.remove('is-selected', 'is-correct', 'is-wrong');
      item.setAttribute('aria-pressed', 'false');
      const letter = (item.querySelector('strong')?.textContent.match(/[A-Z]/i)?.[0] || '').toUpperCase();
      if (correctLetters.includes(letter)) item.classList.add('is-correct');
    });
    option.classList.add('is-selected');
    option.setAttribute('aria-pressed', 'true');
    if (correctLetters.length && !correctLetters.includes(selectedLetter)) option.classList.add('is-wrong');
  }

  function tokenAtPoint(x, y, target) {
    if (isLookupControl(target)) return null;
    let node;
    let offset;
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      node = position?.offsetNode;
      offset = position?.offset;
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      node = range?.startContainer;
      offset = range?.startOffset;
    }
    if (!node || node.nodeType !== Node.TEXT_NODE || !node.nodeValue?.trim()) return null;
    const source = node.nodeValue;
    const safeOffset = Math.max(0, Math.min(Number(offset) || 0, source.length));
    const charIndex = safeOffset === source.length || !isForeignCharacter(source[safeOffset]) ? safeOffset - 1 : safeOffset;
    if (charIndex < 0 || !isForeignCharacter(source[charIndex])) return null;
    const language = detectCharacterLanguage(source[charIndex], source);
    const segment = language === 'ja' ? japaneseSegment(source, charIndex) : boundedToken(source, charIndex, language);
    if (!segment || !segment.word || segment.word.length > 64) return null;
    const word = cleanToken(segment.word, language);
    if (!word || (language !== 'ja' && !/[\p{L}]{2,}/u.test(word))) return null;
    return {word, language, context: extractContext(source, segment.start, segment.end)};
  }

  function isForeignCharacter(char) {
    return !!char && /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž\u0400-\u052F\u3040-\u30ff々〆ヶ'’-]/u.test(char);
  }

  function detectCharacterLanguage(char, source) {
    // Decide by the clicked character only. Checking the whole text node for
    // kana used to misclassify every English word on Japanese-material pages
    // as Japanese (the node contains kana somewhere), breaking lookups.
    if (/[\u0400-\u052F]/u.test(char)) return 'ru';
    if (/[\u3040-\u30ff々〆ヶ]/u.test(char)) return 'ja';
    return 'en';
  }

  function boundedToken(source, index, language) {
    const matcher = language === 'ru' ? /[\u0400-\u052F'’-]/u : /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’-]/u;
    let start = index;
    let end = index + 1;
    while (start > 0 && matcher.test(source[start - 1])) start -= 1;
    while (end < source.length && matcher.test(source[end])) end += 1;
    return {word: source.slice(start, end), start, end};
  }

  function japaneseSegment(source, index) {
    if (typeof Intl.Segmenter === 'function') {
      const segments = new Intl.Segmenter('ja', {granularity: 'word'}).segment(source);
      for (const segment of segments) {
        const end = segment.index + segment.segment.length;
        if (segment.isWordLike && segment.index <= index && index < end) {
          return {word: segment.segment, start: segment.index, end};
        }
      }
    }
    let start = index;
    let end = index + 1;
    const matcher = /[\u3040-\u30ff\u3400-\u9fff々〆ヶ]/u;
    while (start > 0 && matcher.test(source[start - 1])) start -= 1;
    while (end < source.length && matcher.test(source[end])) end += 1;
    return {word: source.slice(start, end), start, end};
  }

  function cleanToken(word, language) {
    let value = word.replace(/^[\-'’]+|[\-'’]+$/g, '');
    if (language === 'en') value = value.replace(/[’']s$/i, '');
    return value;
  }

  function extractContext(source, start, end) {
    const left = Math.max(source.lastIndexOf('.', start - 1), source.lastIndexOf('!', start - 1), source.lastIndexOf('?', start - 1), source.lastIndexOf('。', start - 1), source.lastIndexOf('！', start - 1), source.lastIndexOf('？', start - 1));
    const endings = ['.', '!', '?', '。', '！', '？'].map(mark => source.indexOf(mark, end)).filter(position => position >= 0);
    const right = endings.length ? Math.min(...endings) + 1 : source.length;
    return source.slice(Math.max(left + 1, start - 90), Math.min(right, end + 90)).trim();
  }

  async function showLookup(token) {
    activeLookup = {...token, entry: null};
    lookup.language.textContent = languageLabel(token.language);
    lookup.title.textContent = token.word;
    lookup.content.innerHTML = '<div class="word-lookup__loading">正在查询本地词典...</div>';
    lookup.panel.classList.add('is-open');
    lookup.panel.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('word-lookup-open');
    const entry = token.language === 'en' ? await findEnglishEntry(token.word) : null;
    if (!activeLookup || activeLookup.word !== token.word) return;
    activeLookup.entry = entry;
    renderLookupResult();
  }

  function closeLookup() {
    lookup.panel.classList.remove('is-open');
    lookup.panel.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('word-lookup-open');
    activeLookup = null;
  }

  function languageLabel(language) {
    return ({en: 'ENGLISH', ru: 'RUSSIAN', ja: 'JAPANESE', de: 'GERMAN', fr: 'FRENCH'})[language] || 'DICTIONARY';
  }

  async function findEnglishEntry(word) {
    const index = await loadDictionary();
    const normalized = word.toLocaleLowerCase('en');
    if (index.has(normalized)) return index.get(normalized);
    for (const candidate of englishBaseCandidates(normalized)) {
      if (index.has(candidate)) return index.get(candidate);
    }
    return null;
  }

  function englishBaseCandidates(word) {
    const candidates = [];
    if (word.endsWith('ies') && word.length > 4) candidates.push(`${word.slice(0, -3)}y`);
    if (word.endsWith('ing') && word.length > 5) candidates.push(word.slice(0, -3), `${word.slice(0, -3)}e`, word.slice(0, -4));
    if (word.endsWith('ed') && word.length > 4) candidates.push(word.slice(0, -2), `${word.slice(0, -1)}`);
    if (word.endsWith('es') && word.length > 3) candidates.push(word.slice(0, -2), word.slice(0, -1));
    if (word.endsWith('s') && word.length > 3) candidates.push(word.slice(0, -1));
    return [...new Set(candidates)];
  }

  function loadDictionary() {
    if (dictionaryIndex) return Promise.resolve(dictionaryIndex);
    if (dictionaryPromise) return dictionaryPromise;
    dictionaryPromise = new Promise(resolve => {
      const finish = () => {
        dictionaryIndex = new Map();
        const lookupEntries = (window.WAIYUAN_ENGLISH_LOOKUP || []).map(item => {
          const entry = {word: item[0], phonetic: item[1], meaning: item[2], definition: item[3], exchange: item[4], source: 'ECDICT'};
          dictionaryIndex.set(entry.word.toLocaleLowerCase('en'), entry);
          return entry;
        });
        const studyEntries = [];
        // 词书补充条目：只取已按需加载的词书（背单词页拆分产物）。
        // 其他页面不再回退拉取 4.88MB 整包——ECDICT 词典已覆盖大部分词汇。
        (window.WAIYUAN_VOCABULARY_BOOKS || []).forEach(book => {
          (book.words || []).forEach(entry => {
            const record = {...entry, bookKey: book.key};
            dictionaryIndex.set(entry.word.toLocaleLowerCase('en'), record);
            studyEntries.push(record);
          });
        });
        [...studyEntries, ...lookupEntries].forEach(entry => {
          String(entry.exchange || '').split('/').forEach(part => {
            const form = part.slice(part.indexOf(':') + 1).trim().toLocaleLowerCase('en');
            if (form && !dictionaryIndex.has(form)) dictionaryIndex.set(form, entry);
          });
        });
        resolve(dictionaryIndex);
      };
      const loadScript = source => new Promise(done => {
        const script = document.createElement('script');
        script.src = new URL(source, assetBaseUrl).href;
        script.onload = done;
        script.onerror = () => { console.warn(`[reading-tools] 词典资源加载失败：${source}`); done(); };
        document.head.appendChild(script);
      });
      const pending = [];
      if (!window.WAIYUAN_ENGLISH_LOOKUP) pending.push(loadScript('dictionary/english-lookup-data.js?v=20260821-2030'));
      Promise.all(pending).then(finish);
    });
    return dictionaryPromise;
  }

  function renderLookupResult() {
    if (!activeLookup) return;
    const {word, language, context, entry} = activeLookup;
    const saved = isLookupFavorite(activeLookup);
    const actions = `<div class="word-lookup__actions"><button type="button" data-lookup-action="favorite" class="${saved ? 'is-saved' : ''}">${saved ? '已加入生词' : '加入生词'}</button>${language === 'en' ? '<button type="button" data-lookup-action="speak">朗读</button>' : ''}</div>`;
    if (entry) {
      lookup.content.innerHTML = `<p class="word-lookup__phonetic">${escapeHtml(entry.phonetic || '')}</p><p class="word-lookup__meaning">${escapeHtml(entry.meaning || '暂无中文释义')}</p>${entry.definition ? `<details><summary>英文释义</summary><p>${escapeHtml(entry.definition)}</p></details>` : ''}${context ? `<div class="word-lookup__context"><small>当前语境</small><p>${escapeHtml(context)}</p></div>` : ''}${actions}<p class="word-lookup__source">本地词典 · ECDICT 精简词库</p>`;
      return;
    }
    const pending = language === 'en' ? '当前专四精简词库暂未收录该词。' : '该语种词典适配已启用，精简词典数据将在下一阶段导入。';
    lookup.content.innerHTML = `<p class="word-lookup__missing">${pending}</p>${context ? `<div class="word-lookup__context"><small>当前语境</small><p>${escapeHtml(context)}</p></div>` : ''}${actions}`;
  }

  function lookupFavoriteKey(token) {
    if (token.entry?.id && token.entry?.bookKey) return `${token.entry.bookKey}:${token.entry.id}`;
    return `${token.language}:${token.word.toLocaleLowerCase()}`;
  }

  function isLookupFavorite(token) {
    try {
      if (token.entry?.id && token.entry?.bookKey) {
        const progress = JSON.parse(localStorage.getItem(VOCABULARY_STORAGE_KEY)) || {};
        return !!progress.words?.[lookupFavoriteKey(token)]?.favorite;
      }
      const saved = JSON.parse(localStorage.getItem(LOOKUP_STORAGE_KEY)) || {};
      return !!saved[lookupFavoriteKey(token)];
    } catch (_) {
      return false;
    }
  }

  function toggleLookupFavorite() {
    if (!activeLookup) return;
    const key = lookupFavoriteKey(activeLookup);
    try {
      if (activeLookup.entry?.id && activeLookup.entry?.bookKey) {
        const progress = JSON.parse(localStorage.getItem(VOCABULARY_STORAGE_KEY)) || {};
        if (!progress.words) progress.words = {};
        const current = progress.words[key] || {reps: 0, interval: 0, lapses: 0, due: new Date().toISOString().slice(0, 10)};
        progress.words[key] = {...current, favorite: !current.favorite};
        localStorage.setItem(VOCABULARY_STORAGE_KEY, JSON.stringify(progress));
      } else {
        const saved = JSON.parse(localStorage.getItem(LOOKUP_STORAGE_KEY)) || {};
        if (saved[key]) delete saved[key];
        else saved[key] = {word: activeLookup.word, language: activeLookup.language, context: activeLookup.context, savedAt: new Date().toISOString()};
        localStorage.setItem(LOOKUP_STORAGE_KEY, JSON.stringify(saved));
      }
      renderLookupResult();
    } catch (_) {}
  }

  function speakLookupWord() {
    if (!activeLookup || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(activeLookup.entry?.word || activeLookup.word);
    utterance.lang = activeLookup.language === 'en' ? 'en-US' : activeLookup.language;
    utterance.rate = .86;
    // iOS 默认语音可能不发声：英文词显式挑选英文语音（优先常见英文名，兜底任意 en）
    if (utterance.lang === 'en-US') {
      try {
        const voices = speechSynthesis.getVoices() || [];
        utterance.voice = voices.find(v => /en[-_]us/i.test(v.lang) && /samantha|google us english|microsoft/i.test(v.name || ''))
          || voices.find(v => /^en/i.test(v.lang)) || null;
      } catch (_) {}
    }
    speechSynthesis.speak(utterance);
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
      option.innerHTML = `<b>${escapeHtml(bookTitle)} · 整本书</b><span>${count} 个作答项，包含本书全部单元</span>`;
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
        subtitle: `整本书 · 共 ${questions.length} 个作答项`,
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
