/* ============================================================
   主页账号入口（2026-08-23 重构）：逻辑已抽到根目录 auth-ui.js（WaiyuanAuthUI）
   本文件仅做页面级 init：主页 modal 用 .hidden class 控制、提示走 #auth-hint
   ============================================================ */
(() => {
  if (window.__WAIYUAN_HOME_AUTH__) return;
  window.__WAIYUAN_HOME_AUTH__ = true;
  const ui = window.WaiyuanAuthUI;
  if (!ui || !ui.init) return;
  ui.init({
    hint: (msg, isError) => {
      const hint = document.getElementById('auth-hint');
      if (!hint) return;
      hint.textContent = msg;
      hint.style.color = isError ? '#b3261e' : '';
    },
    panelMode: 'class',
  });
  ui.bindActions();
})();
