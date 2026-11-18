import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arena/domain/arena_cockpit.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_period.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

// Quarta, 18/11/2026.
final _today = DateTime(2026, 11, 18, 18, 42);

ArenaManagerBooking _b(
  String date,
  double amount, {
  String start = '18:00',
  String end = '19:00',
  Map<String, dynamic> extra = const {},
}) {
  return ArenaManagerBooking(
    id: '$date-$start-$amount',
    athleteId: 'u',
    courtId: 'q1',
    courtName: 'Quadra 1',
    dateKey: date,
    startTime: start,
    endTime: end,
    data: {'status': 'confirmed', 'amountReais': amount, ...extra},
  );
}

/// Grade de hoje com [hours] horários de 1h (capacidade = hours × 60 min).
List<ArenaSlot> _grid(int hours) => [
  for (var h = 0; h < hours; h++)
    ArenaSlot(
      id: 's$h',
      arenaId: 'a1',
      courtId: 'q1',
      date: DateTime(2026, 11, 18),
      startTime: '${(8 + h).toString().padLeft(2, '0')}:00',
      endTime: '${(9 + h).toString().padLeft(2, '0')}:00',
      rawStatus: 'available',
    ),
];

ArenaCockpit _build(
  ArenaDashboardPeriod period,
  List<ArenaManagerBooking> bookings, {
  List<ArenaManagerBooking>? prevMonth,
  int gridHours = 10,
}) => buildArenaCockpit(
  period: period,
  bookings: bookings,
  previousMonthBookings: prevMonth,
  todaySlots: _grid(gridHours),
  today: _today,
);

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  group('Hoje', () {
    test('compara com o mesmo dia da semana passada', () {
      final c = _build(ArenaDashboardPeriod.today, [
        _b('2026-11-18', 150),
        _b('2026-11-11', 100),
        _b('2026-11-15', 900), // domingo forte não entra
      ]);
      expect(c.revenue, 150);
      expect(c.revenuePrev, 100);
      expect(c.revenueChangePercent, closeTo(50, 0.001));
      expect(c.bookingsChange, 0);
      expect(c.comparisonLabel, 'vs. quarta passada');
    });

    test('ocupação em minutos sobre a grade de hoje', () {
      final c = _build(ArenaDashboardPeriod.today, [
        _b('2026-11-18', 0, start: '08:00', end: '10:00'), // 120 min
        _b('2026-11-18', 0, start: '18:00', end: '19:30'), // 90 min
      ]);
      // 210 / 600
      expect(c.occupancy, closeTo(35, 0.001));
    });

    test('sem grade, ocupação fica sem valor', () {
      final c = _build(ArenaDashboardPeriod.today, [
        _b('2026-11-18', 10),
      ], gridHours: 0);
      expect(c.occupancy, isNull);
      expect(c.occupancyChangePoints, isNull);
    });

    test('série do destaque: 7 dias terminando hoje', () {
      final c = _build(ArenaDashboardPeriod.today, [
        _b('2026-11-12', 70),
        _b('2026-11-18', 30),
      ]);
      expect(c.seriesDays.first, DateTime(2026, 11, 12));
      expect(c.seriesDays.last, DateTime(2026, 11, 18));
      expect(c.revenueSeries, [70, 0, 0, 0, 0, 0, 30]);
    });

    test('domingo e sábado usam "passado"', () {
      expect(
        arenaCockpitComparisonLabel(
          ArenaDashboardPeriod.today,
          DateTime(2026, 11, 22),
        ),
        'vs. domingo passado',
      );
    });
  });

  group('Semana', () {
    test('últimos 7 dias vs. os 7 anteriores', () {
      final c = _build(ArenaDashboardPeriod.week, [
        _b('2026-11-12', 200),
        _b('2026-11-18', 100),
        _b('2026-11-11', 400),
        _b('2026-11-05', 200),
        _b('2026-11-04', 999), // fora das duas janelas
      ]);
      expect(c.revenue, 300);
      expect(c.revenuePrev, 600);
      expect(c.revenueChangePercent, closeTo(-50, 0.001));
      expect(c.comparisonLabel, 'vs. os 7 dias anteriores');
    });
  });

  group('Mês', () {
    test('do dia 1 até hoje, com série acumulada', () {
      final c = _build(ArenaDashboardPeriod.month, [
        _b('2026-11-01', 100),
        _b('2026-11-02', 50),
        _b('2026-11-18', 25),
        _b('2026-11-25', 999), // futuro: fora do realizado
        _b('2026-10-31', 999),
      ]);
      expect(c.revenue, 175);
      expect(c.seriesDays, hasLength(18));
      expect(c.revenueSeries.first, 100);
      expect(c.revenueSeries[1], 150);
      expect(c.revenueSeries.last, 175);
    });

    test('compara com o mês anterior até o mesmo dia', () {
      final c = _build(
        ArenaDashboardPeriod.month,
        [_b('2026-11-05', 300)],
        prevMonth: [
          _b('2026-10-05', 200),
          _b('2026-10-25', 999), // depois do dia 18: fora
        ],
      );
      expect(c.revenuePrev, 200);
      expect(c.revenueChangePercent, closeTo(50, 0.001));
      expect(c.comparisonLabel, 'vs. outubro até o dia 18');
    });

    test('sem base do mês anterior, não inventa comparação', () {
      final c = _build(ArenaDashboardPeriod.month, [_b('2026-11-05', 300)]);
      expect(c.revenuePrev, isNull);
      expect(c.revenueChangePercent, isNull);
      expect(c.bookingsChange, isNull);
    });

    test('intervalo da base: 31/03 vira 28/02', () {
      final r = arenaCockpitPreviousMonthRange(DateTime(2027, 3, 31));
      expect(r.fromKey, '2027-02-01');
      expect(r.toKey, '2027-02-28');
    });
  });

  group('regras de contagem', () {
    test('ticket médio só das reservas com valor; aula não é reserva', () {
      final c = _build(ArenaDashboardPeriod.today, [
        _b('2026-11-18', 100),
        _b('2026-11-18', 60, start: '19:00', end: '20:00'),
        _b('2026-11-18', 0, start: '20:00', end: '21:00'),
        _b(
          '2026-11-18',
          0,
          start: '10:00',
          end: '11:00',
          extra: {'isClassSession': true},
        ),
      ]);
      expect(c.bookings, 3);
      expect(c.ticket, 80);
    });

    test('cancelada e pagamento recusado ficam de fora', () {
      final c = _build(ArenaDashboardPeriod.today, [
        _b('2026-11-18', 100, extra: {'status': 'cancelled'}),
        _b('2026-11-18', 100, extra: {'paymentStatus': 'rejected'}),
      ]);
      expect(c.revenue, 0);
      expect(c.bookings, 1);
    });

    test('horário de pico é a hora com mais início de reserva', () {
      final c = _build(ArenaDashboardPeriod.week, [
        _b('2026-11-17', 10, start: '19:00', end: '20:00'),
        _b('2026-11-18', 10, start: '19:00', end: '20:00'),
        _b('2026-11-18', 10, start: '08:00', end: '09:00'),
      ]);
      expect(c.peakHour, 19);
    });
  });
}
