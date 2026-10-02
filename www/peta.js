/* ===========================================================================
   PETA SEBARAN — dkpoint
   Mendukung:
   - Fullscreen interactive Leaflet map
   - Titik foto dengan pop-up thumbnail & ringkasan
   - Live marker posisi GPS pengguna (pulsing blue dot + akurasi)
   - Layer data spasial KML lokal (DOMParser mandiri tanpa dependensi luar)
   - Layer peta raster georeferensi (JPG/PDF) dengan opasitas & kalibrasi drag
   =========================================================================== */

const PETA = (function () {
  const LEAFLET_JS  = './js/leaflet.js';
  const LEAFLET_CSS = './js/leaflet.css';
  const LEAFLET_CDN_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_CDN_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

  const WARNA = ['#1B5E20', '#C62828', '#1565C0', '#EF6C00', '#6A1B9A',
                 '#00838F', '#AD1457', '#4E342E'];

  function warnaRoom(nama) {
    let h = 0;
    for (let i = 0; i < String(nama).length; i++) h = (h * 31 + String(nama).charCodeAt(i)) % 9973;
    return WARNA[h % WARNA.length];
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let janjiMuat = null;
  function muatLeaflet() {
    if (window.L) return Promise.resolve();
    if (janjiMuat) return janjiMuat;
    janjiMuat = new Promise((res, rej) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS;
      css.onerror = () => { css.href = LEAFLET_CDN_CSS; };
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET_JS;
      js.onload = () => res();
      js.onerror = () => {
        // Fallback ke CDN jika berkas lokal tidak terakses
        const cdn = document.createElement('script');
        cdn.src = LEAFLET_CDN_JS;
        cdn.onload = () => res();
        cdn.onerror = () => { janjiMuat = null; rej(new Error('Gagal memuat pustaka peta')); };
        document.head.appendChild(cdn);
      };
      document.head.appendChild(js);
    });
    return janjiMuat;
  }

  const punyaKoordinat = t => t && t.lat != null && t.lon != null &&
                              isFinite(t.lat) && isFinite(t.lon);

  const petaTersimpan = new WeakMap();

  // 1. Google Satelit (sesuai peta google satelite.lyr)
  const URL_GOOGLE_SAT = 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
  const ATRIBUSI_GOOGLE_SAT = '&copy; Google Satellite';

  // 2. Google Hybrid (Satelit + Label Jalan & Toponimi)
  const URL_GOOGLE_HYB = 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
  const ATRIBUSI_GOOGLE_HYB = '&copy; Google Hybrid';

  // 3. Esri World Imagery (Alternatif Citra Satelit Stabil)
  const URL_ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const ATRIBUSI_ESRI_SAT = '&copy; Esri World Imagery';

  // 4. Google Maps / Peta Jalan (sesuai peta google map.lyr)
  const URL_GOOGLE_MAP = 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
  const ATRIBUSI_GOOGLE_MAP = '&copy; Google Maps';

  // 5. OpenStreetMap (OSM - Ringan & Cepat Offline)
  const URL_TILE_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATRIBUSI_OSM = '&copy; OpenStreetMap contributors';

  // Fokus Pulau Jawa
  const PUSAT_JAWA = [-7.5, 110.5];
  const ZOOM_JAWA = 8;

  /* ------------------- INISIALISASI PETA ------------------- */
  async function gambar(wadah, titik, opsi) {
    opsi = opsi || {};
    const berkoordinat = (titik || []).filter(punyaKoordinat);

    try {
      await muatLeaflet();
    } catch (e) {
      wadah.innerHTML = '<div class="peta-kosong">Peta perlu sambungan internet saat pertama kali memuat latar.<br>' +
        'Data titik tetap aman. Silakan coba lagi setelah ada sinyal, atau unduh berkas KML/GeoJSON.</div>';
      return { jumlah: berkoordinat.length, gagalMuat: true };
    }

    let peta = petaTersimpan.get(wadah);
    if (!peta && wadah && wadah._leaflet_id) {
      try {
        delete wadah._leaflet_id;
        wadah.innerHTML = '';
      } catch (e) {}
    }
    if (!peta) {
      wadah.innerHTML = '';
      peta = L.map(wadah, {
        scrollWheelZoom: true,
        zoomControl: false,
        maxZoom: 22
      });

      // 1. Layer Google Satelit (peta google satelite.lyr)
      peta.lapisGoogleSat = L.tileLayer(URL_GOOGLE_SAT, {
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 22, maxNativeZoom: 20,
        keepBuffer: 2, updateWhenIdle: true, updateWhenZooming: false,
        attribution: ATRIBUSI_GOOGLE_SAT
      });

      // 2. Layer Google Hybrid (Satelit + Jalan)
      peta.lapisGoogleHyb = L.tileLayer(URL_GOOGLE_HYB, {
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 22, maxNativeZoom: 20,
        keepBuffer: 2, updateWhenIdle: true, updateWhenZooming: false,
        attribution: ATRIBUSI_GOOGLE_HYB
      });

      // 3. Layer Esri Satelit (Alternatif Satelit Stabil)
      peta.lapisEsriSat = L.tileLayer(URL_ESRI_SAT, {
        maxZoom: 22, maxNativeZoom: 19,
        keepBuffer: 2, updateWhenIdle: true, updateWhenZooming: false,
        attribution: ATRIBUSI_ESRI_SAT
      });

      // 4. Layer Google Map Jalan (peta google map.lyr)
      peta.lapisGoogleMap = L.tileLayer(URL_GOOGLE_MAP, {
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 22, maxNativeZoom: 20,
        keepBuffer: 2, updateWhenIdle: true, updateWhenZooming: false,
        attribution: ATRIBUSI_GOOGLE_MAP
      });

      // 5. Layer OpenStreetMap (Ringan & Offline)
      peta.lapisOSM = L.tileLayer(URL_TILE_OSM, {
        subdomains: ['a', 'b', 'c'],
        maxZoom: 22, maxNativeZoom: 19,
        keepBuffer: 2, updateWhenIdle: true, updateWhenZooming: false,
        attribution: ATRIBUSI_OSM
      });

      // Baca preferensi tersimpan, default ke Google Satelit
      let prefBasemap = 'google_satelit';
      try { prefBasemap = localStorage.getItem('dkpoint_basemap') || 'google_satelit'; } catch (e) {}
      peta.tipeBasemap = prefBasemap;

      if (prefBasemap === 'google_map') {
        peta.lapisGoogleMap.addTo(peta);
      } else if (prefBasemap === 'google_hybrid') {
        peta.lapisGoogleHyb.addTo(peta);
      } else if (prefBasemap === 'esri_satelit') {
        peta.lapisEsriSat.addTo(peta);
      } else if (prefBasemap === 'osm') {
        peta.lapisOSM.addTo(peta);
      } else {
        peta.lapisGoogleSat.addTo(peta);
      }

      // Grup layer bertingkat
      peta.lapisRaster = new Map(); // id -> L.imageOverlay
      peta.lapisKML = L.layerGroup().addTo(peta);
      peta.lapisTitik = L.layerGroup().addTo(peta);
      peta.lapisUser = L.layerGroup().addTo(peta);

      petaTersimpan.set(wadah, peta);
    }

  // Bersihkan titik lama
  peta.lapisTitik.clearLayers();

  // Gambar titik foto lapangan
  berkoordinat.forEach(t => {
    const warna = warnaRoom(t.room);
    const tanda = L.circleMarker([t.lat, t.lon], {
      radius: 8, color: '#ffffff', weight: 2.5,
      fillColor: warna, fillOpacity: 0.95
    });

    if (t.akurasi > 0 && t.akurasi < 500) {
      L.circle([t.lat, t.lon], {
        radius: t.akurasi, color: warna, weight: 1,
        opacity: 0.35, fillColor: warna, fillOpacity: 0.08
      }).addTo(peta.lapisTitik);
    }

    // Pop-up foto ringkas & bersih
    const htmlPopup = `
      <div class="popup-foto-kartu">
        ${t.thumb ? `<div class="popup-foto-img-wadah"><img src="${t.thumb}" class="popup-foto-img" alt="Foto"></div>` : ''}
        <div class="popup-foto-info">
          <div class="popup-foto-baris"><b>👤 Petugas:</b> <span>${esc(t.nama || '-')}</span></div>
          <div class="popup-foto-baris"><b>📁 Room:</b> <span>${esc(t.room || '-')}</span></div>
          <div class="popup-foto-baris"><b>🕒 Waktu:</b> <span>${esc(t.waktu || '-')}</span></div>
          ${t.catatan && t.catatan !== '-' ? `<div class="popup-foto-catatan">"${esc(t.catatan)}"</div>` : ''}
        </div>
      </div>
    `;

    tanda.bindPopup(htmlPopup, { maxWidth: 240, minWidth: 190, className: 'popup-dkpoint-wadah' });

    // Label Titik Foto Lapangan (digeser sedikit ke kanan atas agar tidak tumpang tindih dengan pin)
    const labelTeks = t.catatan && t.catatan !== '-' ? t.catatan : (t.nama || 'Foto');
    tanda.bindTooltip(esc(labelTeks), {
      permanent: true,
      direction: 'right',
      offset: [12, -10],
      className: 'label-titik-foto'
    });

    tanda.addTo(peta.lapisTitik);
  });

  // Sesuaikan batas pandangan jika ada titik dan opsi minta fit
  if (berkoordinat.length && opsi.fit !== false) {
    const batas = L.latLngBounds(berkoordinat.map(t => [t.lat, t.lon]));
    peta.fitBounds(batas, { padding: [35, 35], maxZoom: 16 });
  } else if (!berkoordinat.length && (!peta.getCenter() || !peta.getCenter().lat || (peta.getCenter().lat === 0 && peta.getCenter().lng === 0))) {
    // Default khusus Pulau Jawa sesuai permintaan
    peta.setView(PUSAT_JAWA, ZOOM_JAWA);
  }

  setTimeout(() => peta.invalidateSize(), 150);

    return { peta, jumlah: berkoordinat.length };
  }

  /* ------------------- POSISI GPS PENGGUNA ------------------- */
  function perbaruiLokasiUser(peta, pos) {
    if (!peta || !peta.lapisUser) return;
    peta.lapisUser.clearLayers();
    if (!pos || pos.lat == null || pos.lon == null) return;

    const latlng = [pos.lat, pos.lon];
    const akurasi = pos.akurasi || 15;

    // Lingkaran akurasi
    L.circle(latlng, {
      radius: akurasi,
      color: '#1E88E5',
      weight: 1.5,
      opacity: 0.5,
      fillColor: '#2196F3',
      fillOpacity: 0.12
    }).addTo(peta.lapisUser);

    // Titik denyut biru posisi pengguna
    L.circleMarker(latlng, {
      radius: 9,
      color: '#ffffff',
      weight: 3,
      fillColor: '#1976D2',
      fillOpacity: 1
    }).bindTooltip('Lokasi Anda berdiri (±' + Math.round(akurasi) + ' m)', { direction: 'top' })
      .addTo(peta.lapisUser);
  }

  function pusatkanKeUser(peta, pos) {
    if (!peta || !pos || pos.lat == null) return false;
    peta.setView([pos.lat, pos.lon], Math.max(peta.getZoom(), 16), { animate: true });
    return true;
  }

  /* ------------------- BASEMAP (GOOGLE SATELIT, HYBRID, ESRI SATELIT, GOOGLE MAP, OSM) ------------------- */
  function gantiBasemap(peta, tipe) {
    if (!peta) return 'google_satelit';
    const targets = ['google_satelit', 'google_hybrid', 'esri_satelit', 'google_map', 'osm'];
    const idx = targets.indexOf(peta.tipeBasemap);
    const target = tipe || targets[(idx + 1) % targets.length] || 'google_satelit';
    
    // Aman bersihkan semua basemap aktif
    try { if (peta.lapisGoogleSat) peta.removeLayer(peta.lapisGoogleSat); } catch (e) {}
    try { if (peta.lapisGoogleHyb) peta.removeLayer(peta.lapisGoogleHyb); } catch (e) {}
    try { if (peta.lapisEsriSat) peta.removeLayer(peta.lapisEsriSat); } catch (e) {}
    try { if (peta.lapisGoogleMap) peta.removeLayer(peta.lapisGoogleMap); } catch (e) {}
    try { if (peta.lapisOSM) peta.removeLayer(peta.lapisOSM); } catch (e) {}
    
    let label = 'Google Satelit';
    if (target === 'google_hybrid') {
      try { peta.lapisGoogleHyb.addTo(peta); } catch (e) { peta.lapisGoogleSat.addTo(peta); }
      label = 'Google Satelit Hybrid';
    } else if (target === 'esri_satelit') {
      try { peta.lapisEsriSat.addTo(peta); } catch (e) { peta.lapisGoogleSat.addTo(peta); }
      label = 'Esri World Imagery';
    } else if (target === 'google_map') {
      try { peta.lapisGoogleMap.addTo(peta); } catch (e) { peta.lapisOSM.addTo(peta); }
      label = 'Google Peta Jalan';
    } else if (target === 'osm') {
      try { peta.lapisOSM.addTo(peta); } catch (e) {}
      label = 'Peta Jalan (OpenStreetMap)';
    } else {
      try { peta.lapisGoogleSat.addTo(peta); } catch (e) {}
      label = 'Google Satelit';
    }
    
    peta.tipeBasemap = target;
    try { localStorage.setItem('dkpoint_basemap', target); } catch (e) {}
    if (typeof window.pesan === 'function') {
      window.pesan('Basemap: ' + label);
    }
    return peta.tipeBasemap;
  }

  function dapatkanBasemap(peta) {
    return (peta && peta.tipeBasemap) || 'google_satelit';
  }

  function fokusJawa(peta) {
    if (!peta) return;
    peta.setView(PUSAT_JAWA, ZOOM_JAWA, { animate: true });
  }

  /* ------------------- PARSER KML MANDIRI (OFFLINE) ------------------- */
  function parseKoordinatKML(teks) {
    if (!teks) return [];
    return teks.trim().split(/\s+/).map(baris => {
      const p = baris.split(',');
      if (p.length >= 2) {
        const lon = parseFloat(p[0]), lat = parseFloat(p[1]);
        if (!isNaN(lat) && !isNaN(lon)) return [lat, lon];
      }
      return null;
    }).filter(Boolean);
  }

  function parseKML(kmlString, warnaDefault = '#2E7D32', labelCol = 'name', tampilkanLabel = true) {
    if (!window.L) return null;
    const parser = new DOMParser();
    const xml = parser.parseFromString(kmlString, 'text/xml');
    const group = L.featureGroup();
    group.kmlProps = new Set(['name', 'description']);

    const placemarks = xml.querySelectorAll('Placemark');
    placemarks.forEach(pm => {
      const nama = (pm.querySelector('name') || {}).textContent || 'Objek KML';
      const desk = (pm.querySelector('description') || {}).textContent || '';
      
      const props = { name: nama, description: desk };
      const extendedData = pm.querySelectorAll('ExtendedData Data, ExtendedData SimpleData');
      extendedData.forEach(d => {
        const key = d.getAttribute('name');
        const val = (d.querySelector('value') || d).textContent;
        if (key) { props[key] = val; group.kmlProps.add(key); }
      });
      
      const labelText = props[labelCol] || '';

      const addTooltip = (layer, jenis = 'polygon') => {
        const kmlPopupHtml = `
          <div class="popup-kml-card">
            <div class="popup-kml-title"><b>${esc(nama)}</b></div>
            ${desk ? `<div class="popup-kml-desc"><small>${esc(desk)}</small></div>` : ''}
          </div>`;
        layer.bindPopup(kmlPopupHtml, { maxWidth: 250, className: 'popup-kml-card' });
        if (tampilkanLabel !== false && labelText) {
          // Sedikit digeser agar tidak tumpang tindih dengan fitur aslinya
          const arah = jenis === 'point' ? 'right' : 'center';
          const offset = jenis === 'point' ? [10, -6] : [0, -10];
          layer.bindTooltip(labelText, {
            permanent: true,
            direction: arah,
            offset: offset,
            className: 'kml-label'
          });
        }
        group.addLayer(layer);
      };

      // Poligon
      const polygons = pm.querySelectorAll('Polygon');
      polygons.forEach(poly => {
        const outer = poly.querySelector('outerBoundaryIs coordinates');
        if (outer) {
          const latlngs = parseKoordinatKML(outer.textContent);
          if (latlngs.length >= 3) {
            const layer = L.polygon(latlngs, {
              color: warnaDefault, weight: 2, fillColor: warnaDefault, fillOpacity: 0.25
            });
            addTooltip(layer, 'polygon');
          }
        }
      });

      // Garis (LineString)
      const lines = pm.querySelectorAll('LineString');
      lines.forEach(line => {
        const coords = line.querySelector('coordinates');
        if (coords) {
          const latlngs = parseKoordinatKML(coords.textContent);
          if (latlngs.length >= 2) {
            const layer = L.polyline(latlngs, { color: warnaDefault, weight: 3, opacity: 0.85 });
            addTooltip(layer, 'line');
          }
        }
      });

      // Titik (Point)
      const points = pm.querySelectorAll('Point');
      points.forEach(pt => {
        const coords = pt.querySelector('coordinates');
        if (coords) {
          const latlngs = parseKoordinatKML(coords.textContent);
          if (latlngs.length >= 1) {
            const layer = L.circleMarker(latlngs[0], {
              radius: 6, color: '#fff', weight: 2, fillColor: warnaDefault, fillOpacity: 0.9
            });
            addTooltip(layer, 'point');
          }
        }
      });
    });

    return group;
  }

  /* ------------------- PETA RASTER GEOREFERENSI ------------------- */
  function pasangRaster(peta, id, dataUrl, bounds, opasitas = 0.75) {
    if (!peta || !window.L) return null;
    hapusRaster(peta, id);

    const b = L.latLngBounds(bounds);
    const overlay = L.imageOverlay(dataUrl, b, {
      opacity: opasitas,
      interactive: true
    }).addTo(peta);

    overlay.idRaster = id;
    overlay.currentBounds = b;
    peta.lapisRaster.set(id, overlay);
    return overlay;
  }

  function setOpasitasRaster(peta, id, opasitas) {
    if (!peta || !peta.lapisRaster) return;
    const ov = peta.lapisRaster.get(id);
    if (ov) ov.setOpacity(opasitas);
  }

  function hapusRaster(peta, id) {
    if (!peta || !peta.lapisRaster) return;
    const ov = peta.lapisRaster.get(id);
    if (ov) {
      peta.removeLayer(ov);
      peta.lapisRaster.delete(id);
    }
  }

  function geserRaster(peta, id, dLat, dLon) {
    if (!peta || !peta.lapisRaster) return null;
    const ov = peta.lapisRaster.get(id);
    if (!ov) return null;
    const b = ov.getBounds();
    const sw = b.getSouthWest(), ne = b.getNorthEast();
    const newBounds = L.latLngBounds(
      [sw.lat + dLat, sw.lng + dLon],
      [ne.lat + dLat, ne.lng + dLon]
    );
    ov.setBounds(newBounds);
    ov.currentBounds = newBounds;
    return newBounds;
  }

  function skalaRaster(peta, id, faktor) {
    if (!peta || !peta.lapisRaster) return null;
    const ov = peta.lapisRaster.get(id);
    if (!ov) return null;
    const b = ov.getBounds();
    const c = b.getCenter();
    const sw = b.getSouthWest(), ne = b.getNorthEast();
    const dLat = (ne.lat - sw.lat) * faktor / 2;
    const dLng = (ne.lng - sw.lng) * faktor / 2;
    const newBounds = L.latLngBounds(
      [c.lat - dLat, c.lng - dLng],
      [c.lat + dLat, c.lng + dLng]
    );
    ov.setBounds(newBounds);
    ov.currentBounds = newBounds;
    return newBounds;
  }

  /* Drag & Kalibrasi Freehand Sentuh (Smartphone & Desktop):
     Mendukung body drag langsung dan 4 pin jangkar sudut (NW, NE, SE, SW) */
  let dragAktif = false;
  let dragHandler = null;

  function aktifkanDragRaster(peta, id, onSelesaiGeser) {
    nonaktifkanDragRaster(peta);
    const ov = peta.lapisRaster.get(id);
    if (!ov) return;

    dragAktif = true;
    let titikAwal = null;
    let sedangDrag = false;

    const imgEl = ov.getElement();
    if (imgEl) {
      imgEl.style.cursor = 'grab';
      imgEl.style.touchAction = 'none';
      imgEl.style.userSelect = 'none';
      imgEl.style.webkitUserSelect = 'none';
      imgEl.draggable = false;
    }

    // Buat 4 Pin Sudut (Corner Handles) Interaktif
    const buatIconPin = (label) => L.divIcon({
      className: 'pin-sudut-raster',
      html: `<div style="width:26px;height:26px;border-radius:50%;background:#007AFF;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;touch-action:none;cursor:nwse-resize">${label}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const bAwal = ov.getBounds();
    const pinNW = L.marker([bAwal.getNorth(), bAwal.getWest()], { draggable: true, icon: buatIconPin('↖') }).addTo(peta);
    const pinNE = L.marker([bAwal.getNorth(), bAwal.getEast()], { draggable: true, icon: buatIconPin('↗') }).addTo(peta);
    const pinSE = L.marker([bAwal.getSouth(), bAwal.getEast()], { draggable: true, icon: buatIconPin('↘') }).addTo(peta);
    const pinSW = L.marker([bAwal.getSouth(), bAwal.getWest()], { draggable: true, icon: buatIconPin('↙') }).addTo(peta);

    const sinkronkanPin = (b) => {
      pinNW.setLatLng([b.getNorth(), b.getWest()]);
      pinNE.setLatLng([b.getNorth(), b.getEast()]);
      pinSE.setLatLng([b.getSouth(), b.getEast()]);
      pinSW.setLatLng([b.getSouth(), b.getWest()]);
    };

    const onPinDrag = (corner, latlng) => {
      const b = ov.getBounds();
      let n = b.getNorth(), s = b.getSouth(), w = b.getWest(), e = b.getEast();
      if (corner === 'NW') { n = latlng.lat; w = latlng.lng; }
      else if (corner === 'NE') { n = latlng.lat; e = latlng.lng; }
      else if (corner === 'SE') { s = latlng.lat; e = latlng.lng; }
      else if (corner === 'SW') { s = latlng.lat; w = latlng.lng; }

      // Pastikan urutan koordinat tetap valid
      const newBounds = L.latLngBounds(
        [Math.min(s, n), Math.min(w, e)],
        [Math.max(s, n), Math.max(w, e)]
      );
      ov.setBounds(newBounds);
      ov.currentBounds = newBounds;
      sinkronkanPin(newBounds);
      if (onSelesaiGeser) onSelesaiGeser(newBounds);
    };

    pinNW.on('drag', e => onPinDrag('NW', e.target.getLatLng()));
    pinNE.on('drag', e => onPinDrag('NE', e.target.getLatLng()));
    pinSE.on('drag', e => onPinDrag('SE', e.target.getLatLng()));
    pinSW.on('drag', e => onPinDrag('SW', e.target.getLatLng()));

    function getEventLatLng(e) {
      if (e.latlng) return e.latlng;
      const oe = e.originalEvent || e;
      const touch = (oe.touches && oe.touches[0]) || (oe.changedTouches && oe.changedTouches[0]);
      if (touch) {
        const pt = peta.mouseEventToContainerPoint(touch);
        return peta.containerPointToLatLng(pt);
      }
      if (oe.clientX != null) {
        const pt = peta.mouseEventToContainerPoint(oe);
        return peta.containerPointToLatLng(pt);
      }
      return null;
    }

    const onStart = (e) => {
      const pos = getEventLatLng(e);
      if (!pos) return;
      const b = ov.getBounds();
      // Hanya mulai geser jika sentuhan berada di atas gambar raster
      if (b.contains(pos)) {
        sedangDrag = true;
        titikAwal = pos;
        peta.dragging.disable();
        if (imgEl) imgEl.style.cursor = 'grabbing';
        const oe = e.originalEvent || e;
        if (oe.stopPropagation) oe.stopPropagation();
        if (oe.cancelable && oe.preventDefault) oe.preventDefault();
      }
    };

    const onMove = (e) => {
      if (!sedangDrag || !titikAwal) return;
      const pos = getEventLatLng(e);
      if (!pos) return;
      const dLat = pos.lat - titikAwal.lat;
      const dLon = pos.lng - titikAwal.lng;
      titikAwal = pos;
      const nb = geserRaster(peta, id, dLat, dLon);
      if (nb) sinkronkanPin(nb);
      if (onSelesaiGeser) onSelesaiGeser(nb);
      const oe = e.originalEvent || e;
      if (oe.cancelable && oe.preventDefault) oe.preventDefault();
    };

    const onEnd = () => {
      if (sedangDrag) {
        sedangDrag = false;
        titikAwal = null;
        peta.dragging.enable();
        if (imgEl) imgEl.style.cursor = 'grab';
      }
    };

    ov.on('mousedown touchstart', onStart);
    peta.on('mousedown touchstart', onStart);

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    dragHandler = {
      ov,
      pins: [pinNW, pinNE, pinSE, pinSW],
      onStart,
      onMove,
      onEnd,
      cleanup: () => {
        ov.off('mousedown touchstart', onStart);
        peta.off('mousedown touchstart', onStart);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchend', onEnd);
        window.removeEventListener('touchcancel', onEnd);
        [pinNW, pinNE, pinSE, pinSW].forEach(p => {
          if (peta.hasLayer(p)) peta.removeLayer(p);
        });
        if (imgEl) imgEl.style.cursor = '';
      }
    };
  }

  function nonaktifkanDragRaster(peta) {
    if (!dragAktif || !dragHandler) return;
    dragAktif = false;
    if (dragHandler.cleanup) dragHandler.cleanup();
    peta.dragging.enable();
    dragHandler = null;
  }

  function pusatkanRasterKeTampilan(peta, id) {
    if (!peta || !peta.lapisRaster) return null;
    const ov = peta.lapisRaster.get(id);
    if (!ov) return null;
    const centerTarget = peta.getCenter();
    const b = ov.getBounds();
    const c = b.getCenter();
    const dLat = centerTarget.lat - c.lat;
    const dLon = centerTarget.lng - c.lng;
    return geserRaster(peta, id, dLat, dLon);
  }

  function zoomKeBounds(peta, bounds, padding = [40, 40]) {
    if (!peta || !bounds || !window.L) return false;
    try {
      const b = L.latLngBounds(bounds);
      if (b.isValid()) {
        peta.fitBounds(b, { padding, maxZoom: 18, animate: true });
        return true;
      }
    } catch (e) {}
    return false;
  }

  /* Kalibrasi 2 Titik Ikat (Ground Control Points):
     Menyesuaikan translasi, rotasi, dan skala seragam tanpa distorsi rasio gambar */
  function kalibrasiDuaTitikIkat(peta, id, r1, m1, r2, m2) {
    if (!peta || !peta.lapisRaster) return null;
    const ov = peta.lapisRaster.get(id);
    if (!ov) return null;

    const b = ov.getBounds();
    const sw = b.getSouthWest(), ne = b.getNorthEast();

    // Vektor di raster (r1 -> r2)
    const dLatR = r2.lat - r1.lat;
    const dLonR = r2.lng - r1.lng;
    const distR = Math.hypot(dLatR, dLonR);
    if (distR <= 1e-9) return null;

    // Vektor di peta target (m1 -> m2)
    const dLatM = m2.lat - m1.lat;
    const dLonM = m2.lng - m1.lng;
    const distM = Math.hypot(dLatM, dLonM);
    if (distM <= 1e-9) return null;

    // Skala seragam & rotasi tanpa ubah rasio
    const skala = distM / distR;
    const angleR = Math.atan2(dLatR, dLonR);
    const angleM = Math.atan2(dLatM, dLonM);
    const dAngle = angleM - angleR;
    const cosA = Math.cos(dAngle), sinA = Math.sin(dAngle);

    function transformTitik(p) {
      const dx = p.lng - r1.lng;
      const dy = p.lat - r1.lat;
      const rx = skala * (dx * cosA - dy * sinA);
      const ry = skala * (dx * sinA + dy * cosA);
      return L.latLng(m1.lat + ry, m1.lng + rx);
    }

    const pSW = transformTitik(sw);
    const pNE = transformTitik(ne);
    const pNW = transformTitik(L.latLng(ne.lat, sw.lng));
    const pSE = transformTitik(L.latLng(sw.lat, ne.lng));

    const minLat = Math.min(pSW.lat, pNE.lat, pNW.lat, pSE.lat);
    const maxLat = Math.max(pSW.lat, pNE.lat, pNW.lat, pSE.lat);
    const minLng = Math.min(pSW.lng, pNE.lng, pNW.lng, pSE.lng);
    const maxLng = Math.max(pSW.lng, pNE.lng, pNW.lng, pSE.lng);

    const newBounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
    ov.setBounds(newBounds);
    ov.currentBounds = newBounds;
    return newBounds;
  }

  /* ------------------- EKSPOR DATA ------------------- */
  function keGeoJSON(titik) {
    return JSON.stringify({
      type: 'FeatureCollection',
      name: 'Dokumentasi Foto Lapangan dkpoint',
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

    const keAABBGGRR = h => {
      const r = h.slice(1, 3), g = h.slice(3, 5), b = h.slice(5, 7);
      return 'ff' + b.toLowerCase() + g.toLowerCase() + r.toLowerCase();
    };

    const idGaya = nama => 'gaya_' + String(nama).replace(/[^\w]/g, '_');

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n' +
      '<name>Dokumentasi Foto Lapangan dkpoint</name>\n' +
      Object.keys(gaya).map(r =>
        '<Style id="' + idGaya(r) + '"><IconStyle><color>' + keAABBGGRR(gaya[r]) + '</color>' +
        '<scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>' +
        '</IconStyle></Style>\n').join('') +
      daftar.map(t => {
        const fotoTag = t.thumb
          ? '<div style="margin-bottom:8px;text-align:center;"><img src="' + t.thumb + '" style="max-width:320px;width:100%;height:auto;border-radius:6px;border:1px solid #ccc;box-shadow:0 1px 3px rgba(0,0,0,0.15);" alt="Foto" /></div>'
          : '';
        const driveLink = t.linkDrive
          ? '<div style="margin-top:6px;"><a href="' + esc(t.linkDrive) + '" target="_blank" rel="noopener" style="color:#1a73e8;font-weight:600;text-decoration:none;">🔗 Buka Berkas Asli di Cloud/Drive</a></div>'
          : '';
        const barisBerkas = t.namaBerkas
          ? '<tr><td style="color:#666;padding:2px 4px 2px 0;">Berkas:</td><td style="padding:2px 0;word-break:break-all;"><b>' + esc(t.namaBerkas) + '</b></td></tr>'
          : '';

        return '<Placemark>\n' +
          '  <name>' + esc((t.namaBerkas || t.nama || 'Foto') + ' — ' + (t.waktu || '')) + '</name>\n' +
          '  <styleUrl>#' + idGaya(t.room || 'lain') + '</styleUrl>\n' +
          '  <description><![CDATA[\n' +
          '    <div style="font-family:Roboto,Arial,sans-serif;font-size:12.5px;line-height:1.45;color:#222;max-width:330px;">\n' +
          '      ' + fotoTag + '\n' +
          '      <table style="width:100%;border-collapse:collapse;font-size:12px;">\n' +
          barisBerkas +
          '        <tr><td style="color:#666;padding:2px 4px 2px 0;">Petugas:</td><td style="padding:2px 0;"><b>' + esc(t.nama || '-') + '</b></td></tr>\n' +
          '        <tr><td style="color:#666;padding:2px 4px 2px 0;">Room:</td><td style="padding:2px 0;">' + esc(t.room || '-') + '</td></tr>\n' +
          '        <tr><td style="color:#666;padding:2px 4px 2px 0;">Waktu:</td><td style="padding:2px 0;">' + esc(t.waktu || '-') + '</td></tr>\n' +
          '        <tr><td style="color:#666;padding:2px 4px 2px 0;">Koordinat:</td><td style="padding:2px 0;">' + Number(t.lat).toFixed(6) + ', ' + Number(t.lon).toFixed(6) + '</td></tr>\n' +
          '        <tr><td style="color:#666;padding:2px 4px 2px 0;">Akurasi GPS:</td><td style="padding:2px 0;">' + (t.akurasi ? '±' + Math.round(t.akurasi) + ' m' : 'tidak tercatat') + '</td></tr>\n' +
          (t.catatan && t.catatan !== '-' ? '        <tr><td style="color:#666;padding:2px 4px 2px 0;vertical-align:top;">Catatan:</td><td style="padding:2px 0;font-style:italic;">"' + esc(t.catatan) + '"</td></tr>\n' : '') +
          '      </table>\n' +
          '      ' + driveLink + '\n' +
          '    </div>\n' +
          '  ]]></description>\n' +
          '  <Point><coordinates>' + Number(t.lon) + ',' + Number(t.lat) + ',0</coordinates></Point>\n' +
          '</Placemark>\n';
      }).join('') +
      '</Document></kml>';
  }

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
    perbaruiLokasiUser: perbaruiLokasiUser,
    pusatkanKeUser: pusatkanKeUser,
    gantiBasemap: gantiBasemap,
    dapatkanBasemap: dapatkanBasemap,
    fokusJawa: fokusJawa,
    parseKML: parseKML,
    pasangRaster: pasangRaster,
    setOpasitasRaster: setOpasitasRaster,
    hapusRaster: hapusRaster,
    geserRaster: geserRaster,
    skalaRaster: skalaRaster,
    aktifkanDragRaster: aktifkanDragRaster,
    nonaktifkanDragRaster: nonaktifkanDragRaster,
    pusatkanRasterKeTampilan: pusatkanRasterKeTampilan,
    zoomKeBounds: zoomKeBounds,
    kalibrasiDuaTitikIkat: kalibrasiDuaTitikIkat,
    keGeoJSON: keGeoJSON,
    keKML: keKML,
    unduhGeoJSON: (titik, label) =>
      unduh('Dokumentasi_' + (label || 'semua') + '_' + capTanggal() + '.geojson',
            keGeoJSON(titik), 'application/geo+json'),
    unduhKML: (titik, label) =>
      unduh('Dokumentasi_' + (label || 'semua') + '_' + capTanggal() + '.kml',
            keKML(titik), 'application/vnd.google-earth.kml+xml')
  };
})();
