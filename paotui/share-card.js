/* 外院跑腿分享卡片：只负责 Canvas 绘制与二维码生成，不依赖订单页面状态。 */
(function () {
  function setQrUtf8() {
    const qr = window.qrcode;
    if (qr && qr.stringToBytesFuncs) qr.stringToBytes = qr.stringToBytesFuncs['UTF-8'];
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const lines = [];
    let line = '';
    for (const ch of String(text)) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
    return lines.length;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function draw(type, task, formatTime) {
    const W = 720;
    const H = 960;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const font = '"PingFang SC","Microsoft YaHei",sans-serif';
    const hasTask = type === 'task' && task;
    const fmtTime = typeof formatTime === 'function' ? formatTime : () => '';

    // 背景
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#173f30');
    gradient.addColorStop(1, '#28634f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.beginPath();
    ctx.arc(W - 40, 30, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.beginPath();
    ctx.arc(20, H - 20, 130, 0, Math.PI * 2);
    ctx.fill();

    // 品牌头
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px ' + font;
    ctx.fillText('🛵 外院跑腿', 48, 92);
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.font = '20px ' + font;
    ctx.fillText('外院知识分享站 · 校内互助', 52, 130);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(48, 160);
    ctx.lineTo(W - 48, 160);
    ctx.stroke();

    let qrSize = 220;
    let qrData = 'https://free60127.top/paotui/';
    if (hasTask) {
      qrData = 'https://free60127.top/paotui/?task=' + task.id;
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.font = '22px ' + font;
      ctx.fillText('任务详情', 48, 216);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 42px ' + font;
      const lines = wrapText(ctx, task.title || '跑腿任务', 48, 280, W - 96, 56, 3);
      const titleBottom = 280 + lines * 56;
      ctx.fillStyle = '#f0a45c';
      ctx.font = 'bold 64px ' + font;
      ctx.fillText('¥' + task.reward, 48, titleBottom + 76);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '26px ' + font;
      ctx.fillText('📦 ' + (task.pickup || '待定'), 48, titleBottom + 132);
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = '26px ' + font;
      ctx.fillText('↓', 48, titleBottom + 172);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '26px ' + font;
      wrapText(ctx, '🏁 ' + (task.dropoff || '待定'), 48, titleBottom + 212, W - 96, 36, 2);
      const routeBottom = titleBottom + 212 + 36;
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = '22px ' + font;
      if (task.deadline) ctx.fillText('⏰ 截止 ' + fmtTime(task.deadline), 48, routeBottom + 36);
      ctx.fillText('👤 发布者 ' + (task.publisherName || '同学'), 48, routeBottom + 72);
      qrSize = 190;
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px ' + font;
      ctx.fillText('校内跑腿互助', 48, 240);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = '26px ' + font;
      ctx.fillText('发布任务 · 在线接单 · 线下当面结算', 48, 292);
      const chips = ['取快递', '带饭', '送文件', '帮排队'];
      ctx.font = '22px ' + font;
      let chipX = 48;
      chips.forEach(chip => {
        const chipWidth = ctx.measureText(chip).width + 36;
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        roundRect(ctx, chipX, 320, chipWidth, 48, 24);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(chip, chipX + 18, 351);
        chipX += chipWidth + 14;
      });
      qrSize = 240;
    }

    // 二维码
    const qr = window.qrcode(0, 'M');
    qr.addData(qrData, 'Byte');
    qr.make();
    const qrUrl = qr.createDataURL(5, 10);
    try {
      const image = await loadImage(qrUrl);
      const qx = (W - qrSize) / 2;
      const qy = hasTask ? H - qrSize - 190 : H - qrSize - 200;
      ctx.fillStyle = '#fff';
      roundRect(ctx, qx - 16, qy - 16, qrSize + 32, qrSize + 32, 16);
      ctx.fill();
      ctx.drawImage(image, qx, qy, qrSize, qrSize);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = '22px ' + font;
      ctx.textAlign = 'center';
      ctx.fillText(hasTask ? '扫码去接单 · 手慢无' : '长按识别二维码 → 进入跑腿平台', W / 2, qy + qrSize + 44);
    } catch (_) {
      // 二维码生成失败不阻塞卡片，其余内容仍可保存。
    }

    // 底部
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(48, H - 108);
    ctx.lineTo(W - 48, H - 108);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = '18px ' + font;
    ctx.fillText('外院知识分享站 · 跑腿互助', W / 2, H - 66);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = '16px ' + font;
    ctx.fillText('free60127.top/paotui', W / 2, H - 36);
    return cv;
  }

  window.WaiyuanErrandShareCard = { setQrUtf8, draw };
})();
