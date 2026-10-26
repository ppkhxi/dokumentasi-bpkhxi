package id.bpkh.dokumentasi

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore

/** Menulis catatan kecil ke folder Download, supaya bisa dibaca lewat aplikasi Files. */
object CatatanAplikasi {
    fun tulis(ctx: Context, nama: String, isi: String) {
        try {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, nama)
                put(MediaStore.Downloads.MIME_TYPE, "text/plain")
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return
            ctx.contentResolver.openOutputStream(uri)?.use { it.write(isi.toByteArray()) }
        } catch (_: Throwable) {}
    }

    fun catat(ctx: Context, tahap: String) {
        tulis(ctx, "dokumentasi_log_${System.currentTimeMillis()}_$tahap.txt", tahap)
    }
}
