/* ===========================================================================
   PETA SEBARAN — dipakai bersama oleh aplikasi petugas dan panel admin.

   Satu titik = satu foto. Bentuk data yang diharapkan:
     { lat, lon, nama, room, waktu, catatan, akurasi, linkDrive, thumb }
   `thumb` (data URL) hanya ada di aplikasi petugas; di panel admin kosong.
   =========================================================================== */

const PETA = (function () {
  const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

  /* Warna dibedakan per room supaya sebaran tiap tim terbaca sekali lihat.
     Dipilih yang tetap terbaca di atas peta terang. */
  const WARNA = ['#1B5E20', '#C62828', '#1565C0', '#EF6C00', '#6A1B9A',
                 '#00838F', '#AD1457', '#4E342E'];

  function warnaRoom(nama) {
    let h = 0;
    for (let i = 0; i < String(nama).length; i++) h = (h * 31 + String(nama).charCodeAt(i)) % 9973;
    return WARNA[h % WARNA.length];
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Leaflet dimuat saat dibutuhkan saja, bukan saat aplikasi dibuka —
     supaya aplikasi tetap ringan dan tetap jalan tanpa sinyal. */
  let janjiMuat = null;
  function muatLeaflet() {
    if (window.L) return Promise.resolve();
    if (janjiMuat) return janjiMuat;
    janjiMuat = new Promise((res, rej) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS;
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET_JS;
      js.onload = () => res();
      js.onerror = () => { janjiMuat = null; rej(new Error('gagal memuat pustaka peta')); };
      document.head.appendChild(js);
    });
    return janjiMuat;
  }

  const punyaKoordinat = t => t && t.lat != null && t.lon != null &&
                              isFinite(t.lat) && isFinite(t.lon);

  /* --------------------------------------------------------------------- */

  const petaTersimpan = new WeakMap();

  async function gambar(wadah, titik, opsi) {
    opsi = opsi || {};
    const berkoordinat = (titik || []).filter(punyaKoordinat);

    if (!berkoordinat.length) {
      wadah.innerHTML = '<div class="peta-kosong">Belum ada foto yang punya koordinat.<br>' +
        'Titik baru muncul kalau izin lokasi diberikan saat memotret.</div>';
      return { jumlah: 0 };
    }

    try {
      await muatLeaflet();
    } catch (e) {
      wadah.innerHTML = '<div class="peta-kosong">Peta perlu sambungan internet untuk memuat ' +
        'latar petanya.<br>Data titiknya tetap aman — coba lagi setelah ada sinyal, atau unduh ' +
        'berkas KML/GeoJSON untuk dibuka di aplikasi peta lain.</div>';
      return { jumlah: berkoordinat.length, gagalMuat: true };
    }

    let peta = petaTersimpan.get(wadah);
    if (!peta) {
      wadah.innerHTML = '';
      peta = L.map(wadah, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(peta);
      peta.lapisTitik = L.layerGroup().addTo(peta);
      petaTersimpan.set(wadah, peta);
    }
    peta.lapisTitik.clearLayers();

    berkoordinat.forEach(t => {
      const warna = warnaRoom(t.room);
      const tanda = L.circleMarker([t.lat, t.lon], {
        radius: 7, color: '#fff', weight: 2,
        fillColor: warna, fillOpacity: 0.95
      });

      // Lingkaran ketelitian: mengingatkan pembaca bahwa titik HP bukan
      // hasil ukur geodetik. Hanya digambar kalau nilainya masuk akal.
      if (t.akurasi > 0 && t.akurasi < 500) {
        L.circle([t.lat, t.lon], {
          radius: t.akurasi, color: warna, weight: 1,
          opacity: 0.35, fillColor: warna, fillOpacity: 0.08
        }).addTo(peta.lapisTitik);
      }

      tanda.bindPopup(
        '<div class="peta-popup">' +
        (t.thumb ? '<img src="' + t.thumb + '" alt="">' : '') +
        '<b>' + esc(t.nama || 'Tanpa nama') + '</b>' +
        '<div class="baris">' + esc(t.room || '') + '</div>' +
        '<div class="baris">' + esc(t.waktu || '') + '</div>' +
        '<div class="baris">' + Number(t.lat).toFixed(6) + ', ' + Number(t.lon).toFixed(6) +
          (t.akurasi ? ' · ±' + Math.round(t.akurasi) + ' m' : '') + '</div>' +
        '<div class="catatan">' + esc(t.catatan || '(tanpa catatan)') + '</div>' +
        (t.linkDrive ? '<a href="' + esc(t.linkDrive) + '" target="_blank" rel="noopener">Buka berkas di Drive</a>' : '') +
        '</div>', { maxWidth: 260 }
      );
      tanda.addTo(peta.lapisTitik);
    });

    const batas = L.latLngBounds(berkoordinat.map(t => [t.lat, t.lon]));
    peta.fitBounds(batas, { padding: [30, 30], maxZoom: 17 });
    setTimeout(() => peta.invalidateSize(), 120);   // wadah kadang baru terlihat

    return { jumlah: berkoordinat.length, batas: batas };
  }

  /* --------------------------------------------------------------------- */

  function keGeoJSON(titik) {
    return JSON.stringify({
      type: 'FeatureCollection',
      name: 'Dokumentasi Foto Lapangan BPKH Wilayah XI',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      features: (titik || []).filter(punyaKoordinat).map(t => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(t.lon), Number(t.lat)] },
        properties: {
          petugas: t.nama || '', email: t.email || '', room: t.room || '',
          waktu: t.waktu || '', catatan: t.catatan || '',
          akurasi_m: t.akurasi == null ? null : Number(t.akurasi),
          berkas: t.namaBerkas || '', link_drive: t.linkDrive || ''
        }
      }))
    }, null, 1);
  }

  function keKML(titik) {
    const daftar = (titik || []).filter(punyaKoordinat);
    const gaya = {};
    daftar.forEach(t => { gaya[t.room || 'lain'] = warnaRoom(t.room); });

    // KML memakai urutan warna aabbggrr, bukan rrggbb seperti CSS.
    const keAABBGGRR = h => {
      const r = h.slice(1, 3), g = h.slice(3, 5), b = h.slice(5, 7);
      return 'ff' + b.toLowerCase() + g.toLowerCase() + r.toLowerCase();
    };

    const idGaya = nama => 'gaya_' + String(nama).replace(/[^\w]/g, '_');

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n' +
      '<name>Dokumentasi Foto Lapangan BPKH Wilayah XI</name>\n' +
      Object.keys(gaya).map(r =>
        '<Style id="' + idGaya(r) + '"><IconStyle><color>' + keAABBGGRR(gaya[r]) + '</color>' +
        '<scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>' +
        '</IconStyle></Style>\n').join('') +
      daftar.map(t =>
        '<Placemark>\n' +
        '  <name>' + esc(t.nama || 'Tanpa nama') + ' — ' + esc(t.waktu || '') + '</name>\n' +
        '  <styleUrl>#' + idGaya(t.room || 'lain') + '</styleUrl>\n' +
        '  <description><![CDATA[' +
             '<b>Petugas:</b> ' + esc(t.nama || '-') + '<br>' +
             '<b>Room:</b> ' + esc(t.room || '-') + '<br>' +
             '<b>Waktu:</b> ' + esc(t.waktu || '-') + '<br>' +
             '<b>Ketelitian GPS:</b> ' + (t.akurasi ? '±' + Math.round(t.akurasi) + ' m' : 'tidak tercatat') + '<br>' +
             '<b>Catatan:</b> ' + esc(t.catatan || '(tanpa catatan)') + '<br>' +
             (t.linkDrive ? '<a href="' + esc(t.linkDrive) + '">Buka foto di Google Drive</a>'
                          : '<i>Foto belum terkirim ke Drive</i>') +
           ']]></description>\n' +
        '  <Point><coordinates>' + Number(t.lon) + ',' + Number(t.lat) + ',0</coordinates></Point>\n' +
        '</Placemark>\n').join('') +
      '</Document></kml>';
  }

  /* Sengaja tanpa BOM: pada CSV penanda itu membantu Excel, tapi pada GeoJSON
     bisa membuat pengurai ketat menolak berkasnya, dan pada KML sebagian
     pembaca ikut tersandung. */
  function unduh(namaBerkas, isi, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([isi], { type: mime + ';charset=utf-8' }));
    a.download = namaBerkas;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const capTanggal = () => new Date().toISOString().slice(0, 10);

  return {
    gambar: gambar,
    warnaRoom: warnaRoom,
    jumlahBerkoordinat: t => (t || []).filter(punyaKoordinat).length,
    unduhGeoJSON: (titik, label) =>
      unduh('Dokumentasi_' + (label || 'semua') + '_' + capTanggal() + '.geojson',
            keGeoJSON(titik), 'application/geo+json'),
    unduhKML: (titik, label) =>
      unduh('Dokumentasi_' + (label || 'semua') + '_' + capTanggal() + '.kml',
            keKML(titik), 'application/vnd.google-earth.kml+xml')
  };
})();
