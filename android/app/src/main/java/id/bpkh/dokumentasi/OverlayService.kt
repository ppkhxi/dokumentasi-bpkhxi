package id.bpkh.dokumentasi

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Pil hitam kecil di tepi atas layar, melayang di atas aplikasi lain. Ketuk untuk membuka
 * flyout kamera. Halaman flyout (?flyout=1) membuka kamera sendiri saat dimuat.
 */
class OverlayService : Service() {

    private lateinit var wm: WindowManager
    private var bubble: TextView? = null
    private var flyout: WebView? = null
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        @Volatile
        var jalan = false
        private const val CH = "dokumentasi_bubble"
        private const val NOTIF_ID = 42
        private const val URL_FLYOUT = "https://dkpoint.pages.dev/?flyout=1"

        fun kirimPerintah(ctx: Context, aksi: String) {
            if (!jalan) return
            ctx.startService(Intent(ctx, OverlayService::class.java).setAction(aksi))
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        jalan = true
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        buatNotifikasi()
        pasangBubble()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "SEMBUNYI" -> bubble?.visibility = android.view.View.GONE
            "TAMPIL" -> bubble?.visibility = android.view.View.VISIBLE
            "TUTUP_FLYOUT" -> tutupFlyout()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        jalan = false
        tutupFlyout(segera = true)
        bubble?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        bubble = null
        super.onDestroy()
    }

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun tipeOverlay(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else WindowManager.LayoutParams.TYPE_PHONE

    private fun buatNotifikasi() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CH, "Capture cepat", NotificationManager.IMPORTANCE_MIN)
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
        val notif: Notification = NotificationCompat.Builder(this, CH)
            .setContentTitle("Dokumentasi")
            .setContentText("Bubble capture cepat aktif")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
        ServiceCompat.startForeground(this, NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    }

    /** Pil hitam kecil, menempel di tepi atas layar. */
    @SuppressLint("ClickableViewAccessibility")
    private fun pasangBubble() {
        val tv = TextView(this).apply {
            text = ""
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(14).toFloat()
                setColor(Color.BLACK)
            }
            elevation = dp(4).toFloat()
            setOnClickListener { bukaFlyout() }
        }
        val lp = WindowManager.LayoutParams(
            dp(84), dp(24), tipeOverlay(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = 0
        }
        wm.addView(tv, lp)
        bubble = tv
    }

    /** Flyout dibuat saat dibuka dan dilepas saat ditutup; aset web dibaca dari dalam APK. */
    @SuppressLint("SetJavaScriptEnabled")
    private fun bukaFlyout() {
        if (flyout != null) { tutupFlyout(); return }

        val wv = WebView(this)
        wv.setBackgroundColor(Color.TRANSPARENT)
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "${userAgentString} DokumentasiApp/1"
        }
        wv.addJavascriptInterface(JembatanFlyout(), "DokumentasiNative")
        wv.webViewClient = AsetWebClient(this)
        wv.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val kamera = ContextCompat.checkSelfPermission(this@OverlayService, Manifest.permission.CAMERA) ==
                        PackageManager.PERMISSION_GRANTED
                if (kamera) request.grant(request.resources) else request.deny()
            }
        }
        // Flyout tidak mengambil sentuhan di luar kartunya, jadi aplikasi di bawah tetap bisa dipakai.
        val lp = WindowManager.LayoutParams(
            dp(360), dp(480), tipeOverlay(),
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(32)
        }
        wm.addView(wv, lp)
        flyout = wv
        wv.loadUrl(URL_FLYOUT)
    }

    private fun tutupFlyout(segera: Boolean = false) {
        val wv = flyout ?: return
        flyout = null
        try {
            wv.evaluateJavascript("if(typeof tutupFlyCapture==='function')tutupFlyCapture();", null)
        } catch (_: Exception) {}
        val lepas = Runnable {
            try { wm.removeView(wv) } catch (_: Exception) {}
            wv.destroy()
        }
        if (segera) lepas.run() else handler.postDelayed(lepas, 200)
    }

    inner class JembatanFlyout {
        @JavascriptInterface
        fun tutup() {
            handler.post { tutupFlyout() }
        }
    }
}
