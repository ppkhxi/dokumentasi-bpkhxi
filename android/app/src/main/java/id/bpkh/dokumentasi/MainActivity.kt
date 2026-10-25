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
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.ContextCompat

class MainActivity : Activity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var prefs: SharedPreferences

    companion object {
        const val URL_APP = "https://dkpoint.pages.dev/"
        const val REQ_FILE = 1001
        const val REQ_IZIN = 1002
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        aman { mulai() }
    }

    private fun tampilkanError(e: Throwable) {
        val tv = android.widget.TextView(this).apply {
            text = "Error saat dibuka:\n\n" + e.stackTraceToString()
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
        prefs = getSharedPreferences("dokumentasi", MODE_PRIVATE)

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "${userAgentString} DokumentasiApp/1"
        }
        web.webViewClient = WebViewClient()
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
            } else if (Settings.canDrawOverlays(this) && !OverlayService.jalan) {
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

    private fun punyaIzin(izin: String): Boolean =
        ContextCompat.checkSelfPermission(this, izin) == PackageManager.PERMISSION_GRANTED

    private fun mintaIzin() {
        val daftar = mutableListOf(Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) daftar.add(Manifest.permission.POST_NOTIFICATIONS)
        val belum = daftar.filter { !punyaIzin(it) }
        if (belum.isNotEmpty()) requestPermissions(belum.toTypedArray(), REQ_IZIN)
    }
}
