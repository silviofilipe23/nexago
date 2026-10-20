import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_actions.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_actions_logic.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_students.dart';

import 'professor_actions_test_support.dart';
import 'professor_students_test_support.dart';

void main() {
  group('modelo do contexto', () {
    test('lê permissões, regras, turmas com ocupação, espera e experimentais',
        () {
      final ctx = ProfessorActionsContext.fromMap(professorActionsPayload());
      expect(ctx.permissions.canEnrollStudents, isTrue);
      expect(ctx.permissions.canCancelLessons, isTrue);
      expect(ctx.onlineBillingEnabled, isFalse);
      expect(ctx.makeupValidityDays, 30);
      final c1 = ctx.classById('c1')!;
      expect(c1.freeOn(2), 1);
      expect(c1.freeOn(4), 0);
      expect(c1.freeSpots, 0);
      expect(c1.isFull, isTrue);
      expect(ctx.classById('c3')!.freeSpots, 4);
      expect(
          ctx.waitlistOf('c1').map((w) => w.name), ['Ana Lima', 'Pedro Costa']);
      expect(ctx.creditsOf('s1').single.creditId, 'k1');
      expect(ctx.trials.single.name, 'Rafa Torres');
    });

    test('ações do resumo da arena: ausente = nada liberado', () {
      expect(ProfessorArenaActions.fromMap(null).any, isFalse);
      final snap = professorStudentsSnapshot(arenas: [
        {
          ...arenaMap(),
          'actions': {'canScheduleLessons': true}
        },
        arenaMap(arenaId: 'arena-norte', type: 'INDEPENDENT'),
      ]);
      expect(snap.actionArenas.map((a) => a.arenaId), ['arena-cfc']);
      expect(snap.arena('arena-cfc')!.actions.canScheduleLessons, isTrue);
      expect(snap.arena('arena-cfc')!.actions.canEnrollStudents, isFalse);
    });
  });

  group('regras das telas', () {
    final ctx = ProfessorActionsContext.fromMap(professorActionsPayload());
    final monthly1 = ctx.plans.firstWhere((p) => p.planId == 'p1');
    final monthly2 = ctx.plans.firstWhere((p) => p.planId == 'p2');
    final pkg = ctx.plans.firstWhere((p) => p.planId == 'p4');

    test('dias sugeridos e o que trava a matrícula', () {
      final c3 = ctx.classById('c3')!;
      expect(professorDefaultWeekdays(c3, monthly1), [1]);
      expect(professorDefaultWeekdays(c3, monthly2), [1, 3]);
      expect(professorDefaultWeekdays(c3, pkg), [1, 3]);
      expect(professorEnrollmentBlocker(c3, monthly2, [1, 3]), isNull);
      expect(professorEnrollmentBlocker(c3, monthly2, [1]),
          contains('escolha 2 dias'));
      expect(professorEnrollmentBlocker(ctx.classById('c1'), monthly1, [4]),
          contains('lotada'));
      expect(
          professorEnrollmentBlocker(null, monthly1, [1]), 'Escolha a turma.');
    });

    test('planos que servem: mensal com o mesmo número de dias, depois pacote',
        () {
      expect(
          professorPlansFor(ctx.plans, 2).map((p) => p.planId), ['p2', 'p4']);
    });

    test(
        'aulas para encaixe: com vaga, sem o aluno, turma dele primeiro, até a validade',
        () {
      final list =
          professorMakeupSessions(ctx, studentId: 's1', preferClassIds: {'c3'});
      expect(list.map((s) => s.sessionId), ['s-c3', 's-c1b']);
      expect(
        professorMakeupSessions(ctx, studentId: 's1', until: '2026-10-21')
            .map((s) => s.sessionId),
        ['s-c1b'],
      );
      // Quem já está encaixado não aparece de novo.
      expect(
          professorMakeupSessions(ctx, studentId: 't1').map((s) => s.sessionId),
          ['s-c1b', 's-c3']);
    });

    test('pacote utilizável só ativo e com aula sobrando', () {
      ProfessorStudent withPlans(List<Map<String, Object?>> plans) =>
          ProfessorStudent.fromMap(studentMap({'plans': plans}));
      expect(
          professorUsablePackage(withPlans([
            {
              'enrollmentId': 'e',
              'status': 'active',
              'kind': 'package',
              'creditsLeft': 0
            },
          ])),
          isNull);
      expect(
          professorUsablePackage(withPlans([
            {
              'enrollmentId': 'e',
              'status': 'paused',
              'kind': 'package',
              'creditsLeft': 3
            },
          ])),
          isNull);
      expect(
          professorUsablePackage(withPlans([
            {
              'enrollmentId': 'e2',
              'status': 'active',
              'kind': 'package',
              'creditsLeft': 2
            },
          ]))!
              .enrollmentId,
          'e2');
    });

    test('aviso: aulas de hoje e amanhã, alcance pela soma dos alunos', () {
      final sessions = professorNoticeSessions(ctx);
      expect(sessions.map((s) => s.sessionId), ['s-c1a', 's-c1b']);
      expect(professorNoticeReach(sessions, {'s-c1a', 's-c1b'}), 9);
      expect(ProfessorNoticeTemplate.rain.cancels, isTrue);
      expect(ProfessorNoticeTemplate.delay.cancelReason, 'other');
    });

    test('datas e horários', () {
      expect(professorDayLabel('2026-10-20', '2026-10-20'), 'Hoje');
      expect(professorDayLabel('2026-10-21', '2026-10-20'), 'Amanhã');
      expect(professorDayLabel('2026-10-22', '2026-10-20'), 'Qui 22');
      expect(professorAddMinutes('07:00', 90), '08:30');
      expect(professorAddMinutes('23:30', 60), '24:00');
      expect(professorNextDays('2026-10-30', 3),
          ['2026-10-30', '2026-10-31', '2026-11-01']);
      expect(professorSpotsLabel(0), 'LOTADA');
      expect(professorSpotsLabel(1), '1 VAGA');
    });

    test('mover: outras turmas com dias suficientes', () {
      expect(
        professorMoveTargets(ctx, fromClassId: 'c1', weekdayCount: 2)
            .map((c) => c.classId),
        ['c3'],
      );
    });
  });
}
