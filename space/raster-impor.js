/* Impor raster (JPG/PNG/PDF + GeoPDF) — disalin dari aplikasi HP (index.html) agar perilakunya sama. */

// Kompresi gambar raster di client agar memori HP ringan
async function kompresGambarRaster(file) {
  return new Promise(async (resolve, reject) => {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      try {
        if (!window.pdfjsLib) {
          /* pdf.js dibundel di dalam aplikasi (js/pdf.js) agar tetap jalan tanpa sinyal.
             CDN hanya cadangan kalau berkas lokal tidak ada. */
          const muat = (src) => new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = src; s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          });
          try { await muat('js/pdf.js'); }
          catch (_) { await muat('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'); }
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.js';
        }
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        // Target 300 DPI. Canvas HP punya batas luas piksel (sekitar 16 juta), jadi untuk
        // peta lebar 90 cm skala otomatis turun (sekitar 135-140 DPI) agar tidak gagal dirender.
        const dasar = page.getViewport({ scale: 1 });
        const skala = Math.min(300 / 72,
          Math.sqrt(16000000 / (dasar.width * dasar.height)),
          10000 / Math.max(dasar.width, dasar.height));
        const viewport = page.getViewport({ scale: skala });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        resolve({
          dataUrl,
          ukuranKB: Math.round(dataUrl.length * 0.75 / 1024),
          width: canvas.width,
          height: canvas.height,
          ratio: canvas.width / canvas.height
        });
      } catch (err) {
        reject(new Error('Gagal memproses PDF. Gunakan berkas gambar (JPG/PNG) atau hubungkan perangkat ke internet untuk mengunduh pustaka PDF.'));
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      // Tanpa pengecilan dan tanpa kompresi ulang: resolusi & ketajaman data asli dipertahankan.
      const img = new Image();
      img.onload = () => {
        const dataUrl = reader.result;
        resolve({
          dataUrl,
          ukuranKB: Math.round(dataUrl.length * 0.75 / 1024),
          width: img.naturalWidth,
          height: img.naturalHeight,
          ratio: img.naturalWidth / img.naturalHeight
        });
      };
      img.onerror = () => reject(new Error('Gagal membaca format gambar'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas'));
    reader.readAsDataURL(file);
  });
}

/* Ekstraksi Metadata Georeferensi GPS dari citra (EXIF) jika tersedia */
async function ekstrakExifGps(file){
  if (!file || (!file.type.includes('jpeg') && !file.name.match(/\.jpe?g$/i))) return null;
  try {
    const buf = await file.slice(0, 131072).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xFFD8) return null;
    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xFFE1) {
        offset += 2;
        const exifHeader = String.fromCharCode(...new Uint8Array(buf, offset, 4));
        if (exifHeader !== 'Exif') return null;
        offset += 6;
        const tiffStart = offset;
        const bigEndian = view.getUint16(tiffStart) === 0x4D4D;
        const ifdOffset = view.getUint32(tiffStart + 4, !bigEndian);
        let curOffset = tiffStart + ifdOffset;
        const numEntries = view.getUint16(curOffset, !bigEndian);
        curOffset += 2;
        let gpsOffset = 0;
        for (let i = 0; i < numEntries; i++) {
          const tag = view.getUint16(curOffset + i * 12, !bigEndian);
          if (tag === 0x8825) {
            gpsOffset = view.getUint32(curOffset + i * 12 + 8, !bigEndian);
            break;
          }
        }
        if (!gpsOffset) return null;
        let gpsPos = tiffStart + gpsOffset;
        const gpsEntries = view.getUint16(gpsPos, !bigEndian);
        gpsPos += 2;
        let latRef = 'N', lonRef = 'E', latValues = null, lonValues = null;
        for (let i = 0; i < gpsEntries; i++) {
          const tag = view.getUint16(gpsPos + i * 12, !bigEndian);
          const valOffset = view.getUint32(gpsPos + i * 12 + 8, !bigEndian);
          if (tag === 1) {
            latRef = String.fromCharCode(view.getUint8(gpsPos + i * 12 + 8));
          } else if (tag === 2) {
            const o = tiffStart + valOffset;
            latValues = [
              view.getUint32(o, !bigEndian) / view.getUint32(o + 4, !bigEndian),
              view.getUint32(o + 8, !bigEndian) / view.getUint32(o + 12, !bigEndian),
              view.getUint32(o + 16, !bigEndian) / view.getUint32(o + 20, !bigEndian)
            ];
          } else if (tag === 3) {
            lonRef = String.fromCharCode(view.getUint8(gpsPos + i * 12 + 8));
          } else if (tag === 4) {
            const o = tiffStart + valOffset;
            lonValues = [
              view.getUint32(o, !bigEndian) / view.getUint32(o + 4, !bigEndian),
              view.getUint32(o + 8, !bigEndian) / view.getUint32(o + 12, !bigEndian),
              view.getUint32(o + 16, !bigEndian) / view.getUint32(o + 20, !bigEndian)
            ];
          }
        }
        if (latValues && lonValues) {
          let lat = latValues[0] + latValues[1] / 60 + latValues[2] / 3600;
          if (latRef === 'S') lat = -lat;
          let lon = lonValues[0] + lonValues[1] / 60 + lonValues[2] / 3600;
          if (lonRef === 'W') lon = -lon;
          return { lat, lon };
        }
        return null;
      } else if ((marker & 0xFF00) === 0xFF00) {
        offset += view.getUint16(offset);
      } else {
        break;
      }
    }
  } catch(e){}
  return null;
}

/* Dekompresi stream FlateDecode menggunakan DecompressionStream bawaan browser */
async function dekompresiFlateStr(strChunk) {
  try {
    const bytes = new Uint8Array(strChunk.length);
    for (let i = 0; i < strChunk.length; i++) bytes[i] = strChunk.charCodeAt(i) & 0xFF;
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((a, c) => a + c.length, 0);
    const res = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) { res.set(c, off); off += c.length; }
    return new TextDecoder('latin1').decode(res);
  } catch(e) {
    try {
      const bytes = new Uint8Array(strChunk.length);
      for (let i = 0; i < strChunk.length; i++) bytes[i] = strChunk.charCodeAt(i) & 0xFF;
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLen = chunks.reduce((a, c) => a + c.length, 0);
      const res = new Uint8Array(totalLen);
      let off = 0;
      for (const c of chunks) { res.set(c, off); off += c.length; }
      return new TextDecoder('latin1').decode(res);
    } catch(err) {
      return null;
    }
  }
}

/* Ekstraksi Metadata Geospasial dari berkas PDF (GeoPDF / OGC Best Practice / Adobe GeoPDF) */
async function ekstrakGeoPdf(file){
  if (!file || (!file.type.includes('pdf') && !file.name.match(/\.pdf$/i))) return null;
  try {
    // Baca seluruh berkas jika <= 12MB, atau gabungkan 6MB awal + 4MB akhir jika berkas besar
    let binStr = '';
    if (file.size <= 12 * 1024 * 1024) {
      const buf = await file.arrayBuffer();
      binStr = new TextDecoder('latin1').decode(buf);
    } else {
      const headBuf = await file.slice(0, 6 * 1024 * 1024).arrayBuffer();
      const tailBuf = await file.slice(file.size - 4 * 1024 * 1024).arrayBuffer();
      binStr = new TextDecoder('latin1').decode(headBuf) + '\n' + new TextDecoder('latin1').decode(tailBuf);
    }

    let gpts = null, bbox = null, epsg = null;

    // 1. Ambil Ground Points /GPTS [ num num ... ] (OGC / Adobe GeoPDF) langsung dari teks
    const gptsMatch = binStr.match(/\/GPTS\s*\[\s*([^\]]+)\s*\]/i);
    if (gptsMatch) {
      const rawNums = gptsMatch[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
      if (rawNums.length >= 8) gpts = rawNums;
    }

    // 1b. Fallback format TerraGo GeoPDF (/Registration [ px py worldX worldY ... ])
    if (!gpts) {
      const regMatch = binStr.match(/\/Registration\s*\[\s*([^\]]+)\s*\]/i);
      if (regMatch) {
        const raw = regMatch[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
        if (raw.length >= 8) {
          let coords = [];
          for (let i = 0; i < raw.length; i += 4) {
            coords.push(raw[i + 2], raw[i + 3]);
          }
          if (coords.length >= 8) gpts = coords;
        }
      }
    }

    // 1c. Jika belum ditemukan dan PDF memiliki FlateDecode stream, coba dekompresi stream objek
    if (!gpts && /FlateDecode/i.test(binStr)) {
      const streamRegex = /\/Filter\s*\/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/gi;
      let match;
      let limit = 20; // dekompresi hingga 20 stream utama
      while ((match = streamRegex.exec(binStr)) !== null && limit-- > 0) {
        const decomp = await dekompresiFlateStr(match[1]);
        if (decomp && (/GPTS|Registration|\/GEO|\/Measure/i.test(decomp))) {
          const mGpts = decomp.match(/\/GPTS\s*\[\s*([^\]]+)\s*\]/i);
          if (mGpts) {
            const raw = mGpts[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
            if (raw.length >= 8) gpts = raw;
          }
          if (!gpts) {
            const mReg = decomp.match(/\/Registration\s*\[\s*([^\]]+)\s*\]/i);
            if (mReg) {
              const raw = mReg[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
              if (raw.length >= 8) {
                let coords = [];
                for (let i = 0; i < raw.length; i += 4) coords.push(raw[i + 2], raw[i + 3]);
                if (coords.length >= 8) gpts = coords;
              }
            }
          }
          if (!epsg) {
            const mEpsg = decomp.match(/\/EPSG\s+(\d+)/i) || decomp.match(/EPSG["\s,:\\]+(\d{4,5})/i);
            if (mEpsg) epsg = parseInt(mEpsg[1], 10);
          }
          if (!bbox) {
            const mBbox = decomp.match(/\/BBox\s*\[\s*([^\]]+)\s*\]/i);
            if (mBbox) {
              const raw = mBbox[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
              if (raw.length >= 4) bbox = raw;
            }
          }
          if (gpts) break;
        }
      }
    }

    // 2. Ambil Bounding Box /BBox [ minX minY maxX maxY ] jika belum dapat
    if (!bbox) {
      const bboxMatch = binStr.match(/\/BBox\s*\[\s*([^\]]+)\s*\]/i);
      if (bboxMatch) {
        const rawNums = bboxMatch[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
        if (rawNums.length >= 4) bbox = rawNums;
      }
    }

    // 3. Ambil kode EPSG jika belum dapat
    if (!epsg) {
      const epsgMatch = binStr.match(/\/EPSG\s+(\d+)/i) || binStr.match(/EPSG["\s,:\\]+(\d{4,5})/i);
      if (epsgMatch) epsg = parseInt(epsgMatch[1], 10);
    }

    if (!gpts) return null;

    let c1 = gpts[0], c2 = gpts[1];
    let isGeographic = Math.abs(c1) <= 180 && Math.abs(c2) <= 180;
    let lats = [], lons = [];

    if (isGeographic) {
      // Tentukan mana Lat dan mana Lon (di Indonesia Lat berkisar -11 s/d 6, Lon berkisar 95 s/d 141)
      const p1IsLat = Math.abs(c1) <= 90 && (Math.abs(c2) > 90 || Math.abs(c1) < Math.abs(c2));
      for (let i = 0; i < gpts.length; i += 2) {
        const v1 = gpts[i], v2 = gpts[i + 1];
        if (p1IsLat) { lats.push(v1); lons.push(v2); }
        else { lats.push(v2); lons.push(v1); }
      }
    } else {
      // Koordinat terproyeksi (UTM dalam satuan meter)
      let utmZone = 49, isSouth = true;
      if (epsg >= 32701 && epsg <= 32760) { utmZone = epsg - 32700; isSouth = true; }
      else if (epsg >= 32601 && epsg <= 32660) { utmZone = epsg - 32600; isSouth = false; }
      else {
        // Deteksi zona dari referensi wilayah pengguna atau default zona Jawa/Indonesia
        const refLon = (typeof S !== 'undefined' && S.posisi && S.posisi.lon) || 111.5;
        utmZone = Math.floor((refLon + 180) / 6) + 1;
        if (typeof S !== 'undefined' && S.posisi && S.posisi.lat > 0) isSouth = false;
      }
      for (let i = 0; i < gpts.length; i += 2) {
        let v1 = gpts[i], v2 = gpts[i + 1];
        let easting, northing;
        if (v1 < 1000000 && v2 >= 1000000) {
          easting = v1; northing = v2;
        } else if (v2 < 1000000 && v1 >= 1000000) {
          easting = v2; northing = v1;
        } else {
          easting = Math.min(v1, v2); northing = Math.max(v1, v2);
        }
        if (northing > 5000000) isSouth = true;
        const ll = utmKeLatLon(easting, northing, utmZone, isSouth);
        lats.push(ll.lat); lons.push(ll.lon);
      }
    }

    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    if (isNaN(minLat) || isNaN(minLon) || minLat === maxLat || minLon === maxLon) return null;

    return {
      isGeoPdf: true,
      epsg,
      bounds: [[minLat, minLon], [maxLat, maxLon]],
      center: [(minLat + maxLat) / 2, (minLon + maxLon) / 2],
      gpts,
      bbox
    };
  } catch (e) {
    return null;
  }
}

function utmKeLatLon(easting, northing, zone, isSouth) {
  const a = 6378137.0, f = 1 / 298.257223563;
  const e = Math.sqrt(2 * f - f * f), e1sq = (e * e) / (1 - e * e), k0 = 0.9996;
  const x = easting - 500000.0, y = isSouth ? northing - 10000000.0 : northing;
  const m = y / k0;
  const mu = m / (a * (1 - e * e / 4 - 3 * Math.pow(e, 4) / 64 - 5 * Math.pow(e, 6) / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const j1 = 3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32;
  const j2 = 21 * Math.pow(e1, 2) / 16 - 55 * Math.pow(e1, 4) / 32;
  const j3 = 151 * Math.pow(e1, 3) / 96;
  const fp = mu + j1 * Math.sin(2 * mu) + j2 * Math.sin(4 * mu) + j3 * Math.sin(6 * mu);
  const sinFp = Math.sin(fp), cosFp = Math.cos(fp), tanFp = Math.tan(fp);
  const c1 = e1sq * cosFp * cosFp, t1 = tanFp * tanFp;
  const n1 = a / Math.sqrt(1 - e * e * sinFp * sinFp);
  const r1 = a * (1 - e * e) / Math.pow(1 - e * e * sinFp * sinFp, 1.5);
  const d = x / (n1 * k0);
  let lat = fp - (n1 * tanFp / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * e1sq) * Math.pow(d, 4) / 24);
  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  let lon = (d - (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6) / cosFp;
  return { lat: lat * 180 / Math.PI, lon: lonOrigin + lon * 180 / Math.PI };
}

/* Ekstraksi Georeferensi dari ESRI World File (.jgw / .tfw / .wld / .jgwx) */
function parseWorldFile(jgwText, imgW, imgH, jgwxText = '', hintName = '', manualZone = null) {
  if (!jgwText) return null;
  const lines = jgwText.trim().split(/\r?\n/).map(l => parseFloat(l.trim())).filter(n => !isNaN(n));
  if (lines.length < 6) return null;
  const [A, D, B, E, C, F] = lines;
  if (A === 0 || E === 0) return null;

  // Bound limits di sistem koordinat peta
  const xMin = C - A / 2;
  const yMax = F - E / 2;
  const xMax = xMin + imgW * A;
  const yMin = yMax + imgH * E;

  let epsg = null;
  if (jgwxText) {
    const mEpsg = jgwxText.match(/EPSG["',:\s]+(\d{4,5})/i) || jgwxText.match(/AUTHORITY\["EPSG","(\d+)"\]/i);
    if (mEpsg) {
      epsg = parseInt(mEpsg[1], 10);
    } else {
      const mUtm = jgwxText.match(/UTM_Zone_(\d{1,2})([SN])/i) || jgwxText.match(/UTM\s*Zone\s*(\d{1,2})([SN])/i);
      if (mUtm) {
        const z = parseInt(mUtm[1], 10);
        epsg = mUtm[2].toUpperCase() === 'S' ? 32700 + z : 32600 + z;
      }
    }
  }

  const isGeographic = Math.abs(xMin) <= 180 && Math.abs(xMax) <= 180 && Math.abs(yMin) <= 90 && Math.abs(yMax) <= 90;

  if (isGeographic) {
    const minLat = Math.min(yMin, yMax), maxLat = Math.max(yMin, yMax);
    const minLon = Math.min(xMin, xMax), maxLon = Math.max(xMin, xMax);
    return {
      isGeoreferenced: true,
      tipe: 'World File (Geografis / WGS-84)',
      epsg: epsg || 4326,
      bounds: [[minLat, minLon], [maxLat, maxLon]],
      center: [(minLat + maxLat) / 2, (minLon + maxLon) / 2]
    };
  } else {
    // Koordinat terproyeksi (UTM)
    let utmZone = manualZone || 48, isSouth = true;
    if (epsg >= 32701 && epsg <= 32760) {
      utmZone = epsg - 32700; isSouth = true;
    } else if (epsg >= 32601 && epsg <= 32660) {
      utmZone = epsg - 32600; isSouth = false;
    } else if (!manualZone) {
      if (/banten|jakarta|jabar|lampung|serang|pandeglang|lebak|cilegon|tangerang/i.test(hintName)) {
        utmZone = 48; isSouth = true;
      } else if (/jateng|diy|jogja|semarang|solo/i.test(hintName)) {
        utmZone = 49; isSouth = true;
      } else if (/jatim|surabaya|malang|kediri|madura|bali|lombok/i.test(hintName)) {
        utmZone = 50; isSouth = true;
      } else {
        const refLon = (typeof S !== 'undefined' && S.posisi && S.posisi.lon) || 106.0;
        utmZone = Math.floor((refLon + 180) / 6) + 1;
        if (typeof S !== 'undefined' && S.posisi && S.posisi.lat > 0) isSouth = false;
      }
    }

    const c1 = utmKeLatLon(xMin, yMin, utmZone, isSouth);
    const c2 = utmKeLatLon(xMax, yMax, utmZone, isSouth);
    const minLat = Math.min(c1.lat, c2.lat), maxLat = Math.max(c1.lat, c2.lat);
    const minLon = Math.min(c1.lon, c2.lon), maxLon = Math.max(c1.lon, c2.lon);

    return {
      isGeoreferenced: true,
      tipe: 'World File (UTM Zona ' + utmZone + (isSouth ? 'S' : 'N') + ')',
      epsg: epsg || (isSouth ? 32700 + utmZone : 32600 + utmZone),
      utmZone,
      bounds: [[minLat, minLon], [maxLat, maxLon]],
      center: [(minLat + maxLat) / 2, (minLon + maxLon) / 2]
    };
  }
}
