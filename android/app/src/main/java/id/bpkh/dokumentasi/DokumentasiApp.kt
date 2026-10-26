package id.bpkh.dokumentasi

import android.app.Application

/** Menyimpan detail crash, baik ke Download maupun ke preferensi (ditampilkan saat dibuka lagi). */
class DokumentasiApp : Application() {
    override fun onCreate() {
        super.onCreate()
        CatatanAplikasi.catat(this, "app_onCreate")
        val asli = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            val teks = "Thread: ${t.name}\n\n" + e.stackTraceToString()
            CatatanAplikasi.tulis(this, "dokumentasi_crash_${System.currentTimeMillis()}.txt", teks)
            try {
                getSharedPreferences("dokumentasi", MODE_PRIVATE).edit()
                    .putString("crash_terakhir", teks)
                    .commit()
            } catch (_: Throwable) {}
            asli?.uncaughtException(t, e)
        }
    }
}
