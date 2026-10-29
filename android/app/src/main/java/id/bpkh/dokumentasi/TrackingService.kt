package id.bpkh.dokumentasi

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Merekam jejak GPS di latar belakang (layar mati tetap jalan). Titik disimpan ke berkas track.jsonl. */
class TrackingService : Service() {
    private var mgr: LocationManager? = null
    private var sedangRekam = false
    private val pendengar = LocationListener { loc -> tulis(loc) }
    private val berkas by lazy { File(filesDir, "track.jsonl") }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        jalan = true
        val ch = NotificationChannel(CH, "Tracking lokasi", NotificationManager.IMPORTANCE_LOW)
        getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            AKSI_MULAI -> {
                berkas.delete()          // jejak baru
                naikkanKeForeground()
                lanjut()
            }
            AKSI_LANJUT -> lanjut()
            AKSI_JEDA -> jeda()
            AKSI_STOP -> {
                jeda()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        jeda()
        jalan = false
        super.onDestroy()
    }

    private fun naikkanKeForeground() {
        val notif: Notification = NotificationCompat.Builder(this, CH)
            .setContentTitle("Tracking lokasi aktif")
            .setContentText("Jejak GPS direkam di latar belakang")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()
        val tipe = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
        ServiceCompat.startForeground(this, NOTIF_ID, notif, tipe)
    }

    private fun lanjut() {
        if (sedangRekam) return
        val m = getSystemService(LocationManager::class.java) ?: return
        mgr = m
        try {
            m.requestLocationUpdates(LocationManager.GPS_PROVIDER, 3000L, 3f, pendengar, Looper.getMainLooper())
            sedangRekam = true
        } catch (_: SecurityException) {
        }
    }

    private fun jeda() {
        try { mgr?.removeUpdates(pendengar) } catch (_: Exception) {}
        sedangRekam = false
    }

    private fun tulis(loc: Location) {
        if (loc.accuracy > 80f) return   // abaikan fix yang terlalu melenceng
        val o = JSONObject()
            .put("lat", loc.latitude)
            .put("lon", loc.longitude)
            .put("acc", loc.accuracy.toDouble())
            .put("t", loc.time)
        try { berkas.appendText(o.toString() + "\n") } catch (_: Exception) {}
    }

    companion object {
        const val AKSI_MULAI = "id.bpkh.dokumentasi.TRACK_MULAI"
        const val AKSI_JEDA = "id.bpkh.dokumentasi.TRACK_JEDA"
        const val AKSI_LANJUT = "id.bpkh.dokumentasi.TRACK_LANJUT"
        const val AKSI_STOP = "id.bpkh.dokumentasi.TRACK_STOP"
        private const val CH = "dokumentasi_track"
        private const val NOTIF_ID = 2002

        @Volatile var jalan = false

        fun kirim(ctx: Context, aksi: String) {
            val i = Intent(ctx, TrackingService::class.java).setAction(aksi)
            if (aksi == AKSI_MULAI) ContextCompat.startForegroundService(ctx, i)
            else if (jalan) ctx.startService(i)
        }

        /** Titik sejak indeks [dari] (JSON array). */
        fun baca(ctx: Context, dari: Int): String {
            val f = File(ctx.filesDir, "track.jsonl")
            val arr = JSONArray()
            if (!f.exists()) return arr.toString()
            var no = 0
            f.forEachLine { baris ->
                if (no >= dari && baris.isNotBlank()) {
                    try { arr.put(JSONObject(baris)) } catch (_: Exception) {}
                }
                no++
            }
            return arr.toString()
        }
    }
}
