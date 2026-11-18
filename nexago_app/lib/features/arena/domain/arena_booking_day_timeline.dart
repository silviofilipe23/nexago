import 'package:flutter/foundation.dart';

import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';
import 'arena_now.dart';

/// Momento de uma reserva em relação ao relógio.
enum ArenaTimelinePhase { done, live, upcoming }

/// Item da linha do dia da aba Reservas.
@immutable
sealed class ArenaTimelineEntry {
  const ArenaTimelineEntry();
}

/// Uma reserva na linha do dia.
final class ArenaTimelineBookingEntry extends ArenaTimelineEntry {
  const ArenaTimelineBookingEntry({
    required this.booking,
    required this.phase,
    required this.isToday,
    this.progress = 0,
    this.minutesLeft,
  });

  final ArenaManagerBooking booking;
  final ArenaTimelinePhase phase;

  /// Linha de hoje: a concluída recolhe para uma linha e as ações aparecem.
  final bool isToday;

  /// Quanto da reserva em quadra já passou (0 a 1).
  final double progress;

  /// Minutos até o fim, só para a reserva em quadra.
  final int? minutesLeft;
}

/// Marcador "agora" (só na linha de hoje).
final class ArenaTimelineNowEntry extends ArenaTimelineEntry {
  const ArenaTimelineNowEntry(this.now);

  final DateTime now;
}

/// Linha do dia [dateKey]: reservas ativas em ordem de horário (e de quadra),
/// com o marcador "agora" antes da primeira que ainda vai começar. Dia
/// passado é todo concluído; dia futuro, todo por vir. Função pura: o
/// relógio entra por [now].
List<ArenaTimelineEntry> buildArenaDayTimeline({
  required List<ArenaManagerBooking> bookings,
  required String dateKey,
  required DateTime now,
}) {
  final todayKey = arenaDateKey(arenaDateOnly(now));
  final isToday = dateKey == todayKey;
  final isPast = dateKey.compareTo(todayKey) < 0;
  final nowMin = now.hour * 60 + now.minute;

  final day = bookings
      .where((b) => b.dateKey == dateKey && arenaNowBookingIsActive(b))
      .toList()
    ..sort(arenaBookingChronologicalOrder);

  final out = <ArenaTimelineEntry>[];
  var nowPlaced = false;
  for (final b in day) {
    final entry =
        _entryFor(b, isToday: isToday, isPast: isPast, nowMin: nowMin);
    if (isToday && !nowPlaced && entry.phase == ArenaTimelinePhase.upcoming) {
      out.add(ArenaTimelineNowEntry(now));
      nowPlaced = true;
    }
    out.add(entry);
  }
  if (isToday && !nowPlaced) out.add(ArenaTimelineNowEntry(now));
  return List.unmodifiable(out);
}

ArenaTimelineBookingEntry _entryFor(
  ArenaManagerBooking b, {
  required bool isToday,
  required bool isPast,
  required int nowMin,
}) {
  if (!isToday) {
    return ArenaTimelineBookingEntry(
      booking: b,
      phase: isPast ? ArenaTimelinePhase.done : ArenaTimelinePhase.upcoming,
      isToday: false,
    );
  }
  final start = arenaNowMinutes(b.startTime);
  final end = arenaNowMinutes(b.endTime, isEnd: true);
  if (start == null || end == null || end <= start) {
    return ArenaTimelineBookingEntry(
      booking: b,
      phase: ArenaTimelinePhase.upcoming,
      isToday: true,
    );
  }
  if (nowMin >= end) {
    return ArenaTimelineBookingEntry(
      booking: b,
      phase: ArenaTimelinePhase.done,
      isToday: true,
    );
  }
  if (nowMin >= start) {
    return ArenaTimelineBookingEntry(
      booking: b,
      phase: ArenaTimelinePhase.live,
      isToday: true,
      progress: ((nowMin - start) / (end - start)).clamp(0.0, 1.0),
      minutesLeft: end - nowMin,
    );
  }
  return ArenaTimelineBookingEntry(
    booking: b,
    phase: ArenaTimelinePhase.upcoming,
    isToday: true,
  );
}

/// Ordem da agenda: horário de início, depois quadra, depois id (estável).
int arenaBookingChronologicalOrder(
    ArenaManagerBooking a, ArenaManagerBooking b) {
  final byDay = a.dateKey.compareTo(b.dateKey);
  if (byDay != 0) return byDay;
  final aStart = arenaNowMinutes(a.startTime) ?? 0;
  final bStart = arenaNowMinutes(b.startTime) ?? 0;
  if (aStart != bStart) return aStart.compareTo(bStart);
  final byCourt = a.courtName.compareTo(b.courtName);
  if (byCourt != 0) return byCourt;
  return a.id.compareTo(b.id);
}
