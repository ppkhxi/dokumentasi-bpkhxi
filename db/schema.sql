-- Skema basis data panel admin dkpoint (Cloudflare D1).
-- Terapkan sekali: wrangler d1 execute dkpoint-admin --remote --file=db/schema.sql
-- atau tempel isinya di konsol D1 (Cloudflare dashboard).

CREATE TABLE IF NOT EXISTS rooms (
  nama    TEXT PRIMARY KEY,
  token   TEXT NOT NULL,
  dibuat  TEXT NOT NULL,
  aktif   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS anggota (
  room      TEXT NOT NULL,
  email     TEXT NOT NULL,
  nama      TEXT,
  bergabung TEXT,
  status    TEXT NOT NULL DEFAULT 'aktif',
  PRIMARY KEY (room, email)
);

CREATE TABLE IF NOT EXISTS telemetri (
  device_id      TEXT PRIMARY KEY,
  nama           TEXT,
  user_id        TEXT,
  room           TEXT,
  platform       TEXT,
  mode_tampilan  TEXT,
  versi          TEXT,
  pertama_kali   TEXT,
  terakhir_aktif TEXT,
  total_sesi     INTEGER DEFAULT 0,
  layar          TEXT,
  kunci          TEXT
);
CREATE INDEX IF NOT EXISTS idx_telemetri_kunci ON telemetri (kunci);

CREATE TABLE IF NOT EXISTS masukan (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT,
  nama      TEXT,
  user_id   TEXT,
  room      TEXT,
  platform  TEXT,
  versi     TEXT,
  bintang   INTEGER NOT NULL,
  pesan     TEXT,
  waktu     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_masukan_waktu ON masukan (waktu);
