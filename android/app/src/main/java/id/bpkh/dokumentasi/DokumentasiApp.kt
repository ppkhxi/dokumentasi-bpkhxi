package id.bpkh.dokumentasi

import android.app.Application

/** Menyimpan detail crash terakhir, lalu MainActivity menampilkannya saat aplikasi dibuka lagi. */
class DokumentasiApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val asli = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                getSharedPreferences("dokumentasi", MODE_PRIVATE).edit()
                    .putString("crash_terakhir", "Thread: ${t.name}\n\n" + e.stackTraceToString())
                    .commit()
            } catch (_: Throwable) {}
            asli?.uncaughtException(t, e)
        }
    }
}
