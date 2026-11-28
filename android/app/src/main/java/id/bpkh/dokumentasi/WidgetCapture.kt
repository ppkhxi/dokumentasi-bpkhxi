package id.bpkh.dokumentasi

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * Widget layar utama DKPoint: pintasan Capture Video, Capture Foto, dan portal spacedkpoint.
 * Tombol Video/Foto membuka MainActivity lalu memicu aksi di halaman web setelah selesai dimuat;
 * tombol Portal membuka peramban.
 */
class WidgetCapture : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val tampilan = tampilan(context)
        ids.forEach { id -> manager.updateAppWidget(id, tampilan) }
    }

    private fun tampilan(ctx: Context): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_capture)
        rv.setOnClickPendingIntent(R.id.wvVideo, aksi(ctx, MainActivity.AKSI_VIDEO, 101))
        rv.setOnClickPendingIntent(R.id.wvFoto, aksi(ctx, MainActivity.AKSI_FOTO, 102))
        val portal = PendingIntent.getActivity(
            ctx, 103,
            Intent(Intent.ACTION_VIEW, Uri.parse("https://spacedkpoint.pages.dev"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        rv.setOnClickPendingIntent(R.id.wvPortal, portal)
        return rv
    }

    private fun aksi(ctx: Context, aksi: String, kode: Int): PendingIntent {
        val niat = Intent(ctx, MainActivity::class.java).apply {
            putExtra(MainActivity.EXTRA_AKSI, aksi)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            ctx, kode, niat,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
