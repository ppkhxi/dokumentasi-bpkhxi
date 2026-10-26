package id.bpkh.dokumentasi

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar
import java.util.TimeZone

/**
 * Pengingat harian pukul 16.00 WIB: mengingatkan untuk membuka aplikasi agar antrean foto
 * bisa diunggah saat ada sinyal.
 */
object Pengingat {
    private const val CH = "dokumentasi_upload"
    private const val REQ = 77
    private const val NOTIF_ID = 77

    fun jadwalkan(ctx: Context) {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Jakarta")).apply {
            set(Calendar.HOUR_OF_DAY, 16)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_MONTH, 1)
        }
        val pi = PendingIntent.getBroadcast(
            ctx, REQ, Intent(ctx, PengingatReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        ctx.getSystemService(AlarmManager::class.java)
            .setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
    }

    fun tampil(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CH, "Pengingat upload", NotificationManager.IMPORTANCE_DEFAULT)
            ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
        val buka = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notif = NotificationCompat.Builder(ctx, CH)
            .setContentTitle("Saatnya upload foto")
            .setContentText("Buka Dokumentasi saat ada sinyal agar foto di antrean terkirim.")
            .setSmallIcon(android.R.drawable.ic_menu_upload)
            .setContentIntent(buka)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIF_ID, notif)
        } catch (_: SecurityException) {
            // Izin notifikasi belum diberikan; pengingat dilewati.
        }
    }
}

/** Dipanggil alarm pukul 16.00 WIB; menampilkan pengingat lalu menjadwalkan hari berikutnya. */
class PengingatReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent?) {
        Pengingat.tampil(ctx)
        Pengingat.jadwalkan(ctx)
    }
}
