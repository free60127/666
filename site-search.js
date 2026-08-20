(() => {
  const data = Array.isArray(window.WAIYUAN_SITE_SEARCH) ? window.WAIYUAN_SITE_SEARCH : [];
  const form = document.getElementById('site-search-form');
  const input = document.getElementById('site-search-input');
  const clear = document.getElementById('site-search-clear');
  const results = document.getElementById('site-search-results');
  const status = document.getElementById('site-search-status');
  if (!form || !input || !clear || !results || !status) return;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => String(value || '').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();

  function render() {
    const query = normalize(input.value);
    clear.hidden = !query;
    if (!query) {
      results.innerHTML = '';
      status.textContent = '';
      return;
    }
    const matches = data.filter(item => normalize(`${item.title} ${item.category} ${item.keywords} ${item.description}`).includes(query));
    status.textContent = matches.length ? `找到 ${matches.length} 个结果` : '没有找到匹配的资料';
    results.innerHTML = matches.map(item => `<a class="search-result" href="${escape(item.path)}"><span>${escape(item.category)}</span><strong>${escape(item.title)}</strong><small>${escape(item.description)}</small><b>进入 ›</b></a>`).join('');
  }

  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  input.addEventListener('input', render);
  clear.addEventListener('click', () => { input.value = ''; input.focus(); render(); });
})();
