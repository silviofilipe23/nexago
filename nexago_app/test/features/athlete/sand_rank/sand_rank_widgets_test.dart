import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/gamification_providers.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_catalog.dart';
import 'package:nexago_app/features/athlete/presentation/sand_rank/widgets/sand_rank_emblem.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_quest/athlete_quest_rank_card.dart';

GamificationSummary _summary(int xp, {int shields = 0}) {
  return GamificationSummary(
    xp: xp,
    level: xp ~/ 100,
    streak: 0,
    totalGames: 0,
    lastGameDate: null,
    updatedAt: null,
    streakShieldsAvailable: shields,
  );
}

Widget _wrap(Widget child, {List<Override> overrides = const []}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(home: Scaffold(body: child)),
  );
}

void main() {
  testWidgets('SandRankEmblem renderiza asset do elo com pips de divisão',
      (tester) async {
    await tester.pumpWidget(
      _wrap(
        const SandRankEmblem(
          rankCode: 'DESAFIANTE',
          division: 2,
          size: SandRankEmblemSize.medium,
        ),
      ),
    );

    final image = tester.widget<Image>(find.byType(Image));
    expect(
      (image.image as AssetImage).assetName,
      'assets/sand_rank/emblem_desafiante.png',
    );
    // Divisão II → 3 pips desenhados (2 acesos), todos presentes na árvore.
    final pips = find.descendant(
      of: find.byType(Row),
      matching: find.byType(Container),
    );
    expect(pips, findsNWidgets(3));
  });

  testWidgets('SandRankEmblem bloqueado aplica dessaturação', (tester) async {
    await tester.pumpWidget(
      _wrap(
        const SandRankEmblem(
          rankCode: 'MESTRE',
          division: 3,
          locked: true,
        ),
      ),
    );
    expect(find.byType(ColorFiltered), findsOneWidget);
  });

  testWidgets('SandRankEmblem small não mostra pips', (tester) async {
    await tester.pumpWidget(
      _wrap(
        const SandRankEmblem(
          rankCode: 'ELITE',
          division: 1,
          size: SandRankEmblemSize.small,
        ),
      ),
    );
    expect(find.byType(Image), findsOneWidget);
    expect(find.byType(Container), findsNothing);
  });

  testWidgets('AthleteQuestRankCard mostra elo atual e progresso',
      (tester) async {
    final summary = _summary(1500, shields: 1); // Desafiante III
    await tester.pumpWidget(
      _wrap(
        AthleteQuestRankCard(summary: summary),
        overrides: [
          gamificationSummaryProvider.overrideWith(
            (ref) => Stream.value(summary),
          ),
        ],
      ),
    );
    await tester.pump();

    expect(find.text('Desafiante III'), findsOneWidget);
    // 1900 - 1500 = 400 XP até Desafiante II (RichText).
    expect(
      find.textContaining('400 XP pra', findRichText: true),
      findsOneWidget,
    );
    expect(
      find.textContaining('Desafiante II', findRichText: true),
      findsWidgets,
    );
    // Escudo disponível aparece no chip.
    expect(find.byIcon(Icons.shield_rounded), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('AthleteQuestRankCard no topo mostra copy de Lenda',
      (tester) async {
    final summary = _summary(20000);
    await tester.pumpWidget(
      _wrap(
        AthleteQuestRankCard(summary: summary),
        overrides: [
          gamificationSummaryProvider.overrideWith(
            (ref) => Stream.value(summary),
          ),
        ],
      ),
    );
    await tester.pump();

    expect(find.text(sandRankLabel(sandRankTrack.last)), findsOneWidget);
    expect(find.textContaining('Você é uma Lenda'), findsOneWidget);
  });
}
