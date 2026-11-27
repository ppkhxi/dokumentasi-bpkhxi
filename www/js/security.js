/* ===========================================================================
   DKPOINT — PENGAMAN INPUT (v4.1.0)

   Berkas ini sengaja TIDAK lagi memblokir DevTools, klik kanan, atau mematikan
   console: semua itu tidak menambah keamanan (kode tetap bisa dibaca) tetapi
   menyulitkan diagnosis di lapangan dan menyembunyikan peringatan penting.

   Yang tersisa hanya pembersih data yang benar-benar dipakai:
   - bersihkanTeks: buang karakter kendali, rapikan spasi, batasi panjang.
     TIDAK meng-escape HTML; escaping dilakukan saat menampilkan (esc()).
   - validasiKoordinat: pastikan lat/lon masuk akal sebelum disimpan.
   =========================================================================== */

(function () {
  'use strict';

  window.DK_SECURITY = Object.freeze({
    bersihkanTeks: function (str, maxLen) {
      if (str == null) return '';
      let s = String(str)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
      return s;
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
