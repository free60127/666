export function createDetail({ $, STATUS, esc, fmtTime, toast, openModal, closeModal, api, apiBlob,
  registerObjectUrl, revokeAllObjectUrls, revokeContainerUrls, getMe, openAuthModal, loadList, setShareTask }) {
  let detailSeq = 0;
  let currentReviewTask = null;
  let currentDisputeTask = null;
  let disputeImages = [];
  let reviewRating = 5;

  async function openDetail(id) {
    const seq = ++detailSeq;
    revokeAllObjectUrls(); // 详情整体重渲染：旧证据 objectURL 全部销毁（2026-08-23 审查第 2 轮第 4 项）
    const bodyEl = $('detail-body');
    bodyEl.innerHTML = '<div class="loading">加载中…</div>';
    openModal('detail-modal');
    try {
      const data = await api('/api/errand/tasks/' + id);
      if (seq !== detailSeq) return; // 已被更新的详情请求取代
      renderDetail(data.task, seq);
    } catch (e) {
      if (seq !== detailSeq) return;
      bodyEl.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    }
  }

  function renderDetail(t, seq) {
    seq = seq || detailSeq;
    setShareTask(t);
    const bodyEl = $('detail-body');
    const st = STATUS[t.status] || ['未知', ''];
    const me = getMe();
    const isPublisher = me && me.id && t.publisherId === me.id;
    const isTaker = me && me.id && t.takerId === me.id;
    const expired = t.status === 'open' && t.deadline && t.deadline < Date.now();
    let actions = '';
    if (t.status === 'open') {
      if (expired) actions += '<span class="muted">⏰ 任务已过期，无法接单</span>';
      else if (isPublisher) actions += '<button class="btn danger" data-act="cancel">取消任务</button>';
      else if (me && me.id) actions += '<button class="btn primary big" data-act="take">立即接单 ¥' + esc(t.reward) + '</button>';
      else actions += '<button class="btn primary big" data-act="need-login">登录后接单</button>';
    } else if (t.status === 'doing') {
      if (isTaker) actions += '<button class="btn primary" data-act="complete">标记完成（已送达）</button><button class="btn danger" data-act="cancel">取消接单</button>';
      else if (isPublisher) actions += '<button class="btn danger" data-act="cancel">取消任务</button>';
      else actions += '<span class="muted">进行中…</span>';
    } else if (t.status === 'done') {
      if (isPublisher && !t.confirmedAt) actions += '<button class="btn primary" data-act="confirm">确认完成（结算）</button>';
      else actions += '<span class="muted">' + (t.confirmedAt ? (t.confirmedBy === 'system' ? '✅ 系统超时自动确认（48 小时未确认）' : '✅ 双方确认完成') : '已完成，等待发布者确认（48 小时后系统自动确认）') + '</span>';
      if (t.confirmedAt && (isPublisher || isTaker)) actions += '<button class="btn ghost" data-act="review">⭐ 评价对方</button>';
    } else {
      actions += '<span class="muted">' + esc(t.cancelReason || '已取消') + '</span>';
    }
    // 申诉入口：进行中/已完成均可（后端同样允许 doing/done 申诉）
    // 2026-08-23 审查修复：原写在 done 分支内，doing 状态永远看不到按钮
    if ((t.status === 'doing' || t.status === 'done') && (isPublisher || isTaker)) {
      actions += '<button class="btn ghost" data-act="dispute">⚠️ 申诉</button>';
    }
    bodyEl.innerHTML =
      '<div class="detail-head"><span class="badge ' + st[1] + '">' + st[0] + '</span><span class="reward big">¥' + esc(t.reward) + '</span></div>' +
      '<h3 class="detail-title">' + esc(t.title) + '</h3>' +
      (t.description ? '<p class="detail-desc">' + esc(t.description).replace(/\n/g, '<br>') + '</p>' : '') +
      '<div class="detail-rows">' +
      (t.pickup ? row('📦 取件', t.pickup) : '') +
      (t.dropoff ? row('🏁 送达', t.dropoff) : '') +
      row('👤 发布者', t.publisherName) +
      (t.takerName ? row('🛵 接单者', t.takerName) : '') +
      (t.contact ? row('📞 联系', t.contact) : (t.status === 'open' && !isPublisher ? row('📞 联系', '接单后可见') : '')) +
      (t.deadline ? row('⏰ 截止', fmtTime(t.deadline)) : '') +
      row('🕐 发布时间', fmtTime(t.createdAt)) +
      (t.completedAt ? row('✅ 完成时间', fmtTime(t.completedAt)) : '') +
      '</div>' +
      '<div class="detail-actions">' + actions + '</div>' +
      '<div id="review-box"></div>' +
      '<div id="dispute-box"></div>' +
      '<button class="btn ghost full" data-act="close">关闭</button>';
    bodyEl.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => handleDetailAction(btn.dataset.act, t));
    });
    loadReviews(t.id, seq);
    loadDisputes(t.id, seq);
  }

  async function loadReviews(taskId, seq) {
    const box = $('review-box');
    if (!box) return;
    try {
      const data = await api('/api/errand/reviews?taskId=' + taskId);
      if (seq !== detailSeq) return; // 详情已切换，丢弃过期响应
      const list = data.reviews || [];
      if (!list.length) return;
      box.innerHTML = '<div class="review-head">💬 评价（' + list.length + '）</div>' +
        list.map(r => '<div class="review-item"><span class="review-name">' + esc(r.reviewerName || '匿名') + '</span>' +
          '<span class="review-stars">' + '★'.repeat(r.rating) + '<span class="dim">' + '★'.repeat(5 - r.rating) + '</span></span>' +
          (r.comment ? '<div class="review-comment">' + esc(r.comment) + '</div>' : '') +
          '<div class="review-time">' + fmtTime(r.createdAt) + '</div></div>').join('') +
        '</div>';
    } catch (e) { /* 评价加载失败静默 */ }
  }

  function row(label, val) {
    return '<div class="drow"><span class="dlabel">' + label + '</span><span class="dval">' + esc(val) + '</span></div>';
  }

  function openReviewModal(t) {
    reviewRating = 5;
    currentReviewTask = t;
    $('rv-comment').value = '';
    renderStars();
    openModal('review-modal');
  }

  function renderStars() {
    document.querySelectorAll('#rv-stars .star').forEach((s, i) => {
      s.textContent = i < reviewRating ? '★' : '☆';
      s.classList.toggle('on', i < reviewRating);
    });
    $('rv-label').textContent = ['很差', '较差', '一般', '满意', '非常满意'][reviewRating - 1];
  }

  async function submitReview() {
    if (!currentReviewTask) return;
    const comment = $('rv-comment').value.trim().slice(0, 200);
    try {
      await api('/api/errand/reviews', {
        method: 'POST',
        body: JSON.stringify({ taskId: currentReviewTask.id, rating: reviewRating, comment }),
      });
      closeModal('review-modal');
      toast('评价成功，感谢反馈！');
      openDetail(currentReviewTask.id);
    } catch (e) {
      toast(e.message, true);
    }
  }

  /* ---------- 申诉 ---------- */
  function openDisputeModal(t) {
    currentDisputeTask = t;
    disputeImages = [];
    $('dp-reason').value = '';
    $('dp-detail').value = '';
    $('dp-files').value = '';
    renderDisputeThumbs();
    $('dp-hint').textContent = '';
    openModal('dispute-modal');
  }

  function handleDisputeFiles(e) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      if (disputeImages.length >= 3) { toast('最多 3 张图片', true); break; }
      if (!/^image\//.test(f.type)) continue;
      const reader = new FileReader();
      reader.onload = () => {
        compressImage(String(reader.result), function (dataUrl) {
          if (disputeImages.length >= 3) return;
          disputeImages.push(dataUrl);
          renderDisputeThumbs();
        });
      };
      reader.readAsDataURL(f);
    }
  }

  function compressImage(dataUrl, done) {
    const img = new Image();
    img.onload = function () {
      try {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          const r = Math.min(MAX / w, MAX / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        let q = 0.85, out = cv.toDataURL('image/jpeg', q);
        while (out.length > 274400 && q > 0.4) { // 200KB 上限（base64 膨胀约 1.34x）
          q -= 0.15;
          out = cv.toDataURL('image/jpeg', q);
        }
        done(out);
      } catch (_) { toast('图片处理失败', true); }
    };
    img.onerror = function () { toast('图片读取失败', true); };
    img.src = dataUrl;
  }

  function renderDisputeThumbs() {
    const box = $('dp-preview');
    box.innerHTML = disputeImages.map(function (d, i) {
      return '<div class="dp-thumb"><img src="' + d + '" alt="证据"><button type="button" class="dp-x" data-i="' + i + '">×</button></div>';
    }).join('');
    box.querySelectorAll('.dp-x').forEach(function (b) {
      b.addEventListener('click', function () {
        disputeImages.splice(Number(b.dataset.i), 1);
        renderDisputeThumbs();
      });
    });
    $('dp-count').textContent = disputeImages.length + ' / 3';
  }

  async function submitDispute() {
    if (!currentDisputeTask) return;
    const reason = $('dp-reason').value.trim();
    const hint = $('dp-hint');
    if (!reason) { hint.textContent = '请填写申诉理由'; return; }
    if (reason.length > 60) { hint.textContent = '理由最长 60 字'; return; }
    const btn = $('dp-submit');
    btn.disabled = true;
    try {
      await api('/api/errand/disputes', {
        method: 'POST',
        body: JSON.stringify({ taskId: currentDisputeTask.id, reason, detail: $('dp-detail').value.trim(), evidence: disputeImages }),
      });
      closeModal('dispute-modal');
      toast('申诉已提交，等待管理员处理');
      openDetail(currentDisputeTask.id);
    } catch (e) {
      hint.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function loadDisputes(taskId, seq) {
    const box = $('dispute-box');
    if (!box) return;
    try {
      const data = await api('/api/errand/disputes?taskId=' + taskId);
      if (seq !== detailSeq) return; // 详情已切换，丢弃过期响应
      const list = data.disputes || [];
      revokeContainerUrls(box); // 整块重渲染前撤销旧证据 objectURL
      if (!list.length) { box.innerHTML = ''; return; }
      const stMap = { open: ['待处理', 'st-open'], resolved: ['已解决', 'st-done'], rejected: ['已驳回', 'st-cancelled'] };
      box.innerHTML = '<div class="review-head">⚠️ 申诉（' + list.length + '）</div>' +
        list.map(d => {
          const st = stMap[d.status] || ['', ''];
          return '<div class="dispute-item"><div class="di-top"><span class="badge ' + st[1] + '">' + st[0] + '</span>' +
            '<span class="di-who">' + esc(d.userName || '匿名') + ' · ' + (d.role === 'publisher' ? '发布者' : '接单者') + '</span></div>' +
            '<div class="di-reason">' + esc(d.reason) + '</div>' +
            (d.detail ? '<div class="di-detail">' + esc(d.detail) + '</div>' : '') +
            (d.adminNote ? '<div class="di-note">👮 管理员：' + esc(d.adminNote) + '</div>' : '') +
            '<div class="di-time">' + fmtTime(d.createdAt) + '</div>' +
            '<button class="btn ghost small" data-dp-evidence="' + d.id + '">📎 查看证据</button>' +
            '<div class="di-evidence" data-for="' + d.id + '" hidden></div></div>';
        }).join('') + '</div>';
      box.querySelectorAll('button[data-dp-evidence]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const wrap = box.querySelector('.di-evidence[data-for="' + btn.dataset.dpEvidence + '"]');
          if (!wrap) return;
          if (!wrap.hidden) { wrap.hidden = true; return; }
          // 已有已加载内容 → 仅恢复显示（不重新请求、不撤销仍显示的 URL、不重复追加，2026-08-23 第 3 轮）
          if (wrap.dataset.loaded === '1') { wrap.hidden = false; return; }
          revokeContainerUrls(wrap); // 重新加载前撤销已渲染但即将被替换的证据 URL
          wrap.innerHTML = '<span class="muted">加载中…</span>'; wrap.hidden = false;
          try {
            const data = await api('/api/errand/disputes/' + btn.dataset.dpEvidence + '/evidence');
            const evs = data.evidence || [];
            wrap.textContent = '';
            if (!evs.length) { const sp = document.createElement('span'); sp.className = 'muted'; sp.textContent = '该申诉没有上传证据。'; wrap.append(sp); }
            else for (const v of evs) {
              try {
                const blob = await apiBlob('/api/errand/evidence/' + v.id);
                const img = document.createElement('img'); img.className = 'dp-ev-img'; const objUrl = URL.createObjectURL(blob); registerObjectUrl(objUrl); img.dataset.objUrl = objUrl; img.src = objUrl; img.alt = '证据'; img.loading = 'lazy'; wrap.append(img);
              } catch (er2) {
                const sp = document.createElement('span'); sp.className = 'muted'; sp.textContent = '证据 ' + v.id + ' 加载失败。'; wrap.append(sp);
              }
            }
            wrap.dataset.loaded = '1'; // 加载完成：后续点击仅显示/隐藏（异常路径不置位，允许重试且不重复追加）
          } catch (e) { delete wrap.dataset.loaded; wrap.innerHTML = '<span class="muted">证据加载失败。</span>'; }
        });
      });
    } catch (e) { /* 非双方或未登录：静默 */ }
  }

  async function handleDetailAction(act, t) {
    if (act === 'close') { closeModal('detail-modal'); return; }
    if (act === 'need-login') { closeModal('detail-modal'); openAuthModal('login'); return; }
    if (act === 'review') { openReviewModal(t); return; }
    if (act === 'dispute') { openDisputeModal(t); return; }
    const confirmText = {
      take: '确认接单？接单后请尽快联系发布者。',
      complete: '确认已送达并完成？',
      confirm: '确认任务已完成，与接单者结算？',
      cancel: t.status === 'doing' ? '确定取消？进行中取消请先和对方沟通。' : '确定取消该任务？',
    }[act];
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const data = await api('/api/errand/tasks/' + t.id + '/' + act, { method: 'POST', body: JSON.stringify({}) });
      toast({ take: '接单成功！', complete: '已标记完成，等发布者确认', confirm: '已确认完成，感谢使用！', cancel: '任务已取消' }[act] || '操作成功');
      renderDetail(data.task, detailSeq);
      loadList(false);
    } catch (e) {
      toast(e.message, true);
      openDetail(t.id); // 刷新详情（可能是状态已变化）
    }
  }

  function bindActions() {
    $('rv-cancel').addEventListener('click', () => closeModal('review-modal'));
    $('rv-submit').addEventListener('click', submitReview);
    document.querySelectorAll('#rv-stars .star').forEach(s => s.addEventListener('click', () => { reviewRating = Number(s.dataset.s); renderStars(); }));
    $('dp-cancel').addEventListener('click', () => closeModal('dispute-modal'));
    $('dp-submit').addEventListener('click', submitDispute);
    $('dp-files').addEventListener('change', handleDisputeFiles);
  }

  return { openDetail, bindActions };
}
