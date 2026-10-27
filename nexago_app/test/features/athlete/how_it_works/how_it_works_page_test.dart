import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_rating.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/gamification_providers.dart';
import 'package:nexago_app/features/athlete/domain/how_it_works/how_it_works_rules.dart';
import 'package:nexago_app/features/athlete/domain/level_points_history.dart';
import 'package:nexago_app/features/athlete/domain/rating_ladder.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_providers.dart';
import 'package:nexago_app/features/athlete/presentation/how_it_works/how_it_works_page.dart';
import 'package:nexago_app/features/athlete/presentation/how_it_works/widgets/how_it_works_parts.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_models.dart';

const _profile = AthleteProfile(
  id: 'u1',
  name: 'Ana Souza',
  sport: '',
  level: '',
  city: 'Goiânia',
  primarySportFirestoreId: 'VOLEI_PRAIA',
  secondarySportFirestoreIds: ['BEACH_TENNIS'],
  levelsBySportFirestore: {
    'VOLEI_PRAIA': 'intermediario_1',
    'BEACH_TENNIS': 'iniciante_2',
  },
);

const _rating = AthleteRating(
  athleteId: 'u1',
  sportCode: 'VOLEI_PRAIA',
  rating: 1600,
  rd: 200,
  ratedMatches: 4,
  wins: 3,
  losses: 1,
  levelCode: 'intermediario_1',
  zone: 'stable',
  ladderState: 'stable',
);

void main() {
  Future<void> pumpPage(
    WidgetTester tester, {
    HowItWorksTab tab = HowItWorksTab.level,
    HowItWorksTab? origin,
    bool eloEnabled = true,
    RatingLadder ladder = kDefaultRatingLadder,
    List<LevelPointsEntry> history = const [],
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(402, 2600);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          athleteProfileProvider.overrideWith((ref) => Stream.value(_profile)),
          sandRankEnabledProvider.overrideWith(
            (ref) => Stream.value(eloEnabled),
          ),
          gamificationSummaryProvider.overrideWith(
            (ref) => Stream.value(
              const GamificationSummary(
                xp: 2885,
                level: 28,
                streak: 0,
                totalGames: 12,
                lastGameDate: null,
                updatedAt: null,
              ),
            ),
          ),
          ratingLadderProvider.overrideWith(
            (ref, sport) => Stream.value(ladder),
          ),
          levelPointsHistoryProvider.overrideWith(
            (ref, sport) async => sport == 'VOLEI_PRAIA' ? history : const [],
          ),
          athleteRatingProvider.overrideWith(
            (ref, sport) =>
                Stream.value(sport == 'VOLEI_PRAIA' ? _rating : null),
          ),
          competeHubUserRankingProvider.overrideWith(
            (ref) async => const CompeteHubUserRanking(
              rank: 11,
              seasonLabel: 'TEMPORADA 2026',
              subtitle: '',
              points: 1240,
              tournamentsCount: 3,
            ),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: HowItWorksPage(initialTab: tab, origin: origin),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('Nível: nível do esporte, acompanhamento e a escala', (
    tester,
  ) async {
    await pumpPage(tester);

    expect(find.text('SEU NÍVEL · VÔLEI DE PRAIA'), findsOneWidget);
    // Hero + linha da escada.
    expect(find.text('Intermediário 1'), findsNWidgets(2));
    expect(find.text('VOCÊ'), findsOneWidget);
    expect(find.textContaining('Consolidando seu nível'), findsOneWidget);
    expect(find.textContaining('XP nem com elo'), findsOneWidget);

    // Esporte sem rating: sem card de zona, com o aviso de que é declarado.
    await tester.tap(find.byType(HowItWorksChoicePill).last);
    await tester.pump();
    expect(find.textContaining('Consolidando seu nível'), findsNothing);
    expect(find.textContaining('ainda é só no vôlei'), findsOneWidget);
  });

  testWidgets('Elo e XP: elo atual, falta pro próximo e XP real', (
    tester,
  ) async {
    await pumpPage(tester);
    await tester.tap(find.text('Elo e XP'));
    // O resumo de XP só assina quando a aba monta: um quadro pro stream.
    await tester.pump();
    await tester.pump();

    expect(find.text('Desafiante I'), findsOneWidget);
    expect(find.text('2.885 XP'), findsOneWidget);
    expect(find.textContaining('pra Elite III'), findsOneWidget);
    expect(find.text('Como ganhar XP'.toUpperCase()), findsOneWidget);
    expect(find.text('+15 a 40'), findsOneWidget);
    expect(find.text('Ver minha trilha de elos'), findsOneWidget);
  });

  testWidgets('Elo desligado: aba vira só XP, sem trilha', (tester) async {
    await pumpPage(tester, tab: HowItWorksTab.elo, eloEnabled: false);

    expect(find.text('XP'), findsOneWidget);
    expect(find.text('SEU XP'), findsOneWidget);
    expect(find.text('A TRILHA'), findsNothing);
    expect(find.text('Ver minha trilha de elos'), findsNothing);
  });

  testWidgets('Ranking: posição e tabela no peso do nível do atleta', (
    tester,
  ) async {
    await pumpPage(tester, tab: HowItWorksTab.ranking);
    await tester.pump();

    expect(find.text('#11'), findsOneWidget);
    expect(find.text('1.240 pts'), findsOneWidget);
    // Intermediário 1 abre a tabela em Intermediário (×0,25).
    expect(find.text('+250 pts'), findsOneWidget);

    await tester.tap(find.text('Open'));
    await tester.pump();
    expect(find.text('+1000 pts'), findsOneWidget);
    expect(find.text('Ver ranking completo'), findsOneWidget);
  });

  testWidgets('aberta do Ranking não oferece voltar pro Ranking', (
    tester,
  ) async {
    await pumpPage(
      tester,
      tab: HowItWorksTab.ranking,
      origin: HowItWorksTab.ranking,
    );
    expect(find.text('Ver ranking completo'), findsNothing);
  });

  testWidgets('Nível: pontos, quanto falta pra subir e a tabela', (
    tester,
  ) async {
    await pumpPage(tester);

    // Rating 1600 em Intermediário 1 (começa 1.600, sobe com 1.720).
    expect(find.text('PONTOS DE NÍVEL'), findsOneWidget);
    expect(find.text('1.600 pts'), findsOneWidget);
    expect(find.textContaining('120 pts'), findsOneWidget);
    expect(find.textContaining('pra Intermediário 2 (1.720)'), findsOneWidget);
    expect(find.text('SOBE'), findsOneWidget);
    // Sem partida rateada no histórico, o gráfico não aparece.
    expect(find.text('SUA EVOLUÇÃO'), findsNothing);
    expect(find.text('2.170'), findsOneWidget); // Avançado 2
    // Modo sombra: sem coluna de descida e subida é com o atleta.
    expect(find.text('DESCE'), findsNothing);
    expect(find.text('Subir é com você'), findsOneWidget);
    expect(find.text('Descer, só com a equipe'), findsOneWidget);
  });

  testWidgets('Nível com subida e descida automáticas ligadas', (
    tester,
  ) async {
    await pumpPage(
      tester,
      ladder: const RatingLadder(
        levels: kDefaultRatingLadderLevels,
        autoPromotes: true,
        autoRelegates: true,
      ),
    );

    expect(find.text('DESCE'), findsOneWidget);
    expect(find.text('1.500'), findsOneWidget); // desce: Intermediário 1
    expect(find.text('Passou da marca, você sobe'), findsOneWidget);
    expect(find.text('Abaixo da faixa, você pode descer'), findsOneWidget);
    expect(find.textContaining('90 dias de observação'), findsOneWidget);
  });

  testWidgets('Nível: gráfico de evolução quando há partidas rateadas', (
    tester,
  ) async {
    LevelPointsEntry e(int day, int before, int after, bool win) =>
        LevelPointsEntry(
          endedAt: DateTime(2026, 9, day),
          before: before,
          after: after,
          win: win,
        );
    await pumpPage(
      tester,
      history: [
        e(4, 1500, 1580, true),
        e(5, 1580, 1650, true),
        e(12, 1650, 1600, false),
      ],
    );
    await tester.pump();

    expect(find.text('SUA EVOLUÇÃO'), findsOneWidget);
    expect(find.textContaining('De 1.500 a'), findsOneWidget);
    expect(find.textContaining('3 partidas · 2 V · 1 D · pico 1.650'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
