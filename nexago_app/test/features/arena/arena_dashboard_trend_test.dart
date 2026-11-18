import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arena/data/arena_dashboard_service.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_period.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_period_metrics.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

final _today = DateTime(2026, 11, 18);

ArenaManagerBooking _b(String date, double amount, {String start = '18:00'}) {
  return ArenaManagerBooking(
    id: '$date-$start-$amount',
    athleteId: 'u',
    courtId: 'q1',
    courtName: 'Quadra 1',
    dateKey: date,
    startTime: start,
    endTime: '19:00',
    data: {'status': 'confirmed', 'amountReais': amount},
  );
}

ArenaDashboardPeriodMetrics _metrics(
  List<ArenaManagerBooking> bookings,
  ArenaDashboardPeriod period, {
  int slotsToday = 10,
}) {
  const service = ArenaDashboardService();
  final summary = service.summarize(
    bookings: bookings,
    slots: [
      for (var i = 0; i < slotsToday; i++)
        ArenaSlot(
          id: 's$i',
          arenaId: 'a1',
          courtId: 'q1',
          date: _today,
          startTime: '${(8 + i).toString().padLeft(2, '0')}:00',
          endTime: '${(9 + i).toString().padLeft(2, '0')}:00',
          rawStatus: 'available',
        ),
    ],
    courts: const [],
    todayReference: _today,
  );
  return service.periodMetrics(
    summary: summary,
    bookings: bookings,
    period: period,
    todayReference: _today,
  );
}

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  test('Hoje compara com o mesmo dia da semana passada, não com a média', () {
    final m = _metrics([
      _b('2026-11-18', 150),
      _b('2026-11-11', 100), // terça passada
      _b('2026-11-15', 900), // domingo forte não entra na conta
    ], ArenaDashboardPeriod.today);
    expect(m.revenueBadge?.label, '▲ 50%');
    expect(m.comparisonLabel, 'vs. o mesmo dia da semana passada');
  });

  test('Semana compara os últimos 7 dias com os 7 anteriores', () {
    final m = _metrics([
      _b('2026-11-17', 200),
      _b('2026-11-08', 400),
    ], ArenaDashboardPeriod.week);
    expect(m.revenueBadge?.label, '▼ 50%');
    expect(m.comparisonLabel, 'vs. os 7 dias anteriores');
  });

  test('Mês não mostra variação: a janela não cobre 60 dias', () {
    final m = _metrics([_b('2026-11-17', 200)], ArenaDashboardPeriod.month);
    expect(m.revenueBadge, isNull);
    expect(m.comparisonLabel, isNull);
  });

  test('o gráfico compara os últimos 7 dias com os 7 anteriores', () {
    final m = _metrics([
      _b('2026-11-18', 300),
      _b('2026-11-10', 200),
    ], ArenaDashboardPeriod.today);
    expect(m.chartTrendPercent, closeTo(50, 0.001));
  });

  test('ocupação baixa não usa seta de queda', () {
    final m = _metrics([_b('2026-11-18', 10)], ArenaDashboardPeriod.today);
    expect(m.occupancyBadge?.label, 'baixa');
  });

  test('Reservas e Pico não repetem o período nem o turno', () {
    final m = _metrics([_b('2026-11-18', 10)], ArenaDashboardPeriod.today);
    expect(m.bookingsBadge, isNull);
    expect(m.peakBadge, isNull);
  });
}
