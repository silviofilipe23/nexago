import 'package:flutter/foundation.dart';

import 'arena_date_utils.dart';
import 'arena_free_windows.dart';
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

/// Reserva cancelada, recolhida no fim do dia.
final class ArenaTimelineCanceledEntry extends ArenaTimelineEntry {
  const ArenaTimelineCanceledEntry(this.booking, {required this.slotFreed});

  final ArenaManagerBooking booking;

  /// O horário ainda vai acontecer: a vaga voltou para a venda.
  final bool slotFreed;
}

/// Horário livre entre as reservas (com "Divulgar").
final class ArenaTimelineFreeEntry extends ArenaTimelineEntry {
  const ArenaTimelineFreeEntry(this.window);

  final ArenaFreeWindow window;
}

/// Linha do dia [dateKey]: reservas ativas em ordem de horário (e de quadra),
/// os horários livres ([freeWindows]) no meio, na hora em que começam, o
/// marcador "agora" antes do primeiro item que ainda vai começar e as
/// canceladas ([canceled]) recolhidas no fim. Dia
/// passado é todo concluído; dia futuro, todo por vir. Função pura: o
/// relógio entra por [now].
List<ArenaTimelineEntry> buildArenaDayTimeline({
  required List<ArenaManagerBooking> bookings,
  required String dateKey,
  required DateTime now,
  List<ArenaFreeWindow> freeWindows = const [],
  List<ArenaManagerBooking> canceled = const [],
}) {
  final todayKey = arenaDateKey(arenaDateOnly(now));
  final isToday = dateKey == todayKey;
  final isPast = dateKey.compareTo(todayKey) < 0;
  final nowMin = now.hour * 60 + now.minute;

  final day = bookings
      .where((b) => b.dateKey == dateKey && arenaNowBookingIsActive(b))
      .toList()
    ..sort(arenaBookingChronologicalOrder);

  // (início em minutos, ordem no empate, item): reserva antes do livre.
  final items = <(int, int, ArenaTimelineEntry)>[
    for (final b in day)
      (
        arenaNowMinutes(b.startTime) ?? 0,
        0,
        _entryFor(b, isToday: isToday, isPast: isPast, nowMin: nowMin),
      ),
    for (final w in freeWindows) (w.startMinutes, 1, ArenaTimelineFreeEntry(w)),
  ];
  // Ordenação estável: a ordem das reservas entre si já está certa.
  final indexed = [for (var i = 0; i < items.length; i++) (i, items[i])]
    ..sort((a, b) {
      final byStart = a.$2.$1.compareTo(b.$2.$1);
      if (byStart != 0) return byStart;
      final byKind = a.$2.$2.compareTo(b.$2.$2);
      return byKind != 0 ? byKind : a.$1.compareTo(b.$1);
    });

  final out = <ArenaTimelineEntry>[];
  var nowPlaced = false;
  for (final (_, (_, _, entry)) in indexed) {
    final upcoming = switch (entry) {
      ArenaTimelineBookingEntry(:final phase) =>
        phase == ArenaTimelinePhase.upcoming,
      ArenaTimelineFreeEntry() => true,
      ArenaTimelineNowEntry() || ArenaTimelineCanceledEntry() => false,
    };
    if (isToday && !nowPlaced && upcoming) {
      out.add(ArenaTimelineNowEntry(now));
      nowPlaced = true;
    }
    out.add(entry);
  }
  if (isToday && !nowPlaced) out.add(ArenaTimelineNowEntry(now));
  for (final b in canceled) {
    if (b.dateKey != dateKey) continue;
    final start = arenaNowMinutes(b.startTime) ?? 0;
    out.add(
      ArenaTimelineCanceledEntry(
        b,
        slotFreed: !isPast && (!isToday || start > nowMin),
      ),
    );
  }
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

/// Dias da faixa de 7 dias da aba Reservas.
const int arenaBookingsStripDays = 7;

/// Primeiro dia da faixa: hoje enquanto o dia escolhido cabe nos próximos 7
/// dias; senão, a faixa centraliza o dia escolhido (3 antes, 3 depois).
DateTime arenaBookingsStripStart(DateTime selected, DateTime today) {
  final s = arenaDateOnly(selected);
  final t = arenaDateOnly(today);
  final diff = s.difference(t).inDays;
  if (diff >= 0 && diff < arenaBookingsStripDays) return t;
  return DateTime(s.year, s.month, s.day - arenaBookingsStripDays ~/ 2);
}
