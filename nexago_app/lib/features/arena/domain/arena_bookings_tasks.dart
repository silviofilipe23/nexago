import 'package:flutter/foundation.dart';

import '../../arenas/domain/arena_booking_waitlist_entry.dart';
import 'arena_booking_card_pills.dart';
import 'arena_booking_day_timeline.dart';
import 'arena_booking_labels.dart';
import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';
import 'arena_now.dart';
import 'comandas/arena_comanda.dart';

/// Atraso a partir do qual o check-in vira pendência ("Precisa de você").
const int arenaLateCheckInGraceMinutes = 5;

/// Saldo a cobrar entra na faixa quando a reserva começa em até isso.
const int arenaDueSoonMinutes = 30;

/// Uma pendência da faixa "Precisa de você" da aba Reservas.
@immutable
sealed class ArenaBookingTask {
  const ArenaBookingTask(this.booking);

  final ArenaManagerBooking booking;
}

/// Reserva que já começou e ainda está sem check-in.
final class ArenaLateCheckInTask extends ArenaBookingTask {
  const ArenaLateCheckInTask(super.booking, {required this.minutesLate});

  final int minutesLate;
}

/// Sinal pago ou pagamento na arena, com a reserva começando (ou já em
/// quadra) e sem comanda ligada a ela.
final class ArenaDueBalanceTask extends ArenaBookingTask {
  const ArenaDueBalanceTask(super.booking, {required this.dueReais});

  final double dueReais;
}

/// Horário de hoje cancelado, ainda por vir, com gente na lista de espera.
final class ArenaCanceledWithWaitlistTask extends ArenaBookingTask {
  const ArenaCanceledWithWaitlistTask(
    super.booking, {
    required this.waiting,
    required this.notified,
  });

  /// Quantos estão na fila (esperando ou já avisados).
  final int waiting;

  /// O primeiro da fila já recebeu o aviso da vaga (o servidor avisa sozinho
  /// quando a reserva é cancelada).
  final bool notified;
}

/// Pendências de hoje, na ordem em que pedem ação: check-in atrasado,
/// saldo a cobrar, horário cancelado com fila. [comandas] `null` quando quem
/// vê não lê comandas: aí o saldo a cobrar fica de fora (não dá para saber
/// se já foi recebido). Função pura: o relógio entra por [now].
List<ArenaBookingTask> buildArenaBookingsTasks({
  required List<ArenaManagerBooking> bookings,
  required List<ArenaBookingWaitlistEntry> waitlist,
  required List<ArenaComanda>? comandas,
  required DateTime now,
}) {
  final todayKey = arenaDateKey(arenaDateOnly(now));
  final nowMin = now.hour * 60 + now.minute;
  final today = bookings.where((b) => b.dateKey == todayKey).toList()
    ..sort(arenaBookingChronologicalOrder);

  final late = <ArenaBookingTask>[];
  final due = <ArenaBookingTask>[];
  final canceled = <ArenaBookingTask>[];
  final withComanda = {
    for (final c in comandas ?? const <ArenaComanda>[])
      if (c.bookingId != null) c.bookingId!,
  };

  for (final b in today) {
    final start = arenaNowMinutes(b.startTime);
    final end = arenaNowMinutes(b.endTime, isEnd: true);
    if (start == null || end == null) continue;

    if (b.isCanceled) {
      if (start <= nowMin) continue;
      final queue = waitlist.where(
        (w) =>
            w.isActive &&
            w.dateKey == todayKey &&
            w.courtId == b.courtId &&
            w.startTime == b.startTime,
      );
      if (queue.isEmpty) continue;
      canceled.add(
        ArenaCanceledWithWaitlistTask(
          b,
          waiting: queue.length,
          notified: queue.any((w) => w.isNotified),
        ),
      );
      continue;
    }
    if (!arenaNowBookingIsActive(b) || nowMin >= end) continue;

    final minutesLate = nowMin - start;
    if (minutesLate >= arenaLateCheckInGraceMinutes &&
        b.athleteId.trim().isNotEmpty &&
        arenaBookingShowsCheckInAction(b.data)) {
      late.add(ArenaLateCheckInTask(b, minutesLate: minutesLate));
    }

    final owed = arenaBookingDueReais(b);
    if (comandas != null &&
        owed != null &&
        start - nowMin <= arenaDueSoonMinutes &&
        !withComanda.contains(b.id)) {
      due.add(ArenaDueBalanceTask(b, dueReais: owed));
    }
  }
  return List.unmodifiable([...late, ...due, ...canceled]);
}

/// Canceladas do dia [dateKey] que passam no filtro, em ordem de horário,
/// para o fim da linha do dia ("Vaga liberada").
List<ArenaManagerBooking> arenaCanceledOfDay(
  List<ArenaManagerBooking> bookings,
  String dateKey,
) =>
    bookings.where((b) => b.dateKey == dateKey && b.isCanceled).toList()
      ..sort(arenaBookingChronologicalOrder);
