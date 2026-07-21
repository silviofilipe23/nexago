import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/gamification_providers.dart';
import 'package:nexago_app/features/athlete/presentation/sand_rank/sand_rank_track_page.dart';

GamificationSummary _summary(int xp) {
  return GamificationSummary(
    xp: xp,
    level: xp ~/ 100,
    streak: 0,
    totalGames: 0,
    lastGameDate: null,
    updatedAt: null,
    streakShieldsAvailable: 0,
  );
}

void main() {
  testWidgets(
    'SandRankTrackPage mostra botão de compartilhar o elo atual',
    (tester) async {
      final summary = _summary(1500); // Desafiante III
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            gamificationSummaryProvider.overrideWith(
              (ref) => Stream.value(summary),
            ),
          ],
          child: const MaterialApp(home: SandRankTrackPage()),
        ),
      );
      await tester.pump();

      expect(find.text('Compartilhar meu elo'), findsOneWidget);
      expect(find.byIcon(Icons.ios_share_rounded), findsOneWidget);

      // O card capturável envolve o card do elo atual com RepaintBoundary,
      // a mesma técnica de match_detail_share_capture.dart.
      expect(find.byType(RepaintBoundary), findsWidgets);
    },
  );
}
