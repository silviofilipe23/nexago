import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/squad/domain/squad_repository.dart';

import '../squad_test_support.dart';

void main() {
  setUpAll(loadSquadFonts);

  group('Ganhos (tela 03)', () {
    testWidgets('disponível, linha do repasse com a data e os totais', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadEarnings,
      );

      expect(
        squadTextOf(tester, const Key('squad-available')),
        formatBRLFromCents(4800),
      );
      expect(find.text('Cai na carteira NexaGO em 20 out'), findsOneWidget);
      expect(find.text('A liberar'), findsOneWidget);
      expect(find.text(formatBRLFromCents(1500)), findsWidgets);
      expect(find.text('Recebido'), findsOneWidget);
      expect(find.text('No piloto'), findsOneWidget);
      expect(find.text(formatBRLFromCents(32400)), findsOneWidget);
    });

    testWidgets('abaixo do mínimo, o saldo acumula para o próximo repasse', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(squadMember(availableCents: 1500)),
        ),
        location: AppRoutes.squadEarnings,
      );

      expect(
        find.text(
          'Repasse a partir de ${formatBRLFromCents(2000)}: o saldo acumula '
          'para o próximo.',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('Cai na carteira'), findsNothing);
    });

    testWidgets('ciclo regular troca "No piloto" por "No ciclo"', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(squadMember(cycleId: '2026-2')),
        ),
        location: AppRoutes.squadEarnings,
      );

      expect(find.text('No ciclo'), findsOneWidget);
      expect(find.text('No piloto'), findsNothing);
    });

    testWidgets('barras por semana com os rótulos de dia e mês', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadEarnings,
      );

      expect(find.text('Por semana'), findsOneWidget);
      for (final label in ['8/9', '15', '22', '29', '6/10', '13']) {
        expect(find.text(label), findsOneWidget, reason: label);
      }
    });

    testWidgets(
      'extrato: repasse com "−", cancelada riscada, liberada com "+"',
      (tester) async {
        await pumpSquadApp(
          tester,
          repo: FakeSquadRepository(mySquad: memberSquad()),
          location: AppRoutes.squadEarnings,
        );

        expect(find.text('Extrato'), findsOneWidget);

        // Repasse para a carteira.
        expect(find.text('Repasse para a carteira'), findsOneWidget);
        expect(find.text('− ${formatBRLFromCents(18000)}'), findsOneWidget);
        expect(find.textContaining('Carteira NexaGO'), findsOneWidget);

        // Cancelada por reembolso: sem "+" e riscada.
        expect(find.text('Ana P. · Copa Sol'), findsOneWidget);
        expect(find.textContaining('Cancelada · reembolso'), findsOneWidget);
        final canceled = tester.widget<Text>(
          find.text(formatBRLFromCents(1000)),
        );
        expect(canceled.style?.decoration, TextDecoration.lineThrough);
        expect(find.text('+ ${formatBRLFromCents(1000)}'), findsNothing);

        // Liberada e aguardando: com "+", sem risco.
        expect(find.text('Lucas M. · Open Errejota'), findsOneWidget);
        expect(find.textContaining('Liberada'), findsOneWidget);
        final released = tester.widget<Text>(
          find.text('+ ${formatBRLFromCents(1200)}'),
        );
        expect(released.style?.decoration, isNot(TextDecoration.lineThrough));
        expect(find.text('+ ${formatBRLFromCents(1500)}'), findsOneWidget);
        expect(find.textContaining('Aguardando pgto'), findsOneWidget);
      },
    );

    testWidgets('extrato na ordem: mais recente primeiro', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadEarnings,
      );

      double top(String text) => tester.getTopLeft(find.text(text)).dy;

      expect(
        top('Ana P. · Copa Sol'),
        lessThan(top('Repasse para a carteira')),
      );
      expect(
        top('Repasse para a carteira'),
        lessThan(top('Pedro A. · Open Errejota')),
      );
      expect(
        top('Pedro A. · Open Errejota'),
        lessThan(top('Lucas M. · Open Errejota')),
      );
    });

    testWidgets('sem movimentação: nota de extrato vazio', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(
            squadMember(commissions: const [], payouts: const []),
          ),
        ),
        location: AppRoutes.squadEarnings,
      );

      expect(
        find.text('Nenhuma movimentação neste ciclo ainda.'),
        findsOneWidget,
      );
    });

    testWidgets('erro: mensagem e "Tentar de novo"', (tester) async {
      final repo = FakeSquadRepository(
        mySquadError: const SquadException('Sem conexão.'),
      );
      await pumpSquadApp(tester, repo: repo, location: AppRoutes.squadEarnings);

      expect(
        find.text('Não foi possível carregar seus ganhos'),
        findsOneWidget,
      );
      expect(find.text('Sem conexão.'), findsOneWidget);

      repo
        ..mySquadError = null
        ..mySquad = memberSquad();
      await tester.tap(find.text('Tentar de novo'));
      await settleSquad(tester);

      expect(repo.fetchMySquadCalls, 2);
      expect(find.byKey(const Key('squad-available')), findsOneWidget);
    });

    testWidgets('sem contrato: cai no estado de não-membro', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(),
        location: AppRoutes.squadEarnings,
      );

      expect(find.text('Você ainda não faz parte do Squad'), findsOneWidget);
      expect(find.byKey(const Key('squad-available')), findsNothing);
    });
  });
}
