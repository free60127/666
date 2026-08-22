/* ============================================================
   外院知识分享站 · 番茄钟（全站悬浮工具）
   - 右下角小番茄图标（可收缩：点击开合面板）
   - 预设/自定义时长倒计时（真实时间，interval 漂移免疫）
   - 计时期间可选择白噪音（Web Audio 实时生成：白噪音/雨声/粉红噪音）
   - 结束提示音 + 页面隐藏时系统通知（不主动申请权限）
   依赖：无（离线可用，单文件版同样生效）
   ============================================================ */
(() => {
  if (window.__WAIYUAN_TOMATO__) return;
  window.__WAIYUAN_TOMATO__ = true;

  const LS_KEY = 'waiyuan-tomato-v1';
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_) { return {}; } };
  const savePrefs = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch (_) {} };
  const prefs = loadPrefs();

  let currentMinutes = prefs.minutes && prefs.minutes > 0 ? Math.min(prefs.minutes, 120) : 25;
  let noiseOn = !!prefs.noise;
  let noiseKind = prefs.noiseKind === 'rain' || prefs.noiseKind === 'pink' ? prefs.noiseKind : 'white';
  let noiseVolume = typeof prefs.noiseVolume === 'number' ? Math.min(Math.max(prefs.noiseVolume, 0), 1) : 0.4;

  let timer = null;
  let endAt = 0;
  let remainMs = currentMinutes * 60000;
  let running = false;
  let audioCtx = null;
  let noiseNodes = null;
  const originalTitle = document.title;

  /* ---------- DOM 构建 ---------- */
  const wrap = document.createElement('div');
  wrap.className = 'tomato-timer';
  wrap.innerHTML = `
    <button type="button" class="tomato-timer__toggle" aria-label="番茄钟" aria-expanded="false">
      <svg class="tomato-timer__icon" viewBox="0 0 64 64" aria-hidden="true">
        <ellipse cx="32" cy="39" rx="19" ry="17" fill="#e0503a"/>
        <ellipse cx="25" cy="33" rx="6" ry="3.5" fill="#ff8a6b" opacity=".5" transform="rotate(-25 25 33)"/>
        <rect x="30.8" y="9.5" width="2.4" height="9.5" rx="1.2" fill="#3f8f4e"/>
        <g fill="#4c9e55">
          <ellipse cx="32" cy="21.5" rx="2.8" ry="5"/>
          <ellipse cx="26.5" cy="22.5" rx="2.6" ry="4.6" transform="rotate(-50 26.5 22.5)"/>
          <ellipse cx="37.5" cy="22.5" rx="2.6" ry="4.6" transform="rotate(50 37.5 22.5)"/>
          <ellipse cx="23.5" cy="26.5" rx="2.4" ry="4.2" transform="rotate(-28 23.5 26.5)"/>
          <ellipse cx="40.5" cy="26.5" rx="2.4" ry="4.2" transform="rotate(28 40.5 26.5)"/>
        </g>
      </svg>
      <span class="tomato-timer__remain"></span>
    </button>
    <section class="tomato-timer__panel" role="dialog" aria-label="番茄钟">
      <header><b>🍅 番茄钟</b><button type="button" class="tomato-timer__close" aria-label="关闭">×</button></header>
      <div class="tomato-timer__time" role="timer">25:00</div>
      <div class="tomato-timer__presets">
        <button type="button" class="tomato-timer__chip" data-min="15">15 分</button>
        <button type="button" class="tomato-timer__chip" data-min="25">25 分</button>
        <button type="button" class="tomato-timer__chip" data-min="45">45 分</button>
        <input class="tomato-timer__custom" type="number" min="1" max="120" placeholder="自定义(分)" inputmode="numeric">
      </div>
      <div class="tomato-timer__controls">
        <button type="button" class="tomato-timer__start">开始</button>
        <button type="button" class="tomato-timer__reset">重置</button>
      </div>
      <div class="tomato-timer__noise">
        <label class="tomato-timer__noise-label"><input type="checkbox" class="tomato-timer__noise-check">白噪音</label>
        <select class="tomato-timer__kind" aria-label="白噪音音色">
          <option value="white">白噪音</option>
          <option value="rain">雨声</option>
          <option value="pink">粉红噪音</option>
        </select>
        <input class="tomato-timer__volume" type="range" min="0" max="100" value="40" aria-label="音量">
      </div>
      <p class="tomato-timer__hint">计时结束有提示音；白噪音由浏览器实时生成，无需联网，可边刷题边听。</p>
    </section>`;
  document.body.appendChild(wrap);

  const toggle = wrap.querySelector('.tomato-timer__toggle');
  const panel = wrap.querySelector('.tomato-timer__panel');
  const timeEl = wrap.querySelector('.tomato-timer__time');
  const remainEl = wrap.querySelector('.tomato-timer__remain');
  const chips = [...wrap.querySelectorAll('.tomato-timer__chip')];
  const customEl = wrap.querySelector('.tomato-timer__custom');
  const startBtn = wrap.querySelector('.tomato-timer__start');
  const resetBtn = wrap.querySelector('.tomato-timer__reset');
  const noiseCheck = wrap.querySelector('.tomato-timer__noise-check');
  const kindSel = wrap.querySelector('.tomato-timer__kind');
  const volumeEl = wrap.querySelector('.tomato-timer__volume');

  /* ---------- 显示 ---------- */
  const fmt = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const render = () => { timeEl.textContent = fmt(running ? endAt - Date.now() : remainMs); };
  const renderToggle = () => {
    if (running) {
      remainEl.textContent = String(Math.max(1, Math.ceil((endAt - Date.now()) / 60000)));
    } else if (remainMs <= 0) {
      remainEl.textContent = '✓';
    } else {
      remainEl.textContent = '';
    }
  };
  const restoreTitle = () => { if (document.title !== originalTitle) document.title = originalTitle; };

  function updateUI() {
    startBtn.textContent = running ? '暂停' : (remainMs > 0 && remainMs < currentMinutes * 60000 ? '继续' : '开始');
    startBtn.classList.toggle('is-running', running);
    toggle.classList.toggle('is-running', running);
    document.documentElement.classList.toggle('tomato-running', running);
    toggle.setAttribute('aria-expanded', panel.classList.contains('is-open') ? 'true' : 'false');
    timeEl.classList.toggle('is-finished', !running && remainMs <= 0);
    chips.forEach(chip => chip.classList.toggle('is-active', !running && Number(chip.dataset.min) === currentMinutes));
    customEl.value = chips.some(chip => Number(chip.dataset.min) === currentMinutes) ? '' : currentMinutes;
    noiseCheck.checked = noiseOn;
    kindSel.value = noiseKind;
    volumeEl.value = Math.round(noiseVolume * 100);
    render();
    renderToggle();
  }

  /* ---------- 计时 ---------- */
  function tick() {
    const left = endAt - Date.now();
    if (left <= 0) { finish(); return; }
    render();
    renderToggle();
    document.title = `🍅 ${fmt(left)} · ${originalTitle}`;
  }
  function start() {
    if (running) { pause(); return; }
    if (remainMs <= 0) remainMs = currentMinutes * 60000;
    endAt = Date.now() + remainMs;
    running = true;
    timer = setInterval(tick, 500);
    tick();
    if (noiseOn) ensureNoise();
    updateUI();
  }
  function pause() {
    if (!running) return;
    remainMs = endAt - Date.now();
    running = false;
    clearInterval(timer); timer = null;
    restoreTitle();
    stopNoise();
    updateUI();
  }
  function reset() {
    running = false;
    clearInterval(timer); timer = null;
    remainMs = currentMinutes * 60000;
    restoreTitle();
    stopNoise();
    updateUI();
  }
  function finish() {
    running = false;
    clearInterval(timer); timer = null;
    remainMs = 0;
    restoreTitle();
    stopNoise();
    beep();
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification('🍅 番茄钟结束', { body: '休息一下，起来活动活动吧！' }); } catch (_) {}
    }
    updateUI();
  }
  function setMinutes(m) {
    if (!Number.isFinite(m)) return;
    const clamped = Math.min(Math.max(Math.round(m), 1), 120);
    if (running || remainMs === currentMinutes * 60000) remainMs = clamped * 60000;
    currentMinutes = clamped;
    prefs.minutes = clamped;
    savePrefs();
    updateUI();
  }

  /* ---------- 白噪音（Web Audio 实时生成） ---------- */
  function ensureNoise() {
    if (noiseNodes || !noiseOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const rate = audioCtx.sampleRate;
      const buffer = audioCtx.createBuffer(1, rate * 2, rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      let tail = src;
      if (noiseKind === 'rain') {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 0.5;
        src.connect(filter); tail = filter;
      } else if (noiseKind === 'pink') {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 1500;
        src.connect(filter); tail = filter;
      }
      const gain = audioCtx.createGain();
      gain.gain.value = noiseVolume;
      tail.connect(gain);
      gain.connect(audioCtx.destination);
      src.start();
      noiseNodes = { src, gain };
    } catch (_) { /* 音频不可用则静默忽略 */ }
  }
  function stopNoise() {
    if (!noiseNodes) return;
    try { noiseNodes.src.stop(); } catch (_) {}
    noiseNodes = null;
  }
  function beep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const notes = [880, 880, 1174];
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = audioCtx.currentTime + i * 0.28;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.26);
      });
    } catch (_) {}
  }

  /* ---------- 事件 ---------- */
  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  wrap.querySelector('.tomato-timer__close').addEventListener('click', () => {
    panel.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  });
  chips.forEach(chip => chip.addEventListener('click', () => setMinutes(Number(chip.dataset.min))));
  customEl.addEventListener('change', () => { const v = parseInt(customEl.value, 10); if (Number.isFinite(v)) setMinutes(v); });
  startBtn.addEventListener('click', start);
  resetBtn.addEventListener('click', reset);
  noiseCheck.addEventListener('change', () => {
    noiseOn = noiseCheck.checked;
    prefs.noise = noiseOn;
    savePrefs();
    if (noiseOn && running) ensureNoise();
    if (!noiseOn) stopNoise();
  });
  kindSel.addEventListener('change', () => {
    noiseKind = kindSel.value;
    prefs.noiseKind = noiseKind;
    savePrefs();
    if (noiseOn && running) { stopNoise(); ensureNoise(); }
  });
  volumeEl.addEventListener('input', () => {
    noiseVolume = Number(volumeEl.value) / 100;
    prefs.noiseVolume = noiseVolume;
    savePrefs();
    if (noiseNodes) { try { noiseNodes.gain.gain.value = noiseVolume; } catch (_) {} }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) renderToggle(); });

  updateUI();
})();
