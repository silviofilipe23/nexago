import '../../arenas/domain/my_booking_item.dart';

/// Quando a reserva entra na fila de avaliação: 5 minutos depois do fim — o mesmo
/// atraso do portal (`pending-arena-review.ts`) e do push `arena_review_request`.
const Duration arenaReviewDelayAfterEnd = Duration(minutes: 5);

/// Janela do convite em Minhas reservas. Reserva mais antiga continua avaliável pelo
/// detalhe, mas não vira cartão: cobrar por jogo de meses atrás é ruído.
const Duration arenaReviewPromptWindow = Duration(days: 30);

/// XP creditado pelo gatilho `arena_reviews` (`XP_ARENA_REVIEW` nas functions).
const int arenaReviewXp = 10;

/// Comentário livre, somado aos destaques escolhidos.
const int arenaReviewCommentMax = 500;

/// Destaques rápidos (viram a 1ª linha do comentário: "Destaques: …").
const List<String> arenaReviewHighlights = <String>[
  'Quadra impecável',
  'Atendimento',
  'Iluminação',
  'Vestiário',
  'Pontualidade',
  'Estacionamento',
];

DateTime? _dateOnly(String raw) {
  final value = raw.trim();
  if (value.length < 10) return null;
  final iso = DateTime.tryParse(value.substring(0, 10));
  return iso == null ? null : DateTime(iso.year, iso.month, iso.day);
}

int? _minutes(String hhmm) {
  final parts = hhmm.trim().split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m =
      int.tryParse(parts[1].length > 2 ? parts[1].substring(0, 2) : parts[1]);
  if (h == null || m == null) return null;
  return h * 60 + m;
}

/// Fim real da reserva, somando um dia quando ela cruza a meia-noite (22:00 → 01:00).
DateTime? arenaReviewEndsAt({
  required String dateRaw,
  required String startTime,
  required String endTime,
}) {
  final day = _dateOnly(dateRaw);
  final start = _minutes(startTime);
  final end = _minutes(endTime);
  if (day == null || start == null || end == null) return null;
  final endAt = day.add(Duration(minutes: end));
  return end > start ? endAt : endAt.add(const Duration(days: 1));
}

/// Concluída (por status ou por tempo) e nunca cancelada.
bool isArenaBookingReviewable({
  required String rawStatus,
  required String dateRaw,
  required String startTime,
  required String endTime,
  required DateTime now,
}) {
  final status = rawStatus.trim().toLowerCase();
  if (status == 'canceled' || status == 'cancelled') return false;
  if (status == 'completed' || status == 'finalizado') return true;
  final endsAt = arenaReviewEndsAt(
    dateRaw: dateRaw,
    startTime: startTime,
    endTime: endTime,
  );
  if (endsAt == null) return false;
  return now.isAfter(endsAt.add(arenaReviewDelayAfterEnd));
}

/// Oferecer "Avaliar" para esta reserva: avaliável e com arena (sem `arenaId` o envio falha).
bool canOfferArenaReview(MyBookingItem item, DateTime now) {
  if ((item.arenaId ?? '').trim().isEmpty) return false;
  return isArenaBookingReviewable(
    rawStatus: item.rawStatus,
    dateRaw: item.dateRaw,
    startTime: item.startTime,
    endTime: item.endTime,
    now: now,
  );
}

/// Reserva do cartão "Como foi o jogo?": a de fim mais recente entre as avaliáveis,
/// não avaliadas nem dispensadas, dentro de [arenaReviewPromptWindow].
MyBookingItem? pickPendingArenaReview(
  Iterable<MyBookingItem> items, {
  required Set<String> excludedBookingIds,
  required DateTime now,
}) {
  final windowStart = now.subtract(arenaReviewPromptWindow);
  MyBookingItem? best;
  DateTime? bestEnd;
  for (final item in items) {
    if (excludedBookingIds.contains(item.id)) continue;
    if (!canOfferArenaReview(item, now)) continue;
    final endsAt = arenaReviewEndsAt(
      dateRaw: item.dateRaw,
      startTime: item.startTime,
      endTime: item.endTime,
    );
    if (endsAt == null || endsAt.isBefore(windowStart)) continue;
    if (bestEnd == null || endsAt.isAfter(bestEnd)) {
      best = item;
      bestEnd = endsAt;
    }
  }
  return best;
}

/// Comentário gravado: destaques na 1ª linha, texto livre embaixo; null quando vazio.
String? composeArenaReviewComment(Iterable<String> highlights, String text) {
  final tags = highlights.toList()..sort();
  final userText = text.trim();
  if (tags.isEmpty && userText.isEmpty) return null;
  final buffer = StringBuffer();
  if (tags.isNotEmpty) buffer.write('Destaques: ${tags.join(', ')}');
  if (userText.isNotEmpty) {
    if (buffer.isNotEmpty) buffer.writeln();
    buffer.write(userText);
  }
  return buffer.toString();
}

/// Rótulo da nota, do péssimo ao excelente.
String arenaReviewMoodLabel(int? rating) => switch (rating) {
      1 => 'Péssimo',
      2 => 'Ruim',
      3 => 'Regular',
      4 => 'Bom',
      5 => 'Excelente',
      _ => 'Toque nas estrelas',
    };
