import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/gamification_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_home_page.dart';

void main() {
  testWidgets(
    'skeleton da home não estoura em viewport baixo (landscape)',
    (tester) async {
      // Constraint real do overflow: Column com ~460px de placeholders
      // dentro de ~393px (IndexedStack do shell em landscape).
      tester.view.physicalSize = const Size(694, 393);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final loading = StreamController<GamificationSummary>();
      addTearDown(loading.close);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            gamificationSummaryProvider.overrideWith((ref) => loading.stream),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: const Scaffold(body: AthleteHomePage()),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(NexaSkeleton), findsWidgets);

      final overflows = <Object>[];
      for (;;) {
        final exception = tester.takeException();
        if (exception == null) break;
        overflows.add(exception);
      }
      expect(
        overflows,
        isEmpty,
        reason: 'o skeleton da home precisa caber (ou rolar) em altura curta',
      );
    },
  );
}
