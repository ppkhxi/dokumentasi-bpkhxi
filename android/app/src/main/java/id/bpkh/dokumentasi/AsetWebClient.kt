package id.bpkh.dokumentasi

import android.content.Context
import androidx.webkit.WebViewAssetLoader
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

/**
 * Melayani berkas aplikasi dari dalam APK (folder assets/), sehingga aplikasi dan flyout
 * bisa dibuka tanpa sinyal. Origin tetap https://dkpoint.pages.dev, jadi data penyimpanan
 * browser tidak berpindah. Permintaan /api/ dan /dl/ tetap diambil dari internet.
 */
open class AsetWebClient(private val ctx: Context) : WebViewClient() {

    /**
     * Berkas aplikasi dibaca langsung dari dalam APK (assets/) dengan alamat dkpoint.pages.dev,
     * jadi origin tetap sama dan data penyimpanan browser tidak berpindah.
     */
    private val pemuat = WebViewAssetLoader.Builder()
        .setDomain("dkpoint.pages.dev")
        .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(ctx))
        .build()

    override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
        val uri = request?.url ?: return null
        if (request.method != "GET" || uri.host != "dkpoint.pages.dev") return null
        val path = uri.path ?: "/"
        if (path.startsWith("/api/") || path.startsWith("/dl/")) return null
        // Alamat folder (misalnya "/") dibuka sebagai index.html.
        val tujuan = if (path.isEmpty() || path.endsWith("/"))
            uri.buildUpon().path(if (path.isEmpty()) "/index.html" else path + "index.html").build()
        else uri
        return pemuat.shouldInterceptRequest(tujuan)
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
