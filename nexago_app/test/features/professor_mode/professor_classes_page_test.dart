import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_students_test_support.dart';

Future<void> openClasses(
  WidgetTester tester,
  FakeProfessorStudentsRepository repo,
) =>
    pumpProfessorStudentsApp(
      tester,
      repo: repo,
      location: AppRoutes.professorClasses,
    );

Finder inCard(String classId, String text) => find.descendant(
      of: find.byKey(Key('professor-class-$classId')),
      matching: find.text(text),
    );

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Minhas turmas (A4)', () {
    testWidgets('cartões: espera, hoje, vagas lotadas e presença', (
      tester,
    ) async {
      final repo = FakeProfessorStudentsRepository([
        professorStudentsSnapshot(classes: [
          classMap({
            'waitlistCount': 2,
            'nextDate': professorStudentsTodayKey,
            'activeCount': 6,
            'capacity': 6,
            'presenceRate': 88,
          }),
          classMap({
            'classId': 'c2',
            'arenaId': 'arena-norte',
            'arenaName': 'Arena Norte',
            'name': 'Particular Pedro',
            'type': 'particular',
            'level': 'avancado',
            'weekdays': [3],
            'startTime': '07:00',
            'courtName': '',
            'capacity': 1,
            'activeCount': 1,
            'presenceRate': null,
            'nextDate': '2026-10-21',
          }),
        ]),
      ]);
      await openClasses(tester, repo);

      expect(find.text('Minhas turmas'), findsOneWidget);
      expect(find.text('2 TURMAS · 7 ALUNOS'), findsOneWidget);

      expect(inCard('c1', 'INICIANTE'), findsOneWidget);
      expect(inCard('c1', ' · 2 NA ESPERA'), findsOneWidget);
      expect(inCard('c1', 'Hoje · 19:00'), findsOneWidget);
      expect(inCard('c1', 'Iniciante A'), findsOneWidget);
      // Duas arenas: a arena entra na linha do horário.
      expect(inCard('c1', 'Ter e Qui · 19:00 · Quadra 2 · Arena CFC'),
          findsOneWidget);
      expect(inCard('c1', '6/6'), findsOneWidget);
      expect(inCard('c1', '88%'), findsOneWidget);

      expect(inCard('c2', 'AVANÇADO'), findsOneWidget);
      expect(inCard('c2', 'Qua 21 · 07:00'), findsOneWidget);
      expect(inCard('c2', 'Qua · 07:00 · Arena Norte'), findsOneWidget);
      expect(inCard('c2', '1/1'), findsOneWidget);
      // Sem chamada: traço, não "0%".
      expect(inCard('c2', '—'), findsOneWidget);
      expect(inCard('c2', '0%'), findsNothing);
      // Particular ganha a etiqueta do tipo; sem espera, sem o aviso.
      expect(inCard('c2', 'PARTICULAR'), findsOneWidget);
      expect(find.textContaining('NA ESPERA'), findsOneWidget);
    });

    testWidgets('uma arena só: sem o nome da arena no horário', (
      tester,
    ) async {
      final repo = FakeProfessorStudentsRepository([
        professorStudentsSnapshot(
          arenas: [arenaMap()],
          classes: [classMap({})],
        ),
      ]);
      await openClasses(tester, repo);

      expect(inCard('c1', 'Ter e Qui · 19:00 · Quadra 2'), findsOneWidget);
      expect(inCard('c1', '4/6'), findsOneWidget);
      expect(inCard('c1', 'Qui 22 · 19:00'), findsOneWidget);
      expect(find.text('1 TURMA · 4 ALUNOS'), findsOneWidget);
    });

    testWidgets('turma pausada: PAUSADA no lugar da próxima aula', (
      tester,
    ) async {
      final repo = FakeProfessorStudentsRepository([
        professorStudentsSnapshot(classes: [
          classMap({
            'status': 'paused',
            'nextDate': professorStudentsTodayKey,
          }),
        ]),
      ]);
      await openClasses(tester, repo);

      expect(inCard('c1', 'PAUSADA'), findsOneWidget);
      expect(inCard('c1', 'Hoje · 19:00'), findsNothing);
    });

    testWidgets('aula avulsa sem próxima data', (tester) async {
      final repo = FakeProfessorStudentsRepository([
        professorStudentsSnapshot(classes: [
          classMap({'weekdays': <int>[], 'nextDate': null, 'courtName': ''}),
        ]),
      ]);
      await openClasses(tester, repo);

      expect(find.textContaining('Aula avulsa · 19:00'), findsOneWidget);
      expect(find.textContaining('Hoje'), findsNothing);
    });

    testWidgets('sem turmas: vazio explicado', (tester) async {
      final repo = FakeProfessorStudentsRepository([
        professorStudentsSnapshot(classes: const []),
      ]);
      await openClasses(tester, repo);

      expect(find.byKey(const Key('professor-classes-empty')), findsOneWidget);
      expect(find.text('0 TURMAS · 0 ALUNOS'), findsOneWidget);
    });

    testWidgets('erro: "tentar de novo" e recupera', (tester) async {
      final repo = FakeProfessorStudentsRepository([
        Exception('offline'),
        professorStudentsSnapshot(),
      ]);
      await openClasses(tester, repo);

      final retry = find.text(
        'Não foi possível carregar suas turmas. Toque para tentar de novo.',
      );
      expect(retry, findsOneWidget);
      expect(find.byKey(const Key('professor-classes-empty')), findsNothing);

      await tester.tap(retry);
      await settleProfessorStudents(tester);
      expect(find.byKey(const Key('professor-class-c1')), findsOneWidget);
      expect(repo.fetchCount, 2);
    });
  });
}
