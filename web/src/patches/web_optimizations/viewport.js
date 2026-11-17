/**
 * patches/web_optimizations/viewport.js - keep --agy-vvh honest while the
 * soft keyboard opens and constrain the chat composer editor so its bottom
 * toolbar (model selector, permissions, voice, send) never hides under the IME.
 */
function installViewport(global, doc) {
  try {
    if (!doc.querySelector('style[data-agy="keyboard-composer-fix"]')) {
      var st = doc.createElement('style');
      st.setAttribute('data-agy', 'keyboard-composer-fix');
      st.textContent =
        '#antigravity\\.agentSidePanelInputBox [contenteditable="true"] {' +
        '  max-height: var(--agy-editor-max-h, min(300px, max(48px, calc(var(--agy-vvh, 100dvh) - 180px)))) !important;' +
        '  overflow-y: auto !important;' +
        '}' +
        'html[data-agy-kbd="1"] .agy-home > div > div:first-child {' +
        '  padding-top: 2px !important;' +
        '  padding-bottom: 2px !important;' +
        '  gap: 4px !important;' +
        '}' +
        'html[data-agy-kbd="1"] .agy-home [data-testid="home-greeting"],' +
        'html[data-agy-kbd="1"] .agy-home > div > div:first-child > [aria-hidden="true"] {' +
        '  display: none !important;' +
        '}' +
        'html[data-agy-kbd="1"] .agy-home > div > div:last-child {' +
        '  padding-bottom: 8px !important;' +
        '}';
      (doc.head || doc.documentElement).appendChild(st);
    }

    var lastWidth = 0;
    var maxViewportH = 0;
    var rafId = null;

    function getViewportSize() {
      var vv = global.visualViewport;
      var w = Math.round((vv && vv.width) || global.innerWidth || 0);
      var h = Math.round((vv && vv.height) || global.innerHeight || 0);
      return { w: w, h: h };
    }

    function updateLayout() {
      rafId = null;
      var root = doc.documentElement;
      if (!root) return;

      var sz = getViewportSize();
      if (!sz.h) return;

      if (Math.abs(sz.w - lastWidth) > 40 || sz.h > maxViewportH) {
        lastWidth = sz.w;
        maxViewportH = sz.h;
      }

      root.style.setProperty('--agy-vvh', sz.h + 'px');

      var active = doc.activeElement;
      var inComposer = !!(active && active.closest && active.closest('#antigravity\\.agentSidePanelInputBox, [data-testid="agent-input-box"]'));
      var shrunkByKbd = (maxViewportH - sz.h) > 100;
      var kbdOpen = shrunkByKbd || (inComposer && sz.h < 520);

      if (kbdOpen) {
        root.setAttribute('data-agy-kbd', '1');
      } else {
        root.removeAttribute('data-agy-kbd');
      }

      var box = doc.getElementById('antigravity.agentSidePanelInputBox');
      var editor = box ? box.querySelector('[contenteditable="true"]') : null;
      if (box && editor && kbdOpen) {
        var boxH = box.offsetHeight || 0;
        var edH = editor.offsetHeight || 0;
        var chromeH = Math.max(48, boxH - edH);

        var outerBox = box.closest('[data-testid="agent-input-box"]');
        var outerExtraH = outerBox ? Math.max(0, (outerBox.offsetHeight || 0) - boxH) : 0;

        var sheet = box.closest('.agy-home') || box.closest('main') || box.closest('.agy-sheet');
        var topOffset = 52;
        if (sheet && sheet.getBoundingClientRect) {
          var rectTop = Math.round(sheet.getBoundingClientRect().top);
          if (rectTop >= 0 && rectTop < sz.h * 0.4) {
            topOffset = rectTop;
          }
        }

        // Reserve top header + composer chrome + bottom padding so the entire
        // composer card (including model selector, permissions, mic, send) stays
        // completely above the keyboard.
        var avail = sz.h - topOffset - chromeH - outerExtraH - 20;
        var maxEditorH = Math.min(300, Math.max(44, Math.floor(avail)));
        root.style.setProperty('--agy-editor-max-h', maxEditorH + 'px');
      } else if (!kbdOpen) {
        root.style.removeProperty('--agy-editor-max-h');
      }
    }

    function scheduleUpdate() {
      if (rafId !== null) return;
      rafId = global.requestAnimationFrame(updateLayout);
    }

    updateLayout();

    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', scheduleUpdate, { passive: true });
      global.visualViewport.addEventListener('scroll', scheduleUpdate, { passive: true });
    }
    global.addEventListener('resize', scheduleUpdate, { passive: true });
    doc.addEventListener('focusin', function () {
      scheduleUpdate();
      setTimeout(scheduleUpdate, 120);
      setTimeout(scheduleUpdate, 320);
    }, { passive: true });
    doc.addEventListener('focusout', function () {
      setTimeout(scheduleUpdate, 150);
    }, { passive: true });
    doc.addEventListener('input', function (e) {
      if (e && e.target && e.target.closest && e.target.closest('#antigravity\\.agentSidePanelInputBox')) {
        scheduleUpdate();
      }
    }, { passive: true });
  } catch (e) {}
}
