import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_card.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: child),
    );
  }

  testWidgets('OrganizerMatchCard shows teams label', (tester) async {
    final row = OrganizerMatchRow(
      match: TournamentMatch(
        id: 'm1',
        tournamentId: 't1',
        categoryId: 'Masc A',
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
        teamADescription: 'Time Alpha',
        teamBDescription: 'Time Beta',
      ),
    );

    await tester.pumpWidget(wrap(OrganizerMatchCard(row: row)));
    expect(find.textContaining('Time Alpha'), findsOneWidget);
    expect(find.text('AO VIVO'), findsOneWidget);
  });
}
