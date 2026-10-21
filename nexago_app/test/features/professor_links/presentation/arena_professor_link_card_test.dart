import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_link_detail_page.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_invite_sheet.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_links_settings_group.dart';

import '../professor_links_test_support.dart';

ArenaProfessorLink _praiaViva(
  ArenaProfessorLinkStatus status, {
  DateTime? expiresAt,
}) =>
    professorLink(
      arenaId: 'praia-viva',
      arenaName: 'Praia Viva Arena',
      type: ArenaProfessorLinkType.independent,
      status: status,
      initiatedBy: status == ArenaProfessorLinkStatus.invited
          ? ArenaProfessorSide.arena
          : ArenaProfessorSide.professor,
      requestedAt: DateTime(2026, 10, 17),
      invitedAt: DateTime(2026, 10, 18),
      expiresAt: expiresAt,
      approvedAt: DateTime(2026, 5, 6),
    );

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Card "Você é professor?" na página da arena (M3)', () {
    testWidgets('sem vínculo: pede vínculo; lê só o doc {arenaId}_{uid}', (
      tester,
    ) async {
      final repo = FakeProfessorLinksRepository();
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: professorTestArenaRoute,
      );

      expect(find.text('VOCÊ É PROFESSOR?'), findsOneWidget);
      expect(
        find.text(
          'Peça vínculo para dar aulas aqui — na equipe da arena ou como '
          'independente.',
        ),
        findsOneWidget,
      );
      expect(find.byKey(const Key('arena-professor-request')), findsOneWidget);
      expect(repo.watchLinkCalls, ['praia-viva_prof-1']);
    });

    testWidgets('deslogado: o card some', (tester) async {
      final repo = FakeProfessorLinksRepository();
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: professorTestArenaRoute,
        uid: '',
      );

      expect(find.byKey(const Key('arena-professor-card')), findsNothing);
      expect(repo.watchLinkCalls, isEmpty);
    });

    testWidgets('pedido aguardando: status + "Ver vínculo" no lugar do pedido',
        (
      tester,
    ) async {
      final repo = FakeProfessorLinksRepository(
        links: [_praiaViva(ArenaProfessorLinkStatus.pending)],
      );
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: professorTestArenaRoute,
      );

      expect(find.byKey(const Key('arena-professor-request')), findsNothing);
      expect(find.text('SEU VÍNCULO DE PROFESSOR'), findsOneWidget);
      expect(find.text('Aguardando a arena'), findsOneWidget);
      expect(find.text('Pedido em 17 out'), findsOneWidget);

      await tester.tap(find.byKey(const Key('arena-professor-open')));
      await settleProfessorSheet(tester);
      expect(
        tester
            .widget<ProfessorLinkDetailPage>(
              find.byType(ProfessorLinkDetailPage),
            )
            .linkId,
        'praia-viva_prof-1',
      );
    });

    testWidgets('convite em aberto: "Ver convite" abre a folha do convite', (
      tester,
    ) async {
      final repo = FakeProfessorLinksRepository(
        links: [
          _praiaViva(
            ArenaProfessorLinkStatus.invited,
            expiresAt: DateTime(2026, 10, 25),
          ),
        ],
      );
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: professorTestArenaRoute,
      );

      expect(find.text('Convite recebido'), findsOneWidget);
      await tester.tap(find.byKey(const Key('arena-professor-open')));
      await settleProfessorSheet(tester);
      expect(find.byType(ProfessorInviteSheet), findsOneWidget);
    });

    for (final (label, link) in [
      ('encerrado', _praiaViva(ArenaProfessorLinkStatus.ended)),
      (
        'convite vencido',
        _praiaViva(
          ArenaProfessorLinkStatus.invited,
          expiresAt: DateTime(2026, 10, 19),
        ),
      ),
    ]) {
      testWidgets('vínculo fechado ($label): volta a pedir', (tester) async {
        final repo = FakeProfessorLinksRepository(links: [link]);
        await pumpProfessorLinksApp(
          tester,
          repo: repo,
          location: professorTestArenaRoute,
        );
        expect(
          find.byKey(const Key('arena-professor-request')),
          findsOneWidget,
        );
      });
    }

    testWidgets('erro de leitura do vínculo conta como "sem vínculo"', (
      tester,
    ) async {
      final repo = _FailingLinkRepository();
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: professorTestArenaRoute,
      );

      expect(find.byKey(const Key('arena-professor-request')), findsOneWidget);
    });
  });

  group('Seção "Professores" da página da arena', () {
    testWidgets('lista o espelho público: equipe primeiro, com modalidades', (
      tester,
    ) async {
      final repo = FakeProfessorLinksRepository(
        publicProfessors: {
          'praia-viva': const [
            PublicArenaProfessor(
              professorUserId: 'p2',
              name: 'Marcos Lima',
              type: ArenaProfessorLinkType.independent,
              modalities: ['Vôlei de praia'],
            ),
            PublicArenaProfessor(
              professorUserId: 'p1',
              name: 'Juliana Rocha',
              type: ArenaProfessorLinkType.arenaStaff,
              modalities: ['Beach Tennis', 'Kids'],
            ),
          ],
        },
      );
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: professorTestArenaRoute,
      );

      expect(find.text('Professores'), findsOneWidget);
      expect(find.text('Beach Tennis · Kids'), findsOneWidget);
      expect(find.text('Vôlei de praia'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Juliana Rocha')).dy <
            tester.getTopLeft(find.text('Marcos Lima')).dy,
        isTrue,
      );

      await tester.tap(find.text('Juliana Rocha'));
      await settleProfessorSheet(tester);
      expect(find.text('perfil p1'), findsOneWidget);
    });

    testWidgets('arena sem professores públicos: a seção some', (tester) async {
      final repo = FakeProfessorLinksRepository();
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: professorTestArenaRoute,
      );

      expect(find.byKey(const Key('arena-public-professors')), findsNothing);
      expect(find.text('Professores'), findsNothing);
    });
  });

  group('Entrada "Minhas arenas" nos ajustes', () {
    Future<void> pumpGroup(
      WidgetTester tester,
      FakeProfessorLinksRepository repo, {
      VoidCallback? onTap,
    }) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            professorLinksRepositoryProvider.overrideWithValue(repo),
            professorLinksUidProvider.overrideWithValue(professorTestUid),
            professorLinksClockProvider.overrideWithValue(
              () => professorTestNow,
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: Scaffold(body: ProfessorLinksSettingsGroup(onTap: onTap)),
          ),
        ),
      );
      await settleProfessorLinks(tester);
    }

    testWidgets('sem vínculos: o grupo some (atleta que só joga)', (
      tester,
    ) async {
      await pumpGroup(tester, FakeProfessorLinksRepository());

      expect(find.text('PROFESSOR'), findsNothing);
      expect(find.text('Minhas arenas'), findsNothing);
      expect(find.byKey(const Key('professor-links-settings-tile')), findsNothing);
    });

    testWidgets('vínculo encerrado: o grupo continua (histórico)', (
      tester,
    ) async {
      await pumpGroup(
        tester,
        FakeProfessorLinksRepository(
          links: [
            professorLink(
              status: ArenaProfessorLinkStatus.ended,
              endedAt: DateTime(2026, 9, 1),
            ),
          ],
        ),
      );

      expect(find.text('PROFESSOR'), findsOneWidget);
      expect(find.text('Minhas arenas'), findsOneWidget);
    });

    testWidgets('convite em aberto: subtítulo e selo; o toque abre', (
      tester,
    ) async {
      var taps = 0;
      await pumpGroup(
        tester,
        FakeProfessorLinksRepository(links: prototypeLinks()),
        onTap: () => taps++,
      );

      expect(find.text('1 convite de arena para responder'), findsOneWidget);
      expect(find.text('1 CONVITE'), findsOneWidget);
      await tester.tap(find.byKey(const Key('professor-links-settings-tile')));
      expect(taps, 1);
    });
  });
}

/// Leitura do vínculo recusada (rules antigas / sem acesso).
class _FailingLinkRepository extends FakeProfessorLinksRepository {
  @override
  Stream<ArenaProfessorLink?> watchLink(String linkId) =>
      Stream.error(Exception('permission-denied'));
}
