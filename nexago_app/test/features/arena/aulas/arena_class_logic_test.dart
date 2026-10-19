import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_logic.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';

import 'arena_class_fixtures.dart';

void main() {
  // Segunda 19/10/2026, 17:40 — o "agora" do protótipo.
  final now = DateTime(2026, 10, 19, 17, 40);

  group('arenaClassSessionPhase — agora / próxima / concluída', () {
    test('antes do início é próxima', () {
      expect(
        arenaClassSessionPhase(session(start: '18:00', end: '19:30'), now),
        ArenaClassPhase.upcoming,
      );
    });

    test('entre início e fim é agora (início inclusivo)', () {
      expect(
        arenaClassSessionPhase(session(start: '17:00', end: '18:00'), now),
        ArenaClassPhase.live,
      );
      expect(
        arenaClassSessionPhase(
          session(start: '17:40', end: '18:40'),
          now,
        ),
        ArenaClassPhase.live,
      );
    });

    test('no minuto do fim já é concluída (fim exclusivo)', () {
      expect(
        arenaClassSessionPhase(session(start: '16:40', end: '17:40'), now),
        ArenaClassPhase.done,
      );
    });

    test('chamada fechada conta como concluída mesmo antes do fim', () {
      expect(
        arenaClassSessionPhase(
          session(start: '17:00', end: '18:00', status: 'completed'),
          now,
        ),
        ArenaClassPhase.done,
      );
    });

    test('cancelada vence o relógio', () {
      expect(
        arenaClassSessionPhase(
          session(start: '17:00', end: '18:00', status: 'canceled'),
          now,
        ),
        ArenaClassPhase.canceled,
      );
    });

    test('aula de outro dia: passado é concluída, futuro é próxima', () {
      expect(
        arenaClassSessionPhase(session(date: '2026-10-18'), now),
        ArenaClassPhase.done,
      );
      expect(
        arenaClassSessionPhase(
          session(date: '2026-10-20', start: '07:00', end: '08:00'),
          now,
        ),
        ArenaClassPhase.upcoming,
      );
    });

    test('prefere o instante startAt gravado pelo backend', () {
      // Hora de parede diz 18:00, mas o instante gravado é 17:30: o relógio
      // do aparelho em outro fuso não pode enganar o "AGORA".
      final s = session(
        start: '18:00',
        end: '19:00',
        startAt: DateTime(2026, 10, 19, 17, 30),
      );
      expect(arenaClassSessionStart(s), DateTime(2026, 10, 19, 17, 30));
      expect(arenaClassSessionEnd(s), DateTime(2026, 10, 19, 18, 30));
      expect(arenaClassSessionPhase(s, now), ArenaClassPhase.live);
    });

    test('horário inválido cai em 1h de duração', () {
      final s = session(start: '18:00', end: 'xx');
      expect(arenaClassSessionEnd(s), DateTime(2026, 10, 19, 19, 0));
    });
  });

  group('buildArenaClassDayView', () {
    final sessions = [
      session(
          id: 'a1',
          classId: 'c1',
          className: 'Iniciante A',
          start: '07:00',
          end: '08:00',
          status: 'completed',
          capacity: 6,
          attendance: const {
            'x': AttendanceMark.present,
            'y': AttendanceMark.absent
          }),
      session(
          id: 'a4',
          classId: 'c4',
          className: 'Experimental',
          start: '17:00',
          end: '18:00',
          capacity: 3),
      session(
          id: 'a6',
          classId: 'c6',
          className: 'Diego',
          start: '19:00',
          end: '20:00',
          capacity: 1),
      session(
          id: 'a5',
          classId: 'c5',
          className: 'Vôlei Avançado',
          start: '18:00',
          end: '19:30',
          capacity: 12),
      session(
          id: 'a2',
          classId: 'c2',
          className: 'Carla',
          start: '10:00',
          end: '11:00',
          capacity: 1),
      session(
          id: 'a9',
          classId: 'c9',
          className: 'Chuva',
          start: '12:00',
          end: '13:00',
          status: 'canceled',
          capacity: 8),
    ];
    final classes = {
      'c1': arenaClass(id: 'c1', studentCount: 6, capacity: 6),
      'c4': arenaClass(id: 'c4', studentCount: 3, capacity: 3),
      'c5': arenaClass(id: 'c5', studentCount: 11, capacity: 12),
      'c6': arenaClass(id: 'c6', studentCount: 1, capacity: 1),
      'c2': arenaClass(id: 'c2', studentCount: 1, capacity: 1),
      'c9': arenaClass(id: 'c9', studentCount: 8, capacity: 8),
    };

    test('separa ao vivo/próximas, concluídas e canceladas em ordem de horário',
        () {
      final view = buildArenaClassDayView(
        sessions: sessions,
        classesById: classes,
        now: now,
      );
      expect(view.active.map((i) => i.session.id), ['a4', 'a5', 'a6']);
      expect(view.active.first.phase, ArenaClassPhase.live);
      expect(view.done.map((i) => i.session.id), ['a1', 'a2']);
      expect(view.canceled.map((i) => i.session.id), ['a9']);
    });

    test('só a primeira aula por começar de hoje é "PRÓXIMA"', () {
      final view = buildArenaClassDayView(
        sessions: sessions,
        classesById: classes,
        now: now,
      );
      expect(
        view.active.where((i) => i.isNext).map((i) => i.session.id),
        ['a5'],
      );
    });

    test('dia futuro não marca "PRÓXIMA"', () {
      final view = buildArenaClassDayView(
        sessions: [session(date: '2026-10-21')],
        classesById: classes,
        now: now,
      );
      expect(view.active.single.isNext, isFalse);
    });

    test('KPIs ignoram a aula cancelada', () {
      final view = buildArenaClassDayView(
        sessions: sessions,
        classesById: classes,
        now: now,
      );
      // 6 + 3 + 1 + 11 + 1 alunos; 6 + 3 + 1 + 12 + 1 vagas.
      expect(view.studentTotal, 22);
      expect(view.occupancyPercent, (22 * 100 / 23).round());
      expect(view.classCount, 5);
    });

    test('chamada pendente = terminou pelo relógio sem fechar', () {
      final view = buildArenaClassDayView(
        sessions: sessions,
        classesById: classes,
        now: now,
      );
      final byId = {for (final i in view.done) i.session.id: i};
      expect(byId['a1']!.attendancePending, isFalse);
      expect(byId['a2']!.attendancePending, isTrue);
    });

    test('turma ilegível usa o tamanho da chamada como nº de alunos', () {
      final view = buildArenaClassDayView(
        sessions: [sessions.first],
        classesById: const {},
        now: now,
      );
      expect(view.done.single.studentCount, 2);
    });

    test('dia sem vagas não inventa ocupação', () {
      final view = buildArenaClassDayView(
        sessions: const [],
        classesById: const {},
        now: now,
      );
      expect(view.isEmpty, isTrue);
      expect(view.occupancyPercent, isNull);
    });
  });

  group('semana e rótulos', () {
    test('semana vai de segunda a domingo', () {
      final days = arenaClassWeekDays(DateTime(2026, 10, 22, 15));
      expect(days.first, DateTime(2026, 10, 19));
      expect(days.last, DateTime(2026, 10, 25));
      expect(days.map(arenaClassWeekdayInitial).join(), 'STQQSSD');
    });

    test('domingo fica no fim da própria semana, virada de mês', () {
      final days = arenaClassWeekDays(DateTime(2026, 11, 1));
      expect(days.first, DateTime(2026, 10, 26));
      expect(days.last, DateTime(2026, 11, 1));
    });

    test('cabeçalho sem o ponto do DateFormat pt_BR', () {
      expect(arenaClassDayHeading(DateTime(2026, 10, 19)), 'SEG, 19 OUT');
      expect(arenaClassDayHeading(DateTime(2026, 3, 7)), 'SÁB, 07 MAR');
    });

    test('horário da turma e da avulsa', () {
      expect(
        arenaClassScheduleLabel(arenaClass(weekdays: const [1, 3])),
        'Seg · Qua · 18:00–19:30',
      );
      expect(
        arenaClassScheduleLabel(
          arenaClass(weekdays: const [], startDate: '2026-10-21'),
        ),
        '21/10 · 18:00–19:30',
      );
    });

    test('iniciais', () {
      expect(arenaClassInitials('Felipe Rocha'), 'FR');
      expect(arenaClassInitials('João P. Silva'), 'JS');
      expect(arenaClassInitials('ana'), 'A');
      expect(arenaClassInitials('  '), '?');
    });
  });

  group('aba Turmas', () {
    test('esconde encerradas e avulsas passadas; ativas antes de pausadas', () {
      final list = arenaClassesForList(
        [
          arenaClass(id: 'paused', status: 'paused', weekdays: const [1]),
          arenaClass(id: 'archived', status: 'archived'),
          arenaClass(id: 'past', weekdays: const [], startDate: '2026-10-18'),
          arenaClass(id: 'single', weekdays: const [], startDate: '2026-10-21'),
          arenaClass(id: 'sat', weekdays: const [6], start: '09:00'),
          arenaClass(id: 'mon-late', weekdays: const [1, 3], start: '19:00'),
          arenaClass(id: 'mon-early', weekdays: const [1, 3], start: '07:00'),
        ],
        '2026-10-19',
      );
      expect(
        list.map((c) => c.id),
        ['mon-early', 'mon-late', 'sat', 'single', 'paused'],
      );
    });

    test('conta só conflitos de hoje em diante', () {
      final c = arenaClass(
        conflictDates: const ['2026-10-12', '2026-10-19', '2026-10-26'],
      );
      expect(arenaClassPendingConflicts(c, '2026-10-19'), 2);
    });
  });

  group('chamada', () {
    test('abre no dia da aula e nunca em aula cancelada', () {
      expect(
          arenaClassAttendanceOpen(session(date: '2026-10-19'), '2026-10-19'),
          isTrue);
      expect(
          arenaClassAttendanceOpen(session(date: '2026-10-18'), '2026-10-19'),
          isTrue);
      expect(
          arenaClassAttendanceOpen(session(date: '2026-10-20'), '2026-10-19'),
          isFalse);
      expect(
        arenaClassAttendanceOpen(session(status: 'canceled'), '2026-10-19'),
        isFalse,
      );
    });

    test('roster: ativos + quem saiu mas tem marca, em ordem alfabética', () {
      final roster = arenaClassAttendanceRoster(
        session(attendance: const {'4': AttendanceMark.present}),
        [
          student('3', 'Rafael'),
          student('1', 'caio'),
          student('2', 'Bruno', status: 'removed'),
          student('4', 'Ana', status: 'removed'),
        ],
      );
      expect(roster.map((s) => s.id), ['4', '1', '3']);
    });

    test('rascunho: marcar, todos presentes preserva falta/aviso, payload', () {
      var draft = ArenaClassAttendanceDraft.fromSession(
        ['a', 'b', 'c', 'd'],
        const {'a': AttendanceMark.absent},
      );
      expect(draft.hasAnyMark, isTrue);
      expect(draft.differsFrom(const {'a': AttendanceMark.absent}), isFalse);

      draft = draft.withMark('b', AttendanceMark.excused);
      expect(draft.differsFrom(const {'a': AttendanceMark.absent}), isTrue);

      draft = draft.withUnmarkedPresent();
      final summary = draft.summary;
      expect(summary.present, 2);
      expect(summary.absent, 1);
      expect(summary.excused, 1);
      expect(summary.unmarked, 0);
      expect(summary.total, 4);

      draft = draft.withMark('c', null);
      expect(draft.toPayload(), {
        'a': 'absent',
        'b': 'excused',
        'c': null,
        'd': 'present',
      });
    });

    test('prévia do push repete a frase do backend', () {
      final s = session(
          className: 'Vôlei Avançado', date: '2026-10-19', start: '18:00');
      expect(
        arenaClassCancelPushBody(s, ArenaClassCancelReason.rain),
        'A aula Vôlei Avançado de 19/10 às 18:00 foi cancelada pela arena (chuva).',
      );
      expect(
        arenaClassCancelPushBody(s, ArenaClassCancelReason.other),
        'A aula Vôlei Avançado de 19/10 às 18:00 foi cancelada pela arena.',
      );
    });

    test('ids dos motivos batem com o backend', () {
      expect(
        ArenaClassCancelReason.values.map((r) => r.id),
        ['rain', 'teacher_absent', 'maintenance', 'holiday', 'other'],
      );
    });
  });

  group('parse', () {
    test('aula: chamada válida, marcas desconhecidas descartadas', () {
      final s = ArenaClassSession.fromMap('class_c1_2026-10-19', {
        'classId': 'c1',
        'arenaId': 'a1',
        'className': 'Iniciante A',
        'type': 'particular',
        'level': 'kids',
        'date': '2026-10-19',
        'startTime': '07:00:00',
        'endTime': '08:00',
        'status': 'completed',
        'attendance': {
          'u1': {'mark': 'present', 'name': 'Ana'},
          'u2': {'mark': 'late', 'name': 'Bia'},
          'u3': 'present',
        },
        'cancelReason': 'teacher_absent',
      });
      expect(s.type, ArenaClassType.particular);
      expect(s.level, ArenaClassLevel.kids);
      expect(s.startTime, '07:00');
      expect(s.attendance, {'u1': AttendanceMark.present});
      expect(s.presentCount, 1);
      expect(s.isCompleted, isTrue);
      expect(s.cancelReason, ArenaClassCancelReason.teacherAbsent);
    });

    test('turma: dias ordenados e filtrados, defaults do backend', () {
      final c = ArenaClass.fromMap('c1', {
        'arenaId': 'a1',
        'weekdays': [5, 1, 9, 'x', 3],
        'type': 'aula-show',
        'studentCount': 4,
        'conflictDates': ['2026-10-20', '', 3],
      });
      expect(c.weekdays, [1, 3, 5]);
      expect(c.type, ArenaClassType.turma);
      expect(c.level, ArenaClassLevel.livre);
      expect(c.teacherColor, '#FF6A1A');
      expect(c.studentCount, 4);
      expect(c.conflictDates, ['2026-10-20']);
      expect(c.isSingle, isFalse);
    });

    test('aluno sem conta não recebe push', () {
      final s =
          ArenaClassStudent.fromMap('x', {'name': 'Zé', 'athleteId': null});
      expect(s.hasAccount, isFalse);
      expect(s.isActive, isTrue);
      expect(
        ArenaClassStudent.fromMap('u1', {'name': 'Ana', 'athleteId': 'u1'})
            .hasAccount,
        isTrue,
      );
    });
  });
}
