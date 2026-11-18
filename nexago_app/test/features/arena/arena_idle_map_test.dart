import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_idle_map.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

// Quarta, 18/11/2026, 10:30.
final _now = DateTime(2026, 11, 18, 10, 30);

ArenaSlot _s(
  int dayOffset,
  int hour,
  String status, {
  String court = 'q1',
  double price = 80,
}) {
  final h = hour.toString().padLeft(2, '0');
  final e = (hour + 1).toString().padLeft(2, '0');
  return ArenaSlot(
    id: '$court-$dayOffset-$hour',
    arenaId: 'a1',
    courtId: court,
    date: DateTime(2026, 11, 18 + dayOffset),
    startTime: '$h:00',
    endTime: '$e:00',
    rawStatus: status,
    priceReais: price,
  );
}

void main() {
  test('monta 7 dias e só as horas em que a arena abre', () {
    final map = buildArenaIdleMap(
      slots: [_s(0, 18, 'booked'), _s(3, 8, 'available')],
      now: _now,
    );
    expect(map.days, hasLength(7));
    expect(map.days.first.date, DateTime(2026, 11, 18));
    expect(map.hours, [8, 18]);
  });

  test('ocupação por célula soma as quadras e ignora bloqueados', () {
    final map = buildArenaIdleMap(
      slots: [
        _s(1, 19, 'booked', court: 'q1'),
        _s(1, 19, 'available', court: 'q2'),
        _s(1, 19, 'blocked', court: 'q3'),
      ],
      now: _now,
    );
    final cell = map.days[1].cells.single;
    expect(cell.total, 2);
    expect(cell.booked, 1);
    expect(cell.occupancy, 0.5);
  });

  test('hora em que a arena não abre fica sem ocupação', () {
    final map = buildArenaIdleMap(
      slots: [_s(0, 18, 'booked'), _s(2, 9, 'available')],
      now: _now,
    );
    expect(map.days[0].cells.first.occupancy, isNull); // 9h de hoje
  });

  test('ignora dias fora da semana', () {
    final map = buildArenaIdleMap(slots: [_s(7, 18, 'available')], now: _now);
    expect(map.isEmpty, isTrue);
    expect(map.hole, isNull);
  });

  test('sugere o maior bloco vazio contínuo, com valor parado', () {
    final map = buildArenaIdleMap(
      slots: [
        // quinta: 14h–17h vazio em 2 quadras = 6 horários livres
        for (final h in [14, 15, 16]) ...[
          _s(1, h, 'available', court: 'q1'),
          _s(1, h, 'available', court: 'q2'),
        ],
        _s(1, 17, 'booked', court: 'q1'),
        _s(1, 17, 'booked', court: 'q2'),
        // sexta: 2 horas vazias numa quadra = 2 livres
        _s(2, 9, 'available'),
        _s(2, 10, 'available'),
      ],
      now: _now,
    );
    final hole = map.hole!;
    expect(hole.date, DateTime(2026, 11, 19));
    expect(hole.startHour, 14);
    expect(hole.endHour, 17);
    expect(hole.freeSlots, 6);
    expect(hole.idleReais, 480);
  });

  test('horas que já passaram hoje não viram sugestão', () {
    final map = buildArenaIdleMap(
      slots: [
        _s(0, 8, 'available'),
        _s(0, 9, 'available'),
        _s(0, 10, 'available'),
      ],
      now: _now,
    );
    expect(map.days.first.cells.every((c) => c.isPast), isTrue);
    expect(map.hole, isNull);
  });

  test('uma hora vazia sozinha não basta para sugerir promoção', () {
    final map = buildArenaIdleMap(
      slots: [
        _s(1, 14, 'available'),
        _s(1, 15, 'booked'),
        _s(1, 16, 'available'),
      ],
      now: _now,
    );
    expect(map.hole, isNull);
  });

  test('buraco na grade (hora sem horário) interrompe o bloco', () {
    final map = buildArenaIdleMap(
      slots: [
        _s(1, 14, 'available'),
        _s(1, 16, 'available'),
        _s(2, 12, 'booked'),
        _s(2, 13, 'booked'),
        _s(2, 15, 'booked'),
      ],
      now: _now,
    );
    expect(map.hole, isNull);
  });
}
