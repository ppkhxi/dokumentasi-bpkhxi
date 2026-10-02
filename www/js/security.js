/* ===========================================================================
   DKPOINT SECURITY & INTEGRITY GUARD (v3.8.2)
   Perlindungan menyeluruh terhadap inspeksi kode, manipulasi DevTools (F12),
   injeksi konsol, dan pengamanan input pengguna.
   =========================================================================== */

(function () {
  'use strict';

  // 1. BLOKIR SHORTCUT DEVTOOLS & VIEW-SOURCE
  window.addEventListener('keydown', function (e) {
    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const key = (e.key || '').toLowerCase();
    const code = e.keyCode;

    // Ctrl+Shift+I (Inspect), Ctrl+Shift+J (Console), Ctrl+Shift+C (Elements)
    if (isCtrlOrCmd && isShift && (key === 'i' || key === 'j' || key === 'c' || code === 73 || code === 74 || code === 67)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+U (View Source)
    if (isCtrlOrCmd && (key === 'u' || code === 85)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+S (Save Page)
    if (isCtrlOrCmd && (key === 's' || code === 83)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // 2. BLOKIR KLIK KANAN (CONTEXT MENU / INSPECT ELEMENT)
  window.addEventListener('contextmenu', function (e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') {
      return true;
    }
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // 3. NETRALISIR KONSOL & PEMBERSIHAN OTOMATIS
  try {
    const noop = function () {};
    if (window.console) {
      window.console.log = noop;
      window.console.info = noop;
      window.console.warn = noop;
      window.console.debug = noop;
      window.console.table = noop;
    }
  } catch (e) {}

  // 4. DETEKSI DEVTOOLS
  let devtoolsTerbuka = false;
  const ambangBatas = 160;

  function periksaDevTools() {
    const lebarLuar = window.outerWidth - window.innerWidth > ambangBatas;
    const tinggiLuar = window.outerHeight - window.innerHeight > ambangBatas;
    if (lebarLuar || tinggiLuar) {
      if (!devtoolsTerbuka) {
        devtoolsTerbuka = true;
        try { console.clear(); } catch (e) {}
      }
    } else {
      devtoolsTerbuka = false;
    }
  }

  window.addEventListener('resize', periksaDevTools, { passive: true });
  setInterval(periksaDevTools, 2000);

  // 5. HELPER KEAMANAN & SANITASI INPUT
  window.DK_SECURITY = Object.freeze({
    bersihkanTeks: function (str, maxLen) {
      if (str == null) return '';
      let s = String(str).trim();
      if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
      return s.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    validasiKoordinat: function (pos) {
      if (!pos || typeof pos !== 'object') return false;
      const lat = Number(pos.lat), lon = Number(pos.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
      if (lat < -90 || lat > 90) return false;
      if (lon < -180 || lon > 180) return false;
      return true;
    }
  });

})();
