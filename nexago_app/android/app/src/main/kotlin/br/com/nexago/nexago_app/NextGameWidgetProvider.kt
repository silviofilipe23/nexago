package br.com.nexago.nexago_app

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews

/**
 * Widget "Próximo jogo" (W1) da tela inicial. Lê o snapshot que o app grava
 * pelo canal `nexago/home_widget` ([saveSnapshot]) e se redesenha sozinho: a
 * contagem é do `Chronometer` nativo, e um alarme o acorda no início e no fim
 * do próximo compromisso. Tocar abre a Agenda (`nexago://agenda`).
 */
class NextGameWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { render(context, manager, it) }
        scheduleRefresh(context)
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        manager: AppWidgetManager,
        id: Int,
        options: Bundle,
    ) {
        render(context, manager, id)
    }

    companion object {
        /** Abaixo disso o widget é o pequeno: sem a coluna "Depois". */
        private const val WIDE_MIN_DP = 250

        fun saveSnapshot(context: Context, json: String) {
            context.getSharedPreferences(NextGameWidgetModel.PREFS, Context.MODE_PRIVATE)
                .edit().putString(NextGameWidgetModel.KEY, json).apply()
            refreshAll(context)
        }

        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            ids(context, manager).forEach { render(context, manager, it) }
            scheduleRefresh(context)
        }

        private fun ids(context: Context, manager: AppWidgetManager): IntArray =
            manager.getAppWidgetIds(ComponentName(context, NextGameWidgetProvider::class.java))

        private fun snapshot(context: Context): NextGameSnapshot? =
            NextGameWidgetModel.parse(
                context.getSharedPreferences(NextGameWidgetModel.PREFS, Context.MODE_PRIVATE)
                    .getString(NextGameWidgetModel.KEY, null),
            )

        private fun openAgenda(context: Context): PendingIntent {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nexago://agenda"))
                .setClass(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            return PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        }

        private fun render(context: Context, manager: AppWidgetManager, id: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_next_game)
            views.setOnClickPendingIntent(R.id.widget_root, openAgenda(context))
            val now = System.currentTimeMillis()
            val snap = snapshot(context)
            val entries = snap?.let { NextGameWidgetModel.upcoming(it, now) }.orEmpty()

            when {
                snap == null || !snap.signedIn -> showEmpty(context, views, signedIn = false)
                entries.isEmpty() -> showEmpty(context, views, signedIn = true)
                else -> {
                    val wide = manager.getAppWidgetOptions(id)
                        .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) >= WIDE_MIN_DP
                    showEntries(context, views, entries, now, wide)
                }
            }
            manager.updateAppWidget(id, views)
        }

        private fun showEmpty(context: Context, views: RemoteViews, signedIn: Boolean) {
            views.setViewVisibility(R.id.widget_content, View.GONE)
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            if (signedIn) {
                views.setTextViewText(R.id.widget_empty_label, context.getString(R.string.widget_next_game_free_label))
                views.setTextViewText(R.id.widget_empty_title, context.getString(R.string.widget_next_game_free_title))
                views.setTextViewText(R.id.widget_empty_caption, context.getString(R.string.widget_next_game_free_caption))
                views.setTextViewText(R.id.widget_empty_button, context.getString(R.string.widget_next_game_open_agenda))
            } else {
                views.setTextViewText(R.id.widget_empty_label, "nexaGO")
                views.setTextViewText(R.id.widget_empty_title, context.getString(R.string.widget_next_game_signed_out_title))
                views.setTextViewText(R.id.widget_empty_caption, context.getString(R.string.widget_next_game_signed_out_caption))
                views.setTextViewText(R.id.widget_empty_button, context.getString(R.string.widget_next_game_open_app))
            }
        }

        private fun showEntries(
            context: Context,
            views: RemoteViews,
            entries: List<NextGameEntry>,
            now: Long,
            wide: Boolean,
        ) {
            views.setViewVisibility(R.id.widget_empty, View.GONE)
            views.setViewVisibility(R.id.widget_content, View.VISIBLE)
            val first = entries.first()
            val model = NextGameWidgetModel

            views.setTextViewText(
                R.id.widget_label,
                "${first.label} · ${model.dayWord(first.startsAt, now)}".uppercase(),
            )
            views.setTextColor(R.id.widget_label, first.color)
            showHeadline(context, views, first, now)
            views.setTextViewText(R.id.widget_when, model.whenLine(first, now))
            views.setTextViewText(R.id.widget_detail, model.join(first.title, first.detail))

            val later = entries.drop(1).take(2)
            val showLater = wide && later.isNotEmpty()
            val laterVisibility = if (showLater) View.VISIBLE else View.GONE
            views.setViewVisibility(R.id.widget_divider, laterVisibility)
            views.setViewVisibility(R.id.widget_later, laterVisibility)
            if (!showLater) return
            val rows = listOf(
                R.id.widget_later1_when to R.id.widget_later1_detail,
                R.id.widget_later2_when to R.id.widget_later2_detail,
            )
            rows.forEachIndexed { i, (whenId, detailId) ->
                val entry = later.getOrNull(i)
                views.setTextViewText(whenId, entry?.let { model.whenLine(it, now) } ?: "")
                views.setTextViewText(detailId, entry?.let { model.join(it.label, it.title) } ?: "")
            }
        }

        /** Contagem nas próximas 24h; "Agora" em andamento; senão o dia. */
        private fun showHeadline(context: Context, views: RemoteViews, entry: NextGameEntry, now: Long) {
            val model = NextGameWidgetModel
            val untilStart = entry.startsAt - now
            val countdown = !entry.allDay && untilStart in 1..model.COUNTDOWN_WINDOW_MS
            views.setViewVisibility(R.id.widget_countdown, if (countdown) View.VISIBLE else View.GONE)
            views.setViewVisibility(R.id.widget_big_text, if (countdown) View.GONE else View.VISIBLE)
            if (countdown) {
                views.setChronometer(R.id.widget_countdown, SystemClock.elapsedRealtime() + untilStart, null, true)
                views.setChronometerCountDown(R.id.widget_countdown, true)
                views.setTextViewText(R.id.widget_caption, context.getString(R.string.widget_next_game_until))
                return
            }
            views.setChronometer(R.id.widget_countdown, SystemClock.elapsedRealtime(), null, false)
            val (big, caption) = when {
                untilStart <= 0 -> context.getString(R.string.widget_next_game_now) to
                    context.getString(R.string.widget_next_game_happening)
                entry.allDay -> model.dayRange(entry, now) to context.getString(R.string.widget_next_game_all_day)
                else -> model.whenLine(entry, now) to context.getString(R.string.widget_next_game_next)
            }
            views.setTextViewText(R.id.widget_big_text, big)
            views.setTextViewText(R.id.widget_caption, caption)
        }

        /** Acorda o widget na próxima virada (janela da contagem, início ou fim). */
        private fun scheduleRefresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = ids(context, manager)
            val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, NextGameWidgetProvider::class.java)
                .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            val pending = PendingIntent.getBroadcast(
                context,
                1,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val snap = snapshot(context)
            val now = System.currentTimeMillis()
            val at = snap?.let { NextGameWidgetModel.nextRefreshAt(NextGameWidgetModel.upcoming(it, now), now) }
            if (ids.isEmpty() || at == null) {
                alarms.cancel(pending)
                return
            }
            // Inexato de propósito: não pede a permissão de alarme exato, e o
            // sistema ainda atualiza a cada 30 min (updatePeriodMillis).
            alarms.set(AlarmManager.RTC, at, pending)
        }
    }
}
