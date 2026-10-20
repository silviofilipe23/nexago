import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/presentation/professor_link_detail_page.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_invite_sheet.dart';

import '../professor_links_test_support.dart';

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('Minhas arenas (M1)', () {
    testWidgets('header, card do convite e uma linha por arena', (
      tester,
    ) async {
      final repo = FakeProfessorLinksRepository(links: prototypeLinks());
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: AppRoutes.professorArenas,
      );

      expect(find.text('Minhas arenas'), findsOneWidget);
      expect(find.text('2 ATIVAS · 1 CONVITE · 1 AGUARDANDO'), findsOneWidget);

      // Convite em aberto: card azul no topo, fora das linhas.
      expect(find.text('NOVO CONVITE'), findsOneWidget);
      expect(find.text('Arena Sul quer você na equipe'), findsOneWidget);
      expect(find.text('Expira em 7 dias'), findsOneWidget);
      expect(find.byKey(const Key('professor-link-row-arena-sul_prof-1')),
          findsNothing);

      // Linhas: ativos (mais recente primeiro), aguardando e o encerrado.
      final rows = [
        'arena-norte_prof-1',
        'arena-cfc_prof-1',
        'lagoa_prof-1',
        'beach-point_prof-1',
      ];
      double top(String id) =>
          tester.getTopLeft(find.byKey(Key('professor-link-row-$id'))).dy;
      for (var i = 1; i < rows.length; i++) {
        expect(top(rows[i - 1]) < top(rows[i]), isTrue, reason: rows[i]);
      }
      expect(find.text('Desde mar 2025'), findsOneWidget);
      expect(find.text('Desde mai 2026'), findsOneWidget);
      expect(find.text('Aguardando a arena'), findsOneWidget);
      expect(find.text('Pedido em 17 out'), findsOneWidget);
      expect(find.text('Encerrado em fev 2026'), findsOneWidget);
      expect(find.text('EQUIPE DA ARENA'), findsOneWidget);
      expect(find.text('INDEPENDENTE'), findsNWidgets(3));

      // Fechado fica apagado.
      final ended = tester.widget<Opacity>(
        find.ancestor(
          of: find.byKey(const Key('professor-link-row-beach-point_prof-1')),
          matching: find.byType(Opacity),
        ),
      );
      expect(ended.opacity, 0.55);
    });

    testWidgets('tocar numa linha abre o detalhe do vínculo', (tester) async {
      final repo = FakeProfessorLinksRepository(links: prototypeLinks());
      final router = await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: AppRoutes.professorArenas,
      );

      await tester
          .tap(find.byKey(const Key('professor-link-row-arena-cfc_prof-1')));
      await settleProfessorSheet(tester);

      expect(
        tester
            .widget<ProfessorLinkDetailPage>(
              find.byType(ProfessorLinkDetailPage),
            )
            .linkId,
        'arena-cfc_prof-1',
      );
      expect(router.canPop(), isTrue);
      expect(find.text('VÍNCULO ATIVO · DESDE MAR 2025'), findsOneWidget);
    });

    testWidgets('"Ver convite" abre a folha do convite', (tester) async {
      final repo = FakeProfessorLinksRepository(links: prototypeLinks());
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: AppRoutes.professorArenas,
      );

      await tester.tap(
        find.byKey(const Key('professor-invite-open-arena-sul_prof-1')),
      );
      await settleProfessorSheet(tester);

      expect(find.byType(ProfessorInviteSheet), findsOneWidget);
      expect(find.text('Convite da Arena Sul'), findsOneWidget);
    });

    testWidgets('"Recusar" no card confirma antes de recusar', (tester) async {
      final repo = FakeProfessorLinksRepository(links: prototypeLinks());
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: AppRoutes.professorArenas,
      );

      await tester.tap(
        find.byKey(const Key('professor-invite-card-decline-arena-sul_prof-1')),
      );
      await settleProfessorSheet(tester);
      expect(find.text('Recusar convite?'), findsOneWidget);

      // Voltar não recusa.
      await tester.tap(find.text('Voltar'));
      await settleProfessorSheet(tester);
      expect(repo.respondCalls, isEmpty);

      await tester.tap(
        find.byKey(const Key('professor-invite-card-decline-arena-sul_prof-1')),
      );
      await settleProfessorSheet(tester);
      await tester.tap(find.byKey(const Key('professor-link-confirm')));
      await settleProfessorSheet(tester);

      expect(repo.respondCalls, [
        (linkId: 'arena-sul_prof-1', accept: false, reason: null),
      ]);
      expect(find.text('Convite recusado.'), findsOneWidget);
      // O convite saiu do topo e virou linha "Recusado".
      expect(find.text('NOVO CONVITE'), findsNothing);
      expect(find.byKey(const Key('professor-link-row-arena-sul_prof-1')),
          findsOneWidget);
      expect(find.text('Recusado'), findsOneWidget);
    });

    testWidgets('convite vencido vira linha "Convite expirado", sem card', (
      tester,
    ) async {
      final repo = FakeProfessorLinksRepository(
        links: [invitedLink(expiresAt: DateTime(2026, 10, 19))],
      );
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: AppRoutes.professorArenas,
      );

      expect(find.text('NOVO CONVITE'), findsNothing);
      expect(find.text('Convite expirado'), findsOneWidget);
      expect(find.text('NENHUM VÍNCULO ATIVO'), findsOneWidget);
    });

    testWidgets('vazio: explica como pedir e leva à busca de arenas', (
      tester,
    ) async {
      final repo = FakeProfessorLinksRepository();
      final router = await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: AppRoutes.professorArenas,
      );

      expect(find.text('Nenhuma arena por aqui'), findsOneWidget);
      expect(find.textContaining('“Solicitar vínculo”'), findsOneWidget);
      expect(find.text('ÁREA DO PROFESSOR'), findsOneWidget);

      await tester.tap(find.text('Buscar arenas'));
      await settleProfessorSheet(tester);
      expect(router.routerDelegate.currentConfiguration.uri.toString(),
          '/discover?tab=reservar');
    });

    testWidgets('"+" explica que o pedido nasce na página da arena', (
      tester,
    ) async {
      final repo = FakeProfessorLinksRepository(links: prototypeLinks());
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: AppRoutes.professorArenas,
        size: const Size(375, 667),
      );

      await tester.tap(find.byKey(const Key('professor-arenas-add')));
      await settleProfessorSheet(tester);

      expect(find.text('Pedir vínculo a uma arena'), findsOneWidget);
      expect(find.byKey(const Key('professor-arenas-find')), findsOneWidget);
    });

    testWidgets('só lê os vínculos da sessão', (tester) async {
      final other = ArenaProfessorLink(
        id: 'arena-x_outro',
        arenaId: 'arena-x',
        professorUserId: 'outro',
        type: ArenaProfessorLinkType.independent,
        status: ArenaProfessorLinkStatus.active,
        permissions: ArenaProfessorPermissions.none,
        arenaName: 'Arena X',
      );
      final repo = FakeProfessorLinksRepository(links: [other]);
      await pumpProfessorLinksApp(
        tester,
        repo: repo,
        location: AppRoutes.professorArenas,
      );

      expect(find.text('Arena X'), findsNothing);
      expect(find.text('Nenhuma arena por aqui'), findsOneWidget);
    });
  });
}
