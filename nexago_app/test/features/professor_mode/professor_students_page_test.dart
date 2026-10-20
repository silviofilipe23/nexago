import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_wallet.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_student_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

Finder row(String arenaId, String studentId) =>
    find.byKey(Key('professor-student-$arenaId::$studentId'));

String subtitle(WidgetTester tester) => tester
    .widget<Text>(find.byKey(const Key('professor-students-subtitle')))
    .data!;

Future<void> openList(
  WidgetTester tester,
  FakeProfessorStudentsRepository repo, {
  FakeProfessorWalletRepository? wallet,
}) =>
    pumpProfessorStudentsApp(
      tester,
      repo: repo,
      walletRepo: wallet,
      location: AppRoutes.professorStudents,
      extraRoutes: professorWalletRoutes,
    );

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Alunos (A5 + B2)', () {
    testWidgets('lista nomes, subtítulos com a arena e o cabeçalho', (
      tester,
    ) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openList(tester, repo);

      expect(find.text('Alunos'), findsOneWidget);
      expect(subtitle(tester), 'TODAS AS ARENAS · 3 ALUNOS · 1 PENDENTE');
      expect(row('arena-cfc', 's1'), findsOneWidget);
      expect(row('arena-cfc', 's2'), findsOneWidget);
      expect(row('arena-norte', 's3'), findsOneWidget);
      expect(find.text('João Silva'), findsOneWidget);
      // Mais de uma arena em "todas": a arena vem antes.
      expect(
          find.text('Arena CFC · Iniciante A · 95% presença'), findsOneWidget);
      expect(
        find.text('Arena Norte · Particular Pedro · sem chamada ainda'),
        findsOneWidget,
      );
      // Atrasado vira pílula; em dia mostra os créditos.
      expect(
        find.descendant(
            of: row('arena-cfc', 's2'), matching: find.text('ATRASADO')),
        findsOneWidget,
      );
      expect(
        find.descendant(
            of: row('arena-cfc', 's1'), matching: find.text('1 créd.')),
        findsOneWidget,
      );
      expect(repo.fetchCount, 1);
    });

    testWidgets('aluno pausado: pílula PAUSADO, subtítulo sem repetir', (
      tester,
    ) async {
      final snap = professorStudentsSnapshot(
        arenas: [arenaMap()],
        students: [
          studentMap({'status': 'paused', 'billing': null}),
        ],
      );
      final repo = FakeProfessorStudentsRepository([snap]);
      await openList(tester, repo);

      expect(
        find.descendant(
          of: row('arena-cfc', 's1'),
          matching: find.text('PAUSADO'),
        ),
        findsOneWidget,
      );
      expect(find.text('Iniciante A · 95% presença'), findsOneWidget);
      expect(find.textContaining('Pausado ·'), findsNothing);
    });

    testWidgets('busca sem acento filtra; nada achado explica', (
      tester,
    ) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openList(tester, repo);

      await tester.enterText(
        find.byKey(const Key('professor-students-search')),
        'joao',
      );
      await tester.pump();
      expect(row('arena-cfc', 's1'), findsOneWidget);
      expect(row('arena-cfc', 's2'), findsNothing);
      expect(row('arena-norte', 's3'), findsNothing);

      await tester.enterText(
        find.byKey(const Key('professor-students-search')),
        'zzz',
      );
      await tester.pump();
      expect(find.text('Nenhum aluno encontrado.'), findsOneWidget);
      // A busca não mexe no cabeçalho.
      expect(subtitle(tester), 'TODAS AS ARENAS · 3 ALUNOS · 1 PENDENTE');
    });

    testWidgets('chips Turma e Particular (dupla conta como particular)', (
      tester,
    ) async {
      final snap = professorStudentsSnapshot(students: [
        ...professorStudentsPayload()['students']!
            as List<Map<String, Object?>>,
        studentMap({
          'studentId': 's4',
          'name': 'Ana Dupla',
          'classes': [studentClassMap(type: 'dupla')],
        }),
      ]);
      final repo = FakeProfessorStudentsRepository([snap]);
      await openList(tester, repo);

      await tester
          .tap(find.byKey(const Key('professor-students-filter-turma')));
      await tester.pump();
      expect(row('arena-cfc', 's1'), findsOneWidget);
      expect(row('arena-cfc', 's2'), findsOneWidget);
      expect(row('arena-norte', 's3'), findsNothing);
      expect(row('arena-cfc', 's4'), findsNothing);

      await tester
          .tap(find.byKey(const Key('professor-students-filter-particular')));
      await tester.pump();
      expect(row('arena-cfc', 's1'), findsNothing);
      expect(row('arena-norte', 's3'), findsOneWidget);
      expect(row('arena-cfc', 's4'), findsOneWidget);
    });

    testWidgets('"Pendentes" aparece com cobrança e filtra os atrasados', (
      tester,
    ) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openList(tester, repo);

      final pending =
          find.byKey(const Key('professor-students-filter-pending'));
      expect(pending, findsOneWidget);
      await tester.tap(pending);
      await tester.pump();
      expect(row('arena-cfc', 's2'), findsOneWidget);
      expect(row('arena-cfc', 's1'), findsNothing);
      expect(row('arena-norte', 's3'), findsNothing);
    });

    testWidgets('sem cobrança visível (independente) não há "Pendentes"', (
      tester,
    ) async {
      final snap = professorStudentsSnapshot(
        arenas: [arenaMap(type: 'INDEPENDENT')],
        students: [
          studentMap({'billing': null}),
          studentMap({'studentId': 's2', 'name': 'Maria', 'billing': null}),
        ],
      );
      final repo = FakeProfessorStudentsRepository([snap]);
      await openList(tester, repo);

      expect(find.byKey(const Key('professor-students-filter-pending')),
          findsNothing);
      expect(find.byKey(const Key('professor-students-filter-all')),
          findsOneWidget);
      // Uma arena só: sem troca de escopo e sem a arena na linha.
      expect(find.byKey(const Key('professor-students-scope')), findsNothing);
      expect(find.text('Iniciante A · 95% presença'), findsNWidgets(2));
    });

    testWidgets('arena sem "Gerenciar as próprias aulas" mostra o aviso', (
      tester,
    ) async {
      final snap = professorStudentsSnapshot(arenas: [
        arenaMap(),
        arenaMap(
          arenaId: 'arena-lagoa',
          arenaName: 'Lagoa Beach',
          canSeeStudents: false,
          studentCount: 0,
        ),
      ]);
      final repo = FakeProfessorStudentsRepository([snap]);
      await openList(tester, repo);

      final note = find.textContaining(
        'Seus alunos da Lagoa Beach não aparecem',
      );
      expect(note, findsOneWidget);
      // Leva a Minhas arenas, onde o vínculo é revisto.
      await tester.tap(note);
      await settleProfessorStudents(tester);
      expect(find.text('minhas arenas'), findsOneWidget);
    });

    testWidgets('só arena bloqueada: aviso, sem "Nenhum aluno"', (
      tester,
    ) async {
      final snap = professorStudentsSnapshot(
        arenas: [
          arenaMap(canSeeStudents: false, studentCount: 0),
        ],
        classes: const [],
        students: const [],
      );
      final repo = FakeProfessorStudentsRepository([snap]);
      await openList(tester, repo);

      expect(find.textContaining('Seus alunos da Arena CFC não aparecem'),
          findsOneWidget);
      expect(find.text('Nenhum aluno nas suas turmas ainda.'), findsNothing);
      expect(find.byKey(const Key('professor-students-search')), findsNothing);
    });

    testWidgets('arena liberada sem alunos: "Nenhum aluno"', (tester) async {
      final snap = professorStudentsSnapshot(
        arenas: [arenaMap(studentCount: 0)],
        students: const [],
      );
      final repo = FakeProfessorStudentsRepository([snap]);
      await openList(tester, repo);

      expect(find.text('Nenhum aluno nas suas turmas ainda.'), findsOneWidget);
      expect(find.byKey(const Key('professor-students-search')), findsNothing);
    });

    testWidgets('sem arenas: explica que ainda não dá aula', (tester) async {
      final repo = FakeProfessorStudentsRepository([
        professorStudentsSnapshot(
          arenas: const [],
          classes: const [],
          students: const [],
        ),
      ]);
      await openList(tester, repo);

      expect(find.byKey(const Key('professor-students-no-classes')),
          findsOneWidget);
      expect(subtitle(tester), 'TODAS AS ARENAS · 0 ALUNOS');
    });

    testWidgets('deslogado não chama a callable', (tester) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await pumpProfessorStudentsApp(
        tester,
        repo: repo,
        location: AppRoutes.professorStudents,
        uid: '',
      );

      expect(repo.fetchCount, 0);
      expect(find.byKey(const Key('professor-students-no-classes')),
          findsOneWidget);
    });

    testWidgets('erro vira "tentar de novo" e tocar busca de novo', (
      tester,
    ) async {
      final repo = FakeProfessorStudentsRepository([
        const ProfessorStudentsException('offline'),
        professorStudentsSnapshot(),
      ]);
      await openList(tester, repo);

      final retry = find.text(
        'Não foi possível carregar seus alunos. Toque para tentar de novo.',
      );
      expect(retry, findsOneWidget);
      expect(
          find.byKey(const Key('professor-students-no-classes')), findsNothing);
      expect(
          find.byKey(const Key('professor-students-subtitle')), findsNothing);

      await tester.tap(retry);
      await settleProfessorStudents(tester);

      expect(repo.fetchCount, 2);
      expect(retry, findsNothing);
      expect(row('arena-cfc', 's1'), findsOneWidget);
    });

    testWidgets('"Ver alunos de…" troca a arena, a lista e o cabeçalho', (
      tester,
    ) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openList(tester, repo);

      await tester.tap(find.byKey(const Key('professor-students-scope')));
      await settleProfessorStudents(tester);
      expect(find.text('Ver alunos de'), findsOneWidget);
      expect(find.byKey(const Key('professor-scope-all')), findsOneWidget);
      expect(
          find.byKey(const Key('professor-scope-arena-cfc')), findsOneWidget);

      await tester.tap(find.byKey(const Key('professor-scope-arena-norte')));
      await settleProfessorStudents(tester);

      expect(find.text('Ver alunos de'), findsNothing);
      expect(subtitle(tester), 'ARENA NORTE · 1 ALUNO');
      expect(row('arena-norte', 's3'), findsOneWidget);
      expect(row('arena-cfc', 's1'), findsNothing);
      // Uma arena escolhida: a linha não repete a arena.
      expect(find.text('Particular Pedro · sem chamada ainda'), findsOneWidget);
      // Norte é independente: sem cobrança, sem "Pendentes".
      expect(find.byKey(const Key('professor-students-filter-pending')),
          findsNothing);

      // Volta a todas.
      await tester.tap(find.byKey(const Key('professor-students-scope')));
      await settleProfessorStudents(tester);
      await tester.tap(find.byKey(const Key('professor-scope-all')));
      await settleProfessorStudents(tester);
      expect(subtitle(tester), 'TODAS AS ARENAS · 3 ALUNOS · 1 PENDENTE');
    });

    testWidgets('"Pendentes" escolhido e arena sem cobrança: volta a Todos', (
      tester,
    ) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openList(tester, repo);

      await tester
          .tap(find.byKey(const Key('professor-students-filter-pending')));
      await tester.pump();
      expect(row('arena-norte', 's3'), findsNothing);

      await tester.tap(find.byKey(const Key('professor-students-scope')));
      await settleProfessorStudents(tester);
      await tester.tap(find.byKey(const Key('professor-scope-arena-norte')));
      await settleProfessorStudents(tester);

      // Sem o chip, o filtro escondido não pode zerar a lista.
      expect(row('arena-norte', 's3'), findsOneWidget);
      expect(find.text('Nenhum aluno encontrado.'), findsNothing);
    });

    testWidgets('tocar no aluno abre a tela dele', (tester) async {
      final repo =
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]);
      await openList(tester, repo);

      await tester.tap(row('arena-cfc', 's2'));
      await settleProfessorStudents(tester);

      final page = tester
          .widget<ProfessorStudentPage>(find.byType(ProfessorStudentPage));
      expect(page.arenaId, 'arena-cfc');
      expect(page.studentId, 's2');
      expect(find.text('Maria Souza'), findsOneWidget);
      expect(
        tester
            .widget<Text>(
              find.byKey(const Key('professor-student-presence-rate')),
            )
            .data,
        '70%',
      );
      // A tela do aluno lê do mesmo resultado: sem outra ida ao servidor.
      expect(repo.fetchCount, 1);
    });

    group('fase 3: carteira própria', () {
      FakeProfessorWalletRepository wallet() => FakeProfessorWalletRepository(
            plans: walletPlans(),
            students: [
              walletStudent(),
              walletStudent(
                athleteId: 'ath-rafa',
                name: 'Rafaela Torres',
                status: ProfessorWalletStudentStatus.invited,
              ),
              walletStudent(
                athleteId: 'ath-velho',
                name: 'Arquivado',
                status: ProfessorWalletStudentStatus.archived,
              ),
            ],
          );

      testWidgets('"Todas as arenas" inclui os da carteira com o selo azul',
          (tester) async {
        await openList(
          tester,
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
          wallet: wallet(),
        );
        expect(subtitle(tester), 'TODAS AS ARENAS · 5 ALUNOS · 1 PENDENTE');
        expect(find.byKey(const Key('professor-wallet-row-ath-paulo')),
            findsOneWidget);
        expect(find.byKey(const Key('professor-wallet-row-ath-rafa')),
            findsOneWidget);
        expect(find.byKey(const Key('professor-wallet-row-ath-velho')),
            findsNothing);
        expect(find.text('CARTEIRA'), findsNWidgets(2));
        expect(find.text('CONVITE ENVIADO'), findsOneWidget);
        // Os das turmas continuam lá.
        expect(row('arena-cfc', 's1'), findsOneWidget);

        await tester.ensureVisible(
            find.byKey(const Key('professor-wallet-row-ath-paulo')));
        await tester
            .tap(find.byKey(const Key('professor-wallet-row-ath-paulo')));
        await settleProfessorStudents(tester);
        expect(find.text('CARTEIRA PRÓPRIA'), findsOneWidget);
        expect(find.text('Paulo Viana'), findsOneWidget);
      });

      testWidgets('escopo "Carteira própria" na folha', (tester) async {
        await openList(
          tester,
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
          wallet: wallet(),
        );
        await tester.tap(find.byKey(const Key('professor-students-scope')));
        await settleProfessorStudents(tester);
        expect(find.byKey(const Key('professor-scope-wallet')), findsOneWidget);
        await tester.tap(find.byKey(const Key('professor-scope-wallet')));
        await settleProfessorStudents(tester);

        expect(subtitle(tester), 'CARTEIRA PRÓPRIA · 2 ALUNOS');
        expect(row('arena-cfc', 's1'), findsNothing);
        expect(find.byKey(const Key('professor-wallet-row-ath-paulo')),
            findsOneWidget);
      });

      testWidgets('só carteira (sem turmas): lista os da carteira',
          (tester) async {
        await openList(
          tester,
          FakeProfessorStudentsRepository([
            professorStudentsSnapshot(arenas: [], classes: [], students: []),
          ]),
          wallet: wallet(),
        );
        expect(find.byKey(const Key('professor-students-no-classes')),
            findsNothing);
        expect(find.byKey(const Key('professor-wallet-row-ath-paulo')),
            findsOneWidget);
      });
    });
  });
}
