package id.bpkh.dokumentasi

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import android.widget.Toast
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Pil hitam di tengah atas layar, melayang di atas aplikasi lain. Ketuk untuk membuka
 * flyout kamera (halaman web dkpoint dengan ?flyout=1).
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
            "SEMBUNYI" -> bubble?.visibility = View.GONE
            "TAMPIL" -> bubble?.visibility = View.VISIBLE
            "TUTUP_FLYOUT" -> tutupFlyout()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        jalan = false
        tutupFlyout()
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

    /** Pil hitam di tengah atas (gaya Dynamic Island). Ketuk untuk membuka flyout kamera. */
    @SuppressLint("ClickableViewAccessibility")
    private fun pasangBubble() {
        val tv = TextView(this).apply {
            text = ""
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(18).toFloat()
                setColor(Color.BLACK)
            }
            elevation = dp(6).toFloat()
            setOnClickListener { bukaFlyout() }
        }
        val lp = WindowManager.LayoutParams(
            dp(120), dp(36), tipeOverlay(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(8)
        }
        wm.addView(tv, lp)
        bubble = tv
    }

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
        wv.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    Toast.makeText(this@OverlayService, "Flyout gagal dimuat. Periksa koneksi.", Toast.LENGTH_LONG).show()
                }
            }
        }
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
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(52)
        }
        wm.addView(wv, lp)
        flyout = wv
        wv.loadUrl(URL_FLYOUT)
    }

    private fun tutupFlyout() {
        val wv = flyout ?: return
        flyout = null
        try {
            wv.evaluateJavascript("if(typeof tutupFlyCapture==='function')tutupFlyCapture();", null)
        } catch (_: Exception) {}
        handler.postDelayed({
            try { wm.removeView(wv) } catch (_: Exception) {}
            wv.destroy()
        }, 200)
    }

    inner class JembatanFlyout {
        @JavascriptInterface
        fun tutup() {
            handler.post { tutupFlyout() }
        }
    }
}
