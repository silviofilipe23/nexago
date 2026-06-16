import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: child),
    );
  }

  testWidgets('LiveTableHeader shows court and elapsed', (tester) async {
    await tester.pumpWidget(
      wrap(
        LiveTableHeader(
          courtLabel: 'Q1',
          metaLabel: 'Masc Open · Quartas',
          elapsedLabel: '24:10',
          onBack: () {},
        ),
      ),
    );

    expect(find.textContaining('Mesa ao vivo · Q1'), findsOneWidget);
    expect(find.text('Masc Open · Quartas'), findsOneWidget);
    expect(find.text('24:10'), findsOneWidget);
  });

  testWidgets('LiveTableTeamScoreRow renders team and score', (tester) async {
    await tester.pumpWidget(
      wrap(
        LiveTableTeamScoreRow(
          teamLabel: 'Marcos / Victor',
          currentScore: 18,
          isServing: true,
          onTap: () {},
        ),
      ),
    );

    expect(find.text('Marcos / Victor'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);
  });

  testWidgets('LiveTablePointFeed shows recent points', (tester) async {
    final match = TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'Masc Open',
      round: 1,
      matchType: 'wb',
      poolId: '',
      teamAId: 'a',
      teamBId: 'b',
      status: TournamentMatchStatus.inProgress,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 1,
      teamADescription: 'Marcos / Victor',
      teamBDescription: 'Igor / João',
      sets: const [TournamentMatchSet(a: 18, b: 16)],
      currentSetIndex: 0,
    );

    await tester.pumpWidget(
      wrap(
        LiveTablePointFeed(
          setIndex: 0,
          match: match,
          events: const [],
        ),
      ),
    );

    expect(find.textContaining('ÚLTIMOS PONTOS · SET 1'), findsOneWidget);
    expect(find.text('Nenhum ponto registrado neste set.'), findsOneWidget);
  });
}
