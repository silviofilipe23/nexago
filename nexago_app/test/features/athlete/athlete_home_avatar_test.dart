import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/gamification_providers.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_home_page.dart';
import 'package:nexago_app/features/athlete/presentation/sand_rank/widgets/sand_rank_emblem.dart';

Future<void> _pump(WidgetTester tester, {required bool sandRank}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        gamificationSummaryProvider.overrideWith(
          (ref) => Stream.value(GamificationSummary.initial()),
        ),
        myBookingsStreamProvider.overrideWith((ref) => Stream.value(const [])),
        sandRankEnabledProvider.overrideWith((ref) => Stream.value(sandRank)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(body: AthleteHomePage()),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  // O escudo de nível saiu da frente do avatar da Início (pedido do dono).
  for (final sandRank in [true, false]) {
    testWidgets(
        'avatar da Início sem escudo de nível '
        '(Sand Rank ${sandRank ? 'ligado' : 'desligado'})', (tester) async {
      await _pump(tester, sandRank: sandRank);

      final avatar = find.byKey(const Key('athlete-home-avatar'));
      expect(avatar, findsOneWidget);
      expect(find.byType(SandRankEmblem), findsNothing);
      expect(
        find.descendant(of: avatar, matching: find.byType(Text)),
        findsOneWidget,
        reason: 'no avatar só sobram as iniciais, sem o número do nível',
      );
    });
  }
}
