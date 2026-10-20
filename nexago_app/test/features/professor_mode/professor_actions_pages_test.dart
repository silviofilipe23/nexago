import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/actions/professor_enroll_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_actions_test_support.dart';
import 'professor_students_test_support.dart';

Future<void> tap(WidgetTester tester, Key key) async {
  await tester.ensureVisible(find.byKey(key));
  await tester.tap(find.byKey(key));
  await settleProfessorStudents(tester);
}

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Aluno (B3) — ações liberadas pela arena', () {
    testWidgets(
        'com as chaves: matricular, reposição e mover; sem pacote, sem nova aula',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorActionsApp(
        tester,
        location: '${AppRoutes.professorStudents}/arena-cfc/s1',
        actions: actions,
      );
      expect(find.byKey(const Key('professor-student-enroll')), findsOneWidget);
      expect(find.text('Reposição · 1 crédito'), findsOneWidget);
      expect(find.byKey(const Key('professor-student-move')), findsOneWidget);
      expect(
          find.byKey(const Key('professor-student-new-lesson')), findsNothing);
    });

    testWidgets('arena sem chave ligada não mostra ação nenhuma',
        (tester) async {
      await pumpProfessorActionsApp(
        tester,
        location: '${AppRoutes.professorStudents}/arena-cfc/s1',
        actions: FakeProfessorActionsRepository(),
        snapshot: professorSnapshotWithActions(actions: const {}),
      );
      expect(find.text('AÇÕES · LIBERADAS PELA ARENA'), findsNothing);
      expect(find.byKey(const Key('professor-student-enroll')), findsNothing);
    });

    testWidgets('mover de turma chama o servidor com a origem e o destino',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorActionsApp(
        tester,
        location: '${AppRoutes.professorStudents}/arena-cfc/s1',
        actions: actions,
      );
      await tap(tester, const Key('professor-student-move'));
      await tap(tester, const Key('professor-move-to-c3'));
      await tap(tester, const Key('professor-move-submit'));
      expect(actions.calls, contains('move:c1>c3:s1'));
      expect(find.text('João Silva mudou de turma.'), findsOneWidget);
    });
  });

  group('B6 Matricular', () {
    testWidgets(
        'turma + plano mostram a prévia e matriculam com os dias da turma',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorActionsApp(
        tester,
        location:
            '/professor/acoes/arena-cfc/matricular?name=Bruno%20Alves&athleteId=ath-bruno',
        actions: actions,
      );
      expect(find.text('Matricular em turma'), findsOneWidget);
      await tap(tester, const Key('professor-enroll-class-c3'));
      await tap(tester, const Key('professor-enroll-plan-p2'));
      expect(find.textContaining('120,00'), findsWidgets);
      await tap(tester, const Key('professor-enroll-submit'));
      final req = actions.lastEnrollment!;
      expect([
        req.classId,
        req.planId,
        req.weekdays,
        req.student.athleteId
      ], [
        'c3',
        'p2',
        [1, 3],
        'ath-bruno'
      ]);
      expect(req.online, isFalse);
    });

    testWidgets('mensal 2x com só um dia escolhido trava o botão',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorActionsApp(
        tester,
        location:
            '/professor/acoes/arena-cfc/matricular?name=Bruno&athleteId=ath-bruno&classId=c3',
        actions: actions,
      );
      await tap(tester, const Key('professor-enroll-plan-p2'));
      await tap(tester, const Key('professor-enroll-day-3'));
      expect(find.textContaining('escolha 2 dias'), findsOneWidget);
      await tap(tester, const Key('professor-enroll-submit'));
      expect(actions.lastEnrollment, isNull);
    });

    testWidgets('erro do servidor aparece e a tela fica', (tester) async {
      final actions = FakeProfessorActionsRepository()
        ..error = const ProfessorStudentsException(
            'A Arena CFC não liberou matricular alunos nas suas turmas no seu vínculo.');
      await pumpProfessorActionsApp(
        tester,
        location:
            '/professor/acoes/arena-cfc/matricular?name=Bruno&athleteId=ath-bruno&classId=c3',
        actions: actions,
      );
      await tap(tester, const Key('professor-enroll-plan-p1'));
      await tap(tester, const Key('professor-enroll-submit'));
      expect(find.textContaining('não liberou matricular'), findsOneWidget);
      expect(find.text('Matricular em turma'), findsOneWidget);
    });
  });

  group('B12 Lista de espera', () {
    testWidgets(
        'fila em ordem; matricular leva ao B6 com a entrada; tirar pede confirmação',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorActionsApp(
        tester,
        location: '/professor/acoes/arena-cfc/espera/c1',
        actions: actions,
      );
      expect(find.text('TURMA LOTADA'), findsOneWidget);
      final ana = tester.getTopLeft(find.text('Ana Lima')).dy;
      final pedro = tester.getTopLeft(find.text('Pedro Costa')).dy;
      expect(ana, lessThan(pedro));

      await tap(tester, const Key('professor-waitlist-remove-w2'));
      await tap(tester, const Key('professor-waitlist-remove-confirm'));
      expect(actions.calls, contains('unwait:c1:w2'));

      await tap(tester, const Key('professor-waitlist-enroll-w1'));
      final page =
          tester.widget<ProfessorEnrollPage>(find.byType(ProfessorEnrollPage));
      expect([page.waitlistEntryId, page.athleteId, page.classId],
          ['w1', 'ath-ana', 'c1']);
    });
  });

  group('B11 Reposição', () {
    testWidgets('crédito escolhido sozinho; encaixa na aula com vaga',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorActionsApp(
        tester,
        location: '/professor/acoes/arena-cfc/reposicao/s1',
        actions: actions,
      );
      expect(find.text('Aula perdida em 15 out'), findsOneWidget);
      // A aula lotada de hoje não aparece.
      expect(find.byKey(const Key('professor-makeup-session-s-c1a')),
          findsNothing);
      await tap(tester, const Key('professor-makeup-session-s-c1b'));
      await tap(tester, const Key('professor-makeup-submit'));
      expect(actions.calls, contains('makeup:s-c1b:k1'));
    });
  });

  group('B13 Comunicado', () {
    testWidgets('chuva: confirma e cancela cada aula com o recado e o crédito',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorActionsApp(
        tester,
        location: '/professor/acoes/arena-cfc/comunicado',
        actions: actions,
      );
      await tap(tester, const Key('professor-notice-session-s-c1a'));
      await tap(tester, const Key('professor-notice-session-s-c1b'));
      expect(find.text('Cancelar e avisar 9 alunos'), findsOneWidget);
      await tap(tester, const Key('professor-notice-submit'));
      await tap(tester, const Key('professor-notice-cancel-confirm'));
      expect(actions.cancels.map((c) => c.sessionId), ['s-c1a', 's-c1b']);
      expect(actions.cancels.first.reason, 'rain');
      expect(actions.cancels.first.credits, isTrue);
      expect(actions.cancels.first.message, contains('chuva'));
    });

    testWidgets('atraso: só avisa, sem cancelar', (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorActionsApp(
        tester,
        location: '/professor/acoes/arena-cfc/comunicado',
        actions: actions,
      );
      await tap(tester, const Key('professor-notice-template-delay'));
      await tap(tester, const Key('professor-notice-session-s-c1b'));
      await tap(tester, const Key('professor-notice-submit'));
      expect(actions.cancels, isEmpty);
      expect(actions.lastNotice!.sessionIds, ['s-c1b']);
      expect(find.text('Aviso enviado para 7 alunos.'), findsOneWidget);
    });
  });

  group('B8 Nova aula', () {
    testWidgets(
        'aluno sem pacote fica apagado; com pacote agenda e mostra a quadra',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      final students = [
        studentMap({}),
        studentMap({
          'studentId': 's2',
          'name': 'Carla Dias',
          'plans': [
            {
              'enrollmentId': 'e9',
              'status': 'active',
              'name': 'Pacote 4 aulas',
              'kind': 'package',
              'priceReais': 440,
              'credits': 4,
              'creditsLeft': 2
            },
          ],
        }),
      ];
      await pumpProfessorActionsApp(
        tester,
        location: '/professor/acoes/arena-cfc/nova-aula',
        actions: actions,
        snapshot: professorSnapshotWithActions(students: students),
      );
      expect(find.text('Sem pacote com aula sobrando'), findsOneWidget);
      expect(find.text('Pacote 4 aulas · 2 aulas restantes'), findsOneWidget);
      await tap(tester, const Key('professor-lesson-student-s2'));
      await tap(tester, const Key('professor-lesson-day-2026-10-22'));
      await tap(tester, const Key('professor-lesson-start-09:00'));
      await tap(tester, const Key('professor-lesson-submit'));
      final lesson = actions.lastLesson!;
      expect([lesson.type, lesson.date, lesson.start, lesson.end],
          ['particular', '2026-10-22', '09:00', '10:00']);
      expect(lesson.students.single.studentId, 's2');
      expect(find.text('Aula agendada na Quadra 3.'), findsOneWidget);
    });
  });

  group('B5 Adicionar aluno e B7 Converter', () {
    testWidgets(
        'experimental recente abre a conversão; turma lotada vai para a espera',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorActionsApp(
        tester,
        location: AppRoutes.professorAddStudent,
        actions: actions,
      );
      expect(find.text('EXPERIMENTAIS RECENTES'), findsOneWidget);
      await tap(tester, const Key('professor-add-trial-ath-rafa'));
      expect(find.text('Converter experimental'), findsOneWidget);
      expect(
          find.textContaining('entra na espera (3º)'), findsOneWidget);
      await tap(tester, const Key('professor-convert-class-c1'));
      expect(find.text('Pôr na lista de espera'), findsOneWidget);
      await tap(tester, const Key('professor-convert-submit'));
      expect(actions.calls, contains('waitlist:c1:ath-rafa'));
    });

    testWidgets('turma com vaga leva à matrícula com a turma escolhida',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      final router = await pumpProfessorActionsApp(
        tester,
        location:
            '/professor/acoes/arena-cfc/experimental?athleteId=ath-rafa&name=Rafa%20Torres&classId=c1',
        actions: actions,
      );
      await tap(tester, const Key('professor-convert-class-c3'));
      await tap(tester, const Key('professor-convert-submit'));
      final uri = router.routerDelegate.currentConfiguration.uri;
      expect(uri.path, '/professor/acoes/arena-cfc/matricular');
      expect(uri.queryParameters['classId'], 'c3');
    });
  });
}
