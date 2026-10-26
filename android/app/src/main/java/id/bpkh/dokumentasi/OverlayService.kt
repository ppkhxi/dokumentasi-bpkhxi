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
import android.view.View
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
 * Dynamic Island di tepi atas layar. Tiga tahap:
 * 0 = kompak (pil kecil), 1 = merekam ("Kamera Aktif..."), 2 = terbuka (preview kamera).
 * Kamera aktif saat pil dibuka dan berhenti saat ditutup.
 */
class OverlayService : Service() {

    private lateinit var wm: WindowManager
    private var bubble: TextView? = null
    private var lpBubble: WindowManager.LayoutParams? = null
    private var flyout: WebView? = null
    private var keadaan = 0
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
            "TAMPIL" -> if (keadaan != 2) bubble?.visibility = View.VISIBLE
            "TUTUP_FLYOUT" -> tutupSemua()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        jalan = false
        flyout?.let { try { wm.removeView(it) } catch (_: Exception) {}; it.destroy() }
        flyout = null
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
            .setContentText("Dynamic Island capture aktif")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
        ServiceCompat.startForeground(this, NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    }

    /** Pil di tepi atas; ukurannya berubah sesuai tahap. */
    @SuppressLint("ClickableViewAccessibility")
    private fun pasangBubble() {
        val tv = TextView(this).apply {
            text = ""
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#E4E4E7"))
            textSize = 12f
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(30).toFloat()
                setColor(Color.BLACK)
            }
            elevation = dp(4).toFloat()
            setOnClickListener { ketukPil() }
        }
        val lp = WindowManager.LayoutParams(
            dp(120), dp(35), tipeOverlay(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = 0
        }
        wm.addView(tv, lp)
        bubble = tv
        lpBubble = lp
    }

    private fun ketukPil() {
        when (keadaan) {
            0 -> mulaiMerekam()
            1 -> bukaPanel()
        }
    }

    /** Tahap 0 -> 1: pil melebar, kamera mulai aktif. */
    private fun mulaiMerekam() {
        keadaan = 1
        if (flyout == null) siapkanFlyout()
        val tv = bubble ?: return
        val lp = lpBubble ?: return
        tv.text = "● Kamera Aktif..."
        lp.width = dp(200)
        wm.updateViewLayout(tv, lp)
    }

    /** Tahap 1 -> 2: panel preview kamera terbuka. */
    private fun bukaPanel() {
        keadaan = 2
        bubble?.visibility = View.GONE
        flyout?.visibility = View.VISIBLE
    }

    /** Tutup semua: kembali ke pil kompak dan kamera berhenti. */
    private fun tutupSemua() {
        keadaan = 0
        flyout?.let { wv ->
            flyout = null
            try { wv.evaluateJavascript("if(typeof tutupFlyCapture==='function')tutupFlyCapture();", null) } catch (_: Exception) {}
            handler.postDelayed({
                try { wm.removeView(wv) } catch (_: Exception) {}
                wv.destroy()
            }, 150)
        }
        val tv = bubble ?: return
        val lp = lpBubble ?: return
        tv.text = ""
        lp.width = dp(120)
        wm.updateViewLayout(tv, lp)
        tv.visibility = View.VISIBLE
    }

    /** Flyout (kamera + catatan + shutter) dimuat sekali per kali dibuka; tampil saat tahap 2. */
    @SuppressLint("SetJavaScriptEnabled")
    private fun siapkanFlyout() {
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
        val lp = WindowManager.LayoutParams(
            dp(320), dp(320), tipeOverlay(),
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = 0
        }
        wv.visibility = View.GONE
        wm.addView(wv, lp)
        flyout = wv
        wv.loadUrl(URL_FLYOUT)
    }

    inner class JembatanFlyout {
        @JavascriptInterface
        fun tutup() {
            handler.post { tutupSemua() }
        }
    }
}
