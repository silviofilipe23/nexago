import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_billing_logic.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_enrollment.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_logic.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';

import 'arena_class_fixtures.dart';

void main() {
  // 19/10/2026 é segunda (ISO 1); 21/10 é quarta (3).
  const today = '2026-10-19';

  group('roster por dia da semana', () {
    final students = [
      student('a', 'Ana', weekdays: const [1, 3]),
      student('b', 'Bruno', weekdays: const [2, 4]),
      student('c', 'Caio'), // fase 1: sem weekdays = todos os dias
      student('d', 'Davi', status: 'paused', weekdays: const [1]),
      student('e', 'Elisa', status: 'removed'),
    ];

    test('segunda: só quem faz segunda, sem pausado nem removido', () {
      final roster = arenaClassAttendanceRoster(session(), students);
      expect(roster.map((r) => r.id), ['a', 'c']);
      expect(
          roster.every((r) => r.kind == ArenaClassRosterKind.regular), isTrue);
    });

    test('terça: o aluno de Ter/Qui entra e o de Seg/Qua sai', () {
      final roster =
          arenaClassAttendanceRoster(session(date: '2026-10-20'), students);
      expect(roster.map((r) => r.id), ['b', 'c']);
    });

    test('quem tem marca nesta aula fica, mesmo pausado ou fora do dia', () {
      final roster = arenaClassAttendanceRoster(
        session(attendance: const {
          'd': AttendanceMark.present,
          'b': AttendanceMark.absent,
        }),
        students,
      );
      expect(roster.map((r) => r.id), ['a', 'b', 'c', 'd']);
    });

    test('encaixes vêm no fim, com o tipo, e não duplicam aluno da turma', () {
      final roster = arenaClassAttendanceRoster(
        session(extras: {
          'z': extra('z', 'Zeca'),
          't': extra('t', 'Tati', kind: ArenaClassExtraKind.trial),
          'c': extra('c', 'Caio'),
        }),
        students,
      );
      expect(roster.map((r) => r.id), ['a', 'c', 't', 'z']);
      expect(roster.map((r) => r.kind).toList(), [
        ArenaClassRosterKind.regular,
        ArenaClassRosterKind.makeup, // Caio encaixado conta como encaixe
        ArenaClassRosterKind.trial,
        ArenaClassRosterKind.makeup,
      ]);
    });

    test('vagas livres = capacidade − alunos do dia − encaixes', () {
      expect(
        arenaClassSessionFreeSpots(session(capacity: 4), students),
        2, // Ana + Caio na segunda
      );
      expect(
        arenaClassSessionFreeSpots(
          session(capacity: 4, extras: {'z': extra('z', 'Zeca')}),
          students,
        ),
        1,
      );
      expect(
        arenaClassSessionFreeSpots(
          session(capacity: 1, extras: {'z': extra('z', 'Zeca')}),
          students,
        ),
        0,
      );
    });
  });

  group('vaga por dia na matrícula', () {
    final cls = arenaClass(
      id: 'c2',
      name: 'Intermediário B',
      weekdays: const [2, 4],
      start: '19:00',
      capacity: 2,
    );
    final students = {
      'c2': [
        student('x', 'X', classId: 'c2', weekdays: const [2]),
        student('y', 'Y', classId: 'c2', weekdays: const [2]),
        student('w', 'W', classId: 'c2', weekdays: const [4], status: 'paused'),
      ],
    };

    test('cada dia da turma é um horário com a vaga daquele dia', () {
      final options = arenaClassSlotOptions(
        classes: [cls],
        studentsByClass: students,
      );
      expect(options.map((o) => (o.weekday, o.taken, o.free, o.isFull)), [
        (2, 2, 0, true), // terça lotada
        (4, 0, 2, false), // pausado não ocupa a quinta
      ]);
    });

    test('o próprio aluno não conta contra ele (reativar/rematricular)', () {
      final options = arenaClassSlotOptions(
        classes: [cls],
        studentsByClass: students,
        excludeStudentId: 'x',
      );
      expect(options.first.free, 1);
    });

    test('turma pausada e aula avulsa ficam fora; ordem por dia e horário', () {
      final options = arenaClassSlotOptions(
        classes: [
          cls,
          arenaClass(id: 'c3', name: 'Pausada', status: 'paused'),
          arenaClass(id: 'c4', name: 'Avulsa', weekdays: const []),
          arenaClass(
              id: 'c1',
              name: 'Iniciante A',
              weekdays: const [1, 3],
              start: '07:00'),
        ],
        studentsByClass: students,
      );
      expect(
        options.map((o) => '${o.cls.id}:${o.weekday}'),
        ['c1:1', 'c2:2', 'c1:3', 'c2:4'],
      );
    });

    test('mensal exige exatamente as aulas por semana; pacote de 1 a 7', () {
      expect(arenaClassSlotsRequired(plan(perWeek: 2)), (min: 2, max: 2));
      expect(
        arenaClassSlotsRequired(
          plan(kind: ArenaClassPlanKind.package, credits: 8, validityDays: 60),
        ),
        (min: 1, max: 7),
      );
      expect(arenaClassSlotsTitle(plan(perWeek: 1)), 'Escolha 1 horário');
      expect(arenaClassSlotsTitle(plan(perWeek: 3)), 'Escolha 3 horários');
    });

    test('só mensal e pacote ativos viram matrícula', () {
      final list = arenaClassEnrollablePlans([
        plan(
            id: 'p8', kind: ArenaClassPlanKind.package, price: 360, credits: 8),
        plan(id: 'm2', perWeek: 2),
        plan(id: 'av', kind: ArenaClassPlanKind.single, price: 120),
        plan(id: 'm1', perWeek: 1, price: 180),
        plan(id: 'old', status: 'archived'),
      ]);
      expect(list.map((p) => p.id), ['m1', 'm2', 'p8']);
    });
  });

  group('mensalidades', () {
    test('atraso só depois do vencimento; vencer hoje ainda não é atraso', () {
      expect(arenaClassChargeIsOverdue(charge(dueDate: '2026-10-18'), today),
          isTrue);
      expect(arenaClassChargeIsOverdue(charge(dueDate: today), today), isFalse);
      expect(
        arenaClassChargeIsOverdue(
            charge(dueDate: '2026-10-01', status: 'paid'), today),
        isFalse,
      );
      expect(
          arenaClassChargeDaysOverdue(charge(dueDate: '2026-10-12'), today), 7);
    });

    test('rótulos do cartão', () {
      expect(arenaClassChargeStatusLabel(charge(dueDate: '2026-10-18'), today),
          '1 dia em atraso');
      expect(arenaClassChargeStatusLabel(charge(dueDate: '2026-10-10'), today),
          '9 dias em atraso');
      expect(arenaClassChargeStatusLabel(charge(dueDate: today), today),
          'vence hoje');
      expect(arenaClassChargeStatusLabel(charge(dueDate: '2026-11-05'), today),
          'vence 05 nov');
      expect(
        arenaClassChargeStatusLabel(
          charge(status: 'paid', paidOn: '2026-10-12'),
          today,
        ),
        'pago 12 out · PIX',
      );
    });

    test('abas e totais do mês', () {
      final view = buildArenaClassChargesView(
        open: [
          charge(id: 'late2', name: 'Zé', dueDate: '2026-10-12', amount: 180),
          charge(id: 'late1', name: 'Ana', dueDate: '2026-10-05', amount: 440),
          charge(id: 'today', dueDate: today, amount: 320),
          charge(id: 'nov', dueDate: '2026-11-05', amount: 320),
        ],
        paid: [
          charge(id: 'p1', status: 'paid', paidOn: '2026-10-02', amount: 100),
          charge(id: 'p2', status: 'paid', paidOn: '2026-10-15', amount: 200),
          // Pago no mês passado não entra no recebido de outubro.
          charge(id: 'p0', status: 'paid', paidOn: '2026-09-30', amount: 999),
        ],
        todayKey: today,
      );
      expect(view.overdue.map((c) => c.id), ['late1', 'late2']);
      expect(view.upcoming.map((c) => c.id), ['today', 'nov']);
      expect(view.paid.map((c) => c.id), ['p2', 'p1']);
      expect(view.overdueReais, 620);
      expect(view.toReceiveReais, 640);
      expect(view.receivedReais, 300);
      expect(view.of(ArenaClassChargesTab.overdue).length, 2);
    });

    test('situação do aluno: atraso vence pausa; sem matrícula = sem plano',
        () {
      final late = [charge(dueDate: '2026-10-05')];
      expect(
        arenaClassStudentStanding(
            enrollment: enrollment(status: 'paused'),
            charges: late,
            todayKey: today),
        ArenaClassStudentStanding.overdue,
      );
      expect(
        arenaClassStudentStanding(
            enrollment: enrollment(status: 'paused'),
            charges: const [],
            todayKey: today),
        ArenaClassStudentStanding.paused,
      );
      expect(
        arenaClassStudentStanding(
            enrollment: enrollment(),
            charges: [charge(dueDate: today)],
            todayKey: today),
        ArenaClassStudentStanding.dueToday,
      );
      expect(
        arenaClassStudentStanding(
            enrollment: null, charges: const [], todayKey: today),
        ArenaClassStudentStanding.noPlan,
      );
      expect(
        arenaClassStudentStanding(
            enrollment: enrollment(), charges: const [], todayKey: today),
        ArenaClassStudentStanding.upToDate,
      );
    });

    test('mensagem do Cobrar diz o valor, o vencimento e como pagar', () {
      final msg = arenaClassChargeReminderMessage(
        charge(dueDate: '2026-10-12', amount: 180),
        todayKey: today,
        arenaName: 'Vegeton',
      );
      expect(msg, startsWith('Olá, Carla!'));
      expect(msg, contains('R\$'));
      expect(msg, contains('que venceu em 12/10'));
      expect(msg, contains('PIX'));
      expect(msg, endsWith('— Vegeton'));
    });
  });

  group('reposição para encaixar', () {
    test('um por aluno (o que vence antes), sem quem já está na aula', () {
      final options = arenaClassMakeupOptions(
        credits: [
          credit(
              id: 'c-a2', studentId: 'a', name: 'Ana', expiresOn: '2026-11-20'),
          credit(
              id: 'c-a1', studentId: 'a', name: 'Ana', expiresOn: '2026-11-01'),
          credit(
              id: 'c-b', studentId: 'b', name: 'Bia', expiresOn: '2026-10-25'),
          credit(id: 'c-in', studentId: 'in', name: 'Já na aula'),
          credit(id: 'c-used', studentId: 'u', name: 'Usado', status: 'used'),
          // Vence antes da aula de 21/10: o backend recusa.
          credit(
              id: 'c-old',
              studentId: 'o',
              name: 'Vencido',
              expiresOn: '2026-10-20'),
        ],
        session: session(date: '2026-10-21'),
        inSession: {'in'},
      );
      expect(options.map((o) => o.credit.id), ['c-b', 'c-a1']);
      expect(options.last.creditCount, 2);
      expect(
        arenaClassMakeupSubtitle(options.last, sourceClassName: 'Iniciante A'),
        '2 créditos · expira 01 nov · Iniciante A',
      );
    });
  });

  group('frequência do aluno', () {
    test('conta só os dias do aluno, sem cancelada e sem aula futura', () {
      final sessions = [
        session(id: 's1', date: '2026-10-05', attendance: const {
          'u1': AttendanceMark.present,
        }),
        session(id: 's2', date: '2026-10-07', attendance: const {
          'u1': AttendanceMark.excused,
        }),
        // Terça: o aluno faz Seg/Qua — sem marca, não conta.
        session(id: 's3', date: '2026-10-06'),
        session(id: 's4', date: '2026-10-12', status: 'canceled'),
        session(id: 's5', date: '2026-10-14', attendance: const {
          'u1': AttendanceMark.present,
        }),
        session(id: 's6', date: '2026-10-21'), // futura
      ];
      final freq = buildArenaClassStudentFrequency(
        studentId: 'u1',
        sessions: sessions,
        weekdaysByClass: const {
          'c1': [1, 3]
        },
        fromKey: '2026-08-25',
        todayKey: today,
      );
      expect(freq.lessons.map((l) => l.session.id), ['s1', 's2', 's5']);
      expect(freq.percent, 67);
      expect(freq.recent(2).map((l) => l.session.id), ['s5', 's2']);
    });

    test('aula passada sem marca entra como "sem marca" e não pesa no %', () {
      final freq = buildArenaClassStudentFrequency(
        studentId: 'u1',
        sessions: [
          session(id: 's1', date: '2026-10-05'),
          session(id: 's2', date: '2026-10-07', attendance: const {
            'u1': AttendanceMark.present,
          }),
        ],
        weekdaysByClass: const {'c1': null},
        fromKey: '2026-08-25',
        todayKey: today,
      );
      expect(freq.lessons.length, 2);
      expect(freq.percent, 100);
      expect(arenaClassLessonLabel(null), 'Sem marca');
    });
  });

  group('rótulos de horário', () {
    const slots = [
      ArenaClassEnrollmentSlot(
          classId: 'c2',
          weekday: 4,
          className: 'Intermediário B',
          startTime: '19:00'),
      ArenaClassEnrollmentSlot(
          classId: 'c2',
          weekday: 2,
          className: 'Intermediário B',
          startTime: '19:00'),
    ];

    test('agrupa dias da mesma turma e horário', () {
      expect(arenaClassSlotsLabel(slots), 'Ter e Qui · 19:00');
      expect(
        arenaClassSlotsLabel([
          ...slots,
          const ArenaClassEnrollmentSlot(
              classId: 'c1',
              weekday: 1,
              className: 'Iniciante A',
              startTime: '07:00'),
        ]),
        'Intermediário B · Ter e Qui · 19:00 / Iniciante A · Seg · 07:00',
      );
    });

    test('1ª aula = próximo dia que cai num dos horários', () {
      expect(arenaClassNextSlotDate(slots, today), '2026-10-20');
      expect(arenaClassNextSlotDate(slots, '2026-10-23'), '2026-10-27');
      expect(arenaClassWeekdayDate('2026-10-20'), 'Ter 20 out');
    });

    test('detalhe e preço do plano', () {
      expect(arenaClassPlanDetail(plan()), '2x por semana · 2 reposições/mês');
      // `formatBRLWhole` usa espaço não separável depois do R$.
      expect(arenaClassPlanPrice(plan()), '${formatBRLWhole(320)}/mês');
      final pkg = plan(
          kind: ArenaClassPlanKind.package,
          price: 360,
          credits: 8,
          validityDays: 60);
      expect(arenaClassPlanDetail(pkg), '8 aulas · validade 60 dias');
      expect(arenaClassPlanPrice(pkg), formatBRLWhole(360));
    });
  });
}
