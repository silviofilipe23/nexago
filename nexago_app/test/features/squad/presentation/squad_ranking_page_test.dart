import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/squad/domain/squad_repository.dart';

import '../squad_test_support.dart';

void main() {
  setUpAll(loadSquadFonts);

  group('Squad Ranking (tela 04)', () {
    testWidgets('pódio com os 3 primeiros; o atleta aparece como "Você"', (
      tester,
    ) async {
      final repo = FakeSquadRepository(mySquad: memberSquad());
      await pumpSquadApp(tester, repo: repo, location: AppRoutes.squadRanking);

      expect(repo.fetchRankingCalls, 1);
      expect(find.text('Marina'), findsOneWidget);
      expect(find.text('Pedro'), findsOneWidget);
      expect(find.text('Você'), findsOneWidget);
      // O pódio mostra primeiro nome, nunca o nome inteiro.
      expect(find.text('Marina Costa'), findsNothing);
      expect(find.text('João Victor (você)'), findsNothing);
      expect(find.text('2.400'), findsOneWidget);
      expect(find.text('2.100'), findsOneWidget);
      expect(find.text('1.280'), findsOneWidget);
    });

    testWidgets('faixa "subiu" quando a posição melhorou na semana', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadRanking,
      );

      expect(find.byKey(const Key('squad-ranking-move')), findsOneWidget);
      expect(find.text('Você subiu 3 posições esta semana.'), findsOneWidget);
      expect(find.byIcon(Icons.arrow_upward_rounded), findsOneWidget);
    });

    testWidgets('demais posições com variação: ▼ caiu e "novo" na semana', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadRanking,
      );

      expect(find.text('Lia Rocha'), findsOneWidget);
      expect(find.text('▼2'), findsOneWidget);
      expect(find.text('Caio Lima'), findsOneWidget);
      expect(find.text('novo'), findsOneWidget);
      expect(find.text('900'), findsOneWidget);
    });

    testWidgets('níveis de pontos com o mínimo de cada um', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadRanking,
      );

      for (final level in ['Bronze', 'Silver', 'Gold', 'Elite']) {
        expect(find.text(level), findsOneWidget, reason: level);
      }
      for (final min in ['0+', '500+', '1.000+', '2.000+']) {
        expect(find.text(min), findsOneWidget, reason: min);
      }
    });

    testWidgets('fora do top: linha própria "(você)" e faixa de queda', (
      tester,
    ) async {
      final ranking = squadRanking(
        entries: [
          squadRankingEntryPayload(1, 'Marina Costa', 2400, delta: 0),
          squadRankingEntryPayload(2, 'Pedro Alves', 2100, delta: 1),
          squadRankingEntryPayload(3, 'Lia Rocha', 1900, delta: -1),
          squadRankingEntryPayload(4, 'Caio Lima', 1500),
        ],
        me: squadRankingEntryPayload(
          14,
          'João Victor',
          300,
          delta: -2,
          me: true,
        ),
      );
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad(), ranking: ranking),
        location: AppRoutes.squadRanking,
      );

      expect(find.text('João Victor (você)'), findsOneWidget);
      expect(find.text('14'), findsOneWidget);
      expect(find.text('Você caiu 2 posições esta semana.'), findsOneWidget);
      expect(find.byIcon(Icons.arrow_downward_rounded), findsOneWidget);
      expect(find.text('Você'), findsNothing);
    });

    testWidgets('posição igual na semana: sem faixa', (tester) async {
      final ranking = squadRanking(
        entries: [
          squadRankingEntryPayload(1, 'João Victor', 1280, delta: 0, me: true),
          squadRankingEntryPayload(2, 'Pedro Alves', 900, delta: 0),
        ],
      );
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad(), ranking: ranking),
        location: AppRoutes.squadRanking,
      );

      expect(find.byKey(const Key('squad-ranking-move')), findsNothing);
      // Menos de 3: sem pódio, todos em linha.
      expect(find.text('João Victor (você)'), findsOneWidget);
      expect(find.text('Pedro Alves'), findsOneWidget);
    });

    testWidgets('subtítulo diz se os pontos são do piloto ou do ciclo', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadRanking,
      );
      expect(
        find.text('Pontos do piloto · conversões confirmadas'),
        findsOneWidget,
      );
    });

    testWidgets('ciclo regular: "Pontos do ciclo"', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(squadMember(cycleId: '2026-2')),
        ),
        location: AppRoutes.squadRanking,
      );
      expect(
        find.text('Pontos do ciclo · conversões confirmadas'),
        findsOneWidget,
      );
    });

    testWidgets('erro: mensagem e "Tentar de novo" refaz o ranking', (
      tester,
    ) async {
      final repo = FakeSquadRepository(
        mySquad: memberSquad(),
        rankingError: const SquadException('Ranking indisponível.'),
      );
      await pumpSquadApp(tester, repo: repo, location: AppRoutes.squadRanking);

      expect(find.text('Não foi possível carregar o ranking'), findsOneWidget);
      expect(find.text('Ranking indisponível.'), findsOneWidget);

      repo.rankingError = null;
      await tester.tap(find.text('Tentar de novo'));
      await settleSquad(tester);

      expect(repo.fetchRankingCalls, 2);
      expect(find.text('Você subiu 3 posições esta semana.'), findsOneWidget);
    });
  });
}
