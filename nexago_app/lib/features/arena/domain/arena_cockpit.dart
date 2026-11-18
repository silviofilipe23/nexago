import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import '../../arenas/domain/arena_slot.dart';
import 'arena_dashboard_period.dart';
import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';
import 'arena_now.dart';

/// Números da aba Negócio (cockpit) para um período, já com a base de
/// comparação. Tudo deriva das reservas em memória; nada aqui faz I/O.
@immutable
class ArenaCockpit {
  const ArenaCockpit({
    required this.period,
    required this.revenue,
    required this.revenuePrev,
    required this.bookings,
    required this.bookingsPrev,
    required this.occupancy,
    required this.occupancyPrev,
    required this.ticket,
    required this.ticketPrev,
    required this.peakHour,
    required this.seriesDays,
    required this.revenueSeries,
    required this.bookingsSeries,
    required this.comparisonLabel,
  });

  final ArenaDashboardPeriod period;

  final double revenue;

  /// Base de comparação; `null` quando não há dado para comparar.
  final double? revenuePrev;
  final int bookings;
  final int? bookingsPrev;

  /// Ocupação 0–100 (minutos reservados / minutos da grade); `null` sem grade.
  final double? occupancy;
  final double? occupancyPrev;

  /// Ticket médio das reservas pagas; `null` sem reserva com valor.
  final double? ticket;
  final double? ticketPrev;
  final int? peakHour;

  /// Dias da série do destaque (Hoje/Semana: 7 dias até hoje; Mês: dia 1
  /// até hoje).
  final List<DateTime> seriesDays;

  /// Faturamento por dia (Hoje/Semana) ou acumulado no mês (Mês).
  final List<double> revenueSeries;

  /// Reservas por dia (Hoje/Semana) ou acumuladas no mês (Mês).
  final List<int> bookingsSeries;

  /// "vs. terça passada", "vs. os 7 dias anteriores", "vs. outubro até o dia 18".
  final String comparisonLabel;

  double? get revenueChangePercent => _pct(revenue, revenuePrev);
  double? get ticketChangePercent =>
      ticket == null ? null : _pct(ticket!, ticketPrev);
  int? get bookingsChange =>
      bookingsPrev == null ? null : bookings - bookingsPrev!;

  /// Diferença em pontos percentuais.
  double? get occupancyChangePoints =>
      occupancy == null || occupancyPrev == null
      ? null
      : occupancy! - occupancyPrev!;

  static double? _pct(double current, double? base) {
    if (base == null || base <= 0) return null;
    return (current - base) / base * 100;
  }
}

/// Monta o cockpit de [period] em [today]. Função pura.
///
/// - Hoje: o dia (inteiro, já reservado) vs. o mesmo dia da semana passada.
/// - Semana: últimos 7 dias vs. os 7 anteriores.
/// - Mês: do dia 1 até hoje vs. o mês anterior até o mesmo dia — essa base
///   vem de [previousMonthBookings] (a janela do gestor só olha 30 dias para
///   trás); `null` deixa o Mês sem comparação.
///
/// Ocupação = minutos reservados / minutos da grade, com a grade de hoje
/// ([todaySlots]) como capacidade de cada dia — aproximação: dias com outro
/// horário de funcionamento contam como hoje.
ArenaCockpit buildArenaCockpit({
  required ArenaDashboardPeriod period,
  required List<ArenaManagerBooking> bookings,
  required List<ArenaManagerBooking>? previousMonthBookings,
  required List<ArenaSlot> todaySlots,
  required DateTime today,
}) {
  final day = arenaDateOnly(today);
  final current = _currentDays(period, day);
  final previous = _previousDays(period, day);
  final active = bookings.where(arenaNowBookingIsActive).toList();
  final prevSource = period == ArenaDashboardPeriod.month
      ? previousMonthBookings?.where(arenaNowBookingIsActive).toList()
      : active;
  final capacity = _capacityMinutes(todaySlots);

  final cur = _Totals.of(active, current, capacity);
  final prev = prevSource == null
      ? null
      : _Totals.of(prevSource, previous, capacity);

  final seriesDays = period == ArenaDashboardPeriod.month
      ? current
      : _lastDays(day, 7);
  final revenueByDay = [
    for (final d in seriesDays) arenaRevenueReais(_onDay(active, d)),
  ];
  final bookingsByDay = [
    for (final d in seriesDays) _onDay(active, d).where(_isBooking).length,
  ];

  return ArenaCockpit(
    period: period,
    revenue: cur.revenue,
    revenuePrev: prev?.revenue,
    bookings: cur.bookings,
    bookingsPrev: prev?.bookings,
    occupancy: cur.occupancy,
    occupancyPrev: prev?.occupancy,
    ticket: cur.ticket,
    ticketPrev: prev?.ticket,
    peakHour: cur.peakHour,
    seriesDays: seriesDays,
    revenueSeries: period == ArenaDashboardPeriod.month
        ? _cumulative(revenueByDay)
        : revenueByDay,
    bookingsSeries: period == ArenaDashboardPeriod.month
        ? _cumulative(
            bookingsByDay.map((e) => e.toDouble()).toList(),
          ).map((e) => e.round()).toList()
        : bookingsByDay,
    comparisonLabel: arenaCockpitComparisonLabel(period, day),
  );
}

/// Intervalo da base do Mês: do dia 1 do mês anterior até o mesmo dia
/// (limitado ao último dia daquele mês).
({String fromKey, String toKey}) arenaCockpitPreviousMonthRange(
  DateTime today,
) {
  final day = arenaDateOnly(today);
  final lastDayPrev = DateTime(day.year, day.month, 0).day;
  final endDay = day.day < lastDayPrev ? day.day : lastDayPrev;
  return (
    fromKey: arenaDateKey(DateTime(day.year, day.month - 1, 1)),
    toKey: arenaDateKey(DateTime(day.year, day.month - 1, endDay)),
  );
}

String arenaCockpitComparisonLabel(
  ArenaDashboardPeriod period,
  DateTime today,
) {
  switch (period) {
    case ArenaDashboardPeriod.today:
      final name = DateFormat.EEEE('pt_BR').format(today).split('-').first;
      final masculine = today.weekday >= DateTime.saturday;
      return 'vs. $name ${masculine ? 'passado' : 'passada'}';
    case ArenaDashboardPeriod.week:
      return 'vs. os 7 dias anteriores';
    case ArenaDashboardPeriod.month:
      final prev = DateTime(today.year, today.month - 1);
      final name = DateFormat.MMMM('pt_BR').format(prev);
      return 'vs. $name até o dia ${today.day}';
  }
}

List<DateTime> _currentDays(ArenaDashboardPeriod period, DateTime day) {
  switch (period) {
    case ArenaDashboardPeriod.today:
      return [day];
    case ArenaDashboardPeriod.week:
      return _lastDays(day, 7);
    case ArenaDashboardPeriod.month:
      return [
        for (var d = 1; d <= day.day; d++) DateTime(day.year, day.month, d),
      ];
  }
}

List<DateTime> _previousDays(ArenaDashboardPeriod period, DateTime day) {
  switch (period) {
    case ArenaDashboardPeriod.today:
      return [DateTime(day.year, day.month, day.day - 7)];
    case ArenaDashboardPeriod.week:
      return _lastDays(DateTime(day.year, day.month, day.day - 7), 7);
    case ArenaDashboardPeriod.month:
      final lastDayPrev = DateTime(day.year, day.month, 0).day;
      final end = day.day < lastDayPrev ? day.day : lastDayPrev;
      return [
        for (var d = 1; d <= end; d++) DateTime(day.year, day.month - 1, d),
      ];
  }
}

List<DateTime> _lastDays(DateTime end, int n) => [
  for (var i = n - 1; i >= 0; i--) DateTime(end.year, end.month, end.day - i),
];

Iterable<ArenaManagerBooking> _onDay(
  List<ArenaManagerBooking> list,
  DateTime d,
) {
  final key = arenaDateKey(d);
  return list.where((b) => b.dateKey == key);
}

/// Reserva de verdade (bloqueio de aula ocupa a quadra, mas não é reserva).
bool _isBooking(ArenaManagerBooking b) => !b.isClassBlock;

int _bookedMinutes(ArenaManagerBooking b) {
  final start = arenaNowMinutes(b.startTime);
  final end = arenaNowMinutes(b.endTime, isEnd: true);
  if (start == null || end == null || end <= start) return 0;
  return end - start;
}

int _capacityMinutes(List<ArenaSlot> slots) {
  var total = 0;
  for (final s in slots) {
    if (s.isBlocked) continue;
    final start = arenaNowMinutes(s.startTime);
    final end = arenaNowMinutes(s.endTime, isEnd: true);
    if (start == null || end == null || end <= start) continue;
    total += end - start;
  }
  return total;
}

List<double> _cumulative(List<double> values) {
  var acc = 0.0;
  return [for (final v in values) acc += v];
}

class _Totals {
  const _Totals({
    required this.revenue,
    required this.bookings,
    required this.occupancy,
    required this.ticket,
    required this.peakHour,
  });

  final double revenue;
  final int bookings;
  final double? occupancy;
  final double? ticket;
  final int? peakHour;

  factory _Totals.of(
    List<ArenaManagerBooking> source,
    List<DateTime> days,
    int capacityPerDay,
  ) {
    final keys = {for (final d in days) arenaDateKey(d)};
    final inRange = source.where((b) => keys.contains(b.dateKey)).toList();
    final real = inRange.where(_isBooking).toList();
    final revenue = arenaRevenueReais(inRange);
    final paid = real.where((b) => arenaRevenueReais([b]) > 0).toList();
    final minutes = inRange.fold<int>(0, (acc, b) => acc + _bookedMinutes(b));
    final capacity = capacityPerDay * days.length;

    final byHour = <int, int>{};
    for (final b in real) {
      final m = arenaNowMinutes(b.startTime);
      if (m != null) byHour[m ~/ 60] = (byHour[m ~/ 60] ?? 0) + 1;
    }
    int? peak;
    for (final e in byHour.entries) {
      if (peak == null ||
          e.value > byHour[peak]! ||
          (e.value == byHour[peak]! && e.key < peak)) {
        peak = e.key;
      }
    }

    return _Totals(
      revenue: revenue,
      bookings: real.length,
      occupancy: capacity == 0
          ? null
          : (minutes / capacity * 100).clamp(0.0, 100.0),
      ticket: paid.isEmpty ? null : arenaRevenueReais(paid) / paid.length,
      peakHour: peak,
    );
  }
}
