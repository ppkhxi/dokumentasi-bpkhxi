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
    }

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
            kabar("Mengunduh pembaruan…")
            Thread {
                val berkas: File? = try {
                    val tujuan = File(cacheDir, "apk/dkpoint.apk").apply { parentFile?.mkdirs() }
                    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 15000
                        readTimeout = 60000
                        instanceFollowRedirects = true
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

        /** Nama versi aplikasi yang terpasang, misalnya 3.9.39. */
        @JavascriptInterface
        fun versiAplikasi(): String = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        } catch (_: Exception) { "" }
    }

    /** Tampilkan kabar singkat di halaman web (fungsi pesan()). */
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
