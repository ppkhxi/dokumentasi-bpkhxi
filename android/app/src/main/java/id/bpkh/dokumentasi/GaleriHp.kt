package id.bpkh.dokumentasi

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.provider.MediaStore

/** Menyalin foto dokumentasi ke Galeri HP (Pictures/dkpoint) sebagai cadangan di luar penyimpanan aplikasi. */
object GaleriHp {
    fun simpan(ctx: Context, nama: String, data: ByteArray): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        return try {
            val aman = nama.replace(Regex("[^A-Za-z0-9._-]"), "_").ifEmpty { "foto.jpg" }
            val nilai = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, aman)
                put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/dkpoint")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val resolver = ctx.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, nilai) ?: return false
            resolver.openOutputStream(uri)?.use { it.write(data) } ?: return false
            nilai.clear()
            nilai.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, nilai, null, null)
            true
        } catch (e: Exception) {
            false
        }
    }
}
