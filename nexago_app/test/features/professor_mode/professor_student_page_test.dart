import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_students_test_support.dart';

String studentPath(String arenaId, String studentId) =>
    '${AppRoutes.professorStudents}/$arenaId/$studentId';

Future<void> openStudent(
  WidgetTester tester,
  FakeProfessorStudentsRepository repo,
  String arenaId,
  String studentId,
) =>
    pumpProfessorStudentsApp(
      tester,
      repo: repo,
      location: studentPath(arenaId, studentId),
    );

String textOf(WidgetTester tester, Key key) =>
    tester.widget<Text>(find.byKey(key)).data!;

Finder inBilling(String text) => find.descendant(
      of: find.byKey(const Key('professor-student-billing')),
      matching: find.text(text),
    );

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Aluno (B3)', () {
    testWidgets('cabeçalho, presença, plano e pagamento atrasado', (
      tester,
    ) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openStudent(tester, repo, 'arena-cfc', 's2');

      expect(find.text('Maria Souza'), findsOneWidget);
      expect(find.text('ARENA CFC · DESDE MAR 2025'), findsOneWidget);
      expect(find.text('Iniciante A · Ter e Qui · 19:00'), findsOneWidget);
      expect(
        textOf(tester, const Key('professor-student-presence-rate')),
        '70%',
      );

      expect(find.text('PRESENÇA · 3 ÚLTIMAS'), findsOneWidget);
      expect(find.text('Última aula com você: 16 out'), findsOneWidget);
      // Sem crédito, sem o aviso de reposição.
      expect(find.byKey(const Key('professor-student-credits')), findsNothing);

      expect(find.text('PLANO E COBRANÇA'), findsOneWidget);
      expect(find.text('Plano da arena'), findsOneWidget);
      expect(find.text('2x por semana'), findsOneWidget);
      expect(inBilling('Pagamento'), findsOneWidget);
      expect(inBilling('Atrasado'), findsOneWidget);
      expect(inBilling('Venceu 05 out · cobrança da arena'), findsOneWidget);
      expect(
        find.textContaining('plano e cobrança ficam com a arena'),
        findsNothing,
      );
    });

    testWidgets('em dia, com crédito de reposição', (tester) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openStudent(tester, repo, 'arena-cfc', 's1');

      expect(
        textOf(tester, const Key('professor-student-presence-rate')),
        '95%',
      );
      expect(
        textOf(tester, const Key('professor-student-credits')),
        '1 CRÉDITO DE REPOSIÇÃO',
      );
      expect(inBilling('Em dia'), findsOneWidget);
      expect(inBilling('Cobrado pela arena · próximo 05 nov'), findsOneWidget);
    });

    testWidgets('pacote e vence hoje', (tester) async {
      final snap = professorStudentsSnapshot(students: [
        studentMap({
          'credits': 2,
          'plans': [
            {
              'enrollmentId': 'e2',
              'status': 'active',
              'name': 'Pacote 10 aulas',
              'kind': 'package',
              'priceReais': 500,
              'credits': 10,
              'creditsLeft': 4,
              'expiresOn': '2026-12-31',
            },
          ],
          'billing': {'standing': 'due_today', 'nextDueDate': '2026-10-20'},
        }),
      ]);
      final repo = FakeProfessorStudentsRepository([snap]);
      await openStudent(tester, repo, 'arena-cfc', 's1');

      expect(find.text('Pacote 10 aulas'), findsOneWidget);
      expect(find.text('4 de 10'), findsOneWidget);
      expect(
          find.textContaining('restantes · validade 31 dez'), findsOneWidget);
      expect(inBilling('Vence hoje'), findsOneWidget);
      expect(inBilling('Vence hoje · cobrança da arena'), findsOneWidget);
      expect(
        textOf(tester, const Key('professor-student-credits')),
        '2 CRÉDITOS DE REPOSIÇÃO',
      );
    });

    testWidgets('aluno pausado ganha a etiqueta', (tester) async {
      final snap = professorStudentsSnapshot(students: [
        studentMap({
          'status': 'paused',
          'billing': {'standing': 'paused'},
        }),
      ]);
      final repo = FakeProfessorStudentsRepository([snap]);
      await openStudent(tester, repo, 'arena-cfc', 's1');

      expect(find.text('PAUSADO'), findsOneWidget);
      expect(inBilling('Pausado'), findsOneWidget);
      expect(inBilling('Plano pausado na arena'), findsOneWidget);
    });

    testWidgets('independente (billing null): nota azul, sem cobrança', (
      tester,
    ) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openStudent(tester, repo, 'arena-norte', 's3');

      expect(find.text('Pedro Lima'), findsOneWidget);
      expect(
        find.text('Turma da Arena Norte: plano e cobrança ficam com a arena.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('professor-student-billing')), findsNothing);
      expect(find.text('PLANO E COBRANÇA'), findsNothing);
      expect(
        textOf(tester, const Key('professor-student-presence-rate')),
        '—',
      );
      expect(find.text('Sem chamada registrada nas suas aulas ainda.'),
          findsOneWidget);
      expect(find.text('PRESENÇA'), findsWidgets);
    });

    testWidgets('aluno que saiu das turmas: aviso', (tester) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openStudent(tester, repo, 'arena-cfc', 'nao-existe');

      expect(
          find.byKey(const Key('professor-student-missing')), findsOneWidget);
      expect(find.text('Aluno'), findsOneWidget);
    });

    testWidgets('mesmo id em outra arena não é o mesmo aluno', (tester) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openStudent(tester, repo, 'arena-norte', 's1');

      expect(
          find.byKey(const Key('professor-student-missing')), findsOneWidget);
      expect(find.text('João Silva'), findsNothing);
    });

    testWidgets('erro ao carregar: "tentar de novo" e recupera', (
      tester,
    ) async {
      final repo = FakeProfessorStudentsRepository([
        const ProfessorStudentsException('offline'),
        professorStudentsSnapshot(),
      ]);
      await openStudent(tester, repo, 'arena-cfc', 's1');

      final retry = find.text(
        'Não foi possível carregar o aluno. Toque para tentar de novo.',
      );
      expect(retry, findsOneWidget);
      expect(find.byKey(const Key('professor-student-missing')), findsNothing);

      await tester.tap(retry);
      await settleProfessorStudents(tester);
      expect(find.text('João Silva'), findsOneWidget);
      expect(repo.fetchCount, 2);
    });

    testWidgets('voltar retorna à lista', (tester) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await pumpProfessorStudentsApp(
        tester,
        repo: repo,
        location: AppRoutes.professorStudents,
      );
      await tester
          .tap(find.byKey(const Key('professor-student-arena-cfc::s1')));
      await settleProfessorStudents(tester);
      expect(find.byKey(const Key('professor-student-presence-rate')),
          findsOneWidget);

      await tester.tap(find.byIcon(Icons.arrow_back_rounded));
      await settleProfessorStudents(tester);
      expect(
          find.byKey(const Key('professor-students-subtitle')), findsOneWidget);
      expect(find.byKey(const Key('professor-student-presence-rate')),
          findsNothing);
    });
  });

  group('Anotações do professor', () {
    testWidgets('vazia: convite para escrever', (tester) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openStudent(tester, repo, 'arena-cfc', 's1');

      expect(find.text('SUAS ANOTAÇÕES · SÓ VOCÊ VÊ'), findsOneWidget);
      expect(
        find.text('Toque para escrever. Nem a arena nem o aluno veem.'),
        findsOneWidget,
      );
    });

    testWidgets('salvar grava com uid, arena e aluno e fecha a folha', (
      tester,
    ) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openStudent(tester, repo, 'arena-cfc', 's1');

      await tester.tap(find.byKey(const Key('professor-student-note')));
      await settleProfessorStudents(tester);
      expect(find.text('Anotações'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('professor-note-field')),
        'Dor no ombro direito',
      );
      await tester.tap(find.byKey(const Key('professor-note-save')));
      await settleProfessorStudents(tester);

      expect(repo.saveCalls, [
        (
          uid: professorStudentsTestUid,
          arenaId: 'arena-cfc',
          studentId: 's1',
          text: 'Dor no ombro direito',
        ),
      ]);
      expect(find.text('Anotações'), findsNothing);
      // O cartão acompanha a anotação ao vivo.
      expect(find.text('Dor no ombro direito'), findsOneWidget);
    });

    testWidgets('anotação existente abre preenchida', (tester) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      repo.notes[professorNoteId('arena-cfc', 's1')] = 'Evitar smash';
      await openStudent(tester, repo, 'arena-cfc', 's1');

      expect(find.text('Evitar smash'), findsOneWidget);
      await tester.tap(find.byKey(const Key('professor-student-note')));
      await settleProfessorStudents(tester);

      final field = tester.widget<TextField>(
        find.byKey(const Key('professor-note-field')),
      );
      expect(field.controller!.text, 'Evitar smash');
    });

    testWidgets('erro ao salvar mantém a folha e mostra a mensagem', (
      tester,
    ) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()])
            ..saveError = const ProfessorStudentsException(
              'Não foi possível salvar a anotação. Tente de novo.',
            );
      await openStudent(tester, repo, 'arena-cfc', 's1');

      await tester.tap(find.byKey(const Key('professor-student-note')));
      await settleProfessorStudents(tester);
      await tester.enterText(
        find.byKey(const Key('professor-note-field')),
        'Joelho',
      );
      await tester.tap(find.byKey(const Key('professor-note-save')));
      await settleProfessorStudents(tester);

      expect(repo.saveCalls, hasLength(1));
      expect(find.text('Anotações'), findsOneWidget);
      expect(
        find.text('Não foi possível salvar a anotação. Tente de novo.'),
        findsOneWidget,
      );
      // O texto digitado não se perde.
      final field = tester.widget<TextField>(
        find.byKey(const Key('professor-note-field')),
      );
      expect(field.controller!.text, 'Joelho');

      // Corrigido o erro, salvar de novo funciona.
      repo.saveError = null;
      await tester.tap(find.byKey(const Key('professor-note-save')));
      await settleProfessorStudents(tester);
      expect(repo.saveCalls, hasLength(2));
      expect(find.text('Anotações'), findsNothing);
    });
  });
}
