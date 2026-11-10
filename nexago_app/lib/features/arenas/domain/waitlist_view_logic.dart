import 'arena_booking_waitlist_entry.dart';

/// Quanto tempo o histórico de filas encerradas aparece na tela.
const Duration waitlistHistoryWindow = Duration(days: 30);

/// Como uma fila encerrada terminou (o selo do histórico).
enum WaitlistClosedReason { converted, offerExpired, slotStarted, left }

extension WaitlistClosedReasonLabel on WaitlistClosedReason {
  String get label => switch (this) {
        WaitlistClosedReason.converted => 'Virou reserva',
        WaitlistClosedReason.offerExpired => 'Prazo acabou',
        WaitlistClosedReason.slotStarted => 'Horário passou',
        WaitlistClosedReason.left => 'Você saiu',
      };
}

/// As filas do atleta separadas como a tela "Listas de espera" mostra.
class WaitlistView {
  const WaitlistView({
    required this.offers,
    required this.waiting,
    required this.closed,
  });

  /// Vaga liberada para o atleta, ainda dentro dos 15 min.
  final List<ArenaBookingWaitlistEntry> offers;

  /// Na fila, horário ainda por vir.
  final List<ArenaBookingWaitlistEntry> waiting;

  /// Encerradas nos últimos [waitlistHistoryWindow], com o motivo.
  final List<(ArenaBookingWaitlistEntry, WaitlistClosedReason)> closed;

  int get activeCount => offers.length + waiting.length;
  bool get hasOffer => offers.isNotEmpty;
  bool get isEmpty => activeCount == 0 && closed.isEmpty;

  static const empty = WaitlistView(offers: [], waiting: [], closed: []);
}

DateTime? _slotStart(ArenaBookingWaitlistEntry e) {
  final day = e.dateKey.length >= 10
      ? DateTime.tryParse(e.dateKey.substring(0, 10))
      : null;
  final parts = e.startTime.split(':');
  final h = parts.isNotEmpty ? int.tryParse(parts[0]) : null;
  final m = parts.length > 1 ? int.tryParse(parts[1]) : 0;
  if (day == null || h == null || m == null) return null;
  return DateTime(day.year, day.month, day.day, h, m);
}

/// Motivo do encerramento; null quando a entrada ainda está ativa.
/// O app corrige o atraso do servidor: horário já começado ou prazo vencido já contam
/// como encerrados, mesmo antes da varredura de 5 em 5 min.
WaitlistClosedReason? waitlistClosedReason(
  ArenaBookingWaitlistEntry e,
  DateTime now,
) {
  switch (e.status) {
    case ArenaBookingWaitlistStatus.converted:
      return WaitlistClosedReason.converted;
    case ArenaBookingWaitlistStatus.expired:
      return switch (e.expiredReason) {
        'left_by_athlete' => WaitlistClosedReason.left,
        'slot_started' => WaitlistClosedReason.slotStarted,
        _ => WaitlistClosedReason.offerExpired,
      };
    case ArenaBookingWaitlistStatus.notified:
      final exp = e.expiresAt;
      if (exp != null && !now.isBefore(exp))
        return WaitlistClosedReason.offerExpired;
      if (e.slotStarted(now)) return WaitlistClosedReason.slotStarted;
      return null;
    case ArenaBookingWaitlistStatus.waiting:
      return e.slotStarted(now) ? WaitlistClosedReason.slotStarted : null;
  }
}

WaitlistView buildWaitlistView(
  Iterable<ArenaBookingWaitlistEntry> entries,
  DateTime now,
) {
  final offers = <ArenaBookingWaitlistEntry>[];
  final waiting = <ArenaBookingWaitlistEntry>[];
  final closed = <(ArenaBookingWaitlistEntry, WaitlistClosedReason)>[];
  final historyStart = now.subtract(waitlistHistoryWindow);
  for (final e in entries) {
    final reason = waitlistClosedReason(e, now);
    if (reason == null) {
      (e.isNotified ? offers : waiting).add(e);
      continue;
    }
    final when = _slotStart(e) ?? e.createdAt;
    if (when == null || when.isBefore(historyStart)) continue;
    closed.add((e, reason));
  }
  int bySlot(ArenaBookingWaitlistEntry a, ArenaBookingWaitlistEntry b) =>
      (_slotStart(a) ?? DateTime(0)).compareTo(_slotStart(b) ?? DateTime(0));
  offers.sort(bySlot);
  waiting.sort(bySlot);
  closed.sort((a, b) => bySlot(b.$1, a.$1));
  return WaitlistView(offers: offers, waiting: waiting, closed: closed);
}
