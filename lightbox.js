/* 轻量图片放大（Lightbox）：任务图片 / 申诉证据 / 上传预览点击放大，支持拖拽与缩放（2026-08-25） */
(function () {
  if (window.WaiyuanLightbox) return;
  var CSS = '.wy-lightbox{position:fixed;inset:0;z-index:9999;background:rgba(8,12,14,.94);display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;touch-action:none;}'
    + '.wy-lightbox[hidden]{display:none!important;}'
    + '.wy-lightbox .wy-lb-stage{position:relative;max-width:100vw;max-height:100vh;overflow:hidden;display:flex;align-items:center;justify-content:center;}'
    + '.wy-lightbox .wy-lb-img{max-width:96vw;max-height:88vh;object-fit:contain;border-radius:4px;box-shadow:0 8px 40px rgba(0,0,0,.6);transform-origin:center;cursor:grab;transition:transform .1s ease;}'
    + '.wy-lightbox .wy-lb-img.dragging{cursor:grabbing;transition:none;}'
    + '.wy-lightbox .wy-lb-close{position:absolute;top:14px;right:16px;width:46px;height:46px;border:none;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:26px;line-height:1;cursor:pointer;}'
    + '.wy-lightbox .wy-lb-bar{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:rgba(0,0,0,.5);border-radius:24px;padding:8px 12px;}'
    + '.wy-lightbox .wy-lb-bar button{border:none;background:rgba(255,255,255,.18);color:#fff;min-width:44px;height:42px;border-radius:22px;font-size:17px;cursor:pointer;padding:0 10px;}'
    + '.wy-lightbox .wy-lb-bar .wy-lb-pct{color:#fff;font-size:13px;min-width:46px;text-align:center;}'
    + '@media(max-width:560px){.wy-lightbox .wy-lb-img{max-width:94vw;max-height:80vh;}.wy-lightbox .wy-lb-close{top:10px;right:10px;}}';
  function ensure() {
    if (document.getElementById('wy-lightbox')) return document.getElementById('wy-lightbox');
    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    var el = document.createElement('div'); el.id = 'wy-lightbox'; el.className = 'wy-lightbox'; el.hidden = true;
    el.innerHTML = '<div class="wy-lb-stage"><img class="wy-lb-img" alt="放大预览"></div>'
      + '<button class="wy-lb-close" type="button" title="关闭">×</button>'
      + '<div class="wy-lb-bar"><button type="button" data-wy-lb="minus">−</button><span class="wy-lb-pct">100%</span><button type="button" data-wy-lb="reset">复位</button><button type="button" data-wy-lb="plus">＋</button></div>';
    document.body.appendChild(el);
    var img = el.querySelector('.wy-lb-img');
    var stage = el.querySelector('.wy-lb-stage');
    var scale = 1, tx = 0, ty = 0;
    function apply() {
      img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      el.querySelector('.wy-lb-pct').textContent = Math.round(scale * 100) + '%';
    }
    function clamp() { var m = 1600; if (tx > m) tx = m; if (tx < -m) tx = -m; if (ty > m) ty = m; if (ty < -m) ty = -m; }
    function close() { el.hidden = true; img.removeAttribute('src'); scale = 1; tx = 0; ty = 0; apply(); document.removeEventListener('keydown', onKey); }
    function open(src) {
      img.src = src; scale = 1; tx = 0; ty = 0; apply(); el.hidden = false;
      document.addEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape' || e.keyCode === 27) close(); }
    el.addEventListener('click', function (e) { if (e.target === el || e.target === stage) close(); });
    el.querySelector('.wy-lb-close').addEventListener('click', close);
    var barBtns = el.querySelectorAll('button[data-wy-lb]');
    barBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.wyLb;
        if (k === 'minus') { scale = Math.max(0.5, scale / 1.25); }
        else if (k === 'plus') { scale = Math.min(4, scale * 1.25); }
        else { scale = 1; tx = 0; ty = 0; }
        clamp(); apply();
      });
    });
    img.addEventListener('dblclick', function () {
      if (scale > 1.05) { scale = 1; tx = 0; ty = 0; } else { scale = 2; tx = 0; ty = 0; }
      clamp(); apply();
    });
    var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    img.addEventListener('pointerdown', function (e) { dragging = true; sx = e.clientX; sy = e.clientY; ox = tx; oy = ty; img.classList.add('dragging'); img.setPointerCapture && img.setPointerCapture(e.pointerId); });
    img.addEventListener('pointermove', function (e) { if (!dragging) return; tx = ox + (e.clientX - sx); ty = oy + (e.clientY - sy); clamp(); apply(); });
    function endDrag() { dragging = false; img.classList.remove('dragging'); }
    img.addEventListener('pointerup', endDrag);
    img.addEventListener('pointercancel', endDrag);
    img.addEventListener('wheel', function (e) { e.preventDefault(); scale = Math.min(4, Math.max(0.5, scale * (e.deltaY < 0 ? 1.15 : 0.87))); clamp(); apply(); }, { passive: false });
    el._wyApi = { open: open, close: close, ensure: function () { return el; } };
    return el;
  }
  window.WaiyuanLightbox = { open: function (src) { ensure()._wyApi.open(src); }, close: function () { ensure()._wyApi.close(); } };
})();