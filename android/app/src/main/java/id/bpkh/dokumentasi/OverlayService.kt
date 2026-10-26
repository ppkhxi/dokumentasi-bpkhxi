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
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Base64
import android.widget.FrameLayout
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import org.json.JSONObject

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
    private var kontainer: FrameLayout? = null
    private var preview: PreviewView? = null
    private var camProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private val pekerja = Executors.newSingleThreadExecutor()
    /** Siklus hidup untuk CameraX; kamera hidup selama pemilik ini aktif. */
    private val pemilikSiklus = PemilikSiklusKamera()
    private var keadaan = 0
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        @Volatile
        var jalan = false
        private const val CH = "dokumentasi_bubble"
        private const val NOTIF_ID = 42
        private const val URL_FLYOUT = "https://dkpoint.pages.dev/flyout.html"

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
        hentikanKamera()
        pemilikSiklus.atur(Lifecycle.State.DESTROYED)
        pekerja.shutdown()
        flyout?.let { it.destroy() }
        flyout = null
        kontainer?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        kontainer = null
        preview = null
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
            // Satu ketuk langsung membuka flyout kamera (kamera ikut aktif).
            0 -> { mulaiMerekam(); bukaPanel() }
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
        kontainer?.visibility = View.VISIBLE
    }

    /** Tutup semua: kembali ke pil kompak dan kamera berhenti. */
    private fun tutupSemua() {
        keadaan = 0
        hentikanKamera()
        val wv = flyout
        val k = kontainer
        if (wv != null) {
            flyout = null
            kontainer = null
            preview = null
            try { wv.evaluateJavascript("if(typeof tutupFlyCapture==='function')tutupFlyCapture();", null) } catch (_: Exception) {}
            handler.postDelayed({
                try { k?.let { wm.removeView(it) } } catch (_: Exception) {}
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

    /** Flyout: kamera asli (CameraX) di bawah, antarmuka web di atasnya. Dimuat sekali per kali dibuka. */
    @SuppressLint("SetJavaScriptEnabled")
    private fun siapkanFlyout() {
        val pv = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        val wv = WebView(this)
        wv.setBackgroundColor(Color.parseColor("#0E100E"))
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
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
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: android.webkit.GeolocationPermissions.Callback?) {
                val lokasi = ContextCompat.checkSelfPermission(this@OverlayService, Manifest.permission.ACCESS_FINE_LOCATION) ==
                        PackageManager.PERMISSION_GRANTED
                callback?.invoke(origin, lokasi, false)
            }
        }
        val kt = FrameLayout(this).apply {
            addView(wv, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            addView(pv, FrameLayout.LayoutParams(dp(300), dp(300)).apply { leftMargin = dp(10); topMargin = dp(60) })
        }
        val lp = WindowManager.LayoutParams(
            dp(320), dp(420), tipeOverlay(),
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.OPAQUE
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = 0
        }
        kt.visibility = View.GONE
        wm.addView(kt, lp)
        flyout = wv
        kontainer = kt
        preview = pv
        wv.loadUrl(URL_FLYOUT)
        pemilikSiklus.atur(Lifecycle.State.RESUMED)
        nyalakanKamera()
    }

    /** Kamera asli dinyalakan lewat CameraX; pratinjau dipasang ke PreviewView. */
    private fun nyalakanKamera() {
        preview ?: return
    }

    private fun hentikanKamera() {
        try { camProvider?.unbindAll() } catch (_: Exception) {}
        imageCapture = null
        if (jalan) pemilikSiklus.atur(Lifecycle.State.CREATED)
    }

    /** Ambil satu foto, potong 3:4, lalu kirim ke halaman web untuk diberi watermark dan disimpan. */
    private fun ambilFoto() {
        val cap = imageCapture
        if (cap == null) { kabar("Kamera belum siap, tunggu sebentar."); return }
        cap.takePicture(pekerja, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                try {
                    val buf = image.planes[0].buffer
                    val bytes = ByteArray(buf.remaining()).also { buf.get(it) }
                    val hasil = potongJpeg(bytes, image.imageInfo.rotationDegrees)
                    val dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(hasil, Base64.NO_WRAP)
                    handler.post {
                        flyout?.evaluateJavascript("if(typeof terimaFotoNative==='function')terimaFotoNative(${JSONObject.quote(dataUrl)})", null)
                    }
                } catch (e: Exception) {
                    kabar("Foto gagal diproses: " + e.javaClass.simpleName)
                } finally {
                    image.close()
                }
            }
            override fun onError(exc: ImageCaptureException) {
                kabar("Foto gagal diambil (kode " + exc.imageCaptureError + ")")
            }
        })
    }

    private fun potongJpeg(bytes: ByteArray, rotasi: Int): ByteArray {
        val opsi = BitmapFactory.Options().apply { inSampleSize = 2 }
        var bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opsi)
            ?: throw IllegalStateException("decode")
        if (rotasi != 0) {
            val m = Matrix().apply { postRotate(rotasi.toFloat()) }
            bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        }
        val w = bmp.width
        val h = bmp.height
        val cw: Int
        val ch: Int
        if (w.toFloat() / h > 3f / 4f) { ch = h; cw = h * 3 / 4 } else { cw = w; ch = w * 4 / 3 }
        val x = (w - cw) / 2
        val y = (h - ch) / 2
        val potong = Bitmap.createBitmap(bmp, x, y, cw, ch)
        val keluar = ByteArrayOutputStream()
        potong.compress(Bitmap.CompressFormat.JPEG, 92, keluar)
        return keluar.toByteArray()
    }

    /** Kabar singkat ke halaman flyout (fungsi terimaGagalNative). */
    private fun kabar(teks: String) {
        handler.post {
            flyout?.evaluateJavascript("if(typeof terimaGagalNative==='function')terimaGagalNative(${JSONObject.quote(teks)})", null)
        }
    }

    /** Posisi area pratinjau kamera, dikirim dari halaman web (dalam dp). */
    private fun aturPratinjau(x: Int, y: Int, w: Int, h: Int) {
        val pv = preview ?: return
        handler.post {
            pv.layoutParams = FrameLayout.LayoutParams(dp(w), dp(h)).apply {
                leftMargin = dp(x)
                topMargin = dp(y)
            }
        }
    }

    inner class JembatanFlyout {
        @JavascriptInterface
        fun tutup() {
            handler.post { tutupSemua() }
        }

        @JavascriptInterface
        fun jepretNative() {
            handler.post { ambilFoto() }
        }

        @JavascriptInterface
        fun aturPratinjau(x: Int, y: Int, w: Int, h: Int) {
            this@OverlayService.aturPratinjau(x, y, w, h)
        }
    }
}

/** Pemilik siklus hidup untuk CameraX. */
class PemilikSiklusKamera : LifecycleOwner {
    private val daftar = LifecycleRegistry(this)
    override fun getLifecycle(): Lifecycle = daftar
    fun atur(s: Lifecycle.State) {
        daftar.currentState = s
    }
}
