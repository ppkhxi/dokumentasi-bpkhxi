package id.bpkh.dokumentasi

import android.app.Application

/** Menyimpan detail crash ke preferensi; ditampilkan di layar saat aplikasi dibuka lagi. */
class DokumentasiApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val asli = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            val teks = "Thread: ${t.name}\n\n" + e.stackTraceToString()
            try {
                getSharedPreferences("dokumentasi", MODE_PRIVATE).edit()
                    .putString("crash_terakhir", teks)
                    .commit()
            } catch (_: Throwable) {}
            asli?.uncaughtException(t, e)
        }
    }
}
