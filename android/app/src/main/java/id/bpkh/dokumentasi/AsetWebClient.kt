package id.bpkh.dokumentasi

import android.content.Context
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

/**
 * Melayani berkas aplikasi dari dalam APK (folder assets/www), sehingga aplikasi dan flyout
 * bisa dibuka tanpa sinyal. Origin tetap https://dkpoint.pages.dev, jadi data penyimpanan
 * browser tidak berpindah. Permintaan /api/ dan /dl/ tetap diambil dari internet.
 */
open class AsetWebClient(private val ctx: Context) : WebViewClient() {

    override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
        val uri = request?.url ?: return null
        if (request.method != "GET" || uri.host != "dkpoint.pages.dev") return null
        var path = uri.path ?: "/"
        if (path.startsWith("/api/") || path.startsWith("/dl/")) return null
        if (path.isEmpty() || path == "/") path = "/index.html"
        if (path.endsWith("/")) path += "index.html"
        val mime = mimeDari(path)
        return try {
            val masuk = ctx.assets.open("www$path")
            val teks = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json")
            WebResourceResponse(mime, if (teks) "utf-8" else null, masuk)
        } catch (_: Exception) {
            null
        }
    }

    override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
        if (request?.isForMainFrame == true) {
            Toast.makeText(ctx, "Halaman gagal dimuat. Periksa koneksi.", Toast.LENGTH_LONG).show()
        }
    }

    private fun mimeDari(path: String): String {
        val ext = path.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "html" -> "text/html"
            "js" -> "application/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "webmanifest" -> "application/manifest+json"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "svg" -> "image/svg+xml"
            "ico" -> "image/x-icon"
            "woff" -> "font/woff"
            "woff2" -> "font/woff2"
            "ttf" -> "font/ttf"
            "md", "txt" -> "text/plain"
            else -> "application/octet-stream"
        }
    }
}
