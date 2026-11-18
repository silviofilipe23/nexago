import 'package:flutter/foundation.dart';

import '../../arenas/domain/arena_slot.dart';
import 'arena_booking_day_timeline.dart';
import 'arena_booking_labels.dart';
import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';
import 'arena_now.dart';
import 'arena_schedule_grouping.dart';

/// Tom de um selo do card (o tema decide a cor de cada um).
enum ArenaPillTone { ok, pending, live, brand, blue, muted }

/// O que o selo diz (o ícone sai daqui).
enum ArenaPillKind {
  paid,
  deposit,
  awaitingPayment,
  payOnsite,
  paymentFailed,
  checkedIn,
  confirmed,
  arriving,
  late,
  noShow,
  checkInPending,
  recurring,
  classBlock,
  professor,
  canceled,
  live,
}

/// Um selo do card: texto, tom e tipo. Pagamento, presença e tipo da
/// reserva são três selos separados (a análise de UX pedia os três eixos
/// sem misturar).
@immutable
class ArenaBookingPill {
  const ArenaBookingPill(this.label, this.tone, this.kind);

  final String label;
  final ArenaPillTone tone;
  final ArenaPillKind kind;

  @override
  bool operator ==(Object other) =>
      other is ArenaBookingPill &&
      other.label == label &&
      other.tone == tone &&
      other.kind == kind;

  @override
  int get hashCode => Object.hash(label, tone, kind);

  @override
  String toString() => 'ArenaBookingPill($label, $tone, $kind)';
}

/// Chegada em até isso vira "Chega em N min".
const int arenaBookingArrivingWindowMinutes = 60;

/// Valor ainda a receber no local (sinal pago ou pagamento na arena).
/// `null` quando não falta nada, a reserva foi cancelada ou é aula.
double? arenaBookingDueReais(ArenaManagerBooking b) {
  if (b.isCanceled || b.isClassBlock) return null;
  final due = arenaBookingPaymentInfo(b.data).dueOnsiteReais;
  if (due == null || due <= 0.02) return null;
  return due;
}

/// Selo de pagamento. `null` quando a reserva não tem pagamento a mostrar
/// (aula, reserva direta sem cobrança).
ArenaBookingPill? arenaBookingPaymentPill(ArenaManagerBooking b) {
  if (b.isClassBlock) return null;
  final info = arenaBookingPaymentInfo(b.data);
  switch (info.settlement) {
    case ArenaBookingPaymentSettlement.paidFullPix:
    case ArenaBookingPaymentSettlement.paidMp:
      return const ArenaBookingPill(
          'Pago', ArenaPillTone.ok, ArenaPillKind.paid);
    case ArenaBookingPaymentSettlement.paidDepositPix:
      return const ArenaBookingPill(
        'Sinal pago',
        ArenaPillTone.pending,
        ArenaPillKind.deposit,
      );
    case ArenaBookingPaymentSettlement.pendingPix:
    case ArenaBookingPaymentSettlement.pendingMp:
      return const ArenaBookingPill(
        'Aguardando pagamento',
        ArenaPillTone.pending,
        ArenaPillKind.awaitingPayment,
      );
    case ArenaBookingPaymentSettlement.pendingOnsite:
      return const ArenaBookingPill(
        'Pagar na arena',
        ArenaPillTone.muted,
        ArenaPillKind.payOnsite,
      );
    case ArenaBookingPaymentSettlement.failed:
      return const ArenaBookingPill(
        'Pagamento não concluído',
        ArenaPillTone.live,
        ArenaPillKind.paymentFailed,
      );
    case ArenaBookingPaymentSettlement.notOnline:
    case ArenaBookingPaymentSettlement.unknown:
      return null;
  }
}

/// Selo de presença. `null` para aula (a presença é a chamada) e para a
/// reserva cancelada.
ArenaBookingPill? arenaBookingPresencePill(
  ArenaManagerBooking b, {
  required DateTime now,
}) {
  if (b.isClassBlock || b.isCanceled) return null;
  switch (b.attendanceStatus) {
    case 'checked_in':
      return const ArenaBookingPill(
        'Check-in feito',
        ArenaPillTone.ok,
        ArenaPillKind.checkedIn,
      );
    case 'confirmed':
      return const ArenaBookingPill(
        'Presença confirmada',
        ArenaPillTone.ok,
        ArenaPillKind.confirmed,
      );
    case 'no_show':
      return const ArenaBookingPill(
        'Não compareceu',
        ArenaPillTone.live,
        ArenaPillKind.noShow,
      );
  }

  const pending = ArenaBookingPill(
    'Check-in pendente',
    ArenaPillTone.muted,
    ArenaPillKind.checkInPending,
  );
  final todayKey = arenaDateKey(arenaDateOnly(now));
  if (b.dateKey != todayKey) return pending;
  final start = arenaNowMinutes(b.startTime);
  final end = arenaNowMinutes(b.endTime, isEnd: true);
  if (start == null || end == null) return pending;
  final nowMin = now.hour * 60 + now.minute;
  if (nowMin >= end) return pending;
  if (nowMin >= start) {
    final late = nowMin - start;
    return ArenaBookingPill(
      late == 0 ? 'Começou agora' : 'Atrasado · $late min',
      ArenaPillTone.live,
      ArenaPillKind.late,
    );
  }
  final until = start - nowMin;
  if (until <= arenaBookingArrivingWindowMinutes) {
    return ArenaBookingPill(
      'Chega em $until min',
      ArenaPillTone.muted,
      ArenaPillKind.arriving,
    );
  }
  return pending;
}

/// Selos do tipo da reserva (horário fixo, aula, professor) e cancelada.
List<ArenaBookingPill> arenaBookingTypePills(ArenaManagerBooking b) {
  final professor = arenaBookingProfessorLabel(b.data);
  return [
    if (b.isCanceled)
      const ArenaBookingPill(
        'Cancelada',
        ArenaPillTone.live,
        ArenaPillKind.canceled,
      ),
    if (b.isRecurring)
      const ArenaBookingPill(
        'Horário fixo',
        ArenaPillTone.brand,
        ArenaPillKind.recurring,
      ),
    if (b.isClassBlock)
      const ArenaBookingPill(
          'Aula', ArenaPillTone.blue, ArenaPillKind.classBlock),
    if (professor != null)
      ArenaBookingPill(professor, ArenaPillTone.blue, ArenaPillKind.professor),
  ];
}

/// "45 min", "1h", "1h20" para uma contagem de minutos.
String arenaMinutesLabel(int minutes) {
  if (minutes < 60) return '$minutes min';
  final m = minutes % 60;
  return m == 0
      ? '${minutes ~/ 60}h'
      : '${minutes ~/ 60}h${m.toString().padLeft(2, '0')}';
}

/// "1h", "1h30", "45 min" entre dois `HH:MM`.
String arenaBookingDurationLabel(String start, String end) {
  final s = arenaNowMinutes(start);
  final e = arenaNowMinutes(end, isEnd: true);
  if (s == null || e == null || e <= s) return '';
  return arenaMinutesLabel(e - s);
}

/// Resumo da linha do dia: ocupação, quem está em quadra e quanto falta
/// receber das reservas que ainda não acabaram.
@immutable
class ArenaBookingsDaySummary {
  const ArenaBookingsDaySummary({
    required this.bookings,
    required this.live,
    required this.dueReais,
    this.occupancyPercent,
  });

  final int bookings;
  final int live;
  final double dueReais;

  /// Horários vendidos sobre os não bloqueados (0 a 100); `null` sem grade.
  final int? occupancyPercent;
}

ArenaBookingsDaySummary buildArenaBookingsDaySummary({
  required List<ArenaTimelineEntry> timeline,
  required List<ArenaManagerBooking> dayBookings,
  required List<ArenaSlot> daySlots,
  required String dateKey,
}) {
  final items = timeline.whereType<ArenaTimelineBookingEntry>().toList();
  var due = 0.0;
  for (final e in items) {
    if (e.phase == ArenaTimelinePhase.done) continue;
    due += arenaBookingDueReais(e.booking) ?? 0;
  }
  final slots = ArenaScheduleGrouping.applyBookingsOverlay(
    slots: daySlots.where((s) => s.dateKey == dateKey).toList(),
    bookings: dayBookings,
    dateKey: dateKey,
  );
  final grid = slots.where((s) => !s.isBlocked).length;
  final booked = slots.where((s) => s.isBooked).length;
  return ArenaBookingsDaySummary(
    bookings: items.where((e) => !e.booking.isClassBlock).length,
    live: items.where((e) => e.phase == ArenaTimelinePhase.live).length,
    dueReais: due,
    occupancyPercent: grid == 0 ? null : (booked / grid * 100).round(),
  );
}
