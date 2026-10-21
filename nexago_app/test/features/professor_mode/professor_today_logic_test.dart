import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_agenda.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_today.dart';

import 'professor_agenda_test_support.dart';

List<ProfessorAgendaItem> _items(List<(String, String, String)> sessions) =>
    buildProfessorAgendaItems(
      sessions: [
        for (final (id, start, end) in sessions)
          agendaSession(id: id, start: start, end: end),
      ],
      lessons: const [],
      bookingStatus: const {},
      blocks: const [],
    );

void main() {
  test('saudação pela hora (limites)', () {
    expect(professorGreeting(4), 'Boa noite');
    expect(professorGreeting(5), 'Bom dia');
    expect(professorGreeting(11), 'Bom dia');
    expect(professorGreeting(12), 'Boa tarde');
    expect(professorGreeting(17), 'Boa tarde');
    expect(professorGreeting(18), 'Boa noite');
  });

  test('kicker do cabeçalho', () {
    expect(professorTodayKicker(DateTime(2026, 10, 20, 17, 40)),
        'TER, 20 OUT · 17:40');
    expect(professorTodayKicker(DateTime(2026, 11, 1, 6, 5)),
        'DOM, 1 NOV · 06:05');
  });

  test('quanto falta', () {
    expect(professorStartsInLabel(40), 'EM 40 MIN');
    expect(professorStartsInLabel(80), 'EM 1H20');
    expect(professorStartsInLabel(120), 'EM 2H');
  });

  group('Agora', () {
    final items = _items([
      ('a', '07:00', '08:00'),
      ('b', '19:00', '20:00'),
    ]);

    test('em andamento ganha da próxima', () {
      final s =
          professorNowSlot(items, todayKey: '2026-10-20', nowMin: 7 * 60 + 15)!;
      expect(s.item.id, 'session:a');
      expect(s.isLive, isTrue);
      expect(s.label, 'EM ANDAMENTO');
      expect(s.progress, closeTo(0.25, 0.001));
    });

    test('começando em até 60 min', () {
      final s = professorNowSlot(items,
          todayKey: '2026-10-20', nowMin: 18 * 60 + 40)!;
      expect(s.item.id, 'session:b');
      expect(s.label, 'AGORA · FALTAM 20 MIN');
    });

    test('nada agora (J2)', () {
      expect(
        professorNowSlot(items, todayKey: '2026-10-20', nowMin: 12 * 60),
        isNull,
      );
      // Outro dia não conta.
      expect(
        professorNowSlot(items, todayKey: '2026-10-21', nowMin: 7 * 60 + 15),
        isNull,
      );
    });
  });

  test('faixa do dia: hora ocupada por aula', () {
    final strip = professorDayStrip(_items([('a', '07:30', '08:30')]));
    expect(
        strip.length, kProfessorDayStripEndHour - kProfessorDayStripStartHour);
    expect(strip[0], isNull); // 06h
    expect(strip[1]?.id, 'session:a'); // 07h
    expect(strip[2]?.id, 'session:a'); // 08h
    expect(strip[3], isNull); // 09h
  });

  test('pendência com zero não vira linha', () {
    expect(professorTodayPendings(todayKey: '2026-10-20'), isEmpty);
    final p = professorTodayPendings(
      todayKey: '2026-10-20',
      unreadMessages: 1,
      evaluationsPending: 3,
      evaluationPeriod: '2026-10',
    );
    expect(p.map((e) => e.kind), [
      ProfessorTodayPendingKind.messages,
      ProfessorTodayPendingKind.evaluations,
    ]);
    expect(p.first.title, '1 mensagem não lida');
    expect(p.last.subtitle, 'Avaliação de outubro');
  });
}
