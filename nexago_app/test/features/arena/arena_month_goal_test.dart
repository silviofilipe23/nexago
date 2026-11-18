import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_month_goal.dart';

// 18/11/2026: novembro tem 30 dias, 12 restantes.
final _today = DateTime(2026, 11, 18, 10);

ArenaManagerBooking _b(
  String date,
  double amount, {
  String status = 'confirmed',
}) {
  return ArenaManagerBooking(
    id: '$date-$amount',
    athleteId: 'u',
    courtId: 'q1',
    courtName: 'Quadra 1',
    dateKey: date,
    startTime: '18:00',
    endTime: '19:00',
    data: {'status': status, 'amountReais': amount},
  );
}

ArenaMonthGoalProgress _build(
  List<ArenaManagerBooking> b, {
  double? goal = 30000,
}) => buildArenaMonthGoalProgress(bookings: b, today: _today, goalReais: goal);

void main() {
  test('realizado soma do dia 1 até hoje; outubro fica de fora', () {
    final p = _build([
      _b('2026-11-01', 1000),
      _b('2026-11-18', 500),
      _b('2026-10-31', 9000),
    ]);
    expect(p.realizedReais, 1500);
    expect(p.dayOfMonth, 18);
    expect(p.daysInMonth, 30);
  });

  test('reservas já marcadas até o fim do mês contam como "à frente"', () {
    final p = _build([_b('2026-11-25', 800), _b('2026-12-01', 5000)]);
    expect(p.bookedAheadReais, 800);
  });

  test('projeção segue o ritmo dos dias que passaram', () {
    // R$ 18.000 em 18 dias = R$ 1.000/dia; 12 dias restantes = R$ 30.000.
    final p = _build([_b('2026-11-10', 18000)]);
    expect(p.projectionReais, closeTo(30000, 0.01));
    expect(p.onTrack, isTrue);
    expect(p.realizedFraction, closeTo(0.6, 0.0001));
  });

  test('projeção nunca fica abaixo do que já está reservado', () {
    final p = _build([_b('2026-11-02', 1800), _b('2026-11-28', 20000)]);
    // Ritmo daria 1.800 + 100×12 = 3.000; já reservado = 21.800.
    expect(p.projectionReais, 21800);
  });

  test('cancelada e pagamento recusado não entram', () {
    final p = _build([
      _b('2026-11-05', 1000, status: 'cancelled'),
      _b('2026-11-06', 1000, status: 'expired'),
      ArenaManagerBooking(
        id: 'r',
        athleteId: 'u',
        courtId: 'q1',
        courtName: 'Q',
        dateKey: '2026-11-07',
        startTime: '18:00',
        endTime: '19:00',
        data: const {
          'status': 'confirmed',
          'amountReais': 1000,
          'paymentStatus': 'rejected',
        },
      ),
    ]);
    expect(p.realizedReais, 0);
  });

  test('quanto falta por dia para bater a meta', () {
    // Meta 30.000; feito 18.000; nada à frente; faltam 12.000 em 12 dias.
    final p = _build([_b('2026-11-10', 18000)]);
    expect(p.neededPerDay, closeTo(1000, 0.01));
  });

  test('meta já coberta pelo reservado: não falta nada', () {
    final p = _build([_b('2026-11-10', 20000), _b('2026-11-29', 15000)]);
    expect(p.neededPerDay, 0);
  });

  test('sem meta definida, não há fração nem ritmo necessário', () {
    final p = _build([_b('2026-11-10', 18000)], goal: null);
    expect(p.hasGoal, isFalse);
    expect(p.realizedFraction, 0);
    expect(p.neededPerDay, isNull);
    expect(p.onTrack, isFalse);
  });

  test('último dia do mês: o dia 1 ainda está na janela de 30 dias', () {
    final p = buildArenaMonthGoalProgress(
      bookings: [_b('2026-12-01', 700), _b('2026-12-31', 300)],
      today: DateTime(2026, 12, 31),
      goalReais: 1000,
    );
    expect(p.realizedReais, 1000);
    expect(p.neededPerDay, 0);
  });

  group('parseArenaGoalInput', () {
    test('aceita número com ponto de milhar, prefixo e centavos', () {
      expect(parseArenaGoalInput('38.000'), 38000);
      expect(parseArenaGoalInput('R\$ 38000'), 38000);
      expect(parseArenaGoalInput('38.000,50'), 38000);
    });

    test('recusa vazio, zero e valor acima do teto', () {
      expect(parseArenaGoalInput(''), isNull);
      expect(parseArenaGoalInput('0'), isNull);
      expect(parseArenaGoalInput('abc'), isNull);
      expect(parseArenaGoalInput('10.000.001'), isNull);
      expect(parseArenaGoalInput('99999999999'), isNull);
    });
  });
}
