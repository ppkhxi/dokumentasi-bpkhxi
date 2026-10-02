/**
 * exif-gps.js - Modul Geotagging EXIF untuk dkpoint
 * Menyematkan metadata EXIF WGS-84 standar (APP1) ke dalam berkas foto JPEG.
 * Kompatibel dengan QGIS (Import Geotagged Photos), ArcGIS, ExifTool, dan Google Earth.
 */
(function (global) {
  'use strict';

  function dataUrlKeUint8Array(dataUrl) {
    const b64 = dataUrl.split(',')[1] || '';
    const bin = atob(b64);
    const len = bin.length;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function uint8ArrayKeDataUrl(u8) {
    let bin = '';
    const len = u8.byteLength;
    const chunkSize = 16384;
    for (let i = 0; i < len; i += chunkSize) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + chunkSize, len)));
    }
    return 'data:image/jpeg;base64,' + btoa(bin);
  }

  function toDms(val) {
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const rem = (abs - deg) * 60;
    const min = Math.floor(rem);
    const sec = (rem - min) * 60;
    return [
      [deg, 1],
      [min, 1],
      [Math.round(sec * 10000), 10000]
    ];
  }

  function buatExifApp1({ lat, lon, alt = 0, ts = Date.now(), deskripsi = '', kantor = 'dkpoint' }) {
    const buf = [];
    const writeByte = b => buf.push(b & 0xFF);
    const writeShort = s => buf.push(s & 0xFF, (s >> 8) & 0xFF);
    const writeLong = l => buf.push(l & 0xFF, (l >> 8) & 0xFF, (l >> 16) & 0xFF, (l >> 24) & 0xFF);

    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}\0`;
    const gpsDateStr = `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())}\0`;
    const mapDatumStr = "WGS-84\0";
    const makeStr = "dkpoint\0";
    const modelStr = (kantor || "dkpoint Camera") + "\0";
    const softwareStr = "dkpoint v3.5\0";
    const descStr = (deskripsi || '') + '\0';

    const latDms = toDms(lat);
    const lonDms = toDms(lon);
    const latRef = lat >= 0 ? 'N\0' : 'S\0';
    const lonRef = lon >= 0 ? 'E\0' : 'W\0';

    const utcHours = d.getUTCHours();
    const utcMinutes = d.getUTCMinutes();
    const utcSeconds = d.getUTCSeconds();

    const tiffStart = 0;
    const ifd0Start = 8;
    const numIfd0Tags = 7;
    const ifd0Size = 2 + numIfd0Tags * 12 + 4;
    const gpsIfdStart = ifd0Start + ifd0Size;
    const numGpsTags = 10;
    const gpsIfdSize = 2 + numGpsTags * 12 + 4;
    let dataOffset = gpsIfdStart + gpsIfdSize;

    const dataValues = [];
    function addData(bytes) {
      const offset = dataOffset;
      dataValues.push(bytes);
      dataOffset += bytes.length;
      if (bytes.length % 2 !== 0) {
        dataValues.push([0]);
        dataOffset += 1;
      }
      return offset;
    }

    function strToBytes(s) {
      const res = [];
      for (let i = 0; i < s.length; i++) res.push(s.charCodeAt(i));
      return res;
    }

    function dmsToBytes(dms) {
      const res = [];
      for (let i = 0; i < dms.length; i++) {
        const num = dms[i][0], den = dms[i][1];
        res.push(num & 0xFF, (num >> 8) & 0xFF, (num >> 16) & 0xFF, (num >> 24) & 0xFF);
        res.push(den & 0xFF, (den >> 8) & 0xFF, (den >> 16) & 0xFF, (den >> 24) & 0xFF);
      }
      return res;
    }

    function ratToBytes(num, den) {
      return [
        num & 0xFF, (num >> 8) & 0xFF, (num >> 16) & 0xFF, (num >> 24) & 0xFF,
        den & 0xFF, (den >> 8) & 0xFF, (den >> 16) & 0xFF, (den >> 24) & 0xFF
      ];
    }

    const offsetDesc = addData(strToBytes(descStr));
    const offsetMake = addData(strToBytes(makeStr));
    const offsetModel = addData(strToBytes(modelStr));
    const offsetSoftware = addData(strToBytes(softwareStr));
    const offsetDateTime = addData(strToBytes(dateStr));

    const offsetLatDms = addData(dmsToBytes(latDms));
    const offsetLonDms = addData(dmsToBytes(lonDms));
    const offsetAlt = addData(ratToBytes(Math.round(Math.max(0, alt) * 100), 100));
    const offsetGpsTime = addData(dmsToBytes([[utcHours, 1], [utcMinutes, 1], [utcSeconds, 1]]));
    const offsetGpsDate = addData(strToBytes(gpsDateStr));
    const offsetMapDatum = addData(strToBytes(mapDatumStr));

    // Header TIFF (Little Endian 'II')
    writeByte(0x49); writeByte(0x49);
    writeShort(0x002A);
    writeLong(ifd0Start);

    // IFD0 (terurut berdasarkan ID Tag)
    writeShort(numIfd0Tags);
    // 0x010E ImageDescription (ASCII)
    writeShort(0x010E); writeShort(2); writeLong(descStr.length); writeLong(offsetDesc);
    // 0x010F Make (ASCII)
    writeShort(0x010F); writeShort(2); writeLong(makeStr.length); writeLong(offsetMake);
    // 0x0110 Model (ASCII)
    writeShort(0x0110); writeShort(2); writeLong(modelStr.length); writeLong(offsetModel);
    // 0x0112 Orientation (SHORT) -> 1
    writeShort(0x0112); writeShort(3); writeLong(1); writeShort(1); writeShort(0);
    // 0x0131 Software (ASCII)
    writeShort(0x0131); writeShort(2); writeLong(softwareStr.length); writeLong(offsetSoftware);
    // 0x0132 DateTime (ASCII)
    writeShort(0x0132); writeShort(2); writeLong(dateStr.length); writeLong(offsetDateTime);
    // 0x8825 GPSInfo (LONG) -> offset ke GPS IFD
    writeShort(0x8825); writeShort(4); writeLong(1); writeLong(gpsIfdStart);
    writeLong(0);

    // GPS IFD (terurut berdasarkan ID Tag)
    writeShort(numGpsTags);
    // 0x0000 GPSVersionID (BYTE, 4) -> 2.3.0.0
    writeShort(0x0000); writeShort(1); writeLong(4);
    writeByte(2); writeByte(3); writeByte(0); writeByte(0);
    // 0x0001 GPSLatitudeRef (ASCII, 2)
    writeShort(0x0001); writeShort(2); writeLong(2);
    writeByte(latRef.charCodeAt(0)); writeByte(0); writeShort(0);
    // 0x0002 GPSLatitude (RATIONAL, 3)
    writeShort(0x0002); writeShort(5); writeLong(3); writeLong(offsetLatDms);
    // 0x0003 GPSLongitudeRef (ASCII, 2)
    writeShort(0x0003); writeShort(2); writeLong(2);
    writeByte(lonRef.charCodeAt(0)); writeByte(0); writeShort(0);
    // 0x0004 GPSLongitude (RATIONAL, 3)
    writeShort(0x0004); writeShort(5); writeLong(3); writeLong(offsetLonDms);
    // 0x0005 GPSAltitudeRef (BYTE, 1) -> 0
    writeShort(0x0005); writeShort(1); writeLong(1);
    writeByte(0); writeByte(0); writeShort(0);
    // 0x0006 GPSAltitude (RATIONAL, 1)
    writeShort(0x0006); writeShort(5); writeLong(1); writeLong(offsetAlt);
    // 0x0007 GPSTimeStamp (RATIONAL, 3)
    writeShort(0x0007); writeShort(5); writeLong(3); writeLong(offsetGpsTime);
    // 0x0012 GPSMapDatum (ASCII)
    writeShort(0x0012); writeShort(2); writeLong(mapDatumStr.length); writeLong(offsetMapDatum);
    // 0x001D GPSDateStamp (ASCII, 11)
    writeShort(0x001D); writeShort(2); writeLong(gpsDateStr.length); writeLong(offsetGpsDate);
    writeLong(0);

    // Tulis nilai data (strings & rationals)
    for (let i = 0; i < dataValues.length; i++) {
      const chunk = dataValues[i];
      for (let j = 0; j < chunk.length; j++) writeByte(chunk[j]);
    }

    const tiffBytes = new Uint8Array(buf);
    const app1Length = 2 + 6 + tiffBytes.length;
    const app1 = new Uint8Array(2 + app1Length);
    app1[0] = 0xFF; app1[1] = 0xE1;
    app1[2] = (app1Length >> 8) & 0xFF;
    app1[3] = app1Length & 0xFF;
    app1[4] = 0x45; app1[5] = 0x78; app1[6] = 0x69; app1[7] = 0x66; // "Exif"
    app1[8] = 0x00; app1[9] = 0x00;
    app1.set(tiffBytes, 10);

    return app1;
  }

  function sematkan(jpegBytes, opsiGps) {
    if (!opsiGps || opsiGps.lat == null || opsiGps.lon == null) {
      return jpegBytes; // Tidak ada koordinat untuk disematkan
    }

    if (jpegBytes[0] !== 0xFF || jpegBytes[1] !== 0xD8) {
      return jpegBytes; // Bukan JPEG valid
    }

    const app1Segment = buatExifApp1(opsiGps);
    let pos = 2;
    const pieces = [jpegBytes.subarray(0, 2), app1Segment];

    while (pos < jpegBytes.length) {
      if (jpegBytes[pos] !== 0xFF) break;
      const marker = jpegBytes[pos + 1];
      if (marker === 0xDA || marker === 0xD9) {
        pieces.push(jpegBytes.subarray(pos));
        break;
      }
      const len = (jpegBytes[pos + 2] << 8) | jpegBytes[pos + 3];
      if (marker === 0xE1) {
        // Buang segmen APP1 lama agar tidak duplikat
        pos += 2 + len;
      } else {
        pieces.push(jpegBytes.subarray(pos, pos + 2 + len));
        pos += 2 + len;
      }
    }

    let totalLen = 0;
    for (let i = 0; i < pieces.length; i++) totalLen += pieces[i].length;
    const out = new Uint8Array(totalLen);
    let cur = 0;
    for (let i = 0; i < pieces.length; i++) {
      out.set(pieces[i], cur);
      cur += pieces[i].length;
    }
    return out;
  }

  async function sematkanKeBlob(blob, opsiGps) {
    if (!opsiGps || opsiGps.lat == null || opsiGps.lon == null) return blob;
    const arrayBuffer = await blob.arrayBuffer();
    const u8 = new Uint8Array(arrayBuffer);
    const hasilU8 = sematkan(u8, opsiGps);
    return new Blob([hasilU8], { type: 'image/jpeg' });
  }

  function sematkanKeDataUrl(dataUrl, opsiGps) {
    if (!opsiGps || opsiGps.lat == null || opsiGps.lon == null) return dataUrl;
    try {
      const u8 = dataUrlKeUint8Array(dataUrl);
      const hasil = sematkan(u8, opsiGps);
      return uint8ArrayKeDataUrl(hasil);
    } catch (e) {
      return dataUrl;
    }
  }

  const ExifGps = {
    sematkan,
    sematkanKeBlob,
    sematkanKeDataUrl,
    dataUrlKeUint8Array,
    uint8ArrayKeDataUrl
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExifGps;
  } else {
    global.ExifGps = ExifGps;
  }
})(typeof window !== 'undefined' ? window : this);
