/* ============================================================
   题库数据校验（Node + 浏览器双端共用，无依赖）
   校验规则：
   - 题型白名单（按题库目标配置）
   - title 非空
   - single/multi/choice 必须有 ≥2 个选项
   - answer：字母型（single/multi/choice）必须指向有效选项；多选去重
   - 重复检测：同 type+title 视为重复
   导出：Node 用 module.exports，浏览器用 window.QuizSchema。
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuizSchema = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TYPES = {
    quiz: ['single', 'multi', 'short', 'essay', 'material', 'theory'],   // 思政/计算机
    content: ['choice', 'text'],                                          // 泛读/基英
  };
  const LETTER = /^[A-Z]+$/i;   // 答案字母上限 A-Z；实际范围按 options.length 动态校验
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim();

  function normalizeOptions(options) {
    if (Array.isArray(options)) return options.map(o => clean(o)).filter(Boolean);
    if (typeof options === 'string') return options.split(/[|｜]/).map(o => clean(o)).filter(Boolean);
    return [];
  }

  // 单题校验 → 错误数组
  function validateQuestion(q, allowedTypes, index) {
    const errors = [];
    const at = index == null ? '' : `（第 ${index + 1} 题）`;
    if (!q || typeof q !== 'object') { errors.push(`题目为空${at}`); return errors; }
    const type = String(q.type || '').trim().toLowerCase();
    if (!allowedTypes.includes(type)) errors.push(`题型 "${q.type}" 不在白名单 [${allowedTypes.join('/')}] 内${at}`);
    const title = clean(q.title || q.q || '');
    if (!title) errors.push(`题干为空${at}`);
    const options = normalizeOptions(q.options);
    if (['single', 'multi', 'choice'].includes(type) && options.length < 2) errors.push(`${type} 题选项不足 2 个${at}`);
    const answer = clean(q.answer);
    if (!answer) { errors.push(`答案为空${at}`); return errors; }
    if (['single', 'multi', 'choice'].includes(type)) {
      // 答案字母：支持 A-Z；"A or D" 型（二选一均可）拆为两个合法字母；
      // 具体上限由 options.length 决定（如 6 选项可答 A-F）。
      const or = String(answer).match(/^([A-Z])\s+or\s+([A-Z])$/i);
      const letters = or ? [or[1].toUpperCase(), or[2].toUpperCase()] : (String(answer).match(/[A-Z]/g) || []);
      if (!letters.length) {
        errors.push(`${type} 题答案应使用字母（如 C、CD 或 A or D），当前："${answer}"${at}`);
      } else {
        const maxIndex = options.length;
        const bad = letters.filter(l => l.charCodeAt(0) - 65 >= maxIndex);
        if (bad.length) errors.push(`答案 ${bad.join('')} 超出选项范围（共 ${options.length} 项）${at}`);
        if (type === 'single' && letters.length > 1 && !or) errors.push(`单选答案含多个字母：${answer}${at}`);
      }
    }
    return errors;
  }

  // 批量校验 → {errors: [{index, messages[]}], stats}
  function validateList(questions, target) {
    const allowedTypes = TYPES[target] || TYPES.quiz;
    const errors = [];
    const stats = { total: questions.length, byType: {} };
    const seen = new Map();
    const duplicates = [];
    questions.forEach((q, index) => {
      const type = String(q && q.type || '').trim().toLowerCase();
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      const errs = validateQuestion(q, allowedTypes, index);
      if (errs.length) errors.push({ index, messages: errs });
      const title = clean(q && (q.title || q.q));
      if (title) {
        const key = `${type}::${title}`;
        if (seen.has(key)) duplicates.push({ index, sameAs: seen.get(key), type, title });
        else seen.set(key, index);
      }
    });
    return { errors, duplicates, stats };
  }

  // 合并去重：返回 [合并后的数组, 丢弃的重复数]
  function mergeUnique(existing, incoming) {
    const seen = new Set(existing.map(q => `${String(q.type || '')}::${clean(q.title || q.q)}`));
    const merged = existing.slice();
    let dropped = 0;
    for (const q of incoming) {
      const key = `${String(q.type || '')}::${clean(q.title || q.q)}`;
      if (seen.has(key)) { dropped++; continue; }
      seen.add(key);
      merged.push(q);
    }
    return { merged, dropped };
  }

  // 自动编号：按 type 递增 id（保持已有 id 不变）
  function assignIds(questions) {
    const counters = {};
    return questions.map(q => {
      const type = String(q.type || 'other');
      counters[type] = (counters[type] || 0) + 1;
      return { ...q, id: counters[type] };
    });
  }

  return { TYPES, normalizeOptions, validateQuestion, validateList, mergeUnique, assignIds, clean };
});
