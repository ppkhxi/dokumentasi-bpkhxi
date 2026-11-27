package id.bpkh.dokumentasi

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class MainActivity : Activity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val prefs: SharedPreferences by lazy { getSharedPreferences("dokumentasi", MODE_PRIVATE) }

    companion object {
        const val URL_APP = "https://dkpoint.pages.dev/"
        const val REQ_FILE = 1001
        const val REQ_IZIN = 1002
        const val REQ_VIDEO = 1003
        const val BATAS_VIDEO_MS = 4_000   // bawaan 4 detik
        const val BATAS_VIDEO_MIN = 2
        const val BATAS_VIDEO_MAX = 15
    }

    /** Satu klip video hasil kamera HP yang siap dibaca halaman web. */
    @Volatile private var berkasVideo: File? = null
    @Volatile private var statusVideo: String = "menunggu"   // menunggu | siap | batal

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val p = getSharedPreferences("dokumentasi", MODE_PRIVATE)
        val crash = p.getString("crash_terakhir", null)
        if (crash != null) {
            p.edit().remove("crash_terakhir").commit()
            tampilkanTeks("Crash pada pembukaan sebelumnya:\n\n" + crash)
            return
        }
        aman { mulai() }
    }

    private fun tampilkanError(e: Throwable) {
        tampilkanTeks("Error saat dibuka:\n\n" + e.stackTraceToString())
    }

    private fun tampilkanTeks(isi: String) {
        val tv = android.widget.TextView(this).apply {
            text = isi
            setTextIsSelectable(true)
            setPadding(32, 32, 32, 32)
        }
        setContentView(android.widget.ScrollView(this).apply { addView(tv) })
    }

    private inline fun aman(blok: () -> Unit) {
        try { blok() } catch (e: Throwable) { tampilkanError(e) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun mulai() {

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "${userAgentString} DokumentasiApp/1"
        }
        web.webViewClient = AsetWebClient(this)
        web.addJavascriptInterface(JembatanApp(), "DokumentasiNative")
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val butuhKamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                if (!butuhKamera || punyaIzin(Manifest.permission.CAMERA)) {
                    request.grant(request.resources)
                } else {
                    request.deny()
                }
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                callback?.invoke(origin, punyaIzin(Manifest.permission.ACCESS_FINE_LOCATION), false)
            }

            override fun onShowFileChooser(
                view: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    startActivityForResult(params!!.createIntent(), REQ_FILE)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        mintaIzin()
        web.loadUrl(URL_APP)
    }


    override fun onResume() {
        super.onResume()
        OverlayService.kirimPerintah(this, "SEMBUNYI")
    }

    override fun onPause() {
        super.onPause()
        OverlayService.kirimPerintah(this, "TAMPIL")
    }

    override fun onStart() {
        super.onStart()
        aman {
            // Tawarkan izin "tampil di atas aplikasi lain" sekali saja.
            if (!Settings.canDrawOverlays(this) && !prefs.getBoolean("sudah_tanya_overlay", false)) {
                prefs.edit().putBoolean("sudah_tanya_overlay", true).apply()
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            } else if (Settings.canDrawOverlays(this) && bubbleAktif() && !OverlayService.jalan) {
                ContextCompat.startForegroundService(this, Intent(this, OverlayService::class.java))
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FILE) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
            return
        }
        if (requestCode == REQ_VIDEO) {
            val langsung = berkasVideo
            if (resultCode != RESULT_OK) {
                langsung?.delete()
                berkasVideo = null
                statusVideo = "batal"
                return
            }
            // EXTRA_OUTPUT: kamera menulis langsung ke cacheDir/video, jadi tidak
            // bergantung pada data.data yang bisa kosong di sebagian aplikasi kamera.
            if (langsung != null && langsung.exists() && langsung.length() > 0) {
                statusVideo = "siap"
                return
            }
            val uri = data?.data
            if (uri == null) { statusVideo = "batal"; return }
            Thread {
                try {
                    val dir = File(cacheDir, "video").apply { mkdirs() }
                    val tujuan = File(dir, "rekam_" + System.currentTimeMillis() + ".mp4")
                    contentResolver.openInputStream(uri)?.use { masuk ->
                        tujuan.outputStream().use { keluar -> masuk.copyTo(keluar) }
                    } ?: throw IllegalStateException("Tidak bisa membaca video")
                    berkasVideo = tujuan
                    statusVideo = "siap"
                } catch (e: Exception) {
                    statusVideo = "batal"
                }
            }.start()
        }
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    private fun bubbleAktif(): Boolean = prefs.getBoolean("bubble_aktif", true)

    private fun atur(aktif: Boolean) {
        prefs.edit().putBoolean("bubble_aktif", aktif).apply()
        if (aktif) {
            if (Settings.canDrawOverlays(this)) {
                ContextCompat.startForegroundService(this, Intent(this, OverlayService::class.java))
            } else {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            }
        } else {
            stopService(Intent(this, OverlayService::class.java))
        }
    }

    inner class JembatanApp {
        /** Berkas yang sedang disiapkan untuk lembar Bagikan bawaan Android. */
        private val antreBagikan = ArrayList<Uri>()

        /** Salinan cadangan foto ke Galeri HP (Pictures/dkpoint). */
        @JavascriptInterface
        fun simpanKeGaleri(nama: String, base64: String): Boolean =
            GaleriHp.simpan(this@MainActivity, nama, Base64.decode(base64, Base64.DEFAULT))

        @JavascriptInterface
        fun bagikanMulai() {
            antreBagikan.clear()
            val dir = File(cacheDir, "bagikan")
            dir.deleteRecursively()
            dir.mkdirs()
        }

        @JavascriptInterface
        fun bagikanTambah(nama: String, mime: String, base64: String): Boolean {
            return try {
                val dir = File(cacheDir, "bagikan").apply { mkdirs() }
                val aman = nama.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val berkas = File(dir, aman)
                berkas.writeBytes(Base64.decode(base64, Base64.DEFAULT))
                antreBagikan.add(FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", berkas))
                true
            } catch (e: Exception) { false }
        }

        /** Buka lembar Bagikan Android (WhatsApp, Drive, Quick Share, dll.). */
        @JavascriptInterface
        fun bagikanBuka(mime: String, teks: String): Boolean {
            if (antreBagikan.isEmpty()) return false
            val uris = ArrayList(antreBagikan)
            runOnUiThread {
                val intent = if (uris.size == 1) {
                    Intent(Intent.ACTION_SEND).apply {
                        putExtra(Intent.EXTRA_STREAM, uris[0])
                    }
                } else {
                    Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                        putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                    }
                }
                intent.type = if (uris.size == 1) mime else "*/*"
                intent.putExtra(Intent.EXTRA_TEXT, teks)
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                val pilih = Intent.createChooser(intent, "Bagikan")
                pilih.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                try { startActivity(pilih) } catch (e: Exception) { }
            }
            return true
        }
        @JavascriptInterface
        fun setBubble(aktif: Boolean) {
            runOnUiThread { atur(aktif) }
        }

        @JavascriptInterface
        fun tutup() {}

        /** Buka tautan (misalnya unduhan APK) di peramban luar. */
        @JavascriptInterface
        fun bukaLink(url: String) {
            runOnUiThread {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
            }
        }

        /**
         * Perbarui APK sekali ketuk: unduh di latar belakang, lalu buka pemasang Android.
         * Android tetap meminta satu konfirmasi "Pasang" dari pengguna; itu tidak bisa dilewati
         * untuk aplikasi di luar Play Store.
         */
        @JavascriptInterface
        fun perbaruiAplikasi(url: String) {
            kabar("Memeriksa pembaruan…")
            Thread {
                val tujuan = File(cacheDir, "apk/dkpoint.apk").apply { parentFile?.mkdirs() }
                val terpasang: Long = try {
                    packageManager.getPackageInfo(packageName, 0).versionCode.toLong()
                } catch (_: Exception) { 0L }

                // 1. Periksa versi di server lebih dulu (berkas kecil, bukan APK).
                val terbaru: Long = try {
                    JSONObject(unduhTeks(url.substringBeforeLast('/') + "/versi.json")).getLong("versionCode")
                } catch (_: Exception) { -1L }
                if (terbaru < 0) {
                    runOnUiThread { kabar("Tidak bisa memeriksa pembaruan. Periksa sinyal, lalu coba lagi.") }
                    return@Thread
                }
                if (terbaru <= terpasang) {
                    runOnUiThread { kabar("Aplikasi sudah versi terkini.") }
                    return@Thread
                }

                // 2. Pakai salinan yang sudah diunduh bila versinya sama; kalau tidak, unduh.
                val salinanSama = tujuan.exists() &&
                    (packageManager.getPackageArchiveInfo(tujuan.path, 0)?.versionCode?.toLong() ?: -1L) == terbaru
                if (!salinanSama) runOnUiThread { kabar("Mengunduh pembaruan…") }
                val berkas: File? = if (salinanSama) tujuan else try {
                    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 15000
                        readTimeout = 60000
                        instanceFollowRedirects = true
                        useCaches = false
                    }
                    try {
                        conn.inputStream.use { masuk -> tujuan.outputStream().use { masuk.copyTo(it) } }
                    } finally { conn.disconnect() }
                    tujuan
                } catch (_: Exception) { null }

                runOnUiThread {
                    if (berkas == null) {
                        kabar("Unduhan gagal. Periksa sinyal, lalu coba lagi.")
                        return@runOnUiThread
                    }
                    if (!packageManager.canRequestPackageInstalls()) {
                        kabar("Izinkan DKPoint memasang aplikasi, lalu tekan Perbarui lagi.")
                        try {
                            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                        } catch (_: Exception) {}
                        return@runOnUiThread
                    }
                    try {
                        val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", berkas)
                        startActivity(Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, "application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                        })
                    } catch (_: Exception) {
                        kabar("Pemasang tidak bisa dibuka.")
                    }
                }
            }.start()
        }

        /**
         * Rekam satu klip video memakai aplikasi kamera bawaan HP (sensor & stabilizer asli,
         * tanpa encode ulang). Batas durasi dikirim sebagai petunjuk ke aplikasi kamera;
         * bawaan 4 detik, halaman web boleh meminta 2–15 detik lewat rekamVideoDetik().
         */
        @JavascriptInterface
        fun rekamVideo(): Boolean = rekamVideoDetik(BATAS_VIDEO_MS / 1000)

        @JavascriptInterface
        fun rekamVideoDetik(detik: Int): Boolean {
            val batasDetik = detik.coerceIn(BATAS_VIDEO_MIN, BATAS_VIDEO_MAX)
            berkasVideo?.delete()
            berkasVideo = null
            statusVideo = "menunggu"
            val dir = File(cacheDir, "video").apply { mkdirs() }
            val tujuan = File(dir, "rekam_" + System.currentTimeMillis() + ".mp4")
            var berhasil = false
            val selesai = java.util.concurrent.CountDownLatch(1)
            runOnUiThread {
                try {
                    val niat = Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE).apply {
                        putExtra(android.provider.MediaStore.EXTRA_VIDEO_QUALITY, 1)
                        putExtra(android.provider.MediaStore.EXTRA_DURATION_LIMIT, batasDetik)
                        putExtra(
                            android.provider.MediaStore.EXTRA_OUTPUT,
                            FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", tujuan)
                        )
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                    }
                    startActivityForResult(niat, REQ_VIDEO)
                    berhasil = true
                } catch (e: Exception) {
                    statusVideo = "batal"
                } finally {
                    selesai.countDown()
                }
            }
            // Metode @JavascriptInterface berjalan di thread lain, jadi runOnUiThread hanya
            // menitipkan pekerjaan: tanpa menunggu di sini hasilnya selalu false walau kamera
            // sudah terbuka, dan halaman web berhenti memantau rekaman.
            try { selesai.await(3, java.util.concurrent.TimeUnit.SECONDS) } catch (_: InterruptedException) { }
            if (berhasil) berkasVideo = tujuan
            return berhasil
        }

        /** Status rekaman terakhir: menunggu | siap | batal, lengkap dengan ukuran berkas. */
        @JavascriptInterface
        fun statusRekam(): String {
            val f = berkasVideo
            return JSONObject().apply {
                put("status", statusVideo)
                put("nama", f?.name ?: "")
                put("ukuran", if (f != null && f.exists()) f.length() else 0L)
                put("mime", "video/mp4")
            }.toString()
        }

        /** Baca potongan berkas video dalam base64 (offset & panjang dalam byte). */
        @JavascriptInterface
        fun bacaRekam(offset: Int, panjang: Int): String {
            val f = berkasVideo ?: return ""
            if (!f.exists() || offset < 0 || panjang <= 0) return ""
            return try {
                java.io.RandomAccessFile(f, "r").use { raf ->
                    if (offset.toLong() >= raf.length()) return ""
                    val tersedia = minOf(panjang.toLong(), raf.length() - offset).toInt()
                    val buf = ByteArray(tersedia)
                    raf.seek(offset.toLong())
                    raf.readFully(buf)
                    Base64.encodeToString(buf, Base64.NO_WRAP)
                }
            } catch (e: Exception) { "" }
        }

        /** Hapus berkas klip sementara setelah halaman web menyalinnya ke penyimpanan aplikasi. */
        @JavascriptInterface
        fun hapusRekam() {
            berkasVideo?.delete()
            berkasVideo = null
            statusVideo = "menunggu"
        }

        /** Nama versi aplikasi yang terpasang, misalnya 3.9.39. */
        @JavascriptInterface
        fun mulaiTracking(): Boolean {
            if (!punyaIzin(Manifest.permission.ACCESS_FINE_LOCATION)) return false
            TrackingService.kirim(this@MainActivity, TrackingService.AKSI_MULAI)
            return true
        }

        @JavascriptInterface
        fun jedaTracking() { TrackingService.kirim(this@MainActivity, TrackingService.AKSI_JEDA) }

        @JavascriptInterface
        fun lanjutTracking() { TrackingService.kirim(this@MainActivity, TrackingService.AKSI_LANJUT) }

        @JavascriptInterface
        fun hentikanTracking() { TrackingService.kirim(this@MainActivity, TrackingService.AKSI_STOP) }

        @JavascriptInterface
        fun ambilTracking(dari: Int): String = TrackingService.baca(this@MainActivity, dari)

        @JavascriptInterface
        fun izinLatarBelakang(): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || punyaIzin(Manifest.permission.ACCESS_BACKGROUND_LOCATION)

        @JavascriptInterface
        fun versiAplikasi(): String = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        } catch (_: Exception) { "" }
    }

    /** Tampilkan kabar singkat di halaman web (fungsi pesan()). */
    /** Unduh teks kecil (mis. versi.json) tanpa cache. Melempar exception bila gagal. */
    private fun unduhTeks(alamat: String): String {
        val conn = (URL(alamat).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10000
            readTimeout = 10000
            instanceFollowRedirects = true
            useCaches = false
        }
        try {
            return conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally { conn.disconnect() }
    }

    private fun kabar(teks: String) {
        runOnUiThread {
            web.evaluateJavascript("if(typeof pesan==='function')pesan(${JSONObject.quote(teks)})", null)
        }
    }

    private fun punyaIzin(izin: String): Boolean =
        ContextCompat.checkSelfPermission(this, izin) == PackageManager.PERMISSION_GRANTED

    private fun mintaIzin() {
        val daftar = mutableListOf(Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) daftar.add(Manifest.permission.POST_NOTIFICATIONS)
        val belum = daftar.filter { !punyaIzin(it) }
        if (belum.isNotEmpty()) requestPermissions(belum.toTypedArray(), REQ_IZIN)
    }
}
