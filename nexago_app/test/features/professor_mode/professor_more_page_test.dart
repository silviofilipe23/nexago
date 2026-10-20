import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_wallet.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_classes_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_more_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show
        loadProfessorLinksFonts,
        professorLink,
        professorTestNow,
        prototypeLinks;
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

Future<void> openMore(
  WidgetTester tester, {
  FakeProfessorStudentsRepository? repo,
  List<ArenaProfessorLink> links = const [],
  bool multipleRoles = false,
  FakeProfessorWalletRepository? wallet,
}) =>
    pumpProfessorStudentsApp(
      tester,
      repo: repo ??
          FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
      walletRepo: wallet,
      location: AppRoutes.professorMore,
      extraRoutes: [
        GoRoute(
          path: AppRoutes.professorMore,
          name: AppRouteNames.professorMore,
          builder: (_, __) => const ProfessorMorePage(),
        ),
      ],
      overrides: [
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        myProfessorLinksProvider.overrideWith((ref) => Stream.value(links)),
        professorLinksClockProvider.overrideWithValue(() => professorTestNow),
        hasMultipleMobileRolesProvider.overrideWithValue(multipleRoles),
      ],
    );

Finder inRow(String rowKey, String text) => find.descendant(
      of: find.byKey(Key(rowKey)),
      matching: find.text(text),
    );

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Mais (B1)', () {
    testWidgets('sem chave ligada pela arena, sem o grupo de ações', (tester) async {
      await openMore(tester);
      expect(find.text('AÇÕES NA ARENA'), findsNothing);
    });

    testWidgets('fase 2: ações aparecem conforme as chaves da arena', (tester) async {
      final repo = FakeProfessorStudentsRepository([
        professorStudentsSnapshot(arenas: [
          {...arenaMap(), 'actions': {'canScheduleLessons': true}},
        ]),
      ]);
      await openMore(tester, repo: repo);
      expect(find.text('AÇÕES NA ARENA'), findsOneWidget);
      expect(find.byKey(const Key('professor-more-add-student')), findsOneWidget);
      expect(find.byKey(const Key('professor-more-new-lesson')), findsOneWidget);
      expect(find.byKey(const Key('professor-more-notice')), findsNothing);
    });

    testWidgets('linhas: Turmas, Minhas arenas e Sair', (tester) async {
      await openMore(tester);

      expect(find.text('Mais'), findsOneWidget);
      expect(find.text('MODO PROFESSOR'), findsOneWidget);
      // Sem perfil carregado: nome genérico.
      expect(find.text('Professor'), findsOneWidget);
      expect(inRow('professor-more-classes', 'Turmas'), findsOneWidget);
      expect(inRow('professor-more-classes', '2 turmas'), findsOneWidget);
      expect(inRow('professor-more-arenas', 'Minhas arenas'), findsOneWidget);
      expect(find.byKey(const Key('professor-more-sign-out')), findsOneWidget);
      expect(find.text('Sair'), findsOneWidget);
    });

    testWidgets('Turmas soma a fila de espera', (tester) async {
      final repo = FakeProfessorStudentsRepository([
        professorStudentsSnapshot(classes: [
          classMap({'waitlistCount': 2}),
          classMap({'classId': 'c2', 'waitlistCount': 1}),
          classMap({'classId': 'c3'}),
        ]),
      ]);
      await openMore(tester, repo: repo);

      expect(
        inRow('professor-more-classes', '3 turmas · 3 na espera'),
        findsOneWidget,
      );
    });

    testWidgets('uma turma no singular', (tester) async {
      final repo = FakeProfessorStudentsRepository([
        professorStudentsSnapshot(classes: [classMap({})]),
      ]);
      await openMore(tester, repo: repo);

      expect(inRow('professor-more-classes', '1 turma'), findsOneWidget);
    });

    testWidgets('Turmas sem trailing enquanto/se a carga falha', (
      tester,
    ) async {
      final repo = FakeProfessorStudentsRepository([Exception('offline')]);
      await openMore(tester, repo: repo);

      expect(inRow('professor-more-classes', 'Turmas'), findsOneWidget);
      expect(find.textContaining('turma'), findsNothing);
    });

    testWidgets('Minhas arenas mostra os convites em aberto', (tester) async {
      await openMore(tester, links: prototypeLinks());

      expect(inRow('professor-more-arenas', '1 convite'), findsOneWidget);
    });

    testWidgets('sem convite: conta as arenas ativas', (tester) async {
      await openMore(
        tester,
        links: [
          professorLink(arenaId: 'a1', arenaName: 'A1'),
          professorLink(arenaId: 'a2', arenaName: 'A2'),
          professorLink(
            arenaId: 'a3',
            arenaName: 'A3',
            status: ArenaProfessorLinkStatus.ended,
          ),
        ],
      );

      expect(inRow('professor-more-arenas', '2 ativas'), findsOneWidget);
    });

    testWidgets('"Trocar papel" só com mais de um papel', (tester) async {
      await openMore(tester);
      expect(find.byKey(const Key('professor-more-switch-role')), findsNothing);
    });

    testWidgets('"Trocar papel" aparece com mais de um papel', (tester) async {
      await openMore(tester, multipleRoles: true);
      expect(
          find.byKey(const Key('professor-more-switch-role')), findsOneWidget);
      expect(find.text('Trocar papel'), findsOneWidget);
    });

    testWidgets('tocar em Turmas abre Minhas turmas', (tester) async {
      await openMore(tester);

      await tester.tap(find.byKey(const Key('professor-more-classes')));
      await settleProfessorStudents(tester);

      expect(find.byType(ProfessorClassesPage), findsOneWidget);
      expect(find.text('Minhas turmas'), findsOneWidget);
    });

    testWidgets('tocar em Minhas arenas abre a tela dos vínculos', (
      tester,
    ) async {
      await openMore(tester);

      await tester.tap(find.byKey(const Key('professor-more-arenas')));
      await settleProfessorStudents(tester);

      expect(find.text('minhas arenas'), findsOneWidget);
    });

    testWidgets('fase 3: sem vínculo independente nem conta, sem Dinheiro',
        (tester) async {
      await openMore(tester, links: [professorLink()]);
      expect(find.text('DINHEIRO'), findsNothing);
      expect(find.byKey(const Key('professor-more-payout')), findsNothing);
    });

    testWidgets('fase 3: independente vê Dinheiro com conta, planos e a receber',
        (tester) async {
      final wallet = FakeProfessorWalletRepository(
        account: walletAccount(status: ProfessorAccountStatus.pending),
        plans: walletPlans(),
        charges: [walletCharge(amount: 880, dueDate: '2099-01-10')],
      );
      await openMore(
        tester,
        links: [professorLink(type: ArenaProfessorLinkType.independent)],
        wallet: wallet,
      );
      expect(find.text('DINHEIRO'), findsOneWidget);
      expect(inRow('professor-more-payout', 'Pendente'), findsOneWidget);
      expect(inRow('professor-more-plans', '2 planos'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const Key('professor-more-wallet')),
          matching: find.textContaining('a receber'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('fase 3: sem vínculo independente mas com conta, mostra',
        (tester) async {
      await openMore(
        tester,
        wallet: FakeProfessorWalletRepository(account: walletAccount()),
      );
      expect(inRow('professor-more-payout', 'Aprovada'), findsOneWidget);
    });

    testWidgets('fase 3: independente sem conta oferece criar', (tester) async {
      await openMore(
        tester,
        links: [
          professorLink(
            type: ArenaProfessorLinkType.independent,
            status: ArenaProfessorLinkStatus.pending,
          ),
        ],
      );
      expect(inRow('professor-more-payout', 'Criar conta'), findsOneWidget);
    });

    testWidgets('Comunicados em Alunos e aulas', (tester) async {
      await openMore(tester);
      expect(inRow('professor-more-notices', 'Comunicados'), findsOneWidget);
    });
  });
}
