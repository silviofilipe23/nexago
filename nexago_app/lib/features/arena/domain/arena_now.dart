import 'package:flutter/foundation.dart';

import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/arena_slot.dart';
import 'arena_booking_labels.dart';
import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';
import 'comandas/arena_comanda.dart';

/// Estado de uma quadra no instante da aba "Agora" do Painel.
enum ArenaCourtNowState { inPlay, classSession, blocked, free }

/// Uma quadra na faixa "Quadras" da aba Agora.
@immutable
class ArenaCourtNow {
  const ArenaCourtNow({
    required this.courtId,
    required this.courtName,
    required this.state,
    this.booking,
    this.progress = 0,
    this.until,
    this.slot,
  });

  final String courtId;
  final String courtName;
  final ArenaCourtNowState state;

  /// Reserva em andamento (em jogo ou aula); `null` quando livre/bloqueada.
  final ArenaManagerBooking? booking;

  /// Fração já jogada da reserva atual (0–1).
  final double progress;

  /// `HH:MM`: fim da reserva atual, ou início da próxima quando livre.
  /// `null` em quadra livre sem mais nada no dia.
  final String? until;

  /// Horário da grade que cobre o instante (abre o detalhe do horário).
  final ArenaSlot? slot;
}

/// Tipos de pendência da caixa "Precisa de você".
enum ArenaNowTaskKind { checkIn, openComanda, reviews }

/// Uma linha da caixa "Precisa de você".
@immutable
class ArenaNowTask {
  const ArenaNowTask({
    required this.kind,
    required this.count,
    this.amountReais = 0,
    this.booking,
    this.comanda,
  });

  final ArenaNowTaskKind kind;
  final int count;

  /// Check-in: soma a receber no local. Comanda: total em aberto.
  final double amountReais;

  /// Primeira reserva sem check-in (alvo do toque quando há só uma).
  final ArenaManagerBooking? booking;

  /// Comanda aberta há mais tempo (alvo do toque quando há só uma).
  final ArenaComanda? comanda;
}

/// "Hoje até agora" comparado com o mesmo dia da semana passada.
@immutable
class ArenaTodaySoFar {
  const ArenaTodaySoFar({
    required this.revenueReais,
    required this.bookingsCount,
    required this.occupancyPercent,
    required this.lastWeekRevenueReais,
    required this.lastWeekBookingsCount,
  });

  final double revenueReais;
  final int bookingsCount;

  /// Horários reservados / horários da grade de hoje (0–100); `null` sem grade.
  final double? occupancyPercent;
  final double lastWeekRevenueReais;
  final int lastWeekBookingsCount;

  /// Variação % da receita; `null` quando a semana passada não tem base.
  double? get revenueChangePercent {
    if (lastWeekRevenueReais <= 0) return null;
    return (revenueReais - lastWeekRevenueReais) / lastWeekRevenueReais * 100;
  }

  int get bookingsChange => bookingsCount - lastWeekBookingsCount;
}

/// Tudo o que a aba Agora mostra, derivado em memória dos streams do Painel.
@immutable
class ArenaNowSnapshot {
  const ArenaNowSnapshot({
    required this.now,
    required this.courts,
    required this.nextBooking,
    required this.tasks,
    required this.today,
  });

  final DateTime now;
  final List<ArenaCourtNow> courts;

  /// Próxima reserva que ainda não começou (hoje ou adiante).
  final ArenaManagerBooking? nextBooking;
  final List<ArenaNowTask> tasks;
  final ArenaTodaySoFar today;

  int get courtsInUse => courts
      .where(
        (c) =>
            c.state == ArenaCourtNowState.inPlay ||
            c.state == ArenaCourtNowState.classSession,
      )
      .length;

  int get pendingCount => tasks.fold<int>(0, (acc, t) => acc + t.count);
}

/// Comanda aberta há mais que isso entra em "Precisa de você".
const Duration arenaNowStaleComandaAge = Duration(hours: 2);

/// Reserva que começa em até isso já aparece como chegada (check-in).
const int arenaNowArrivalLeadMinutes = 10;

/// Status de reserva que não ocupa mais a quadra (espelha
/// `INACTIVE_BOOKING_STATUSES` em `functions/src/arena-booking-app-payment.ts`).
const Set<String> _inactiveBookingStatuses = {
  'canceled',
  'cancelled',
  'expired',
  'refunded',
  'rejected',
};

bool arenaNowBookingIsActive(ArenaManagerBooking b) {
  final raw = (b.data['status'] as String?)?.trim().toLowerCase() ?? '';
  return !_inactiveBookingStatuses.contains(raw);
}

/// `HH:MM` → minutos do dia. `00:00` no fim vira 24h (reserva até a meia-noite).
int? arenaNowMinutes(String hhmm, {bool isEnd = false}) {
  final parts = hhmm.trim().split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (h == null || m == null) return null;
  final total = h * 60 + m;
  if (isEnd && total == 0) return 24 * 60;
  return total;
}

/// Monta a aba Agora. Função pura: o relógio entra por [now].
ArenaNowSnapshot buildArenaNowSnapshot({
  required DateTime now,
  required List<ArenaManagerBooking> bookings,
  required List<ArenaSlot> todaySlots,
  required List<ArenaCourt> courts,
  required List<ArenaComanda> comandas,
  required int pendingReviews,
}) {
  final todayKey = arenaDateKey(arenaDateOnly(now));
  final nowMin = now.hour * 60 + now.minute;
  final active = bookings.where(arenaNowBookingIsActive).toList();
  final today = active.where((b) => b.dateKey == todayKey).toList();

  return ArenaNowSnapshot(
    now: now,
    courts: _courtsNow(courts, today, todaySlots, nowMin),
    nextBooking: _nextBooking(active, todayKey, nowMin),
    tasks: _tasks(today, comandas, pendingReviews, now, nowMin),
    today: _todaySoFar(active, today, todaySlots, now),
  );
}

List<ArenaCourtNow> _courtsNow(
  List<ArenaCourt> courts,
  List<ArenaManagerBooking> today,
  List<ArenaSlot> slots,
  int nowMin,
) {
  final out = <ArenaCourtNow>[];
  for (final court in courts) {
    final id = court.id.trim();
    if (id.isEmpty) continue;
    final onCourt = today.where((b) => b.courtId == id).toList();
    final slot = _slotAt(slots.where((s) => s.courtId == id), nowMin);
    out.add(_courtState(court, onCourt, slot, nowMin));
  }
  return out;
}

ArenaCourtNow _courtState(
  ArenaCourt court,
  List<ArenaManagerBooking> onCourt,
  ArenaSlot? slot,
  int nowMin,
) {
  if (court.status == ArenaCourtStatus.maintenance) {
    return ArenaCourtNow(
      courtId: court.id,
      courtName: court.name,
      state: ArenaCourtNowState.blocked,
      slot: slot,
    );
  }
  for (final b in onCourt) {
    final start = arenaNowMinutes(b.startTime);
    final end = arenaNowMinutes(b.endTime, isEnd: true);
    if (start == null || end == null || end <= start) continue;
    if (start <= nowMin && nowMin < end) {
      return ArenaCourtNow(
        courtId: court.id,
        courtName: court.name,
        state: b.isClassBlock
            ? ArenaCourtNowState.classSession
            : ArenaCourtNowState.inPlay,
        booking: b,
        progress: ((nowMin - start) / (end - start)).clamp(0.0, 1.0),
        until: b.endTime,
        slot: slot,
      );
    }
  }
  if (slot != null && slot.isBlocked) {
    return ArenaCourtNow(
      courtId: court.id,
      courtName: court.name,
      state: ArenaCourtNowState.blocked,
      until: slot.endTime,
      slot: slot,
    );
  }
  final upcoming =
      onCourt
          .where((b) => (arenaNowMinutes(b.startTime) ?? -1) > nowMin)
          .toList()
        ..sort((a, b) => a.startTime.compareTo(b.startTime));
  return ArenaCourtNow(
    courtId: court.id,
    courtName: court.name,
    state: ArenaCourtNowState.free,
    until: upcoming.isEmpty ? null : upcoming.first.startTime,
    slot: slot,
  );
}

ArenaSlot? _slotAt(Iterable<ArenaSlot> slots, int nowMin) {
  for (final s in slots) {
    final start = arenaNowMinutes(s.startTime);
    final end = arenaNowMinutes(s.endTime, isEnd: true);
    if (start == null || end == null) continue;
    if (start <= nowMin && nowMin < end) return s;
  }
  return null;
}

ArenaManagerBooking? _nextBooking(
  List<ArenaManagerBooking> active,
  String todayKey,
  int nowMin,
) {
  final upcoming =
      active.where((b) {
        if (b.isClassBlock) return false;
        final cmp = b.dateKey.compareTo(todayKey);
        if (cmp > 0) return true;
        if (cmp < 0) return false;
        final start = arenaNowMinutes(b.startTime);
        return start != null && start > nowMin;
      }).toList()..sort((a, b) {
        final byDay = a.dateKey.compareTo(b.dateKey);
        return byDay != 0 ? byDay : a.startTime.compareTo(b.startTime);
      });
  return upcoming.isEmpty ? null : upcoming.first;
}

List<ArenaNowTask> _tasks(
  List<ArenaManagerBooking> today,
  List<ArenaComanda> comandas,
  int pendingReviews,
  DateTime now,
  int nowMin,
) {
  final tasks = <ArenaNowTask>[];

  final arrivals = today.where((b) {
    if (!arenaBookingShowsCheckInAction(b.data)) return false;
    final start = arenaNowMinutes(b.startTime);
    final end = arenaNowMinutes(b.endTime, isEnd: true);
    if (start == null || end == null) return false;
    return start <= nowMin + arenaNowArrivalLeadMinutes && nowMin < end;
  }).toList()..sort((a, b) => a.startTime.compareTo(b.startTime));
  if (arrivals.isNotEmpty) {
    final due = arrivals.fold<double>(
      0,
      (acc, b) => acc + (arenaBookingPaymentInfo(b.data).dueOnsiteReais ?? 0),
    );
    tasks.add(
      ArenaNowTask(
        kind: ArenaNowTaskKind.checkIn,
        count: arrivals.length,
        amountReais: due,
        booking: arrivals.first,
      ),
    );
  }

  final stale =
      comandas.where((c) {
        if (c.status == ArenaComandaStatus.closed) return false;
        final opened = c.openedAt ?? c.createdAt;
        return opened != null &&
            now.difference(opened) >= arenaNowStaleComandaAge;
      }).toList()..sort(
        (a, b) => (a.openedAt ?? a.createdAt ?? now).compareTo(
          b.openedAt ?? b.createdAt ?? now,
        ),
      );
  if (stale.isNotEmpty) {
    tasks.add(
      ArenaNowTask(
        kind: ArenaNowTaskKind.openComanda,
        count: stale.length,
        amountReais: stale.fold<double>(
          0,
          (acc, c) => acc + c.totalCents / 100,
        ),
        comanda: stale.first,
      ),
    );
  }

  if (pendingReviews > 0) {
    tasks.add(
      ArenaNowTask(kind: ArenaNowTaskKind.reviews, count: pendingReviews),
    );
  }
  return tasks;
}

ArenaTodaySoFar _todaySoFar(
  List<ArenaManagerBooking> active,
  List<ArenaManagerBooking> today,
  List<ArenaSlot> slots,
  DateTime now,
) {
  final lastWeekKey = arenaDateKey(
    arenaDateOnly(now).subtract(const Duration(days: 7)),
  );
  final lastWeek = active.where((b) => b.dateKey == lastWeekKey).toList();
  final grid = slots.where((s) => !s.isBlocked).length;
  final booked = slots.where((s) => s.isBooked).length;
  return ArenaTodaySoFar(
    revenueReais: _revenue(today),
    bookingsCount: today.where((b) => !b.isClassBlock).length,
    occupancyPercent: grid == 0 ? null : booked / grid * 100,
    lastWeekRevenueReais: _revenue(lastWeek),
    lastWeekBookingsCount: lastWeek.where((b) => !b.isClassBlock).length,
  );
}

/// Mesma regra de receita do Painel (`ArenaDashboardService`): conta a
/// reserva ativa, menos pagamento recusado/cancelado.
double _revenue(List<ArenaManagerBooking> list) {
  var sum = 0.0;
  for (final b in list) {
    final ps = (b.data['paymentStatus'] as String?)?.trim().toLowerCase();
    if (ps == 'rejected' || ps == 'cancelled' || ps == 'canceled') continue;
    final v = b.data['amountReais'] ?? b.data['priceReais'] ?? b.data['price'];
    if (v is num) sum += v.toDouble();
  }
  return sum;
}
