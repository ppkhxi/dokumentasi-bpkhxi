package id.bpkh.dokumentasi

import android.Manifest
import android.media.MediaActionSound
import android.os.Vibrator
import android.os.VibrationEffect
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
import android.os.Build
import android.os.Bundle
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
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
    private var lpFlyout: WindowManager.LayoutParams? = null
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
        try { bunyiRana.release() } catch (_: Exception) {}
        jalan = false
        hentikanKamera()
        pemilikSiklus.atur(Lifecycle.State.DESTROYED)
        pekerja.shutdown()
        flyout?.let { it.destroy() }
        flyout = null
        kontainer?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        kontainer = null
        lpFlyout = null
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
            .setContentTitle("")
            .setContentText("")
            .setSmallIcon(R.drawable.ic_notif_pil)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setOngoing(true)
            .build()
        // Kamera dipakai dari layanan latar: Android 10+ perlu tipe "camera" agar tidak diblokir.
        // Tipe "microphone" hanya dipasang bila izin mikrofon sudah ada (Android 14+ mewajibkannya).
        val tipe = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var t = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            if (punyaIzin(Manifest.permission.CAMERA)) t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && punyaIzinMikrofon()) {
                t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }
            t
        } else 0
        ServiceCompat.startForeground(this, NOTIF_ID, notif, tipe)
    }

    /** Tombol bulat di tepi kanan layar (seperti tombol aksesibilitas). Bisa digeser naik-turun. */
    @SuppressLint("ClickableViewAccessibility")
    private fun pasangBubble() {
        if (!android.provider.Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }
        val ukuran = dp(56)
        val tinggiLayar = resources.displayMetrics.heightPixels
        val simpan = getSharedPreferences("pil_kamera", MODE_PRIVATE)
        val lp = WindowManager.LayoutParams(
            ukuran, ukuran, tipeOverlay(),
            // FLAG_LAYOUT_NO_LIMITS: tanpa ini Android menahan window tetap di dalam layar, sehingga pil
            // tidak bisa menyusut ke setengah lingkaran di tepi (x negatif diabaikan).
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 0
            y = simpan.getInt("y", tinggiLayar / 3).coerceIn(dp(60), tinggiLayar - ukuran - dp(60))
        }
        val tv = TextView(this).apply {
            // Bentuk pil dari aset (putih transparan, abu-abu transparan 25%).
            background = androidx.core.content.ContextCompat.getDrawable(this@OverlayService, R.drawable.pil_kamera)
        }
        var yAwal = 0f
        var lpYAwal = 0
        var sedangGeser = false
        tv.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    yAwal = e.rawY
                    lpYAwal = lp.y
                    sedangGeser = false
                    bangunBubble()
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val geser = (e.rawY - yAwal).toInt()
                    if (kotlin.math.abs(geser) > dp(6)) sedangGeser = true
                    if (sedangGeser) {
                        lp.y = (lpYAwal + geser).coerceIn(dp(60), tinggiLayar - ukuran - dp(60))
                        try { wm.updateViewLayout(tv, lp) } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (sedangGeser) {
                        simpan.edit().putInt("y", lp.y).apply()
                    } else {
                        ketukPil()
                    }
                    jadwalCiutkan()
                    true
                }
                else -> false
            }
        }
        wm.addView(tv, lp)
        bubble = tv
        lpBubble = lp
        jadwalCiutkan()
    }

    /** Pil kembali penuh di tepi kanan. */
    private fun bangunBubble() {
        handler.removeCallbacks(ciutkanRunnable)
        val lp = lpBubble ?: return
        val tv = bubble ?: return
        if (lp.x == 0) return
        lp.x = 0
        try { wm.updateViewLayout(tv, lp) } catch (_: Exception) {}
    }

    /** Setelah diam beberapa detik, pil menyusut jadi setengah lingkaran di tepi kanan (tidak hilang). */
    private val ciutkanRunnable = Runnable {
        val lp = lpBubble ?: return@Runnable
        val tv = bubble ?: return@Runnable
        if (keadaan != 0 || tv.visibility != View.VISIBLE) return@Runnable
        lp.x = -dp(56) / 2
        try { wm.updateViewLayout(tv, lp) } catch (_: Exception) {}
    }

    private fun jadwalCiutkan() {
        handler.removeCallbacks(ciutkanRunnable)
        if (keadaan == 0) handler.postDelayed(ciutkanRunnable, 5000)
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
    }

    /** Tahap 1 -> 2: panel preview kamera terbuka. */
    private fun bukaPanel() {
        keadaan = 2
        bubble?.visibility = View.GONE
        kontainer?.visibility = View.VISIBLE
    }

    /** Tutup semua: kembali ke pil kompak dan kamera berhenti. */
    /** Catatan dengan suara: pengenal bawaan Android, bahasa Indonesia (id-ID). */
    private var pengenal: SpeechRecognizer? = null

    private fun punyaIzin(izin: String): Boolean =
        ContextCompat.checkSelfPermission(this, izin) == PackageManager.PERMISSION_GRANTED

    private fun punyaIzinMikrofon(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun kirimJs(js: String) {
        handler.post { flyout?.evaluateJavascript(js, null) }
    }

    private fun selesaiPengenal() {
        handler.post {
            pengenal?.destroy()
            pengenal = null
        }
    }

    private fun mulaiSuaraNative() {
        if (flyout == null) return
        if (!punyaIzinMikrofon()) {
            kirimJs("suaraGagal(${JSONObject.quote("Izin mikrofon belum ada. Buka aplikasi Dokumentasi lalu izinkan Mikrofon.")})")
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            kirimJs("suaraGagal(${JSONObject.quote("Pengenal suara tidak tersedia. Pastikan aplikasi Google terpasang dan aktif (Setelan > Aplikasi > Google), lalu coba lagi.")})")
            return
        }
        /* Pasang ulang tipe layanan: kalau layanan lahir sebelum izin mikrofon diberikan, tipe "microphone" belum ada
           dan Android membisukan mikrofon untuk aplikasi di latar. */
        try { buatNotifikasi() } catch (e: Exception) { }
        selesaiPengenal()
        val p = SpeechRecognizer.createSpeechRecognizer(this)
        pengenal = p
        p.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { kirimJs("suaraMulai()") }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onPartialResults(partialResults: Bundle?) {
                val t = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
                kirimJs("terimaSuara(${JSONObject.quote(t)}, false)")
            }
            override fun onResults(results: Bundle?) {
                val t = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                kirimJs("terimaSuara(${JSONObject.quote(t)}, true)")
                selesaiPengenal()
            }
            override fun onError(error: Int) {
                val teks = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Suara tidak terdengar, coba lagi."
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Izin mikrofon belum ada."
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER ->
                        "Butuh internet, atau unduh paket suara offline Bahasa Indonesia (Setelan Google > Suara > Pengenalan suara offline). Kode $error."
                    SpeechRecognizer.ERROR_AUDIO -> "Mikrofon tidak bisa dipakai (sedang dipakai aplikasi lain?). Kode $error."
                    11, 12, 13 -> "Paket bahasa Indonesia belum tersedia. Buka Setelan > Sistem > Bahasa > Pengetikan suara Google, unduh Bahasa Indonesia. Kode $error."
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Pengenal suara masih sibuk, tunggu sebentar lalu coba lagi."
                    else -> "Catatan suara gagal (kode $error)."
                }
                kirimJs("suaraGagal(${JSONObject.quote(teks)})")
                selesaiPengenal()
            }
        })
        p.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "id-ID")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        })
    }

    /** Lokasi dari HP (LocationManager), dikirim ke flyout. Lebih andal daripada WebView. */
    private var lokasiMgr: LocationManager? = null
    private val pendengarLokasi = LocationListener { loc -> kirimLokasi(loc) }

    private fun simpanLokasiTerakhir(loc: Location) {
        getSharedPreferences("lokasi_terakhir", MODE_PRIVATE).edit()
            .putString("lat", loc.latitude.toString())
            .putString("lon", loc.longitude.toString())
            .putLong("waktu", loc.time)
            .apply()
    }

    private fun bacaLokasiTerakhir(): Location? {
        val pref = getSharedPreferences("lokasi_terakhir", MODE_PRIVATE)
        val lat = pref.getString("lat", null)?.toDoubleOrNull() ?: return null
        val lon = pref.getString("lon", null)?.toDoubleOrNull() ?: return null
        return Location("tersimpan").apply {
            latitude = lat
            longitude = lon
            time = pref.getLong("waktu", 0L)
        }
    }

    private fun kirimLokasi(loc: Location) {
        simpanLokasiTerakhir(loc)
        val segar = System.currentTimeMillis() - loc.time < 120_000L
        kirimJs("terimaLokasiNative(${loc.latitude}, ${loc.longitude}, ${loc.accuracy.toInt()}, $segar)")
    }

    private fun mulaiLokasiNative() {
        if (!punyaIzin(Manifest.permission.ACCESS_FINE_LOCATION)) {
            kirimJs("terimaGalatLokasi(${JSONObject.quote("izin lokasi belum ada")})")
            return
        }
        val mgr = getSystemService(LocationManager::class.java) ?: return
        lokasiMgr = mgr
        try {
            mgr.getLastKnownLocation(LocationManager.GPS_PROVIDER)?.let { kirimLokasi(it) }
            mgr.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)?.let { kirimLokasi(it) }
            if (mgr.getLastKnownLocation(LocationManager.GPS_PROVIDER) == null &&
                mgr.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) == null) {
                bacaLokasiTerakhir()?.let { kirimLokasi(it) }   // cadangan: lokasi terakhir dari aplikasi ini
            }
            val adaProvider = mgr.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                mgr.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            if (!adaProvider) {
                kirimJs("terimaGalatLokasi(${JSONObject.quote("Lokasi HP mati. Aktifkan Lokasi.")})")
                return
            }
            if (mgr.isProviderEnabled(LocationManager.GPS_PROVIDER))
                mgr.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, pendengarLokasi, Looper.getMainLooper())
            if (mgr.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                mgr.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000L, 0f, pendengarLokasi, Looper.getMainLooper())
        } catch (_: SecurityException) {
            kirimJs("terimaGalatLokasi(${JSONObject.quote("izin lokasi belum ada")})")
        }
    }

    private fun hentikanLokasiNative() {
        try { lokasiMgr?.removeUpdates(pendengarLokasi) } catch (_: Exception) {}
        lokasiMgr = null
    }

    private fun tutupSemua() {
        keadaan = 0
        selesaiPengenal()
        hentikanLokasiNative()
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
        tv.visibility = View.VISIBLE
        bangunBubble()
        jadwalCiutkan()
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
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.OPAQUE
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = 0
        }
        // Ketuk di luar flyout = tutup (kamera berhenti, kembali ke pil).
        kt.setOnTouchListener { _, e ->
            if (e.action == MotionEvent.ACTION_OUTSIDE) { handler.post { tutupSemua() }; true } else false
        }
        kt.visibility = View.GONE
        wm.addView(kt, lp)
        lpFlyout = lp
        flyout = wv
        kontainer = kt
        preview = pv
        wv.loadUrl(URL_FLYOUT)
        mulaiLokasiNative()
        pemilikSiklus.atur(Lifecycle.State.RESUMED)
        nyalakanKamera()
    }

    /** Kamera asli dinyalakan lewat CameraX; pratinjau dipasang ke PreviewView. */
    private fun nyalakanKamera() {
        val pv = preview ?: return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            kabar("Izin kamera belum aktif untuk DKPoint.")
            return
        }
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                val prov = future.get()
                camProvider = prov
                val prev = Preview.Builder().build().also { it.setSurfaceProvider(pv.surfaceProvider) }
                val cap = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()
                imageCapture = cap
                prov.unbindAll()
                prov.bindToLifecycle(pemilikSiklus, CameraSelector.DEFAULT_BACK_CAMERA, prev, cap)
            } catch (e: Exception) {
                kabar("Kamera tidak bisa dibuka: " + (e.javaClass.simpleName))
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun hentikanKamera() {
        try { camProvider?.unbindAll() } catch (_: Exception) {}
        imageCapture = null
        if (jalan) pemilikSiklus.atur(Lifecycle.State.CREATED)
    }

    /** Ambil satu foto, potong 3:4, lalu kirim ke halaman web untuk diberi watermark dan disimpan. */
    /** Bunyi rana seperti kamera HP (dipakai saat foto diambil). */
    private val bunyiRana by lazy { MediaActionSound().also { it.load(MediaActionSound.SHUTTER_CLICK) } }

    /** Getaran singkat saat tombol rana ditekan. */
    private fun getaranRana() {
        try {
            val v = getSystemService(Vibrator::class.java) ?: return
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
            } else {
                v.vibrate(VibrationEffect.createOneShot(25, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        } catch (_: Exception) {}
    }

    private fun ambilFoto() {
        val cap = imageCapture
        if (cap == null) { kabar("Kamera belum siap, tunggu sebentar."); return }
        getaranRana()
        try { bunyiRana.play(MediaActionSound.SHUTTER_CLICK) } catch (_: Exception) {}
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

    private fun aturFokusKetik(aktif: Boolean) {
        val lp = lpFlyout ?: return
        val k = kontainer ?: return
        val pantau = WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
        lp.flags = if (aktif) {
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or pantau
        } else {
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or pantau
        }
        try { wm.updateViewLayout(k, lp) } catch (_: Exception) {}
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
        fun mulaiSuara() {
            handler.post { mulaiSuaraNative() }
        }

        @JavascriptInterface
        fun hentikanSuara() {
            handler.post { pengenal?.stopListening() }
        }

        @JavascriptInterface
        fun tutup() {
            handler.post { tutupSemua() }
        }

        /** Kolom catatan diketuk: jendela boleh menerima fokus agar keyboard muncul. */
        @JavascriptInterface
        fun fokusKetik(aktif: Boolean) {
            handler.post { aturFokusKetik(aktif) }
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
    override val lifecycle: Lifecycle
        get() = daftar
    fun atur(s: Lifecycle.State) {
        daftar.currentState = s
    }
}
