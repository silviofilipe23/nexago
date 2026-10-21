import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_story.dart';

ClassAgendaEntry aula({
  String id = 's1',
  String date = '2026-05-26',
  String start = '07:00',
  String end = '08:30',
  String role = 'student',
  String status = 'completed',
  String? mark = 'present',
  String? classType = 'turma',
  String teacher = 'Júnior Prado',
}) {
  return ClassAgendaEntry(
    sessionId: id,
    arenaId: 'a1',
    arenaName: 'Praia BT',
    classId: 'c1',
    className: 'Treino técnico',
    teacherName: teacher,
    courtName: 'Quadra central',
    date: date,
    startTime: start,
    endTime: end,
    startAt: null,
    status: status,
    role: role,
    kind: 'regular',
    myMark: mark,
    classType: classType,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('isClassStoryShareable', () {
    final depois = DateTime(2026, 5, 26, 9);

    test('aula do aluno que já acabou, com presença ou sem chamada', () {
      expect(isClassStoryShareable(aula(), depois), isTrue);
      expect(isClassStoryShareable(aula(mark: null), depois), isTrue);
    });

    test('não vale antes do fim da aula', () {
      expect(
        isClassStoryShareable(aula(), DateTime(2026, 5, 26, 8, 29)),
        isFalse,
      );
    });

    test('não vale com falta, justificada, cancelada ou para o professor', () {
      expect(isClassStoryShareable(aula(mark: 'absent'), depois), isFalse);
      expect(isClassStoryShareable(aula(mark: 'excused'), depois), isFalse);
      expect(isClassStoryShareable(aula(status: 'canceled'), depois), isFalse);
      expect(isClassStoryShareable(aula(role: 'teacher'), depois), isFalse);
    });
  });

  group('classStoryStats', () {
    test('duração, treino do mês e semanas seguidas pela chamada', () {
      final session = aula(id: 'hoje');
      final history = [
        aula(id: 'abr', date: '2026-04-28'),
        aula(id: 'm1', date: '2026-05-05'),
        aula(id: 'm2', date: '2026-05-12'),
        aula(id: 'falta', date: '2026-05-14', mark: 'absent'),
        aula(id: 'm3', date: '2026-05-19'),
        aula(id: 'm4', date: '2026-05-21'),
        aula(id: 'futura', date: '2026-05-28', mark: null),
        session,
      ];
      final stats = classStoryStats(session, history);

      expect(stats.minutes, 90);
      // m1, m2, m3, m4 e a própria aula; falta e futura não contam.
      expect(stats.monthOrdinal, 5);
      // Semanas de 27/04, 04/05, 11/05, 18/05 e 25/05 (segunda a domingo).
      expect(stats.weekStreak, 5);
    });

    test('semana sem treino quebra a sequência', () {
      final session = aula(id: 'hoje');
      final stats = classStoryStats(session, [
        aula(id: 'a', date: '2026-05-05'),
        aula(id: 'b', date: '2026-05-19'),
      ]);
      expect(stats.weekStreak, 2);
      expect(stats.monthOrdinal, 3);
    });

    test('sem histórico: primeiro do mês, uma semana', () {
      final stats = classStoryStats(aula(mark: null), const []);
      expect(stats.monthOrdinal, 1);
      expect(stats.weekStreak, 1);
    });
  });

  group('classStoryDataFrom', () {
    test('kicker, números, local e a linha com o professor', () {
      final data = classStoryDataFrom(
        session: aula(),
        stats: const ClassStoryStats(
          minutes: 90,
          monthOrdinal: 12,
          weekStreak: 4,
        ),
        athleteName: 'Mariana Alves',
        athleteNickname: 'ma.beach',
      );
      expect(data.kicker, 'AULA · TREINO TÉCNICO');
      expect(data.stats, [
        ('90', 'MIN'),
        ('12º', 'DO MÊS'),
        ('4', 'SEM. SEGUIDAS'),
      ]);
      expect(data.arenaName, 'Praia BT');
      expect(data.placeLine, ' · Quadra central · Ter 07:00');
      expect(data.handle, '@ma.beach');
      expect(data.withLine, 'com Prof. Júnior e a turma');
      expect(data.noPeopleLine, 'Treino técnico · Ter 7h');
      expect([for (final p in data.people) p.initials], ['MA', 'JP']);
    });

    test('sem apelido usa o primeiro nome; particular não fala em turma', () {
      final data = classStoryDataFrom(
        session: aula(classType: 'particular'),
        stats: const ClassStoryStats(
          minutes: null,
          monthOrdinal: 1,
          weekStreak: 1,
        ),
        athleteName: 'Mariana Alves',
      );
      expect(data.handle, 'Mariana');
      expect(data.withLine, 'com Prof. Júnior');
      // Sem duração e sem sequência de 2+ semanas, sobra o treino do mês.
      expect(data.stats, [('1º', 'DO MÊS')]);
    });
  });

  test('sorteio nunca devolve a frase anterior e cobre a lista', () {
    final random = Random(7);
    final seen = <String>{};
    var last = kClassStoryHeadlines.first;
    for (var i = 0; i < 500; i++) {
      final next = pickClassStoryHeadline(random: random, avoid: last);
      expect(next, isNot(last));
      seen.add(next);
      last = next;
    }
    expect(seen, kClassStoryHeadlines.toSet());
  });

  test('legenda leva a arena, a aula e a hashtag', () {
    expect(
      classStoryShareText(aula()),
      'Treino pago na Praia BT! Treino técnico. #vamosnexa',
    );
  });
}
