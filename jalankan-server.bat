@echo off
REM Menjalankan server lokal untuk menguji aplikasi di HP (satu jaringan WiFi).
REM Tutup jendela ini untuk menghentikan server.

set PY="C:\Program Files\ArcGIS\Pro\bin\Python\envs\arcgispro-py3\python.exe"
if not exist %PY% (
  echo Python tidak ditemukan di lokasi bawaan ArcGIS Pro.
  echo Ubah baris "set PY=" di berkas ini ke lokasi python.exe yang ada.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   PORTAL DOKUMENTASI BPKH WILAYAH XI
echo ============================================
echo.
echo Alamat untuk dibuka di HP (satu WiFi dengan komputer ini):
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    http://%%a:8779
echo.
echo Di komputer ini:  http://localhost:8779
echo.
echo CATATAN: kamera kemungkinan diblokir Chrome pada alamat http:// biasa.
echo Untuk uji kamera sungguhan, unggah isi folder www ke hosting HTTPS
echo (lihat BUILD_APK.md bagian "Cara 1").
echo.
echo Tekan Ctrl+C untuk berhenti.
echo.

%PY% -m http.server 8779 --directory "%~dp0www"
pause
