import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/squad/domain/squad_repository.dart';
import 'package:nexago_app/features/squad/domain/squad_rules.dart';
import 'package:nexago_app/features/squad/presentation/squad_earnings_page.dart';
import 'package:nexago_app/features/squad/presentation/squad_invite_page.dart';
import 'package:nexago_app/features/squad/presentation/squad_ranking_page.dart';

import '../squad_test_support.dart';

void main() {
  setUpAll(loadSquadFonts);

  group('Squad (tela 01) — embaixador', () {
    testWidgets('ganhos do ciclo, disponível e próximo repasse', (
      tester,
    ) async {
      final repo = FakeSquadRepository(mySquad: memberSquad());
      await pumpSquadApp(tester, repo: repo, location: AppRoutes.squad);

      expect(repo.fetchMySquadCalls, 1);
      expect(find.text('VOCÊ GANHOU NO PILOTO'), findsOneWidget);
      expect(
        squadTextOf(tester, const Key('squad-earned-total')),
        formatBRLFromCents(32400),
      );
      // Receita em reais inteiros, para caber numa linha.
      expect(
        find.text('9 atletas trazidos · ${formatBRLWhole(2160)} em inscrições'),
        findsOneWidget,
      );
      expect(find.text(formatBRLFromCents(4800)), findsOneWidget);
      expect(find.text('20 out'), findsOneWidget);
      expect(find.text('AMBASSADOR'), findsWidgets);
    });

    testWidgets('código, oferta do seguidor e progresso para o próximo nível', (
      tester,
    ) async {
      final member = squadMember();
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad(member)),
        location: AppRoutes.squad,
      );

      expect(squadTextOf(tester, const Key('squad-code')), 'JOAO10');
      expect(find.text('10% OFF na 1ª inscrição de quem usar'), findsOneWidget);
      expect(find.text('7/12'), findsOneWidget);
      expect(find.text(squadProgressLine(member.progress!)), findsOneWidget);
      expect(
        find.text(
          'Mais 5 conversões pra concorrer a Pro Ambassador na avaliação '
          'de 06 dez.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('últimas conversões: nome, evento, valor e status', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squad,
      );

      expect(find.text('Últimas conversões'), findsOneWidget);
      expect(find.text('Ver tudo'), findsOneWidget);
      expect(find.text('Lucas M.'), findsOneWidget);
      expect(find.text('Open Errejota · Masc. C'), findsNWidgets(2));
      expect(find.text('+${formatBRLFromCents(1200)}'), findsOneWidget);
      expect(find.text('Liberada'), findsOneWidget);
      expect(find.text('Aguardando'), findsOneWidget);

      // Cancelada: valor sem "+", riscado, com o motivo.
      expect(find.text('Cancelada · reembolso'), findsOneWidget);
      final canceled = tester.widget<Text>(find.text(formatBRLFromCents(1000)));
      expect(canceled.style?.decoration, TextDecoration.lineThrough);
    });

    testWidgets('mostra só as 4 conversões mais recentes', (tester) async {
      final commissions = [
        for (var i = 6; i >= 1; i--)
          squadCommissionPayload(
            id: 'c$i',
            at: '2026-10-${(i + 3).toString().padLeft(2, '0')}T15:00:00.000Z',
            label: 'Atleta $i',
          ),
      ];
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(squadMember(commissions: commissions)),
        ),
        location: AppRoutes.squad,
      );

      for (final shown in ['Atleta 6', 'Atleta 5', 'Atleta 4', 'Atleta 3']) {
        expect(find.text(shown), findsOneWidget);
      }
      expect(find.text('Atleta 2'), findsNothing);
      expect(find.text('Atleta 1'), findsNothing);
    });

    testWidgets('sem conversões: nota explicativa e sem "Ver tudo"', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(squadMember(commissions: const [])),
        ),
        location: AppRoutes.squad,
      );

      expect(
        find.text(
          'Quando alguém pagar a inscrição com o seu código, a conversão '
          'aparece aqui.',
        ),
        findsOneWidget,
      );
      expect(find.text('Ver tudo'), findsNothing);
    });

    testWidgets('contrato pausado mostra o aviso com a data de retorno', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(
            squadMember(status: 'paused', pausedUntil: '2026-11-03'),
          ),
        ),
        location: AppRoutes.squad,
      );

      expect(
        find.text(
          'Contrato pausado até 03 nov: seu código não dá desconto nem gera '
          'comissão enquanto isso.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('abaixo do mínimo de repasse, o próximo repasse fica "—"', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(squadMember(availableCents: 1500)),
        ),
        location: AppRoutes.squad,
      );

      expect(find.text('—'), findsOneWidget);
      expect(find.text('20 out'), findsNothing);
    });

    testWidgets('atalhos abrem Ganhos e Ranking', (tester) async {
      final repo = FakeSquadRepository(mySquad: memberSquad());
      await pumpSquadApp(tester, repo: repo, location: AppRoutes.squad);

      await tester.tap(find.text('Ganhos'));
      await settleSquad(tester, 20);
      expect(find.byType(SquadEarningsPage), findsOneWidget);

      // O "Voltar" da tela de cima (a de baixo segue montada na pilha).
      await tester.tap(find.bySemanticsLabel('Voltar').last);
      await settleSquad(tester, 60);
      expect(find.byType(SquadEarningsPage), findsNothing);
      await tester.tap(find.text('Ranking'));
      await settleSquad(tester, 20);
      expect(find.byType(SquadRankingPage), findsOneWidget);
      expect(repo.fetchRankingCalls, 1);
      // Squad busca uma vez; Ganhos, aberta com cache, pede dado fresco (o
      // push de repasse chega com o app vivo). Ranking não lê getMySquad.
      expect(repo.fetchMySquadCalls, 2);
    });

    testWidgets(
      'aditivo que chegou com o app vivo aparece ao reabrir o Squad',
      (tester) async {
        final repo = FakeSquadRepository(mySquad: memberSquad());
        await pumpSquadApp(tester, repo: repo, location: AppRoutes.squad);
        expect(find.byKey(const Key('squad-amendment-open')), findsNothing);

        // O backoffice mudou o nível depois da primeira leitura.
        repo.mySquad = memberSquad(
          squadMember(
            pendingAmendment: {
              'at': '2026-10-17T15:00:00.000Z',
              'package': squadPackagePayload('pro'),
            },
          ),
        );
        await tester.tap(find.text('Benefícios'));
        await settleSquad(tester, 20);

        // Benefícios e o Squad embaixo dele na pilha: a mesma resposta nova.
        expect(
          find.byKey(const Key('squad-amendment-open')),
          findsNWidgets(2),
        );
      },
    );

    testWidgets('aditivo pendente: "Ver e aceitar" abre a folha e aceita', (
      tester,
    ) async {
      final repo = FakeSquadRepository(
        mySquad: memberSquad(
          squadMember(
            pendingAmendment: {
              'at': '2026-10-15T18:00:00.000Z',
              'package': squadPackagePayload('pro'),
            },
          ),
        ),
      );
      await pumpSquadApp(tester, repo: repo, location: AppRoutes.squad);

      expect(
        find.text('Você foi convidado para Pro Ambassador.'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('squad-amendment-open')));
      await settleSheet(tester);
      expect(find.text('Aditivo: nível Pro Ambassador'), findsOneWidget);
      expect(find.text('10% a 15% de comissão'), findsOneWidget);

      await tester.tap(find.text('Aceitar aditivo'));
      await settleSheet(tester);

      expect(repo.acceptAmendmentCalls, 1);
      expect(find.text('Pronto: agora você é Pro Ambassador.'), findsOneWidget);
      // O aceite invalida o getMySquad: a tela relê o contrato.
      expect(repo.fetchMySquadCalls, 2);
    });

    testWidgets(
      'aditivo recusado pelo servidor: folha segue aberta com o erro',
      (tester) async {
        final repo = FakeSquadRepository(
          mySquad: memberSquad(
            squadMember(
              pendingAmendment: {
                'at': '2026-10-15T18:00:00.000Z',
                'package': squadPackagePayload('pro'),
              },
            ),
          ),
          amendmentError: const SquadException('O aditivo foi cancelado.'),
        );
        await pumpSquadApp(tester, repo: repo, location: AppRoutes.squad);

        await tester.tap(find.byKey(const Key('squad-amendment-open')));
        await settleSheet(tester);
        await tester.tap(find.text('Aceitar aditivo'));
        await settleSheet(tester);

        expect(find.text('O aditivo foi cancelado.'), findsOneWidget);
        expect(find.text('Aceitar aditivo'), findsOneWidget);
        expect(repo.fetchMySquadCalls, 1);
      },
    );
  });

  group('Squad (tela 01) — sem contrato e erro', () {
    testWidgets('não-membro com convite: "Ver convite" abre o convite', (
      tester,
    ) async {
      final repo = FakeSquadRepository(mySquad: inviteSquad(id: 'inv-1'));
      await pumpSquadApp(tester, repo: repo, location: AppRoutes.squad);

      expect(find.text('Você tem um convite pro Squad'), findsOneWidget);
      expect(find.textContaining('como Ambassador'), findsOneWidget);

      await tester.tap(find.text('Ver convite'));
      await settleSquad(tester, 20);

      expect(find.byType(SquadInvitePage), findsOneWidget);
      expect(repo.viewInviteCalls, ['inv-1']);
    });

    testWidgets('não-membro sem convite: explica o programa, sem ação', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(),
        location: AppRoutes.squad,
      );

      expect(find.text('Você ainda não faz parte do Squad'), findsOneWidget);
      expect(find.byType(OutlinedButton), findsNothing);
    });

    testWidgets('erro mostra "Tentar de novo", que refaz a chamada', (
      tester,
    ) async {
      final repo = FakeSquadRepository(
        mySquadError: const SquadException('Sem conexão com o NexaSquad.'),
      );
      await pumpSquadApp(tester, repo: repo, location: AppRoutes.squad);

      expect(find.text('Não foi possível abrir o Squad'), findsOneWidget);
      expect(find.text('Sem conexão com o NexaSquad.'), findsOneWidget);
      expect(find.text('Tentar de novo'), findsOneWidget);

      repo
        ..mySquadError = null
        ..mySquad = memberSquad();
      await tester.tap(find.text('Tentar de novo'));
      await settleSquad(tester);

      expect(repo.fetchMySquadCalls, 2);
      expect(squadTextOf(tester, const Key('squad-code')), 'JOAO10');
    });
  });
}
