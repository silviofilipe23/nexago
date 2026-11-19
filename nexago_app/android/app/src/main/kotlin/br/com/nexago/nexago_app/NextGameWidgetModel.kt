package br.com.nexago.nexago_app

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/** Um compromisso do snapshot que o app grava (`encodeAgendaWidgetSnapshot`). */
data class NextGameEntry(
    val id: String,
    val label: String,
    val title: String,
    val detail: String,
    val startsAt: Long,
    val endsAt: Long,
    val allDay: Boolean,
    val color: Int,
)

data class NextGameSnapshot(val signedIn: Boolean, val entries: List<NextGameEntry>)

/**
 * Regras do widget "Próximo jogo" (W1) sem Android: ler o snapshot, escolher o
 * que mostrar e formatar dia e hora em português. Datas em milissegundos e no
 * fuso do aparelho.
 */
object NextGameWidgetModel {
    const val PREFS = "nexago_home_widget"
    const val KEY = "agenda_snapshot"

    /** Até aqui a contagem é regressiva; mais longe, mostra o dia e a hora. */
    const val COUNTDOWN_WINDOW_MS = 24L * 60 * 60 * 1000

    private val ptBr = Locale("pt", "BR")

    fun parse(json: String?): NextGameSnapshot? {
        if (json.isNullOrBlank()) return null
        return try {
            val root = JSONObject(json)
            val items = root.optJSONArray("items")
            val entries = (0 until (items?.length() ?: 0)).mapNotNull { i ->
                val o = items?.optJSONObject(i) ?: return@mapNotNull null
                NextGameEntry(
                    id = o.optString("id"),
                    label = o.optString("label"),
                    title = o.optString("title"),
                    detail = o.optString("detail"),
                    startsAt = o.optLong("startsAt"),
                    endsAt = o.optLong("endsAt"),
                    allDay = o.optBoolean("allDay"),
                    color = o.optInt("color", 0xFF6EB5FF.toInt()),
                )
            }
            NextGameSnapshot(root.optBoolean("signedIn"), entries)
        } catch (e: org.json.JSONException) {
            null
        }
    }

    /** O que ainda não acabou, na ordem do relógio. */
    fun upcoming(snapshot: NextGameSnapshot, now: Long): List<NextGameEntry> =
        snapshot.entries.filter { it.endsAt > now }.sortedBy { it.startsAt }

    /**
     * Quando o widget precisa se redesenhar sozinho: ao entrar na janela da
     * contagem, no início (vira "Agora") e no fim (passa ao seguinte).
     */
    fun nextRefreshAt(entries: List<NextGameEntry>, now: Long): Long? {
        val first = entries.firstOrNull() ?: return null
        return listOf(first.startsAt - COUNTDOWN_WINDOW_MS, first.startsAt, first.endsAt)
            .filter { it > now }
            .minOrNull()
    }

    private fun calendar(ms: Long) = Calendar.getInstance().apply { timeInMillis = ms }

    private fun dayIndex(c: Calendar) = c.get(Calendar.YEAR) * 400 + c.get(Calendar.DAY_OF_YEAR)

    private fun weekday(ms: Long): String =
        SimpleDateFormat("EEE", ptBr).format(ms).replace(".", "")
            .replaceFirstChar { it.titlecase(ptBr) }

    /** "Hoje", "Amanhã" ou o dia da semana ("Sex"). */
    fun dayWord(ms: Long, now: Long): String {
        val diff = dayIndex(calendar(ms)) - dayIndex(calendar(now))
        return when (diff) {
            0 -> "Hoje"
            1 -> "Amanhã"
            else -> weekday(ms)
        }
    }

    fun time(ms: Long): String = SimpleDateFormat("HH:mm", ptBr).format(ms)

    /** Torneio de dia inteiro: "Sáb–Dom", ou o dia só ("Sáb"). */
    fun dayRange(entry: NextGameEntry, now: Long): String {
        val first = dayWord(entry.startsAt, now)
        val last = dayWord(entry.endsAt, now)
        return if (first == last) first else "$first–$last"
    }

    /** Linha de quando: "Hoje 19:00", "Sex 07:00" ou "Sáb–Dom". */
    fun whenLine(entry: NextGameEntry, now: Long): String =
        if (entry.allDay) dayRange(entry, now) else "${dayWord(entry.startsAt, now)} ${time(entry.startsAt)}"

    fun join(vararg parts: String): String = parts.filter { it.isNotBlank() }.joinToString(" · ")
}
